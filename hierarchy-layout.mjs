// Rule-based nesting for the bounded factory example. This does not infer architecture.
import { encodeNodeSizes } from './visual-encoding.mjs';
import { machineFootprint } from './equipment-footprints.mjs';
const SHELL_MARGIN_X = 1.10;
const SHELL_MARGIN_Z = 1.44;
const TIGHT_GAP = .9;
const FLOW_GAP = 2.2;
const PARALLEL_GAP = 1.8;
const SUPPORT_GAP = 1.45;
const INDEPENDENT_GAP = 3.0;

// Responsibilities/edges determine topology; coordinates remain renderer-owned.
// Calls are never guessed from component names or source-file proximity.
function relationPlacement(ids, source, edges, sizes, footprints, parentId, minimumGap = { x: 0, z: 0 }) {
  const order = new Map(ids.map((id, i) => [id, i]));
  const siblings = new Set(ids);
  const local = edges.filter(e => siblings.has(e.source) && siblings.has(e.target) && e.source !== e.target);
  const success = local.filter(e => !['error', 'loop'].includes(e.data?.branch));
  const primary = success.filter(e => e.data?.flowRole !== 'secondary');
  const backbone = primary.length ? primary : success;
  const primaryIds = new Set(backbone.flatMap(e => [e.source, e.target]));
  if (!primaryIds.size && ids.length) primaryIds.add(ids[0]);
  const main = ids.filter(id => primaryIds.has(id));
  const next = new Map(main.map(id => [id, []])), degree = new Map(main.map(id => [id, 0]));
  const unique = new Set();
  for (const e of backbone) {
    const key = `${e.source}\0${e.target}`;
    if (unique.has(key)) continue;
    unique.add(key); next.get(e.source).push(e.target); degree.set(e.target, degree.get(e.target) + 1);
  }
  const rank = new Map(main.map(id => [id, 0])), done = new Set(), ready = main.filter(id => !degree.get(id));
  while (done.size < main.length) {
    // A cycle remains in the graph; a stable cut is only for positioning.
    if (!ready.length) ready.push(main.find(id => !done.has(id)));
    ready.sort((a, b) => order.get(a) - order.get(b));
    const id = ready.shift(); if (done.has(id)) continue;
    done.add(id);
    for (const target of next.get(id)) {
      if (done.has(target)) continue;
      rank.set(target, Math.max(rank.get(target), rank.get(id) + 1));
      degree.set(target, degree.get(target) - 1);
      if (degree.get(target) <= 0) ready.push(target);
    }
  }
  const layers = [];
  for (const id of main) (layers[rank.get(id)] ??= []).push(id);
  const width = id => footprints.get(id).width * sizes.get(id).factor;
  const depth = id => footprints.get(id).depth * sizes.get(id).factor;
  const maxColumns = parentId === null ? 6 : 4;
  const columns = Math.min(maxColumns, Math.max(1, layers.length));
  const outgoing = new Map(ids.map(id => [id, new Set()])), incoming = new Map(ids.map(id => [id, new Set()]));
  for (const e of success) { outgoing.get(e.source).add(e.target); incoming.get(e.target).add(e.source); }
  // Tight workcells come only from uninterrupted 1-to-1 chains, capped at 3.
  // A branch, merge, folded row or missing relation ends the group.
  const clusterFor = new Map();
  for (const id of [...main].sort((a, b) => rank.get(a) - rank.get(b) || order.get(a) - order.get(b))) {
    if (clusterFor.has(id) || layers[rank.get(id)].length !== 1) continue;
    const group = [id]; let current = id;
    while (group.length < 3 && outgoing.get(current).size === 1) {
      const target = [...outgoing.get(current)][0];
      if (clusterFor.has(target) || group.includes(target) || incoming.get(target).size !== 1 || rank.get(target) !== rank.get(current) + 1 || layers[rank.get(target)].length !== 1 || Math.floor(rank.get(target) / columns) !== Math.floor(rank.get(id) / columns)) break;
      group.push(target); current = target;
    }
    if (group.length > 1) for (const member of group) clusterFor.set(member, `workcell:${parentId ?? 'root'}:${group.join('|')}`);
  }
  const columnOf = i => Math.floor(i / columns) % 2 ? columns - 1 - i % columns : i % columns;
  const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...layers.flatMap((layer, i) => columnOf(i) === column ? layer.map(width) : []), 0));
  const columnGaps = Array.from({ length: Math.max(0, columns - 1) }, (_, column) => {
    const relations = [];
    for (let i = 0; i < layers.length - 1; i++) {
      if (Math.floor(i / columns) !== Math.floor((i + 1) / columns) || Math.min(columnOf(i), columnOf(i + 1)) !== column) continue;
      const a = layers[i], b = layers[i + 1];
      const sameCell = a.length === 1 && b.length === 1 && clusterFor.get(a[0]) && clusterFor.get(a[0]) === clusterFor.get(b[0]);
      const connected = backbone.some(e => a.includes(e.source) && b.includes(e.target));
      relations.push(sameCell ? TIGHT_GAP : connected ? FLOW_GAP : INDEPENDENT_GAP);
    }
    return Math.max(minimumGap.x, ...relations, relations.length ? 0 : FLOW_GAP);
  });
  const parallelGap = Math.max(PARALLEL_GAP, minimumGap.z);
  const xs = []; let cursor = 0;
  columnWidths.forEach((w, i) => { xs.push(cursor + w / 2); cursor += w + (columnGaps[i] ?? 0); });
  const rows = Math.ceil(layers.length / columns), rowDepths = Array.from({ length: rows }, (_, row) => Math.max(...layers.slice(row * columns, (row + 1) * columns).map(layer => layer.reduce((sum, id) => sum + depth(id), 0) + (layer.length - 1) * parallelGap), 0));
  const zs = []; cursor = 0;
  for (const d of rowDepths) { zs.push(cursor + d / 2); cursor += d + Math.max(FLOW_GAP, minimumGap.z); }
  const placements = new Map();
  for (let i = 0; i < layers.length; i++) {
    const row = Math.floor(i / columns), column = row % 2 ? columns - 1 - i % columns : i % columns;
    const layer = layers[i];
    const total = layer.reduce((sum, id) => sum + depth(id), 0) + (layer.length - 1) * parallelGap;
    let z = zs[row] - total / 2;
    for (const id of layer) {
      placements.set(id, { id, x: xs[column], z: z + depth(id) / 2, flowRank: i, layoutKind: layer.length > 1 || (next.get(id)?.length ?? 0) > 1 ? 'branch' : 'flow', siblingCluster: clusterFor.get(id) ?? null });
      z += depth(id) + parallelGap;
    }
  }
  // Placement preferences express affinity; collision clearance is separate.
  // Do not reject a useful diagonal neighbour merely because two expanded
  // preference rectangles overlap at their corners.
  const overlap = (id, x, z, other) => Math.abs(x - other.x) < (width(id) + width(other.id)) / 2 + Math.max(.45, minimumGap.x) - 1e-8 && Math.abs(z - other.z) < (depth(id) + depth(other.id)) / 2 + Math.max(.60, minimumGap.z) - 1e-8;
  for (const id of ids.filter(id => !primaryIds.has(id))) {
    const adjacent = local.filter(e => e.source === id || e.target === id).map(e => placements.get(e.source === id ? e.target : e.source)).filter(Boolean);
    const anchors = adjacent.length ? adjacent : [...placements.values()].slice(0, 1);
    const x = anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length;
    const anchorZ = anchors.reduce((sum, p) => sum + p.z, 0) / anchors.length;
    const gap = Math.max(adjacent.length ? SUPPORT_GAP : INDEPENDENT_GAP, minimumGap.z);
    const candidates = [];
    for (const p of anchors) for (const side of [-1, 1]) {
      candidates.push({ x, z: p.z + side * ((depth(id) + depth(p.id)) / 2 + gap) });
      if (adjacent.length) candidates.push({ x: p.x + side * ((width(id) + width(p.id)) / 2 + Math.max(SUPPORT_GAP, minimumGap.x)), z: p.z });
    }
    for (let step = 1; step <= ids.length + 1; step++) for (const side of [-1, 1]) candidates.push({ x, z: anchorZ + side * step * (Math.max(...anchors.map(p => depth(p.id)), depth(id)) + gap) });
    candidates.sort((a, b) => anchors.reduce((s, p) => s + Math.abs(a.x - p.x) + Math.abs(a.z - p.z), 0) - anchors.reduce((s, p) => s + Math.abs(b.x - p.x) + Math.abs(b.z - p.z), 0) || a.z - b.z);
    const position = candidates.find(p => ![...placements.values()].some(other => overlap(id, p.x, p.z, other)));
    placements.set(id, { id, ...position, flowRank: adjacent.length ? adjacent.reduce((sum, p) => sum + p.flowRank, 0) / adjacent.length : 0, layoutKind: adjacent.length ? 'support' : 'independent' });
  }
  const left = Math.min(...ids.map(id => placements.get(id).x - width(id) / 2));
  const right = Math.max(...ids.map(id => placements.get(id).x + width(id) / 2));
  const top = Math.min(...ids.map(id => placements.get(id).z - depth(id) / 2));
  const bottom = Math.max(...ids.map(id => placements.get(id).z + depth(id) / 2));
  for (const p of placements.values()) { p.x -= (left + right) / 2; p.z -= (top + bottom) / 2; }
  return { placements, width: right - left, depth: bottom - top };
}

export function layoutHierarchy(graph) {
  if (!graph || !Array.isArray(graph.nodes)) throw new Error('层级布局需要 graph.nodes 数组');

  const source = new Map();
  const parents = new Map();
  const children = new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id.trim()) throw new Error('组件 ID 必须是非空字符串');
    if (source.has(node.id)) throw new Error(`组件 ID 重复：${node.id}`);
    const parentId = node.data?.parentId ?? null;
    if (parentId !== null && (typeof parentId !== 'string' || !parentId.trim())) {
      throw new Error(`组件 ${node.id} 的 parentId 必须是非空字符串`);
    }
    source.set(node.id, node);
    parents.set(node.id, parentId);
    children.set(node.id, []);
  }

  const roots = [];
  for (const id of source.keys()) {
    const parentId = parents.get(id);
    if (parentId === null) roots.push(id);
    else {
      if (!source.has(parentId)) throw new Error(`组件 ${id} 引用了未知父组件：${parentId}`);
      children.get(parentId).push(id);
    }
  }

  // Walk every parent chain, including components disconnected from all roots.
  // Explicit stacks avoid a hard-coded hierarchy depth or JavaScript recursion limit.
  const states = new Map();
  for (const startId of source.keys()) {
    if (states.get(startId) === 2) continue;
    const chain = [];
    let id = startId;
    while (id !== null && !states.has(id)) {
      states.set(id, 1);
      chain.push(id);
      id = parents.get(id);
    }
    if (id !== null && states.get(id) === 1) {
      const cycleStart = chain.indexOf(id);
      throw new Error(`组件父子关系存在环：${chain.slice(cycleStart).concat(id).join(' → ')}`);
    }
    for (const visited of chain) states.set(visited, 2);
  }

  const sizeEncodings = encodeNodeSizes(graph);
  // Bottom-up envelopes are derived from content aspect, rather than giving
  // every module a 4.8 x 3.6 exhibition tile. Bounds keep the small-project view
  // usable; source-size encoding remains a separate multiplicative factor.
  const footprints = new Map(), traversal = [...roots];
  for (let i = 0; i < traversal.length; i++) traversal.push(...children.get(traversal[i]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  for (const id of [...traversal].reverse()) {
    const childIds = children.get(id);
    if (!childIds.length) { footprints.set(id, machineFootprint(source.get(id).data?.role || id)); continue; }
    const content = relationPlacement(childIds, source, graph.edges ?? [], sizeEncodings, footprints, id);
    const aspect = clamp(content.width / content.depth, .65, 2.8);
    const innerArea = 9.5 + Math.min(8, childIds.length) * .8;
    const width = clamp(Math.sqrt(innerArea * aspect) + SHELL_MARGIN_X, 3.4, 7.8);
    const depth = clamp(Math.sqrt(innerArea / aspect) + SHELL_MARGIN_Z, 2.8, 6.6);
    footprints.set(id, { width, depth, assetScaleX: width / 4.8, assetScaleZ: depth / 3.6 });
  }
  const laidOut = new Map();
  const rootPlacement = roots.length ? relationPlacement(roots, source, graph.edges ?? [], sizeEncodings, footprints, null) : null;
  const pending = roots.map(id => { const p = rootPlacement.placements.get(id); return { id, center: [p.x, 0, p.z], scale: sizeEncodings.get(id).factor, heightScale: 1, path: [id], placement: p }; });
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const item = pending[cursor];
    const childIds = children.get(item.id);
    const node = {
      id: item.id,
      parentId: parents.get(item.id),
      depth: item.path.length - 1,
      center: item.center,
      scale: item.scale,
      scaleXZ: item.scale,
      heightScale: item.heightScale,
      footprintFactor: sizeEncodings.get(item.id).factor,
      sizeEncoding: sizeEncodings.get(item.id),
      baseWidth: footprints.get(item.id).width,
      baseDepth: footprints.get(item.id).depth,
      assetScaleX: footprints.get(item.id).assetScaleX,
      assetScaleZ: footprints.get(item.id).assetScaleZ,
      width: footprints.get(item.id).width * item.scale,
      depthSize: footprints.get(item.id).depth * item.scale,
      children: [...childIds],
      path: item.path,
      layoutKind: item.placement.layoutKind,
      flowRank: item.placement.flowRank,
      siblingCluster: item.placement.siblingCluster ?? null,
      clusterBasis: 'declared-edges',

    };
    laidOut.set(item.id, node);
    if (!childIds.length) continue;

    // Child clearances are world-space requirements. Iterate the gap floor after
    // fitting so small nested groups keep real pipe/label clearance while larger
    // groups retain tighter 1-to-1 gaps and visibly wider independent spacing.
    let arrangement, childRatio, minimumGap = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 8; attempt++) {
      arrangement = relationPlacement(childIds, source, graph.edges ?? [], sizeEncodings, footprints, item.id, minimumGap);
      childRatio = Math.min((node.baseWidth - SHELL_MARGIN_X) / arrangement.width, (node.baseDepth - SHELL_MARGIN_Z) / arrangement.depth, .72);
      const required = { x: .24 / childRatio, z: .42 / childRatio };
      if (required.x <= minimumGap.x + .001 && required.z <= minimumGap.z + .001) break;
      minimumGap = required;
    }
    for (const id of childIds) {
      const p = arrangement.placements.get(id);
      pending.push({
        id,
        center: [item.center[0] + p.x * childRatio * item.scale, item.center[1] + .08 * item.heightScale, item.center[2] + p.z * childRatio * item.scale],
        scale: childRatio * item.scale * sizeEncodings.get(id).factor,
        heightScale: childRatio * item.scale,
        path: [...item.path, id], placement: p,
      });
    }
  }

  // Keep the caller's stable node order, independent of traversal order.
  const clusterGroups = new Map();
  for (const node of laidOut.values()) if (node.siblingCluster) {
    if (!clusterGroups.has(node.siblingCluster)) clusterGroups.set(node.siblingCluster, []);
    clusterGroups.get(node.siblingCluster).push(node);
  }
  const clusters = [...clusterGroups].map(([id, group]) => {
    const left = Math.min(...group.map(n => n.center[0] - n.width / 2)), right = Math.max(...group.map(n => n.center[0] + n.width / 2));
    const top = Math.min(...group.map(n => n.center[2] - n.depthSize / 2)), bottom = Math.max(...group.map(n => n.center[2] + n.depthSize / 2));
    return { id, parentId: group[0].parentId, nodeIds: group.map(n => n.id), center: [(left + right) / 2, group[0].center[1], (top + bottom) / 2], width: right - left, depthSize: bottom - top, kind: 'workcell', basis: 'declared-edges' };
  });
  return { roots, nodes: graph.nodes.map(node => laidOut.get(node.id)), clusters };
}
