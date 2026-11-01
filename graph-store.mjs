import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectBindings, safeSourcePath } from './source-bindings.mjs';
import { graphRootOf, sourceLocation } from './graph-library.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// A candidate can be inspected without publishing it or refreshing its bindings.
export async function readGraph(root, { raw: candidateRaw } = {}) {
  const raw = candidateRaw ?? await readFile(await safeSourcePath(graphRootOf(root), 'factory.graph.json'), 'utf8');
  if (typeof raw !== 'string') throw new Error('图源码必须是 JSON 文本');
  const graph = JSON.parse(raw);
  if (!object(graph)) throw new Error('图源码根值必须是对象，包含 nodes 和 edges');
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('图源码需要 nodes 和 edges');
  if (graph.meta !== undefined && !object(graph.meta)) throw new Error('图源码 meta 必须是对象');
  const nodeIds = new Set(), edgeIds = new Set();
  for (const [index, node] of graph.nodes.entries()) {
    if (!object(node)) throw new Error(`nodes[${index}] 必须是组件对象，不能是 null、数组或其他类型`);
    if (!nonempty(node.id)) throw new Error(`nodes[${index}].id 必须是非空字符串`);
    if (nodeIds.has(node.id)) throw new Error(`nodes[${index}].id 重复：${node.id}`);
    nodeIds.add(node.id);
    const location = `nodes[${index}]（${node.id}）`;
    if (!object(node.data)) throw new Error(`${location}.data 必须是包含 label 等职责字段的对象`);
    if (!nonempty(node.data.label)) throw new Error(`${location}.data.label 必须是非空、可读的组件名称`);
    // Legacy graphs may omit optional prose. Do not insert defaults into graph
    // data: doing so would change the recorded meaning hash of existing nodes.
    for (const field of ['description', 'annotation', 'input', 'output', 'role', 'kind']) {
      if (node.data[field] !== undefined && node.data[field] !== null && typeof node.data[field] !== 'string') throw new Error(`${location}.data.${field} 必须是字符串，未提供时可省略`);
    }
    if (node.data.parentId !== undefined && node.data.parentId !== null && !nonempty(node.data.parentId)) throw new Error(`${location}.data.parentId 必须是非空组件 ID，顶层组件可省略`);
    if (node.data.sourceRefs !== undefined) {
      if (!Array.isArray(node.data.sourceRefs)) throw new Error(`${location}.data.sourceRefs 必须是源码引用数组`);
      for (const [refIndex, ref] of node.data.sourceRefs.entries()) {
        const refLocation = `${location}.data.sourceRefs[${refIndex}]`;
        if (!object(ref)) throw new Error(`${refLocation} 必须是包含 path、startLine、endLine 的对象`);
        if (!nonempty(ref.path)) throw new Error(`${refLocation}.path 必须是非空文件路径`);
        if (!Number.isInteger(ref.startLine) || ref.startLine < 1 || !Number.isInteger(ref.endLine) || ref.endLine < ref.startLine) throw new Error(`${refLocation} 行号必须是正整数，且 endLine 不得小于 startLine`);
        if (ref.symbol !== undefined && ref.symbol !== null && typeof ref.symbol !== 'string') throw new Error(`${refLocation}.symbol 必须是字符串，未提供时可省略`);
      }
    }
  }
  for (const [index, edge] of graph.edges.entries()) {
    if (!object(edge)) throw new Error(`edges[${index}] 必须是连线对象`);
    if (!nonempty(edge.id) || edgeIds.has(edge.id)) throw new Error(`edges[${index}] 连线 ID 缺失或重复${edge.id ? `：${edge.id}` : ''}`);
    edgeIds.add(edge.id);
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`连线 ${edge.id} 的起点或终点无效：必须引用当前图中的组件 ID`);
    }
    if (edge.data !== undefined && !object(edge.data)) throw new Error(`edges[${index}]（${edge.id}）.data 必须是对象`);
    if (edge.label !== undefined && edge.label !== null && typeof edge.label !== 'string') throw new Error(`edges[${index}]（${edge.id}）.label 必须是字符串`);
  }
  const views = graph.meta?.keyViews;
  if (views !== undefined) {
    if (!Array.isArray(views)) throw new Error('keyViews 必须是数组');
    const seen = new Set();
    const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
    const parents = new Map(graph.nodes.map(n => [n.id, n.data.parentId]));
    for (const view of views) {
      const scope = new Set();
      if (Array.isArray(view?.nodeIds)) for (let id of view.nodeIds) {
        while (id && !scope.has(id)) { scope.add(id); id = parents.get(id); }
      }
      if (!object(view) || !nonempty(view.id) || seen.has(view.id) || !nonempty(view.title) || !nonempty(view.summary)
          || !Array.isArray(view.nodeIds) || !view.nodeIds.length || view.nodeIds.some(id => !nodeIds.has(id))
          || !Array.isArray(view.edgeIds) || view.edgeIds.some(id => !edges.has(id) || ![edges.get(id).source, edges.get(id).target].every(node => scope.has(node)))
          || (view.angle !== undefined && !Number.isFinite(view.angle))) throw new Error('关键视角需要有效标题、说明、组件与对应连线');
      if (view.stages !== undefined && (!Array.isArray(view.stages) || view.stages.some(step => !object(step) || !view.nodeIds.includes(step.nodeId) || !nonempty(step.label) || !nonempty(step.text)))) throw new Error('视角步骤必须指向本视角组件并提供说明');
      if (view.mapLabels !== undefined && (!object(view.mapLabels) || Object.entries(view.mapLabels).some(([id, label]) => !scope.has(id) || !nonempty(label)))) throw new Error('视角标签必须对应当前范围');
      if (view.caution !== undefined && !nonempty(view.caution)) throw new Error('视角核查提示必须是文本');
      seen.add(view.id);
    }
  }
  return inspectBindings(root, graph, raw);
}

export async function nodeSource(root, nodeId) {
  const { graph, graphHash } = await readGraph(root);
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`未知组件 ${nodeId}`);
  const sourceStatus = node.data.sourceStatus;
  const source = sourceStatus.explanationReady ? sourceStatus.refs.map(ref => ({
    ...ref.currentRef, sha256: ref.fileHash, anchorSha256: ref.anchorHash, state: ref.state, text: ref.numberedText,
  })) : [];
  return { nodeId, label: node.data.label, description: node.data.description ?? '', graphHash, sourceStatus, codeSize: node.data.codeSize, source,
    ...(!sourceStatus.explanationReady ? { warning: '图与代码对应待核实；source 为空。先读取实际源码，核对组件描述和 sourceRefs，再显式更新绑定。不要据旧图作重要解释。' } : {}) };
}

export async function sourceNodes(root, path, line) {
  if (line !== undefined && (!Number.isInteger(line) || line < 1)) throw new Error('行号必须为正整数');
  const target = await safeSourcePath(root, path, { allowMissing: true });
  const { graph, graphHash } = await readGraph(root);
  const nodes = graph.nodes.filter(n => n.data.sourceStatus.explanationReady && n.data.sourceStatus.refs.some(ref =>
    ref.canonicalPath === target && (line === undefined || (line >= ref.currentRef.startLine && line <= ref.currentRef.endLine))
  )).map(n => ({ nodeId: n.id, label: n.data.label, state: n.data.sourceStatus.state, currentSourceRefs: n.data.currentSourceRefs }));
  const historicalPath = ref => { const location = sourceLocation(root, ref); return resolve(location.root, location.path); };
  const staleCandidates = graph.nodes.filter(n => !n.data.sourceStatus.explanationReady && (n.data.sourceRefs ?? []).some(ref =>
    historicalPath(ref.path) === historicalPath(path)
  )).map(n => ({ nodeId: n.id, label: n.data.label, state: n.data.sourceStatus.state, reason: '仅历史文件关联，不是当前行号命中' }));
  return { path, ...(line === undefined ? {} : { line }), nodes, staleCandidates, graphHash };
}
