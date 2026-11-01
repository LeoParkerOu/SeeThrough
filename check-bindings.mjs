import { resolve } from 'node:path';
import { readGraph } from './graph-store.mjs';
import { reviewBindings } from './source-bindings.mjs';

const [command, projectRoot, ...args] = process.argv.slice(2);
if (!['check', 'review'].includes(command) || !projectRoot) {
  console.error('用法: node plugin/check-bindings.mjs check <项目目录>\n或: node plugin/check-bindings.mjs review <项目目录> --nodes id1,id2 --expected-hash <check返回的graphHash> --reason "已核对的具体行为和引用"');
  process.exitCode = 1;
} else {
  try {
    const root = resolve(projectRoot);
    let result;
    if (command === 'review') {
      const option = key => args[args.indexOf(key) + 1];
      if (!['--nodes', '--expected-hash', '--reason'].every(flag => args.includes(flag))) throw new Error('review 必须显式指定组件、已检查的图哈希和理由');
      result = await reviewBindings(root, { nodeIds: option('--nodes').split(','), expectedGraphHash: option('--expected-hash'), reason: option('--reason'), reviewer: 'local-command' });
    } else result = await readGraph(root);
    console.log(JSON.stringify({ graphHash: result.graphHash, ...(result.updated ? { updated: result.updated } : {}), summary: result.graph.meta.sourceIntegrity,
      nodes: result.graph.nodes.map(n => ({ nodeId: n.id, state: n.data.sourceStatus.state, codeSize: n.data.codeSize.lines, currentSourceRefs: n.data.currentSourceRefs, issues: n.data.sourceStatus.issues })) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
