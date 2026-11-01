// Visual size encodes verified mapped source scope, never importance or complexity.
// Backend computes de-duplicated source lines; graph-authored arbitrary size is ignored.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const trusted = new Set(['verified', 'relocated']);

export function sourceLineCount(node) {
  const data = node?.data ?? {};
  const count = data.codeSize?.lines;
  return trusted.has(data.sourceStatus?.state) && data.codeSize?.basis === 'mapped-source-lines'
    && Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function encodeNodeSizes(graph) {
  const groups = new Map();
  for (const node of graph.nodes) {
    const parentId = node.data?.parentId ?? null;
    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId).push(node);
  }
  const result = new Map();
  for (const group of groups.values()) {
    const counts = group.map(sourceLineCount).filter(n => n !== null).sort((a, b) => a - b);
    const middle = Math.floor(counts.length / 2);
    const median = counts.length ? (counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2) : null;
    for (const node of group) {
      const lines = sourceLineCount(node);
      // Add a small prior to avoid letting 1 versus 2 lines double the visual signal.
      const factor = lines === null ? 1 : clamp(1 + .18 * Math.log2((lines + 16) / (median + 16)), .82, 1.22);
      result.set(node.id, { factor, lines, siblingMedianLines: median,
        basis: lines === null ? 'neutral-unverified-or-empty' : 'verified-mapped-source-lines',
        meaning: 'relative-source-scope-within-parent', minFactor: .82, maxFactor: 1.22 });
    }
  }
  return result;
}

// Thickness expresses declared structural role only. No throughput is inferred.
export function encodePipe(edge, scale) {
  const branch = edge.data?.branch ?? 'success';
  const role = branch === 'error' ? 'error' : branch === 'loop' ? 'loop'
    : ['main', 'secondary'].includes(edge.data?.flowRole) ? edge.data.flowRole : 'ordinary';
  const radius = { main: .14, ordinary: .10, secondary: .075, error: .09, loop: .075 }[role];
  return {
    flowRole: role, pipeRadius: radius * scale,
    pipeRadiusLimit: .14 * scale, flangeRadiusLimit: 1.3 * radius * scale,
    minPixelWidth: { main: 5, ordinary: 3.5, secondary: 2.5, error: 3, loop: 2.5 }[role],
    thicknessBasis: 'declared-flow-role-not-measured-throughput',
    directionStyle: { source: 'source-to-target', minPixelSize: 8, repeatDistance: 2.2 * scale, endpoint: 'target' },
  };
}
