/** Presentation-only equipment vocabulary. These names do not assert runtime facts. */
export const DEVICE_VARIANT_VERSION = 2;
export const DEVICE_VARIANTS = Object.freeze({
  receiver: ['hopper', 'pump-station', 'inlet-manifold', 'receiving-conveyor', 'receiving-tower', 'rotary-feeder'],
  threshold: ['inspection-gate', 'wheel-valve', 'metering-skid', 'actuated-valve', 'sluice-gate', 'pressure-regulator', 'knife-gate', 'butterfly-valve', 'weighing-station', 'twin-regulator'],
  parser: ['optical-sorter', 'separation-drum', 'sorting-manifold'],
  writer: ['assembly-press', 'robot-workcell', 'processing-drum', 'mixing-vessel', 'roller-mill'],
  storage: ['parts-rack', 'twin-silo', 'horizontal-tank', 'storage-bins', 'bulk-hopper', 'vertical-reservoir'],
  reject: ['reject-bin', 'relief-outlet', 'quarantine-dock'],
  input: ['work-desk', 'feed-station', 'operator-console'],
  list: ['display-trays', 'dispatch-rack', 'distribution-table'],
  utility: ['control-cabinet', 'motor-skid', 'service-unit'],
});

export function deviceFamily(role) {
  if (['validator', 'length-check', 'threshold', 'filter', 'gate'].includes(role)) return 'threshold';
  if (['receiver', 'intake', 'router', 'dispatcher'].includes(role)) return 'receiver';
  if (['parser', 'decoder', 'transformer'].includes(role)) return 'parser';
  if (['writer', 'processor', 'assembler', 'worker'].includes(role)) return 'writer';
  if (['storage', 'database', 'cache', 'buffer'].includes(role)) return 'storage';
  if (['reject', 'error', 'fallback'].includes(role)) return 'reject';
  if (['input', 'form'].includes(role)) return 'input';
  if (['list', 'output', 'display'].includes(role)) return 'list';
  return 'utility';
}

function hash(value) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.codePointAt(0), 16777619);
  return n >>> 0;
}

/**
 * Stable for node order, camera movement and unchanged graph reloads. Pass the
 * previous assignment when incrementally adding nodes to preserve remembered
 * appearances; siblings reuse a style only after exhausting that family.
 */
export function assignDeviceVariants(nodes, previous = new Map()) {
  const groups = new Map(), result = new Map();
  for (const node of nodes) {
    const family = deviceFamily(node.data?.role || node.role || node.id);
    const key = `${node.data?.parentId || node.parentId || ''}\0${family}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: node.id, family });
  }
  for (const siblings of groups.values()) {
    siblings.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const count = DEVICE_VARIANTS[siblings[0].family].length, used = Array(count).fill(0);
    for (const node of siblings) {
      const old = previous.get(node.id);
      if (old?.family === node.family && old.index >= 0 && old.index < count && Number.isInteger(old.index)) {
        result.set(node.id, old); used[old.index]++;
      }
    }
    for (const node of siblings) {
      if (result.has(node.id)) continue;
      const preferred = hash(`${node.family}:${node.id}`) % count, least = Math.min(...used);
      let index = preferred;
      for (let step = 0; step < count; step++) {
        const candidate = (preferred + step) % count;
        if (used[candidate] === least) { index = candidate; break; }
      }
      used[index]++;
      result.set(node.id, { family: node.family, index, key: DEVICE_VARIANTS[node.family][index] });
    }
  }
  return result;
}
