import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createGraphLibrary } from './graph-library.mjs';
import { projectSnapshot, graphFileState, commitGraph, readProjectFile } from './graph-agent-files.mjs';
import { readGraph, nodeSource, sourceNodes } from './graph-store.mjs';
import { reviewBindings, safeSourcePath } from './source-bindings.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'factory-library-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = resolve(root, 'state'), a = resolve(root, 'repo-a'), b = resolve(root, 'repo-b');
  for (const repo of [a, b]) await mkdir(resolve(repo, 'src'), { recursive: true });
  await writeFile(resolve(a, 'src/index.js'), 'export const service = "A";\n');
  await writeFile(resolve(b, 'src/index.js'), 'export const service = "B";\n');
  return { root, state, a, b, library: createGraphLibrary(state) };
}
const graph = refs => ({ nodes: refs.map((path, i) => ({ id: `n${i}`, data: { label: `处理器 ${i}`, kind: 'processor', description: '读取当前服务标识', sourceRefs: [{ path, startLine: 1, endLine: 1 }] } })), edges: [] });
async function publish(scope, value) {
  const snapshot = await projectSnapshot(scope), previous = await graphFileState(scope);
  return commitGraph(scope, value, { expectedCodeHash: snapshot.hash, expectedGraphHash: previous.hash });
}
async function review(scope) {
  const current = await readGraph(scope);
  return reviewBindings(scope, { nodeIds: current.graph.nodes.map(node => node.id), expectedGraphHash: current.graphHash, reason: '已核对服务标识实现与各组件职责和源码引用范围', reviewer: 'test-fixture' });
}

test('explicit selection, persistent A → B → A, and originals remain untouched', async t => {
  const { library, state, a, b } = await fixture(t);
  assert.deepEqual(await library.list('chat'), { activeId: null, active: null, entries: [] });
  const aScope = await library.select('chat', { title: '前端', repositories: [{ path: a }] });
  assert.equal(aScope.hasGraph, false);
  assert.deepEqual(await readdir(aScope.graphRoot), []);
  assert.deepEqual(await readdir(a), ['src']);
  await publish(aScope, graph(['src/index.js'])); await review(aScope);
  const aBytes = await readFile(resolve(aScope.graphRoot, 'factory.graph.json'));
  const bScope = await library.select('chat', { title: '后端', repositories: [{ path: b }] });
  await publish(bScope, graph(['src/index.js']));
  const reopened = createGraphLibrary(state);
  assert.equal((await reopened.context('chat')).id, bScope.id);
  const back = await reopened.select('chat', { graphId: aScope.id });
  assert.equal(back.hasGraph, true);
  assert.deepEqual(await readFile(resolve(back.graphRoot, 'factory.graph.json')), aBytes);
  assert.equal((await reopened.list('chat')).entries.length, 2);
  assert.deepEqual(await readdir(a), ['src']); assert.deepEqual(await readdir(b), ['src']);
  assert.equal((await nodeSource(back, 'n0')).sourceStatus.state, 'verified');
  await assert.rejects(reopened.select('other-chat', { graphId: aScope.id }), /不属于当前会话/);
});

test('multiple repositories keep identical relative filenames distinct and bindings become stale', async t => {
  const { library, a, b } = await fixture(t);
  const scope = await library.select('chat', { repositories: [{ path: a }, { path: b }] });
  const selectedAgain = await library.select('chat', { repositories: [{ path: b }, { path: a }, { path: a }] });
  assert.equal(scope.id, selectedAgain.id);
  const manifest = await projectSnapshot(scope);
  assert.equal(manifest.files.length, 2); assert.notEqual(manifest.files[0].path, manifest.files[1].path);
  const aRef = `${scope.repositories.find(repo => repo.path === a).id}/src/index.js`;
  const bRef = `${scope.repositories.find(repo => repo.path === b).id}/src/index.js`;
  assert.match((await readProjectFile(scope, aRef)).text, /"A"/);
  assert.match((await readProjectFile(scope, bRef)).text, /"B"/);
  await assert.rejects(readProjectFile(scope, 'src/index.js'), /清单/);
  await publish(scope, graph([aRef, bRef])); await review(scope);
  assert.deepEqual((await sourceNodes(scope, aRef, 1)).nodes.map(node => node.nodeId), ['n0']);
  assert.deepEqual((await sourceNodes(scope, bRef, 1)).nodes.map(node => node.nodeId), ['n1']);
  await writeFile(resolve(a, 'src/index.js'), 'export const service = "A2";\n');
  assert.equal((await nodeSource(scope, 'n0')).sourceStatus.state, 'stale');
  assert.deepEqual((await nodeSource(scope, 'n0')).source, []);
  assert.equal((await nodeSource(scope, 'n1')).sourceStatus.state, 'verified');
  assert.deepEqual((await sourceNodes(scope, aRef, 1)).staleCandidates.map(node => node.nodeId), ['n0']);
});

test('selection imports existing files once without changing the repository or trusting bindings', async t => {
  const { library, a } = await fixture(t);
  const original = JSON.stringify(graph(['src/index.js']));
  await writeFile(resolve(a, 'factory.graph.json'), original);
  const scope = await library.select('chat', { repositories: [{ path: a }] });
  assert.equal(scope.hasGraph, true); assert.equal(scope.importedFromProject, true);
  assert.equal((await nodeSource(scope, 'n0')).sourceStatus.state, 'unverified');
  await publish(scope, { ...graph(['src/index.js']), meta: { localChange: true } });
  assert.equal(await readFile(resolve(a, 'factory.graph.json'), 'utf8'), original);
  const again = await library.select('chat', { repositories: [{ path: a }] });
  assert.equal((await readGraph(again)).graph.meta.localChange, true);
});

test('scope refuses traversal, unknown repository prefixes, and both inside and outside symlinks', async t => {
  const { library, a, b } = await fixture(t);
  const scope = await library.select('chat', { repositories: [{ path: a }, { path: b }] });
  const id = scope.repositories.find(repo => repo.path === a).id;
  await symlink(resolve(b, 'src/index.js'), resolve(a, 'escape.js'));
  await symlink(resolve(a, 'src/index.js'), resolve(a, 'internal.js'));
  await symlink(b, resolve(a, 'linked'));
  for (const path of [`${id}/../repo-b/src/index.js`, 'wrong/src/index.js', `${id}/escape.js`, `${id}/internal.js`, `${id}/linked/src/index.js`, `${id}/linked/missing.js`, '/etc/hosts']) {
    await assert.rejects(safeSourcePath(scope, path, { allowMissing: true }));
  }
  const manifest = await projectSnapshot(scope);
  assert.equal(manifest.files.length, 2);
});

test('file and byte limits apply to the combined repositories; selection itself does not scan', async t => {
  const { library, a, b } = await fixture(t);
  await writeFile(resolve(a, 'large.js'), 'a'.repeat(3 * 1024 * 1024));
  await writeFile(resolve(b, 'large.js'), 'b'.repeat(3 * 1024 * 1024));
  const scope = await library.select('chat', { repositories: [{ path: a }, { path: b }] });
  assert.equal(scope.hasGraph, false);
  await assert.rejects(projectSnapshot(scope), /5 MiB/);
  for (const repo of [a, b]) { await rm(resolve(repo, 'large.js')); await Promise.all(Array.from({ length: 250 }, (_, i) => writeFile(resolve(repo, `file${i}.js`), '1;'))); }
  await assert.rejects(projectSnapshot(scope), /500/);
});

test('parallel selections from separate library instances retain both session entries', async t => {
  const { library, state, a, b } = await fixture(t);
  await Promise.all([library.select('chat', { repositories: [{ path: a }] }), createGraphLibrary(state).select('chat', { repositories: [{ path: b }] })]);
  assert.equal((await library.list('chat')).entries.length, 2);
});
