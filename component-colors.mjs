// Bounded industrial identity colors; selection also uses a separate outline and label.
const PALETTE = [
  { body: 0x257fad, name: '工业蓝' },
  { body: 0x269d9f, name: '青蓝' },
  { body: 0xe6a23c, name: '琥珀' },
  { body: 0x677f99, name: '钢蓝' },
];
const REJECT = { body: 0xd56b43, name: '警示橙' };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

function hash(id) {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}

function blend(color, target, fraction) {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const channel = (color >>> shift) & 255;
    result |= Math.round(channel + (((target >>> shift) & 255) - channel) * fraction) << shift;
  }
  return result;
}

function swatch(color) {
  return {
    body: color.body,
    dark: blend(color.body, 0x26323a, .43),
    light: blend(color.body, 0xf5f3e9, .66),
    css: `#${color.body.toString(16).padStart(6, '0')}`,
    name: color.name,
  };
}

function siblingOrder(a, b) {
  // Array order and layout centers are not identity: layout may be recomputed after a reorder.
  for (const read of [node => node.data?.order ?? node.order, node => node.position?.y, node => node.position?.x]) {
    const left = read(a), right = read(b);
    const difference = (finite(left) ? left : Infinity) - (finite(right) ? right : Infinity);
    if (difference && !Number.isNaN(difference)) return difference;
  }
  return compare(a.id, b.id);
}

/**
 * Stable, bounded-palette assignment; no camera state or input mutation.
 * Siblings use distinct ordinary colors while the pool lasts. Larger groups reuse
 * colors greedily, prioritizing direct edges and nearby siblings. Fixed reject
 * colors and arbitrary dense graphs can still conflict; labels/shapes remain needed.
 */
export function assignComponentColors(graph, layout) {
  if (!graph || !Array.isArray(graph.nodes)) throw new Error('组件配色需要 graph.nodes 数组');
  const layoutById = new Map((layout?.nodes ?? []).map(node => [node.id, node]));
  const nodes = new Map(), groups = new Map(), parents = new Map(), adjacent = new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || nodes.has(node.id)) throw new Error('组件配色需要唯一的非空 ID');
    nodes.set(node.id, node);
    const parent = node.data?.parentId ?? layoutById.get(node.id)?.parentId ?? null;
    parents.set(node.id, parent);
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(node);
    adjacent.set(node.id, new Set());
  }
  for (const edge of graph.edges ?? []) {
    if (edge.source === edge.target || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    adjacent.get(edge.source).add(edge.target);
    adjacent.get(edge.target).add(edge.source);
  }

  const assigned = new Map();
  for (const node of nodes.values()) {
    if (node.data?.role === 'reject' || node.id === 'reject' || node.id.endsWith('.reject')) assigned.set(node.id, REJECT);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : compare(String(a), String(b)));
  for (const parent of groupKeys) {
    const siblings = groups.get(parent).slice().sort(siblingOrder);
    const nearby = new Map(siblings.map(node => [node.id, new Set()]));
    // Original graph positions, then canonical sibling order, stay stable across zoom/reordering.
    const distance = (a, b, ai, bi) => {
      if ([a.position?.x, a.position?.y, b.position?.x, b.position?.y].every(finite)) {
        return (a.position.x - b.position.x) ** 2 + (a.position.y - b.position.y) ** 2;
      }
      return Math.abs(ai - bi);
    };
    siblings.forEach((node, index) => {
      const closest = siblings.map((other, otherIndex) => ({ other, d: distance(node, other, index, otherIndex) }))
        .filter(item => item.other.id !== node.id)
        .sort((a, b) => a.d - b.d || compare(a.other.id, b.other.id)).slice(0, 2);
      for (const { other } of closest) {
        nearby.get(node.id).add(other.id);
        nearby.get(other.id).add(node.id);
      }
    });
    const used = new Map();
    for (const node of siblings) {
      if (assigned.has(node.id)) continue;
      const unused = PALETTE.filter(color => !used.has(color.body));
      const candidates = unused.length ? unused : PALETTE;
      const preferred = hash(`${parent ?? '$root'}:${node.id}`) % PALETTE.length;
      const score = color => {
        let value = used.get(color.body) ?? 0;
        for (const id of adjacent.get(node.id)) if (assigned.get(id)?.body === color.body) value += 1000;
        for (const id of nearby.get(node.id)) if (assigned.get(id)?.body === color.body) value += 30;
        if (assigned.get(parents.get(node.id))?.body === color.body) value += 2;
        return value;
      };
      const rank = color => (PALETTE.indexOf(color) - preferred + PALETTE.length) % PALETTE.length;
      const color = candidates.slice().sort((a, b) => score(a) - score(b) || rank(a) - rank(b))[0];
      assigned.set(node.id, color);
      used.set(color.body, (used.get(color.body) ?? 0) + 1);
    }
  }
  return new Map([...nodes.keys()].sort(compare).map(id => [id, swatch(assigned.get(id))]));
}
