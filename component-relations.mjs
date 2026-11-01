// Mixed call/data-flow graphs cannot infer impact direction from arrow direction alone.
export function componentRelations(graph, id, kind, deep = false) {
  if (!graph.nodes.some(node => node.id === id)) throw new Error('组件已不存在');
  const nodes = new Set([id]), edges = new Map();
  let frontier = [id];
  do {
    const next = [];
    for (const current of frontier) for (const edge of graph.edges) {
      if (edge.source !== current && edge.target !== current) continue;
      edges.set(edge.id, edge);
      for (const endpoint of [edge.source, edge.target]) if (!nodes.has(endpoint)) {
        nodes.add(endpoint); next.push(endpoint);
      }
    }
    frontier = next;
  } while (kind === 'impact' && deep && frontier.length);
  return { nodeIds:[...nodes], edges:[...edges.values()] };
}
