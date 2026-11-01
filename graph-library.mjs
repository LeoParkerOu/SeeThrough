import { copyFile, lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const graphIdPattern = /^graph-[a-f0-9]{24}$/;
const safeRelative = path => {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\') || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('请使用范围内的相对源码路径，不能越出仓库');
  return path;
};

/** Graph storage and source roots are intentionally separate. Strings support legacy callers. */
export function graphRootOf(scope) {
  const root = typeof scope === 'string' ? scope : scope?.graphRoot;
  if (typeof root !== 'string' || !root) throw new Error('尚未明确选择要查看的代码库');
  return root;
}

export function sourceRepositories(scope) {
  if (typeof scope === 'string') return [{ id: null, path: scope, label: basename(scope) }];
  if (!Array.isArray(scope?.repositories) || !scope.repositories.length) throw new Error('当前图没有明确的代码库范围');
  return scope.repositories;
}

export function sourceLocation(scope, path) {
  safeRelative(path);
  const repositories = sourceRepositories(scope);
  if (repositories.length === 1) return { root: repositories[0].path, path, repository: repositories[0] };
  const slash = path.indexOf('/'), repository = repositories.find(repo => repo.id === path.slice(0, slash));
  if (slash < 1 || !repository) throw new Error('多仓库源码引用必须使用清单中的 仓库ID/相对路径');
  return { root: repository.path, path: safeRelative(path.slice(slash + 1)), repository };
}

export function sourceReference(scope, repository, path) {
  safeRelative(path);
  return sourceRepositories(scope).length === 1 ? path : `${repository.id}/${path}`;
}

async function regularFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('工厂图资料必须是普通文件，不能是符号链接');
  return stat;
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('工厂图库目录不能是符号链接');
}

/** Selection does directory identity checks only: no source inventory, model call, or graph rewrite. */
export function createGraphLibrary(stateDirectory) {
  const directory = resolve(stateDirectory), indexPath = resolve(directory, 'graph-library.json');
  const graphDirectory = resolve(directory, 'graphs'), lockPath = resolve(directory, '.graph-library.lock');
  const sessionKey = sessionId => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('选择工厂图需要当前会话');
    return hash(sessionId);
  };
  async function readIndex() {
    try {
      await regularFile(indexPath);
      const value = JSON.parse(await readFile(indexPath, 'utf8'));
      if (value.schemaVersion !== 1 || !value.graphs || !value.sessions) throw new Error('工厂图库索引格式无效');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 1, graphs: {}, sessions: {} };
      throw error;
    }
  }
  async function scope(entry) {
    if (!entry || !graphIdPattern.test(entry.id)) throw new Error('找不到保存的工厂图');
    const graphRoot = resolve(graphDirectory, entry.id);
    let hasGraph = false;
    try { await regularFile(resolve(graphRoot, 'factory.graph.json')); hasGraph = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { ...structuredClone(entry), graphRoot, hasGraph };
  }
  async function withIndex(action) {
    await ensureDirectory(directory);
    await ensureDirectory(graphDirectory);
    let lock;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { lock = await open(lockPath, 'wx'); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(done => setTimeout(done, 25)); }
    }
    if (!lock) throw new Error('工厂图库正在更新，请稍后重试');
    const temp = resolve(directory, `.graph-library-${randomUUID()}.tmp`);
    try {
      const index = await readIndex(), result = await action(index);
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(index, null, 2) + '\n'); await file.sync(); }
      finally { await file.close(); }
      await rename(temp, indexPath);
      return result;
    } finally {
      await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await lock.close();
      await unlink(lockPath);
    }
  }
  async function list(sessionId) {
    const index = await readIndex(), session = index.sessions[sessionKey(sessionId)];
    const entries = await Promise.all((session?.graphIds ?? []).map(id => scope(index.graphs[id])));
    const active = entries.find(entry => entry.id === session?.activeId) ?? null;
    return { activeId: active?.id ?? null, active, entries };
  }
  async function select(sessionId, { graphId, title, repositories } = {}) {
    const key = sessionKey(sessionId);
    if (graphId && repositories) throw new Error('请按已保存图 ID 或代码库范围二选一');
    if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 120)) throw new Error('工厂图名称需要 1–120 个字符');
    let roots;
    if (!graphId) {
      if (!Array.isArray(repositories) || !repositories.length || repositories.length > 16) throw new Error('请明确指定 1–16 个代码库目录');
      roots = await Promise.all(repositories.map(async repo => {
        if (typeof repo?.path !== 'string' || !isAbsolute(repo.path) || repo.path.includes('\0')) throw new Error('代码库目录必须是明确的绝对路径');
        const path = await realpath(repo.path), stat = await lstat(path);
        if (!stat.isDirectory()) throw new Error('选择的代码库不是目录');
        return { id: `repo-${hash(path).slice(0, 10)}`, path, label: typeof repo.label === 'string' && repo.label.trim() ? repo.label.trim().slice(0, 120) : basename(path) };
      }));
      roots = [...new Map(roots.map(repo => [repo.path, repo])).values()].sort((a, b) => a.path.localeCompare(b.path));
      graphId = `graph-${hash(JSON.stringify(roots.map(repo => repo.path))).slice(0, 24)}`;
    } else if (!graphIdPattern.test(graphId)) throw new Error('工厂图 ID 无效');
    return withIndex(async index => {
      const now = new Date().toISOString(), session = index.sessions[key] ?? { graphIds: [], activeId: null };
      if (!roots && !session.graphIds.includes(graphId)) throw new Error('该图不属于当前会话的历史，请明确提供代码库范围');
      let entry = index.graphs[graphId];
      if (!entry) {
        entry = { id: graphId, title: title?.trim() ?? roots.map(repo => repo.label).join(' + '), repositories: roots, createdAt: now, updatedAt: now };
        const graphRoot = resolve(graphDirectory, graphId);
        await ensureDirectory(graphRoot);
        // A one-time copy preserves existing project graphs and bindings. Imported content
        // is not trusted here; readGraph still performs normal validation and source checks.
        if (roots.length === 1) {
          let imported = false;
          for (const name of ['factory.graph.json', 'factory.bindings.json']) {
            if (name === 'factory.bindings.json' && !imported) continue;
            const from = resolve(roots[0].path, name);
            try {
              const stat = await regularFile(from);
              if (stat.size > 5 * 1024 * 1024) throw new Error('已有工厂图文件超出 5 MiB 上限');
              await copyFile(from, resolve(graphRoot, name), 1);
              if (name === 'factory.graph.json') imported = true;
            } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error; }
          }
          if (imported) entry.importedFromProject = true;
        }
        index.graphs[graphId] = entry;
      } else if (title) { entry.title = title.trim(); entry.updatedAt = now; }
      if (!session.graphIds.includes(graphId)) session.graphIds.push(graphId);
      session.activeId = graphId;
      index.sessions[key] = session;
      return scope(entry);
    });
  }
  return { list, select, context: async sessionId => (await list(sessionId)).active,
    metadata: async id => scope((await readIndex()).graphs[id]) };
}
