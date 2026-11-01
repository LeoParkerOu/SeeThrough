import { readFile, readdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeSourcePath } from './source-bindings.mjs';
import { readGraph } from './graph-store.mjs';
import { layoutHierarchy } from './hierarchy-layout.mjs';
import { planRoutes } from './routing-plan.mjs';
import { graphRootOf, sourceLocation, sourceRepositories, sourceReference } from './graph-library.mjs';

const MAX_FILES = 500, MAX_BYTES = 5 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const decoder = new TextDecoder('utf-8', { fatal: true });
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.json', '.jsonc', '.md', '.mdx', '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.py', '.pyi', '.go', '.rs', '.java', '.kt', '.kts', '.c', '.h', '.cpp', '.hpp', '.cs', '.rb', '.php', '.swift', '.sh', '.bash', '.zsh', '.sql', '.graphql', '.gql', '.proto', '.yaml', '.yml', '.toml', '.xml']);
const knownSourceNames = new Set(['Dockerfile', 'Makefile', 'CMakeLists.txt', 'README', 'LICENSE', 'LICENCE', '.gitignore', '.dockerignore', '.editorconfig']);
const excludedDirectories = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'data', 'evidence', 'target', '__pycache__', 'venv', 'secrets', 'credentials']);
const excludedFiles = /^(?:factory\.(?:graph|bindings)\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock)$/i;
const secretName = /(?:^|[._-])(?:secrets?|credentials?|tokens?|private[._-]?key)(?:[._-]|$)|^(?:id_rsa|id_ed25519|authorized_keys|known_hosts)$/i;
const lexicalSort = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function eligibleFile(name) {
  if (excludedFiles.test(name) || secretName.test(name) || name.startsWith('.factory') || /^\.env(?:\.|$)/i.test(name)) return false;
  if (name.startsWith('.') && !knownSourceNames.has(name)) return false;
  return knownSourceNames.has(name) || sourceExtensions.has(extname(name).toLowerCase());
}

function relativeFile(path) {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('请使用项目内的相对文件路径');
  return path;
}

// safeSourcePath rejects escapes; this also rejects links *inside* the project.
// The worker must not acquire extra access through a link absent from its manifest.
async function plainPath(root, path, { allowMissing = false } = {}) {
  relativeFile(path);
  const location = sourceLocation(root, path);
  let current = await realpath(location.root);
  const parts = location.path.split('/');
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) { if (allowMissing && index === parts.length - 1 && error.code === 'ENOENT') return current; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`图 Agent 不读取或覆盖符号链接：${path}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`源码路径不是目录：${path}`);
    if (index === parts.length - 1 && !stat.isFile()) throw new Error(`源码路径不是普通文件：${path}`);
  }
  return safeSourcePath(root, path, { allowMissing });
}

function sourceText(bytes, path) {
  if (bytes.includes(0)) throw new Error(`源码文件不是 UTF-8 文本：${path}`);
  try { return decoder.decode(bytes); }
  catch { throw new Error(`源码文件不是 UTF-8 文本：${path}`); }
}

/** Bounded source inventory, not a Git commit hash or a semantic correctness claim. */
export async function projectSnapshot(root) {
  const files = [], repositories = sourceRepositories(root);
  let canonicalRoot, repository;
  let totalBytes = 0;
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => lexicalSort(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || excludedDirectories.has(entry.name.toLowerCase()) || secretName.test(entry.name)) continue;
        await visit(full);
      } else if (entry.isFile() && eligibleFile(entry.name)) {
        const localPath = relative(canonicalRoot, full).split(sep).join('/'), path = sourceReference(root, repository, localPath);
        if (files.length >= MAX_FILES) throw new Error(`项目超出本轮图 Agent 的 ${MAX_FILES} 个源码文件上限`);
        const approved = await plainPath(root, path);
        const stat = await lstat(approved);
        if (totalBytes + stat.size > MAX_BYTES) throw new Error('项目源码超出本轮图 Agent 的 5 MiB 上限');
        const bytes = await readFile(approved);
        sourceText(bytes, path);
        totalBytes += bytes.length;
        if (totalBytes > MAX_BYTES) throw new Error('项目源码超出本轮图 Agent 的 5 MiB 上限');
        files.push({ path, hash: sha(bytes), bytes: bytes.length });
      }
    }
  }
  for (repository of repositories) { canonicalRoot = await realpath(repository.path); await visit(canonicalRoot); }
  files.sort((a, b) => lexicalSort(a.path, b.path));
  return { hash: sha(JSON.stringify(files)), files };
}

export function compareSnapshots(before, after) {
  const oldFiles = new Map(before.files.map(file => [file.path, file.hash]));
  const newFiles = new Map(after.files.map(file => [file.path, file.hash]));
  return [...new Set([...oldFiles.keys(), ...newFiles.keys()])].filter(path => oldFiles.get(path) !== newFiles.get(path)).sort(lexicalSort);
}

/** Reads only a fresh manifest-approved source file. No arbitrary file-read capability. */
export async function readProjectFile(root, path, startLine = 1, endLine) {
  relativeFile(path);
  if (!Number.isInteger(startLine) || startLine < 1 || (endLine !== undefined && (!Number.isInteger(endLine) || endLine < startLine))) throw new Error('源码读取范围必须是从 1 开始的有效行号');
  if (endLine !== undefined && endLine - startLine + 1 > 300) throw new Error('单次源码读取最多 300 行');
  const snapshot = await projectSnapshot(root), file = snapshot.files.find(item => item.path === path);
  if (!file) throw new Error(`文件不在图 Agent 的源码清单中：${path}`);
  const bytes = await readFile(await plainPath(root, path));
  if (sha(bytes) !== file.hash) throw new Error('源码在读取期间发生变化，请重试');
  const lines = sourceText(bytes, path).split('\n');
  if (startLine > lines.length) throw new Error(`起始行超出文件范围：共 ${lines.length} 行`);
  const last = Math.min(endLine ?? startLine + 299, lines.length);
  return { path, hash: file.hash, codeHash: snapshot.hash, startLine, endLine: last, totalLines: lines.length,
    text: lines.slice(startLine - 1, last).map((line, index) => `${startLine + index}: ${line}`).join('\n'), truncated: last < lines.length };
}

/** Raw graph hash used by commitGraph, distinct from readGraph's binding-aware graphHash. */
export async function graphFileState(root) {
  let path;
  try { path = await plainPath(graphRootOf(root), 'factory.graph.json'); }
  catch (error) { if (error.code === 'ENOENT') return { raw: null, hash: 'empty' }; throw error; }
  const bytes = await readFile(path);
  if (bytes.length > MAX_BYTES) throw new Error('现有图源码超出 5 MiB 上限');
  return { raw: sourceText(bytes, 'factory.graph.json'), hash: sha(bytes) };
}

async function assertVersion(root, expectedCodeHash, expectedGraphHash) {
  const snapshot = await projectSnapshot(root);
  if (snapshot.hash !== expectedCodeHash) throw new Error('代码版本已变化，未发布图；请重新读取变更并生成');
  const existing = await graphFileState(root);
  if (existing.hash !== expectedGraphHash) throw new Error('图版本已变化，未覆盖较新的图');
  return snapshot;
}

/**
 * Validate and publish only factory.graph.json. Bindings need a separate explicit review.
 * A lock serializes cooperating graph writers; business code is checked again immediately
 * before rename. This is optimistic validation, not a filesystem-wide source-edit lock.
 */
export async function commitGraph(root, graph, { expectedCodeHash, expectedGraphHash } = {}) {
  if (!/^[a-f\d]{64}$/.test(expectedCodeHash ?? '') || !(expectedGraphHash === 'empty' || /^[a-f\d]{64}$/.test(expectedGraphHash ?? ''))) throw new Error('发布图需要明确的代码快照 hash 和原始图文件 hash（无图时为 empty）');
  const raw = typeof graph === 'string' ? graph : JSON.stringify(graph, null, 2) + '\n';
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) throw new Error('候选图必须是 5 MiB 以内的 JSON');
  const canonicalRoot = await realpath(graphRootOf(root)), lockPath = resolve(canonicalRoot, '.factory-graph-commit.lock');
  const lock = await open(lockPath, 'wx').catch(error => { if (error.code === 'EEXIST') throw new Error('另一次图发布正在进行，请稍后重试'); throw error; });
  let temp;
  try {
    const snapshot = await assertVersion(root, expectedCodeHash, expectedGraphHash);
    await plainPath(canonicalRoot, 'factory.bindings.json', { allowMissing: true });
    const candidate = JSON.parse(raw), manifest = new Map(snapshot.files.map(file => [file.path, file]));
    // Check references before inspectBindings reads any referenced path.
    for (const node of Array.isArray(candidate?.nodes) ? candidate.nodes : []) {
      for (const ref of Array.isArray(node?.data?.sourceRefs) ? node.data.sourceRefs : []) {
        relativeFile(ref?.path);
        const file = manifest.get(ref.path);
        if (!file) throw new Error(`组件引用不属于项目源码清单：${ref.path}`);
        const bytes = await readFile(await plainPath(root, ref.path));
        if (sha(bytes) !== file.hash) throw new Error(`校验期间源码发生变化：${ref.path}`);
        const lines = sourceText(bytes, ref.path).split('\n');
        if (!Number.isInteger(ref.startLine) || !Number.isInteger(ref.endLine) || ref.startLine < 1 || ref.endLine < ref.startLine || ref.endLine > lines.length) throw new Error(`组件引用行范围无效：${ref.path}`);
      }
    }
    const inspected = await readGraph(root, { raw });
    const layout = layoutHierarchy(inspected.graph), routes = planRoutes(inspected.graph, layout);
    const output = await plainPath(canonicalRoot, 'factory.graph.json', { allowMissing: true });
    temp = resolve(canonicalRoot, `.factory-graph-${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(raw, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await assertVersion(root, expectedCodeHash, expectedGraphHash);
    await rename(temp, output);
    temp = undefined;
    return { published: true, codeHash: expectedCodeHash, rawGraphHash: sha(raw), graphHash: inspected.graphHash,
      nodeCount: inspected.graph.nodes.length, edgeCount: inspected.graph.edges.length, rootCount: layout.roots.length,
      routeCount: routes.length, sourceIntegrity: inspected.graph.meta.sourceIntegrity,
      note: '图结构、路由与引用范围已校验；未自动更新对应关系基线，不代表语义或运行正确性已认证。' };
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}
