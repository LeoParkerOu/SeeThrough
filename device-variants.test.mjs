import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEVICE_VARIANTS, DEVICE_VARIANT_VERSION, assignDeviceVariants, deviceFamily } from './device-variants.mjs';
import { createFactoryAssets, machineSocket } from './factory-assets.js';

const nodes = Array.from({length: 10}, (_, index) => ({ id: `gate-${index}`, data: { role: index % 2 ? 'validator' : 'length-check', parentId: 'line' } }));
const first = assignDeviceVariants(nodes);
assert.equal(new Set([...first.values()].map(v => v.index)).size, 10, 'ten nearby gates should use ten distinct silhouettes');
assert.deepEqual([...assignDeviceVariants([...nodes].reverse())], [...first], 'input ordering must not change presentation');
const extended = assignDeviceVariants([{id: 'gate--new', data:{role:'validator', parentId:'line'}}, ...nodes], first);
for (const node of nodes) assert.deepEqual(extended.get(node.id), first.get(node.id), 'adding a sibling should preserve prior appearances');
const reloaded = assignDeviceVariants(nodes);
assert.deepEqual([...reloaded], [...first], 'unchanged graph reload must be deterministic');
assert.equal(deviceFamily('validator'), deviceFamily('length-check'));
assert.equal(machineSocket('storage', 'left')[0], -1.495);
assert.equal(machineSocket('receiver', 'right')[0], 1.505);
assert.deepEqual(DEVICE_VARIANTS.threshold.slice(0,6), ['inspection-gate','wheel-valve','metering-skid','actuated-valve','sluice-gate','pressure-regulator'], 'existing threshold indices must not be reassigned');
assert.deepEqual(DEVICE_VARIANTS.receiver.slice(0,4), ['hopper','pump-station','inlet-manifold','receiving-conveyor']);
assert.deepEqual(DEVICE_VARIANTS.writer.slice(0,3), ['assembly-press','robot-workcell','processing-drum']);
assert.deepEqual(DEVICE_VARIANTS.storage.slice(0,4), ['parts-rack','twin-silo','horizontal-tank','storage-bins']);

const created = new Set(), mats = {};
function material(color, options = {}) { const m = new THREE.MeshStandardMaterial({color, ...options}); created.add(m); return m; }
for (const [key, color] of Object.entries({teal:0x359dc4, light:0xe5edf0, dark:0x263c4d, amber:0xf2a235, metal:0x97abb5})) mats[key] = material(color);
function mesh(parent, geometry, mat, position=[0,0,0], rotation) {
  created.add(geometry); const obj = new THREE.Mesh(geometry, mat); obj.position.set(...position);
  if (rotation) obj.rotation.set(...rotation); parent.add(obj); return obj;
}
const box = (g,size,p,m) => mesh(g, new THREE.BoxGeometry(...size), m, p);
const cylinder = (g,a,b,h,p,m,r) => mesh(g, new THREE.CylinderGeometry(a,b,h,20), m,p,r);
const pipe = (g,ps,r,m) => mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps.map(p=>new THREE.Vector3(...p))),32,r,6),m);
const assets = createFactoryAssets({THREE, material, mesh, box, cylinder, pipe, mats, fine:[]});
const report = [];
const roles = {threshold:'validator', utility:'unknown', ...Object.fromEntries(Object.keys(DEVICE_VARIANTS).filter(k=>!['threshold','utility'].includes(k)).map(k=>[k,k]))};
for (const [family, styles] of Object.entries(DEVICE_VARIANTS)) {
  for (let index = 0; index < styles.length; index++) {
    const group = new THREE.Group(); assets.buildMachine(group, roles[family], {index}); group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3());
    let meshes = 0, vertices = 0; group.traverse(obj => {if (obj.isMesh) {meshes++;vertices+=obj.geometry.attributes.position.count;}});
    assert.ok(Number.isFinite(size.x + size.y + size.z), `${styles[index]} must have finite geometry`);
    assert.ok(bounds.min.x >= -1.65 && bounds.max.x <= 1.65, `${styles[index]} exceeds width: ${bounds.min.x}..${bounds.max.x}`);
    assert.ok(bounds.min.z >= -1.26 && bounds.max.z <= 1.26, `${styles[index]} exceeds depth: ${bounds.min.z}..${bounds.max.z}`);
    assert.ok(bounds.max.y <= 2.6, `${styles[index]} exceeds machine height`);
    assert.ok(Math.abs(bounds.min.y) < 1e-6, `${styles[index]} needs grounded machine feet`);
    assert.deepEqual(group.scale.toArray(), [1,1,1], `${styles[index]} must keep native scale for external semantic sizing`);
    assert.ok(group.userData.supportStyle, `${styles[index]} needs a functional support type`);
    group.traverse(obj => {
      if (!obj.isMesh) return;
      const part = new THREE.Box3().setFromObject(obj), partSize = part.getSize(new THREE.Vector3());
      assert.ok(!(partSize.x > 1.8 && partSize.z > 1.3 && part.min.y < .2 && part.max.y < .42), `${styles[index]} must not retain a broad display plinth`);
    });
    const supportBoxes=[],bodyBoxes=[];
    group.traverse(obj=>{if(!obj.isMesh)return;(obj.userData.factorySupport?supportBoxes:bodyBoxes).push(new THREE.Box3().setFromObject(obj));});
    const touches=(a,b)=>a.clone().expandByScalar(.006).intersectsBox(b);
    const joined=new Set(supportBoxes.map((a,i)=>bodyBoxes.some(b=>touches(a,b))?i:-1).filter(i=>i>=0));
    let changed=true;
    while(changed) {changed=false;supportBoxes.forEach((a,i)=>{if(!joined.has(i)&&[...joined].some(j=>touches(a,supportBoxes[j]))){joined.add(i);changed=true;}});}
    assert.equal(joined.size,supportBoxes.length,`${styles[index]} has detached support pieces: ${supportBoxes.map((b,i)=>joined.has(i)?null:{i,min:b.min.toArray(),max:b.max.toArray()}).filter(Boolean).map(x=>JSON.stringify(x)).join(', ')}`);
    assert.ok(meshes <= 100, `${styles[index]} exceeds mesh budget: ${meshes}`);
    const ports = [];
    group.traverse(obj => { if (obj.userData.factoryPort) ports.push({ ...obj.userData.factoryPort, mesh:obj }); });
    assert.equal(ports.length, 2, `${styles[index]} must have exactly two end flanges, without duplicated repairs`);
    for (const side of ['left', 'right']) {
      const matches = ports.filter(port => port.side === side);
      assert.equal(matches.length, 1, `${styles[index]} missing or duplicate ${side} connection`);
      const expected = machineSocket(roles[family], side);
      matches[0].face.forEach((value, coordinate) => assert.ok(Math.abs(value - expected[coordinate]) < 1e-9, `${styles[index]} ${side} face differs from routing contract`));
      const physical = new THREE.Box3().setFromObject(matches[0].mesh), center = physical.getCenter(new THREE.Vector3());
      const face = [side === 'left' ? physical.min.x : physical.max.x, center.y, center.z];
      face.forEach((value, coordinate) => assert.ok(Math.abs(value - expected[coordinate]) < 1e-6, `${styles[index]} ${side} rendered flange misses the route endpoint`));
    }
    report.push({family, style:styles[index], support:group.userData.supportStyle, meshes, vertices, bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
    const facility = new THREE.Group(); assets.buildBuilding(facility, roles[family], 'pitched', {index}); facility.updateMatrixWorld(true);
    const facilityBounds = new THREE.Box3().setFromObject(facility);
    assert.ok(facilityBounds.min.x >= -2.41 && facilityBounds.max.x <= 2.41, `${styles[index]} building width`);
    assert.ok(facilityBounds.min.z >= -1.81 && facilityBounds.max.z <= 1.81, `${styles[index]} building depth`);
    assert.ok(facilityBounds.max.y <= 2.75, `${styles[index]} building height`);
  }
}
// The legacy measuring gate shares a family with validator but has its own
// construction. Exercise it separately from the canonical-family catalogue.
const measuringGate = new THREE.Group(); assets.buildMachine(measuringGate, 'length-check', 0);
const measuringPorts = []; measuringGate.traverse(obj => { if (obj.userData.factoryPort) measuringPorts.push(obj.userData.factoryPort); });
assert.equal(measuringPorts.length, 2);
for (const port of measuringPorts) port.face.forEach((v,i) => assert.ok(Math.abs(v - machineSocket('length-check', port.side)[i]) < 1e-9));
for (const options of [{}, {width:7.2,depth:2.4,kind:'workspace'}, {width:2.4,depth:5.1,kind:'module'}]) {
  const floor = new THREE.Group(); assets.buildTray(floor, options); floor.updateMatrixWorld(true);
  const actual = new THREE.Box3().setFromObject(floor), size = actual.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - (options.width || 4.8)) < 1e-5 && Math.abs(size.z - (options.depth || 3.6)) < 1e-5, 'floor must follow supplied width and depth');
  assert.ok(actual.max.y <= .093 && Math.abs(actual.min.y) < 1e-6, 'floor remains one thin ground-contact layer');
  assert.equal(floor.userData.floorTop, .08);
  assert.ok(floor.children.length <= 9, 'floor marks must remain sparse');
}
for (const resource of created) resource.dispose();
console.log(JSON.stringify({ok:true, catalogVersion:DEVICE_VARIANT_VERSION, variantCount:report.length, supportStyles:[...new Set(report.map(r=>r.support))], maxMeshes:Math.max(...report.map(r=>r.meshes)), maxVertices:Math.max(...report.map(r=>r.vertices)), checks:['stable allocation', 'ten distinct nearby threshold machines', 'incremental appearance preservation', 'legacy indices retained', `${report.length} grounded native-scale machines without display plinths`, `${report.length} machine supports connected to equipment by bounding-box contacts`, `${report.length} facility bounds`, 'mesh budget', 'socket compatibility', `${report.length*2+2} actual end flanges match router coordinates without duplicates`, 'adaptive thin floors'], variants:report}, null, 2));
