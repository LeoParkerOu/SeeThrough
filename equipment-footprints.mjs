import { deviceFamily } from './device-variants.mjs';

// Presentation envelopes, not execution cost or source complexity. Native mesh
// variants keep the same family transform; the envelope includes sockets/margins.
const FOOTPRINTS = Object.freeze({
  receiver: { width: 3.70, depth: 2.25, assetScaleX: 1.00, assetScaleZ: .80 },
  threshold:{ width: 2.20, depth: 1.65, assetScaleX: .60, assetScaleZ: .57 },
  parser:   { width: 3.30, depth: 2.25, assetScaleX: .90, assetScaleZ: .80 },
  writer:   { width: 4.05, depth: 2.70, assetScaleX: 1.12, assetScaleZ: .96 },
  storage:  { width: 3.20, depth: 3.05, assetScaleX: .90, assetScaleZ: 1.08 },
  input:    { width: 3.25, depth: 1.95, assetScaleX: .90, assetScaleZ: .70 },
  list:     { width: 3.65, depth: 2.65, assetScaleX: 1.00, assetScaleZ: .95 },
  reject:   { width: 1.95, depth: 1.55, assetScaleX: .51, assetScaleZ: .53 },
  utility:  { width: 2.40, depth: 1.95, assetScaleX: .66, assetScaleZ: .70 },
});

export function machineFootprint(role) {
  // Return a fresh value: a renderer cannot mutate the shared vocabulary.
  return { ...FOOTPRINTS[deviceFamily(role)] };
}
