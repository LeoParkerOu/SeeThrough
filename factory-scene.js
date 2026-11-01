import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { layoutHierarchy } from './hierarchy-layout.mjs';
import { attachMapInput } from './camera-input.js';
import { assignComponentColors } from './component-colors.mjs';
import { planRoutes } from './routing-plan.mjs';
import { createFactoryAssets, machineSocket } from './factory-assets.js';
import { assignDeviceVariants, DEVICE_VARIANT_VERSION } from './device-variants.mjs';

const PALETTE = { ink: 0x203c50, teal: 0x2789b5, light: 0xf0f3f1, metal: 0xaab9c1, dark: 0x304b5c, amber: 0xf1b447, red: 0xd56b43, white: 0xfffbf1 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);

// Geometry templates describe understandable responsibilities. Hierarchy and depth come from the graph.
export function createFactoryScene(container, { onSelect, onContextMenu, onView, onError, appearanceKey = 'local' } = {}) {
  let disposed = false, frame = 0, width = 1, height = 1, selected = null;
  let graph = { nodes: [], edges: [] }, graphKey = '', tween = null, lastView = '', lastDraw = 0, automaticFrame = null;
  let layout = { roots: [], nodes: [] }, ordered = [], homeSpan = 25, colors = new Map(), lastVisualAt = performance.now(), inputMode = 'pan';
  const highlighted = new Set(), models = new Map(), pickables = [], labels = [], routes = [], fine = [], workcells = [];
  let preset = null;
  const variantStorageKey = `factory-device-variants-v${DEVICE_VARIANT_VERSION}:${appearanceKey}`;
  let variants = new Map();
  try { variants = new Map(JSON.parse(localStorage.getItem(variantStorageKey) || '[]')); } catch { /* Storage is optional. */ }
  const resources = new Set(); let graphResources = new Set();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eef1');
  const camera = new THREE.OrthographicCamera(-13, 13, 10, -10, .001, 300);
  const defaultOffset = V(24, 36, 28);
  camera.position.copy(defaultOffset); camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('aria-label', '项目工厂画布：两指平移，捏合缩放，Option加两指旋转；单击查看，右键引用');
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none';
  renderer.domElement.tabIndex = 0; container.appendChild(renderer.domElement);
  const overlay = document.createElement('div');
  // A focused off-screen caption can scroll an overflow:hidden layer, detaching
  // every caption and direction marker from WebGL. Clip without a scroll container.
  overlay.style.cssText = 'position:absolute;inset:0;overflow:clip;pointer-events:none'; container.appendChild(overlay);
  const svgNS = 'http://www.w3.org/2000/svg';
  const flowOverlay = document.createElementNS(svgNS, 'svg');
  flowOverlay.setAttribute('aria-hidden', 'true'); flowOverlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none'; overlay.appendChild(flowOverlay);
  const svgElement = (name, attributes, parent) => { const el = document.createElementNS(svgNS, name); for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value); parent.appendChild(el); return el; };
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.enableRotate = true; controls.screenSpacePanning = true;
  controls.minPolarAngle = Math.PI * 25 / 180; controls.maxPolarAngle = Math.PI * 72 / 180;
  controls.rotateSpeed = .6;
  controls.mouseButtons.RIGHT = null; // Right click belongs to the component menu.
  controls.minZoom = .7; controls.maxZoom = 100;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  const cancelMove = (clearFrame = true) => { tween?.resolve(false); tween = null; if (clearFrame) automaticFrame = null; };
  const releaseInput = attachMapInput({ element: container, camera, controls, THREE, onStart: cancelMove, onChange: renderNow, getMode: () => inputMode });
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0x8798a8, 1.7));
  const sun = new THREE.DirectionalLight(0xfff3df, 3.1); sun.position.set(-12, 23, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: .1, far: 60 });
  sun.shadow.normalBias = .008; sun.shadow.bias = -.00008; sun.shadow.radius = 3; scene.add(sun); scene.add(sun.target);
  const fillLight = new THREE.DirectionalLight(0xb9dcff, .8); fillLight.position.set(15, 9, -12); scene.add(fillLight);
  const world = new THREE.Group(); scene.add(world);
  function material(color, options = {}) { const m = new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .15, ...options }); resources.add(m); return m; }
  const mats = Object.fromEntries(Object.entries(PALETTE).map(([name, color]) => [name, material(color)]));
  function mesh(parent, geometry, mat, position = [0, 0, 0], rotation) {
    resources.add(geometry); const obj = new THREE.Mesh(geometry, mat); obj.position.set(...position);
    if (rotation) obj.rotation.set(...rotation); obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  function box(parent, size, position, mat = mats.light) { return mesh(parent, new THREE.BoxGeometry(...size), mat, position); }
  function cylinder(parent, rt, rb, h, position, mat = mats.metal, rotation) { return mesh(parent, new THREE.CylinderGeometry(rt, rb, h, 20), mat, position, rotation); }
  function pipe(parent, points, radius = .035, mat = mats.teal) { return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => V(...p)), false, 'centripetal'), 32, radius, 6, false), mat); }
  const assets = createFactoryAssets({ THREE, box, cylinder, mesh, pipe, mats, material, fine });
  const floor = box(scene, [250, .1, 250], [0, -.05, 0], material(0xe5ebef)); floor.castShadow = false;
  const grid = new THREE.GridHelper(80, 80, 0xc7d2da, 0xdce3e8); grid.position.y = .006; scene.add(grid);
  resources.add(grid.geometry); resources.add(grid.material);
  function prepare(group, id) {
    const materials = new Map(), shadowCasters = [];
    group.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.castShadow) shadowCasters.push(obj);
      if (!materials.has(obj.material)) {
        const original = obj.material, cloned = original.clone(), color = colors.get(id);
        if (color && original === mats.teal) cloned.color.setHex(color.body);
        // Neutral metal, white panels and dark frames stay consistent across the
        // factory. Identity color belongs to the casing, not every visible surface.
        resources.add(cloned); materials.set(original, cloned);
      }
      obj.material = materials.get(obj.material); obj.userData.nodeId = id; if (id) pickables.push(obj);
    });
    return { group, materials: [...materials.values()], shadowCasters, opacity: -1 };
  }
  function fade(layer, value) {
    layer.group.visible = value > .001;
    if (layer.opacity === value) return;
    layer.opacity = value;
    for (const mat of layer.materials) {
      const transparent = value < .9999;
      if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
      mat.opacity = value; mat.depthWrite = !transparent;
    }
    // Standard shadow maps otherwise leave a fully opaque roof shadow while its surface fades.
    for (const obj of layer.shadowCasters) obj.castShadow = value >= .99;
  }
  function addLabel(model) {
    const el = document.createElement('button'); el.type = 'button'; el.dataset.partLabel = model.id;
    const title = document.createElement('strong'); title.textContent = model.node.data.label || model.id;
    title.style.cssText = 'display:block;font:600 11px/1.4 system-ui;letter-spacing:.01em';
    const note = document.createElement('span'); note.textContent = model.node.data.annotation || '';
    note.style.cssText = 'position:absolute;left:-1px;right:-1px;top:calc(100% - 1px);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;opacity:0;font:10px/1.45 system-ui;color:#526779;white-space:normal;overflow-wrap:anywhere;padding:3px 6px 5px;background:#f7fafcf5;border:1px solid #c8d5df;border-top:0;border-radius:0 0 5px 5px;pointer-events:none';
    if (!note.textContent) note.style.display = 'none';
    el.append(title, note); el.title = [title.textContent, note.textContent].filter(Boolean).join(' · '); el.setAttribute('aria-label', `查看组件：${title.textContent}`);
    el.style.cssText = 'position:absolute;transform:translateX(-50%);pointer-events:none;border:1px solid #c8d5df;border-top-width:2px;border-radius:5px;padding:3px 6px;background:#fcfdfef2;color:#243e50;white-space:normal;width:88px;box-shadow:0 2px 7px #233b3312;cursor:pointer';
    el.onclick = () => onSelect?.(model.id);
    el.oncontextmenu = event => { event.preventDefault(); onContextMenu?.({ id: model.id, clientX: event.clientX, clientY: event.clientY }); };
    const leader = svgElement('line', { stroke: colors.get(model.id)?.css || '#438d88', 'stroke-width': 1.4 }, flowOverlay);
    overlay.appendChild(el); labels.push({ model, el, title, note, leader, visibility: 0 });
  }
  function roundedPath(points, radius) {
    const path = new THREE.CurvePath(); let previous = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const corner = points[i], next = points[i + 1];
      const distance = Math.min(radius, previous.distanceTo(corner) / 2, corner.distanceTo(next) / 2);
      if (distance < .000001) continue;
      const enter = corner.clone().lerp(previous, distance / corner.distanceTo(previous));
      const leave = corner.clone().lerp(next, distance / corner.distanceTo(next));
      if (previous.distanceTo(enter) > .000001) path.add(new THREE.LineCurve3(previous, enter));
      path.add(new THREE.QuadraticBezierCurve3(enter, corner, leave)); previous = leave;
    }
    if (previous.distanceTo(points.at(-1)) > .000001) path.add(new THREE.LineCurve3(previous, points.at(-1)));
    return path;
  }
  function makeWorkcell(cluster) {
    const members = cluster.nodeIds.map(id => models.get(id)).filter(Boolean);
    if (members.length < 2) return;
    const scale = Math.min(...members.map(m => m.scale));
    const group = new THREE.Group(); world.add(group);
    const [x, y, z] = cluster.center;
    // One stepped floor apron follows the actual cooperating equipment. No equal
    // display tiles, invented component, or extra pipe is introduced by grouping.
    const horizontal = cluster.width >= cluster.depthSize;
    const bounds = members.map(m => ({
      s: m.center[horizontal ? 0 : 2], t: m.center[horizontal ? 2 : 0],
      length: horizontal ? m.width : m.depthSize,
      breadth: horizontal ? m.depthSize : m.width,
    })).sort((a,b) => a.s-b.s);
    const pad = .14 * scale;
    const bands = bounds.map((b,i) => ({
      start: i ? (bounds[i-1].s + bounds[i-1].length/2 + b.s-b.length/2)/2 : b.s-b.length/2-pad,
      end: i < bounds.length-1 ? (b.s+b.length/2 + bounds[i+1].s-bounds[i+1].length/2)/2 : b.s+b.length/2+pad,
      lo: b.t-b.breadth/2-pad, hi: b.t+b.breadth/2+pad,
    }));
    const boundary = [
      ...bands.flatMap(b => [[b.start,b.lo],[b.end,b.lo]]),
      ...[...bands].reverse().flatMap(b => [[b.end,b.hi],[b.start,b.hi]]),
    ].map(([s,t]) => horizontal ? [s,-t] : [t,-s]);
    const shape = new THREE.Shape(boundary.map(([px,pz]) => new THREE.Vector2(px,pz)));
    const apron = mesh(group, new THREE.ShapeGeometry(shape), material(0xcddae0, {roughness:.94, metalness:0, side:THREE.DoubleSide}), [0,y+.006*scale,0], [-Math.PI/2,0,0]);
    apron.castShadow = false;
    // A short shared access marking is enough to connect the work area visually.
    const front = z + cluster.depthSize/2 + .11*scale;
    for (const sign of [-1,1]) {
      box(group, [.30*scale,.006*scale,.035*scale], [x+sign*(cluster.width/2-.2*scale),y+.012*scale,front], mats.amber);
    }
    workcells.push({ ...cluster, layer: prepare(group) });
  }
  function makeRoute(plan) {
    const edge = graph.edges.find(e => e.id === plan.edgeId); if (!edge || plan.points.length < 2) return;
    const group = new THREE.Group(); world.add(group);
    const scale = plan.scale, points = plan.points.map(p => V(...p));
    const radius = plan.pipeRadius ?? .10 * scale;
    const endpointJoins = [];
    let startRadius = radius, endRadius = radius;
    function machineJoin(node, boundary) {
      const scale = node.scaleXZ ?? node.scale, sy = node.heightScale ?? node.scale;
      const sx = scale * (node.assetScaleX ?? 1), sz = scale * (node.assetScaleZ ?? 1);
      const dx = (boundary.x - node.center[0]) / (node.width / 2), dz = (boundary.z - node.center[2]) / (node.depthSize / 2);
      const side = Math.abs(dx) >= Math.abs(dz) ? (dx < 0 ? 'left' : 'right') : (dz < 0 ? 'top' : 'bottom');
      const local = machineSocket(node.role, side, (boundary.x - node.center[0]) / sx);
      if (side === 'top' || side === 'bottom') {
        const manifold = new THREE.Group(); manifold.position.set(...node.center); manifold.scale.set(sx, sy, sz); group.add(manifold);
        assets.buildAuxiliarySocket(manifold, node.role, side, (boundary.x - node.center[0]) / sx);
      }
      const socket = V(node.center[0] + local[0] * sx, node.center[1] + local[1] * sy, node.center[2] + local[2] * sz);
      const outward = side === 'left' ? V(-1,0,0) : side === 'right' ? V(1,0,0) : side === 'top' ? V(0,0,-1) : V(0,0,1);
      // Orthogonal lead and riser end on the actual socket face, not on empty tile space.
      const outside = socket.clone().addScaledVector(outward, .20 * scale);
      const riser = outside.clone(); riser.y = boundary.y;
      const bend = boundary.clone();
      if (side === 'left' || side === 'right') bend.z = riser.z; else bend.x = riser.x;
      const socketRadius = .14 * Math.min(sy, side === 'left' || side === 'right' ? sz : sx);
      endpointJoins.push({ nodeId: node.id, side, socket: socket.toArray(), socketRadius, boundary: boundary.toArray() });
      return [socket, outside, riser, bend];
    }
    const from = models.get(plan.sourceId || edge.source), to = models.get(plan.targetId || edge.target);
    if (from && !from.children.length && (!plan.bridge && !plan.port || plan.machineEndpoint === 'source')) {
      points.unshift(...machineJoin(from, points[0])); startRadius = Math.min(radius, endpointJoins.at(-1).socketRadius);
    }
    if (to && !to.children.length && (!plan.bridge && !plan.port || plan.machineEndpoint === 'target')) {
      points.push(...machineJoin(to, points.at(-1)).reverse()); endRadius = Math.min(radius, endpointJoins.at(-1).socketRadius);
    }
    for (let i = points.length - 1; i > 0; i--) if (points[i].distanceToSquared(points[i - 1]) < 1e-14) points.splice(i, 1);
    const routeColor = plan.branch === 'error' ? '#ce7046' : plan.branch === 'loop' ? '#7783ad' : '#33899f';
    const mat = material(routeColor, { roughness: .32, metalness: .4 });
    const jointMat = material(0xbac5bd, { roughness: .38, metalness: .58 });
    const curve = roundedPath(points, .18 * scale);
    const steps = Math.max(48, points.length*16), radialSteps = 12;
    const tube = new THREE.TubeGeometry(curve, steps, radius, radialSteps, false);
    const routeLength = curve.getLength(), taperLength = Math.min(.45*scale, routeLength*.22);
    const radiusAt = distance => Math.min(
      THREE.MathUtils.lerp(startRadius,radius,smooth(0,taperLength,distance)),
      THREE.MathUtils.lerp(endRadius,radius,smooth(0,taperLength,routeLength-distance))
    );
    if (startRadius < radius || endRadius < radius) {
      const positions = tube.attributes.position;
      // Reduce only the short socket leads. Main-pipe width still expresses the
      // declared flow role; a small machine gets a physically compatible reducer.
      for (let i=0;i<=steps;i++) {
        const u=i/steps, center=curve.getPointAt(u), ratio=radiusAt(u*routeLength)/radius;
        for (let j=0;j<=radialSteps;j++) {
          const index=i*(radialSteps+1)+j;
          positions.setXYZ(index, center.x+(positions.getX(index)-center.x)*ratio,
            center.y+(positions.getY(index)-center.y)*ratio, center.z+(positions.getZ(index)-center.z)*ratio);
        }
      }
      positions.needsUpdate=true; tube.computeVertexNormals();
    }
    mesh(group, tube, mat);
    const collar = (point, tangent, terminal = false, localRadius = radius) => {
      const obj = cylinder(group, 1.27*localRadius, 1.27*localRadius, .065 * scale, point.toArray(), jointMat);
      obj.quaternion.setFromUnitVectors(V(0, 1, 0), tangent.clone().normalize());
      const seam = cylinder(group, 1.3*localRadius, 1.3*localRadius, .018 * scale, point.toArray(), terminal ? mats.amber : mats.dark);
      seam.quaternion.copy(obj.quaternion);
    };
    collar(points[0], points[1].clone().sub(points[0]), true, startRadius);
    collar(points.at(-1), points.at(-1).clone().sub(points.at(-2)), true, endRadius);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = a.distanceTo(b);
      if (length < .65 * scale || Math.abs(a.y - b.y) > 1e-8) continue;
      const middle = a.clone().lerp(b, .5), tangent = b.clone().sub(a).normalize();
      collar(middle, tangent);
      const owner = models.get(plan.ownerId), ground = owner ? owner.center[1] + .08 * (owner.heightScale ?? owner.scale) : .01;
      const legHeight = Math.max(.01 * scale, middle.y - radius - ground);
      box(group, [.075 * scale, legHeight, .075 * scale], [middle.x, ground + legHeight / 2, middle.z], jointMat);
      box(group, [.16 * scale, .025 * scale, .16 * scale], [middle.x, ground, middle.z], mats.dark);
    }
    const screenGroup = svgElement('g', { 'data-flow-route': plan.id }, flowOverlay);
    const screenLine = svgElement('path', { fill: 'none', stroke: routeColor, 'stroke-linecap':'round', 'stroke-linejoin':'round' }, screenGroup);
    const arrowGroup = svgElement('g', {}, screenGroup);
    const arrows = Array.from({length: 3}, () => svgElement('path', { d:'M -5 -4 L 4 0 L -5 4 L -2 0 Z', fill:'#fff7d9', stroke:routeColor, 'stroke-width':'1.4', 'stroke-linejoin':'round' }, arrowGroup));
    const screenSamples = curve.getPoints(96);
    const mid = curve.getPoint(.62);
    let label, labelPoint = mid;
    const detailLabel = !plan.bridge && !!plan.ownerId && (plan.branch === 'loop' || (plan.branch === 'success' && plan.points.length > 4));
    if (!plan.bridge && (!plan.ownerId || detailLabel)) {
      label = document.createElement('span'); label.textContent = edge.label === 'title' ? '填写的内容' : edge.label === 'items' ? '保存后的清单' : edge.label || '';
      label.dataset.routeLabel = edge.id;
      label.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:10px system-ui;color:#4d756b;white-space:nowrap;padding:3px;background:#f3f1e8e8;border:1px solid #d7dcd1;border-radius:4px'; overlay.appendChild(label);
      if (detailLabel) {
        const segments = plan.points.slice(1).map((p, i) => ({a: plan.points[i], b: p}));
        const horizontal = segments.filter(s => Math.abs(s.a[2] - s.b[2]) < 1e-8).sort((a, b) => Math.abs(b.b[0] - b.a[0]) - Math.abs(a.b[0] - a.a[0]))[0];
        if (horizontal) labelPoint = V(...horizontal.a).lerp(V(...horizontal.b), .5);
        label.style.color = plan.branch === 'loop' ? '#526d8c' : '#42685e';
        label.style.borderRadius = '4px'; label.dataset.routeLabel = edge.id;
      }
    }
    routes.push({ edge, plan, layer: prepare(group), midpoint: labelPoint, label, detailLabel, screenGroup, screenLine, arrows, screenSamples, radius, startRadius, endRadius, endpointJoins });
  }
  function setGraph(next) {
    const key = JSON.stringify([next.nodes.map(n => [n.id, n.data]), next.edges]); graph = next;
    if (key === graphKey) return;
    const firstGraph = !models.size, previousFrame = automaticFrame;
    const nextLayout = layoutHierarchy(next); graphKey = key; cancelMove();
    world.clear(); models.clear(); pickables.length = 0; fine.length = 0; workcells.length = 0;
    labels.splice(0).forEach(l => { l.el.remove(); l.leader.remove(); }); routes.splice(0).forEach(r => { r.label?.remove(); r.screenGroup?.remove(); });
    for (const item of graphResources) { item.dispose(); resources.delete(item); }
    const retained = new Set(resources); layout = nextLayout; colors = assignComponentColors(next, layout);
    variants = assignDeviceVariants(next.nodes, variants);
    try { localStorage.setItem(variantStorageKey, JSON.stringify([...variants])); } catch { /* Rendering works without persistence. */ }
    const source = new Map(next.nodes.map(n => [n.id, n]));
    for (const item of layout.nodes) {
      const node = source.get(item.id), role = node.data?.role || item.id;
      const group = new THREE.Group(); group.position.set(...item.center); group.scale.set(item.scaleXZ ?? item.scale, item.heightScale ?? item.scale, item.scaleXZ ?? item.scale); world.add(group);
      const summary = new THREE.Group(); summary.scale.set(item.assetScaleX ?? 1, 1, item.assetScaleZ ?? 1); group.add(summary);
      const interior = new THREE.Group(); group.add(interior);
      if (item.children.length) {
        const variant = node.data?.appearance?.roof || (role === 'intake' ? 'sawtooth' : 'pitched');
        assets.buildBuilding(summary, role, variant, variants.get(item.id)); assets.buildTray(interior, {width:item.baseWidth, depth:item.baseDepth, kind:'module'});
      } else assets.buildMachine(summary, role, variants.get(item.id));
      const model = { ...item, node, role, group, summary: prepare(summary, item.id), interior: prepare(interior, item.id), reveal: 0, opacity: 0, pixels: 0 };
      const outlineX = item.baseWidth/2+.035, outlineZ = item.baseDepth/2+.035;
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints([V(-outlineX,.10,-outlineZ), V(outlineX,.10,-outlineZ), V(outlineX,.10,outlineZ), V(-outlineX,.10,outlineZ)]);
      const outlineMaterial = new THREE.LineBasicMaterial({ color: PALETTE.amber }); resources.add(outlineGeometry); resources.add(outlineMaterial);
      const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial); group.add(outline); outline.visible = false; model.outline = outline;
      models.set(item.id, model); addLabel(model);
    }
    ordered = [...models.values()].sort((a, b) => a.depth - b.depth);
    (layout.clusters ?? []).forEach(makeWorkcell);
    world.updateMatrixWorld(true);
    for (const m of ordered) m.physicalBounds = new THREE.Box3().setFromObject(m.summary.group);
    planRoutes(next, layout).forEach(makeRoute);
    container.dataset.routePlans = JSON.stringify(routes.map(r => r.plan));
    container.dataset.componentColors = JSON.stringify(Object.fromEntries(colors));
    container.dataset.deviceVariants = JSON.stringify(Object.fromEntries(variants));
    container.dataset.workcells = JSON.stringify(layout.clusters ?? []);
    container.dataset.layoutKinds = JSON.stringify(layout.nodes.map(n => ({ id: n.id, kind: n.layoutKind, cluster: n.siblingCluster })));
    graphResources = new Set([...resources].filter(x => !retained.has(x)));
    homeSpan = Math.max(15, Math.max(...ordered.filter(m => !m.parentId).map(m => m.center[0] + m.width / 2)) - Math.min(...ordered.filter(m => !m.parentId).map(m => m.center[0] - m.width / 2)) + 5);
    const minScale = Math.min(...ordered.map(m => m.scale), 1);
    controls.maxZoom = Math.max(12, 5 / minScale);
    automaticFrame = previousFrame?.ids.every(id => models.has(id)) ? previousFrame : firstGraph && layout.roots.length ? { ids: [...layout.roots], detail: false } : null;
    const roots = ordered.filter(m => !m.parentId);
    if (roots.length) {
      const xmin = Math.min(...roots.map(m => m.center[0] - m.width / 2)), xmax = Math.max(...roots.map(m => m.center[0] + m.width / 2));
      const zmin = Math.min(...roots.map(m => m.center[2] - m.depthSize / 2)), zmax = Math.max(...roots.map(m => m.center[2] + m.depthSize / 2));
      const cx = (xmin + xmax) / 2, cz = (zmin + zmax) / 2, extent = Math.max(xmax - xmin, zmax - zmin) * .72 + 4;
      sun.target.position.set(cx, 0, cz); sun.position.set(cx - 12, Math.max(23, extent), cz + 10);
      Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: extent * 4 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    container.dataset.partCount = String(models.size); resize();
  }
  function projection(model) {
    const points = [];
    for (const x of [-model.width / 2, model.width / 2]) for (const z of [-model.depthSize / 2, model.depthSize / 2]) {
      const p = V(model.center[0] + x, model.center[1], model.center[2] + z).project(camera);
      points.push([(p.x + 1) * width / 2, (1 - p.y) * height / 2]);
    }
    return { l: Math.min(...points.map(p => p[0])), r: Math.max(...points.map(p => p[0])), t: Math.min(...points.map(p => p[1])), b: Math.max(...points.map(p => p[1])) };
  }
  function physicalRect(model) {
    const b = model.physicalBounds, points = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const p = V(x, y, z).project(camera); points.push([(p.x + 1) * width / 2, (1 - p.y) * height / 2]);
    }
    return { l: Math.min(...points.map(p => p[0])), r: Math.max(...points.map(p => p[0])), t: Math.min(...points.map(p => p[1])), b: Math.max(...points.map(p => p[1])) };
  }
  function intersection(a, b) { return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)); }
  function projectRoute(route, opacity, equipmentRects) {
    const points = route.screenSamples.map(point => { const p = point.clone().project(camera); return [(p.x + 1) * width / 2, (1 - p.y) * height / 2]; });
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0]-points[i-1][0], points[i][1]-points[i-1][1]));
    const total = lengths.at(-1), physicalPixels = 2 * route.radius * height * camera.zoom / (camera.top - camera.bottom);
    const minimum = route.plan.minPixelWidth ?? 2.4;
    route.screenGroup.style.opacity = String(opacity);
    route.screenGroup.style.visibility = opacity > .02 ? 'visible' : 'hidden';
    const intersectsEquipment = p => equipmentRects.some(b => p[0] > b.l-2 && p[0] < b.r+2 && p[1] > b.t-2 && p[1] < b.b+2);
    let screenPath = '';
    route.captionAvoidRects = [];
    for (let i=1; i<points.length; i++) {
      const a=points[i-1], b=points[i], mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if (![a,b,mid].some(intersectsEquipment)) {
        screenPath += `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} `;
        if (opacity > .5) route.captionAvoidRects.push({ l:Math.min(a[0],b[0])-2, r:Math.max(a[0],b[0])+2, t:Math.min(a[1],b[1])-2, b:Math.max(a[1],b[1])+2 });
      }
    }
    route.screenLine.setAttribute('d', screenPath);
    route.screenLine.setAttribute('stroke-width', String(minimum));
    // Only reinforce subpixel geometry; at close range the lit tube remains visible.
    route.screenLine.setAttribute('opacity', String(1 - smooth(minimum * .7, minimum * 1.1, physicalPixels)));
    const count = total < 32 ? 0 : Math.min(3, Math.max(1, Math.floor(total / 150) + 1));
    route.markerBounds = [];
    route.arrows.forEach((arrow, index) => {
      if (index >= count) { arrow.style.display = 'none'; return; }
      arrow.style.display = '';
      const distance = count === 1 ? total * .62 : 18 + (total - 40) * (index + .5) / count;
      let i = 1; while (i < lengths.length - 1 && lengths[i] < distance) i++;
      const a = points[i - 1], b = points[i], ratio = (distance - lengths[i-1]) / Math.max(.001, lengths[i] - lengths[i-1]);
      const x = a[0] + (b[0]-a[0])*ratio, y = a[1] + (b[1]-a[1])*ratio;
      const angle = Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI;
      const markerScale = THREE.MathUtils.clamp(physicalPixels / 3, 1, 1.55);
      arrow.setAttribute('transform', `translate(${x} ${y}) rotate(${angle}) scale(${markerScale})`);
      route.markerBounds.push({ el: arrow, l:x-7, r:x+7, t:y-7, b:y+7 });
    });
    route.displayMetrics = { id: route.plan.id, flowRole: route.plan.flowRole ?? route.edge.data?.flowRole ?? 'ordinary', branch: route.plan.branch,
      worldRadius: route.radius, startRadius: route.startRadius, endRadius: route.endRadius, pixelWidth: Math.max(minimum, physicalPixels), arrows: count, opacity, endpointJoins: route.endpointJoins };
  }
  function renderNow() {
    if (disposed || width < 2 || height < 2) return;
    camera.updateMatrixWorld();
    const now = performance.now(), elapsed = Math.min(.08, Math.max(0, (now - lastVisualAt) / 1000)); lastVisualAt = now;
    const blend = 1 - Math.exp(-elapsed / .12);
    // A broad screen-space interval plus short temporal smoothing avoids whole batches popping in.
    const expandEnd = Math.min(width * .86, height * .95, 430), expandStart = expandEnd * .40;
    const visibleIds = [], projected = [], boxes = [], captionBoxes = [];
    for (const model of ordered) {
      model.rect = projection(model); model.pixels = model.rect.r - model.rect.l;
      const parent = models.get(model.parentId);
      model.opacity = parent ? parent.opacity * parent.reveal : 1;
      const ancestor = preset?.ancestors.has(model.id);
      const included = !preset || ancestor || preset.nodes.has(model.id);
      model.emphasis = (model.emphasis ?? 1) + ((included ? 1 : .17) - (model.emphasis ?? 1)) * blend;
      const targetReveal = model.children.length ? (preset ? Number(ancestor && !preset.macro) : smooth(expandStart, expandEnd, model.pixels)) : 0;
      model.reveal += (targetReveal - model.reveal) * blend;
      if (Math.abs(targetReveal - model.reveal) < .0001) model.reveal = targetReveal;
      model.inView = model.rect.r > 0 && model.rect.l < width && model.rect.b > 0 && model.rect.t < height;
      // The building keeps its proportions: roof/walls fade in place while the foundation
      // and nested machinery remain anchored. Never crush the building into a flat icon.
      fade(model.summary, model.opacity * model.emphasis * (model.children.length ? Math.pow(1 - model.reveal, 3) : 1));
      fade(model.interior, model.opacity * model.emphasis);
      model.outline.visible = model.opacity > .5 && (selected === model.id || highlighted.has(model.id));
      model.outline.material.color.setHex(highlighted.has(model.id) ? PALETTE.amber : 0x359e93);
      if (model.opacity > .55 && model.reveal < .55 && model.inView) visibleIds.push(model.id);
      projected.push({ id: model.id, parentId: model.parentId, depth: model.depth, center: model.center, scale: model.scale, heightScale: model.heightScale, baseWidth: model.baseWidth, baseDepth: model.baseDepth, assetScaleX: model.assetScaleX, assetScaleZ: model.assetScaleZ, sizeEncoding: model.sizeEncoding, sourceState: model.node.data.sourceStatus?.state, shellOpacity: +model.summary.opacity.toFixed(3), reveal: +model.reveal.toFixed(3), opacity: +model.opacity.toFixed(3), visible: model.opacity > .55, pixels: +model.pixels.toFixed(2), bounds: [model.rect.l, model.rect.t, model.rect.r, model.rect.b].map(Math.round) });
    }
    const refined = new Map();
    for (const cell of workcells) {
      const owner = models.get(cell.parentId);
      fade(cell.layer, owner ? owner.opacity * owner.reveal : 1);
    }
    for (const r of routes) {
      if (!r.plan.noReplace && r.edge.data?.refines) {
        const owner = models.get(r.plan.ownerId);
        refined.set(r.edge.data.refines, Math.max(refined.get(r.edge.data.refines) || 0, (owner?.opacity || 0) * (owner?.reveal || 0)));
      }
    }
    const equipmentRects = ordered.filter(m => m.opacity > .55 && m.reveal < .55 && m.inView).map(m => ({ id: m.id, ...physicalRect(m) }));
    for (const route of routes) {
      const owner = models.get(route.plan.ownerId);
      const opacity = owner ? owner.opacity * owner.reveal : 1;
      const active = new Set([selected, ...highlighted].filter(Boolean));
      const relevant = [...active].some(id => [route.edge.source, route.edge.target, route.plan.sourceId, route.plan.targetId].includes(id) || owner?.path.includes(id));
      const desiredWeight = preset ? (preset.edges.has(route.plan.edgeId) ? 1 : .12) : (active.size && !relevant ? .3 : 1);
      route.weight = (route.weight ?? 1) + (desiredWeight - (route.weight ?? 1)) * blend;
      const routeOpacity = opacity * (1 - (refined.get(route.edge.id) || 0)) * route.weight;
      fade(route.layer, routeOpacity); projectRoute(route, routeOpacity, equipmentRects);
      if (route.label) {
        const p = route.midpoint.clone().project(camera), x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
        route.label.style.left = `${x}px`; route.label.style.top = `${y + (route.detailLabel && route.plan.branch === 'loop' ? 23 : -7)}px`;
        // Overview explains modules and direction. Edge conditions appear only for
        // the local question: a single component's neighbours, or edges inside a selection.
        const overviewFrame = automaticFrame && !automaticFrame.detail && layout.roots.length > 0 && layout.roots.every(id => automaticFrame.ids.includes(id));
        const allRootsSelected = layout.roots.length > 0 && layout.roots.every(id => active.has(id));
        const localEdge = active.size === 1 ? active.has(route.edge.source) || active.has(route.edge.target)
          : active.size > 1 && active.has(route.edge.source) && active.has(route.edge.target);
        const macroLabelPriority = !overviewFrame && !allRootsSelected && localEdge ? .85 : 0;
        const labelOpacity = (route.detailLabel ? opacity * smooth(280, 390, owner.pixels) : macroLabelPriority) * smooth(0, 12, Math.min(x, width - x));
        route.label.style.opacity = String(labelOpacity * route.weight); route.label.style.visibility = labelOpacity > .005 ? 'visible' : 'hidden';
        route.label.dataset.annotationState = labelOpacity > .005 ? 'pending-placement' : 'outside-scope';
      }
    }
    const isEmphasized = m => selected === m.id || highlighted.has(m.id);
    const pipeRects = routes.flatMap(r => r.captionAvoidRects ?? []);
    const labelPriority = m => isEmphasized(m) ? 2 : selected && m.path.includes(selected) ? 1 : 0;
    for (const item of [...labels].sort((a, b) => labelPriority(b.model) - labelPriority(a.model) || b.model.depth - a.model.depth)) {
      const m = item.model;
      const plainLabel = preset?.mapLabels?.[m.id];
      item.title.textContent = plainLabel || m.node.data.label || m.id;
      item.note.textContent = plainLabel ? m.node.data.label : m.node.data.annotation || '';
      item.note.style.display = item.note.textContent ? '' : 'none';
      // Include the 12px padding, borders and Chinese glyph width, so a short
      // equipment name does not wrap its last character onto a lonely line.
      const titleWidth = Math.min(150, Math.max(84, [...(plainLabel || m.node.data.label || m.id)].length * 11.3 + 18));
      item.el.style.width = `${titleWidth}px`;
      // Root notes wait for a closer view; their names remain readable in the overview.
      const noteStart = isEmphasized(m) ? 70 : m.parentId ? 155 : Math.max(160, Math.min(width, height) * .40);
      const noteEnd = isEmphasized(m) ? 120 : m.parentId ? 225 : Math.max(230, Math.min(width, height) * .55);
      const noteProgress = plainLabel ? 1 : m.parentId ? smooth(noteStart, noteEnd, m.pixels) : 1;
      // Two-line previews preserve the equipment silhouette. Clicking opens the
      // complete annotation in the existing details panel; nothing is lost there.
      item.note.style.opacity = String(noteProgress);
      // Follow the visible screen-space silhouette at every azimuth; a fixed world
      // +Z label would sit on top of its own machine when viewed from behind.
      const silhouette = physicalRect(m);
      const anchorX = (silhouette.l + silhouette.r) / 2;
      const w = item.el.offsetWidth || 75, h = item.el.offsetHeight || 24;
      const fullHeight = h + (noteProgress > .1 && item.note.style.display !== 'none' ? item.note.offsetHeight : 0);
      let best = null;
      // Names stay immediately beside their equipment. Prefer below; use above
      // when a junction or a neighbour would otherwise be hidden by the nameplate.
      for (const above of [false, true]) for (const dx of [0, -.35*w, .35*w, -.7*w, .7*w]) {
        const x = anchorX + dx, y = above ? silhouette.t - fullHeight - 4 : silhouette.b + 3;
        const rect = { l: x - w/2 - 2, r: x + w/2 + 2, t: y, b: y + fullHeight + 4 };
        const score = equipmentRects.filter(r => r.id !== m.id).reduce((n,r) => n + intersection(rect,r),0) * 3 + captionBoxes.reduce((n,r) => n + intersection(rect,r),0) * 5 + pipeRects.reduce((n,r) => n + intersection(rect,r),0) * 2 + (Math.max(0,-rect.l) + Math.max(0,rect.r-width) + Math.max(0,-rect.t) + Math.max(0,rect.b-height)) * 1000 + Math.abs(dx)*.1 + (above ? 18 : 0);
        if (!best || score < best.score) best = { x, y, score };
      }
      item.x = item.x === undefined ? best.x : item.x + (best.x - item.x) * blend;
      item.y = item.y === undefined ? best.y : item.y + (best.y - item.y) * blend;
      const x = item.x, y = item.y;
      item.el.style.left = `${x}px`; item.el.style.top = `${y}px`;
      const rect = { l: x - w / 2 - 2, r: x + w / 2 + 2, t: y, b: y + h + 4 };
      const edgeSpace = Math.min(rect.l, width - rect.r, rect.t - 5, height - 8 - rect.b);
      const titleVisibility = m.parentId ? smooth(45, 78, m.pixels) : smooth(18, 40, m.pixels);
      const silhouetteCenterY = (silhouette.t + silhouette.b) / 2;
      const equipmentOnScreen = smooth(-4, 8, Math.min(anchorX, width - anchorX, silhouetteCenterY, height - silhouetteCenterY));
      const desired = m.opacity * m.emphasis * Math.pow(1 - m.reveal, 2) * titleVisibility * smooth(-8, 8, edgeSpace) * equipmentOnScreen;
      item.visibility += (desired - item.visibility) * blend;
      item.el.style.visibility = item.visibility > .005 ? 'visible' : 'hidden'; item.el.style.opacity = String(item.visibility);
      const above = y < silhouette.t;
      for (const [attr, value] of Object.entries({ x1:anchorX, y1:above ? silhouette.t : silhouette.b, x2:x, y2:above ? y + fullHeight : y, opacity:item.visibility })) item.leader.setAttribute(attr, value);
      item.el.style.pointerEvents = item.visibility > .5 ? 'auto' : 'none';
      item.el.dataset.annotationVisible = String(item.visibility > .5 && noteProgress > .5);
      item.note.style.background = isEmphasized(m) ? '#fff1d7f5' : '#f7fafcf5';
      item.el.dataset.labelOpacity = item.visibility.toFixed(3); item.el.dataset.noteProgress = noteProgress.toFixed(3);
      item.el.style.borderColor = isEmphasized(m) ? '#bf8b36' : '#c8d5df';
      item.el.style.borderTopColor = selected === m.id || highlighted.has(m.id) ? '#be8831' : colors.get(m.id)?.css || '#438d88';
      item.el.style.background = isEmphasized(m) ? '#fff1d7f2' : '#fcfdfef2';
      if (desired > .2) {
        boxes.push(rect);
        captionBoxes.push({ ...rect, b: rect.b + (noteProgress > .1 && item.note.style.display !== 'none' ? item.note.offsetHeight : 0) });
      }
    }
    // Conditional path signs must not cover component names or explanations.
    for (const route of routes) for (const marker of route.markerBounds ?? []) {
      marker.el.style.visibility = [...captionBoxes, ...equipmentRects].some(box => intersection(marker, box) > 0) ? 'hidden' : 'visible';
    }
    for (const route of routes) {
      const el = route.label; if (!el || Number(el.style.opacity) < .01) continue;
      const x = parseFloat(el.style.left), baseY = parseFloat(el.style.top), w = el.offsetWidth, h = el.offsetHeight;
      let placed = false;
      for (const offset of [0, 20, -20]) {
        const y = baseY + offset, rect = { l: x - w / 2 - 3, r: x + w / 2 + 3, t: y - h - 3, b: y + 3 };
        if (rect.l < 5 || rect.r > width - 5 || rect.t < 5 || rect.b > height - 5 || [...captionBoxes, ...equipmentRects].some(b => rect.l < b.r && rect.r > b.l && rect.t < b.b && rect.b > b.t)) continue;
        el.style.top = `${y}px`; captionBoxes.push(rect); placed = true; el.dataset.annotationState = 'visible'; break;
      }
      if (!placed) { el.style.visibility = 'hidden'; el.dataset.annotationState = 'no-clear-position'; }
    }
    const opened = ordered.filter(m => m.reveal > .55 && m.opacity > .55 && m.inView && m.rect.l < width / 2 && m.rect.r > width / 2 && m.rect.t < height / 2 + 40 && m.rect.b > height / 2 - 40);
    const context = opened.sort((a, b) => b.depth - a.depth)[0];
    const region = context?.id || 'overview';
    grid.material.transparent = true; grid.material.opacity = .12 * (1 - smooth(2.5, 6, camera.zoom)); grid.visible = grid.material.opacity > .001;
    renderer.render(scene, camera);
    container.dataset.camera = JSON.stringify({ zoom: +camera.zoom.toFixed(3), target: controls.target.toArray().map(v => +v.toFixed(5)), position: camera.position.toArray().map(v => +v.toFixed(5)), polar: controls.getPolarAngle(), azimuth: controls.getAzimuthalAngle(), mode: inputMode });
    container.dataset.routeStyles = JSON.stringify(routes.map(r => r.displayMetrics));
    container.dataset.projectedParts = JSON.stringify(projected);
    container.dataset.equipmentBounds = JSON.stringify(equipmentRects);
    container.dataset.visibleIds = JSON.stringify(visibleIds);
    container.dataset.sceneSelected = selected || ''; container.dataset.sceneHighlighted = [...highlighted].join(',');
    container.dataset.detailRegion = region;
    container.dataset.visibleRoutes = JSON.stringify(routes.filter(r => r.layer.opacity > .55).map(r => r.edge.id));
    container.dataset.routeOpacity = JSON.stringify(routes.map(r => [r.edge.id, +r.layer.opacity.toFixed(3)]));
    const view = `${Math.round(camera.zoom * 100)}:${region}:${visibleIds.join(',')}`;
    if (view !== lastView) { lastView = view; onView?.({ zoom: camera.zoom, region, visibleIds, breadcrumb: context ? ['项目全景', ...context.path.map(id => models.get(id).node.data.label)] : ['项目全景'] }); }
  }
  function framing(ids, detail, offset = camera.position.clone().sub(controls.target)) {
    const found = ids.map(id => models.get(id));
    if (!found.length || found.some(m => !m)) throw new Error('当前画布没有对应组件。');
    if (detail && found.length === 1) {
      const anchor = !found[0].children.length && found[0].parentId ? models.get(found[0].parentId) : found[0];
      const rect = projection(anchor), desired = Math.min(width * .90, height * 1.3);
      return { target: V(...anchor.center), zoom: camera.zoom * desired / Math.max(.000001, rect.r - rect.l) };
    }
    // Fit complete physical footprints at the user's current angle, with 10% margins.
    const bounds = new THREE.Box3();
    for (const model of found) {
      bounds.union(model.physicalBounds);
      for (const x of [-model.width / 2, model.width / 2]) for (const z of [-model.depthSize / 2, model.depthSize / 2]) bounds.expandByPoint(V(model.center[0] + x, model.center[1], model.center[2] + z));
    }
    const target = bounds.getCenter(V()), view = camera.clone();
    view.position.copy(target).add(offset); view.lookAt(target); view.updateMatrixWorld(true);
    let extentX = 0, extentY = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = V(x, y, z).project(view); extentX = Math.max(extentX, Math.abs(point.x)); extentY = Math.max(extentY, Math.abs(point.y));
    }
    return { target, zoom: camera.zoom * Math.min(.72 / Math.max(extentX, .000001), .66 / Math.max(extentY, .000001)) };
  }
  function resize() {
    const rect = container.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
    width = rect.width; height = rect.height;
    const aspect = width / height, span = Math.max(11, homeSpan / aspect);
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    if (automaticFrame) {
      const fit = framing(automaticFrame.ids, automaticFrame.detail);
      controls.minZoom = Math.min(controls.minZoom, fit.zoom);
      const zoom = THREE.MathUtils.clamp(fit.zoom, controls.minZoom, controls.maxZoom);
      if (tween) { tween.to.copy(fit.target); tween.zoomTo = zoom; }
      else {
        const offset = camera.position.clone().sub(controls.target);
        controls.target.copy(fit.target); camera.position.copy(fit.target).add(offset); camera.zoom = zoom;
        camera.updateProjectionMatrix(); controls.update();
      }
    }
    renderNow();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  const raycaster = new THREE.Raycaster(); let pointerDown;
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, 1 - (clientY - r.top) / r.height * 2), camera);
    const visibleMesh = obj => { for (let current = obj; current; current = current.parent) if (!current.visible) return false; return obj.material.opacity > .55; };
    return raycaster.intersectObjects(pickables, false).find(h => visibleMesh(h.object))?.object.userData.nodeId;
  }
  const down = e => { cancelMove(); pointerDown = e.button === 0 ? [e.clientX, e.clientY] : null; };
  const up = e => {
    if (e.button !== 0 || !pointerDown) return;
    const click = Math.hypot(e.clientX - pointerDown[0], e.clientY - pointerDown[1]) < 5; pointerDown = null; if (!click) return;
    const id = pick(e.clientX, e.clientY); if (id) onSelect?.(id);
  };
  const context = e => { e.preventDefault(); const id = pick(e.clientX, e.clientY); if (id) onContextMenu?.({ id, clientX: e.clientX, clientY: e.clientY }); };
  const lost = e => { e.preventDefault(); onError?.('画布暂时失去图形上下文，请刷新恢复。'); };
  renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('contextmenu', context); renderer.domElement.addEventListener('webglcontextlost', lost);
  function move(target, zoom, resetAngle = false, destination = defaultOffset) {
    cancelMove(false); const offset = camera.position.clone().sub(controls.target);
    return new Promise(resolve => { tween = { start: performance.now(), from: controls.target.clone(), to: target.clone(), offsetFrom: offset, offsetTo: resetAngle ? destination.clone() : offset.clone(), zoomFrom: camera.zoom, zoomTo: THREE.MathUtils.clamp(zoom, controls.minZoom, controls.maxZoom), resolve }; });
  }
  function tick(time) {
    if (disposed) return; frame = requestAnimationFrame(tick);
    if (time - lastDraw < 30) return; lastDraw = time;
    if (tween) {
      const t = Math.min(1, (time - tween.start) / 520), k = t * t * (3 - 2 * t);
      controls.target.lerpVectors(tween.from, tween.to, k);
      const a = new THREE.Spherical().setFromVector3(tween.offsetFrom), b = new THREE.Spherical().setFromVector3(tween.offsetTo);
      const arc = Math.atan2(Math.sin(b.theta-a.theta), Math.cos(b.theta-a.theta));
      camera.position.copy(controls.target).add(V().setFromSphericalCoords(THREE.MathUtils.lerp(a.radius,b.radius,k), THREE.MathUtils.lerp(a.phi,b.phi,k), a.theta + arc*k));
      camera.zoom = THREE.MathUtils.lerp(tween.zoomFrom, tween.zoomTo, k); camera.updateProjectionMatrix();
      if (t === 1) { const resolve = tween.resolve; tween = null; controls.update(); renderNow(); resolve(true); }
    }
    controls.update(); renderNow();
  }
  resize(); frame = requestAnimationFrame(tick);
  return {
    captureView() { return { target:controls.target.clone(), offset:camera.position.clone().sub(controls.target), zoom:camera.zoom, preset }; },
    restoreView(saved) { preset = saved.preset; automaticFrame = null; return move(saved.target, saved.zoom, true, saved.offset); },
    setGraph,
    setInputMode(mode) { inputMode = mode === 'rotate' ? 'rotate' : 'pan'; controls.mouseButtons.LEFT = inputMode === 'rotate' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN; renderer.domElement.style.cursor = inputMode === 'rotate' ? 'grab' : ''; renderNow(); },
    setSelected(id) { selected = id; renderNow(); },
    setHighlighted(ids) { highlighted.clear(); ids.forEach(id => highlighted.add(id)); renderNow(); },
    focus(ids) {
      const unique = [...new Set(ids)], detail = unique.length === 1, fit = framing(unique, detail);
      automaticFrame = { ids: unique, detail }; controls.minZoom = Math.min(controls.minZoom, fit.zoom);
      return move(fit.target, fit.zoom);
    },
    clearPreset() { preset = null; },
    showPreset(view) {
      const nodes = new Set(view.nodeIds), ancestors = new Set();
      for (const id of nodes) for (const ancestor of models.get(id).path) if (ancestor !== id) ancestors.add(ancestor);
      const roots = [...new Set([...nodes].map(id => models.get(id).path[0]))];
      const macro = roots.length > 1 && !view.expand;
      preset = { nodes, ancestors, macro, mapLabels:view.mapLabels, edges:new Set(view.edgeIds) };
      const offset = defaultOffset.clone().applyAxisAngle(V(0,1,0), (view.angle ?? 0) * Math.PI / 180);
      automaticFrame = { ids:macro ? roots : [...nodes], detail:false };
      const fit = framing(automaticFrame.ids, false, offset);
      controls.minZoom = Math.min(controls.minZoom, fit.zoom);
      return move(fit.target, fit.zoom, true, offset);
    },
    presentation(ids) {
      const visibleNodeIds = [], hiddenNodeIds = [], visibleAncestorIds = new Set(), hiddenReasons = [];
      const visible = model => !!model && model.opacity > .55 && model.inView && model.pixels >= 20;
      for (const id of [...new Set(ids)]) {
        const model = models.get(id);
        if (visible(model)) { visibleNodeIds.push(id); continue; }
        hiddenNodeIds.push(id);
        hiddenReasons.push({ nodeId: id, reason: !model ? 'unknown-component' : !model.inView ? 'outside-viewport' : model.opacity <= .55 ? 'inside-closed-module' : 'too-small-to-read' });
        let parent = models.get(model?.parentId);
        while (parent && !visible(parent)) parent = models.get(parent.parentId);
        if (parent) visibleAncestorIds.add(parent.id);
      }
      return { presented: hiddenNodeIds.length ? 'partial' : 'complete', visibleNodeIds, hiddenNodeIds, visibleAncestorIds: [...visibleAncestorIds], hiddenReasons };
    },
    home(resetAngle = false) {
      preset = null;
      if (!layout.roots.length) { automaticFrame = null; return move(V(), 1); }
      automaticFrame = { ids: [...layout.roots], detail: false };
      const fit = framing(automaticFrame.ids, false, resetAngle ? defaultOffset : undefined); controls.minZoom = Math.min(controls.minZoom, fit.zoom);
      return move(fit.target, fit.zoom, resetAngle);
    },
    resetView() { return move(controls.target.clone(), camera.zoom, true); },
    zoomBy(factor) { cancelMove(); camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom); camera.updateProjectionMatrix(); renderNow(); },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); cancelMove(); resizeObserver.disconnect(); releaseInput(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('webglcontextlost', lost); renderer.domElement.removeEventListener('contextmenu', context);
      for (const item of resources) item.dispose(); renderer.dispose(); renderer.domElement.remove(); overlay.remove();
    },
  };
}
