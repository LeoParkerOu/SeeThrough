import { deviceFamily, DEVICE_VARIANTS } from './device-variants.mjs';

/**
 * Shared, procedural factory vocabulary. Geometry is presentation, never evidence
 * of a source-code operation: labels, hierarchy and source links remain graph data.
 * Units: a 4.8 × 3.6 module tile; individual machinery stays inside 3.2 × 2.6.
 * No downloaded models, textures, game assets, or additional runtime dependencies.
 */
// The outer socket face is part of the machine vocabulary, so routes attach to a
// known piece of geometry rather than guessing a fraction of the routing tile.
export function machineSocket(role, side, offset = 0) {
  const familyRole = { threshold: 'validator', utility: 'writer' }[deviceFamily(role)] || deviceFamily(role);
  const reach = { receiver: 1.505, 'length-check': 1.545, parser: 1.545, validator: 1.545,
    writer: 1.545, storage: 1.495, reject: 1.475, input: 1.605, list: 1.605 }[role] ??
    { receiver: 1.505, storage: 1.495, reject: 1.475, input: 1.605, list: 1.605 }[familyRole] ?? 1.545;
  if (side === 'left' || side === 'right') return [(side === 'left' ? -1 : 1) * reach, .58, 0];
  return [Math.max(-.95, Math.min(.95, offset)), .58, side === 'top' ? -1.12 : 1.12];
}
export function createFactoryAssets({ THREE, box, cylinder, mesh, pipe, mats, material, fine }) {
  const steel = material(0xa8b8c1, { metalness: .58, roughness: .34 });
  const frame = material(0x344e60, { metalness: .35, roughness: .5 });
  const rubber = material(0x263744, { roughness: .95, metalness: 0 });
  const concrete = material(0xd2d9dc, { roughness: 1, metalness: 0 });
  const cream = material(0xf2f4ef, { roughness: .65, metalness: .05 });
  const brass = material(0xe9a33b, { roughness: .45, metalness: .35 });
  const glass = material(0x4a7e98, { metalness: .25, roughness: .3 });
  const lamp = material(0xf5d987, { emissive: 0xa78740, emissiveIntensity: .12 });

  // A real bevel catches the light; a flat-colored rectangle cannot substitute for it.
  function cabinet(g, size, at, mat = mats.teal, bevel = .045) {
    const [w, h, d] = size, b = Math.min(bevel, w / 5, h / 5, d / 5);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + b, -h / 2 + b);
    shape.lineTo(w / 2 - b, -h / 2 + b);
    shape.lineTo(w / 2 - b, h / 2 - b);
    shape.lineTo(-w / 2 + b, h / 2 - b);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - 2 * b, bevelEnabled: true, bevelThickness: b,
      bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 1,
    });
    geometry.translate(0, 0, -d / 2 + b);
    return mesh(g, geometry, mat, at);
  }
  function ring(g, radius, tube, at, mat = steel, rotation = [-Math.PI / 2, 0, 0]) {
    return mesh(g, new THREE.TorusGeometry(radius, tube, 6, 20), mat, at, rotation);
  }
  function detail(obj) { fine.push(obj); return obj; }
  function bolt(g, x, y, z) { return detail(cylinder(g, .045, .045, .025, [x, y, z], steel)); }
  function plinth(g, w = 2.95, d = 2.2) {
    const family = g.userData.semanticFamily || 'utility', variant = g.userData.deviceVariant || 0;
    const supportStart = g.children.length;
    const foot = (x, z, h = .4) => {
      box(g, [.28, .06, .28], [x, .03, z], rubber);
      cabinet(g, [.17, h - .06, .17], [x, .06 + (h - .06) / 2, z], steel, .015);
    };
    const skid = (xs, zs, top = .48) => {
      for (const z of zs) {
        for (const x of xs) foot(x, z, top - .08);
        cabinet(g, [xs[1] - xs[0] + .26, .14, .14], [(xs[0] + xs[1])/2, top - .07, z], frame, .018);
      }
    };
    // A support is part of the machine: no common trophy-like platform remains.
    if (family === 'writer' && variant === 3) {
      g.userData.supportStyle = 'vessel-tripod';
      // Feet sit under the vessel shell, not at the corners of its routing tile.
      for (const angle of [Math.PI/2, Math.PI*7/6, Math.PI*11/6]) foot(Math.cos(angle)*.5, Math.sin(angle)*.5, .61);
    } else if ((family === 'writer' && variant === 2) || (family === 'parser' && variant === 1) || (family === 'threshold' && variant === 2)) {
      g.userData.supportStyle = 'aligned-drum-saddles';
      const x = family === 'writer' ? .17 : family === 'parser' ? -.07 : 0;
      const z = family === 'threshold' ? -.29 : -.14;
      const length = family === 'writer' ? 1.6 : family === 'parser' ? 1.55 : 1.65;
      for (const sx of [x-length*.31, x+length*.31]) {
        cabinet(g, [.33, .35, .78], [sx, .175, z], frame, .018);
        cabinet(g, [.44, .07, .88], [sx, .035, z], rubber, .012);
      }
      if (family !== 'threshold') foot(family === 'writer' ? -.95 : -.94, family === 'writer' ? -.18 : -.24, .52);
      if (family === 'parser') skid([-.9,.9],[.7],.54);
    } else if (family === 'writer' && variant === 1) {
      g.userData.supportStyle = 'robot-worktable-legs';
      for (const x of [-.27, 1]) for (const z of [-.4,.66]) foot(x,z,.45);
      foot(-.96,-.38,.41);
    } else if (family === 'utility' && variant === 1) {
      g.userData.supportStyle = 'motor-skid';
      skid([-.96,1.03],[-.36,.24],.5);
    } else if (family === 'receiver' && variant === 1) {
      g.userData.supportStyle = 'pump-skid';
      skid([-1.02,1.02],[-.42,.65],.51);
    } else if (family === 'receiver' && variant === 2) {
      g.userData.supportStyle = 'manifold-supports';
      for (const x of [-.92,.92]) foot(x,-.16,.4);
      foot(0,-.63,.43);
    } else if (family === 'receiver' && variant === 4) {
      g.userData.supportStyle = 'tower-feet';
      for (const x of [-.64,.64]) for (const z of [-.5,.5]) foot(x,z,.14);
    } else if (family === 'reject' && variant === 1) {
      g.userData.supportStyle = 'relief-vessel-pedestal';
      cylinder(g,.37,.4,.12,[.35,.06,-.04],frame);
      cylinder(g,.24,.28,.43,[.35,.335,-.04],steel);
      foot(1,-.72,.9);
    } else if (family === 'threshold' && ![0, 2, 4, 8].includes(variant)) {
      g.userData.supportStyle = 'valve-pedestal';
      cylinder(g, .36, .4, .1, [0, .05, 0], frame);
      cylinder(g, .19, .24, .66, [0, .43, 0], steel);
      for (const x of [-1.05, 1.05]) { foot(x, 0, .52); cabinet(g, [.3, .11, .38], [x, .54, 0], frame, .02); }
    } else if (family === 'storage' && [1, 4, 5].includes(variant)) {
      g.userData.supportStyle = variant === 5 ? 'tank-ring' : 'silo-feet';
      if (variant === 5) { cylinder(g, .73, .77, .13, [0, .065, 0], frame); cylinder(g, .6, .64, .3, [0, .28, 0], steel); }
      else for (const x of variant === 1 ? [-.65, .65] : [-.91, .91]) for (const z of variant === 1 ? [-.45, .45] : [-.52, .52]) foot(x, z, .43);
    } else if (family === 'storage' && variant === 0) {
      g.userData.supportStyle = 'rack-feet';
      for (const x of [-1.08, 1.08]) for (const z of [-.8, .8]) foot(x, z, .45);
    } else if (family === 'storage' && variant === 2) {
      g.userData.supportStyle = 'tank-saddles';
      for (const x of [-.66, .66]) {
        cabinet(g, [.26, .3, 1.04], [x, .15, -.12], frame, .02);
        cabinet(g, [.42, .1, 1.21], [x, .35, -.12], steel, .025);
      }
    } else if (family === 'threshold' || family === 'parser' || (family === 'receiver' && variant === 3)) {
      g.userData.supportStyle = 'machine-runners';
      const z = Math.min(.72, d / 2 - .22);
      const top = family === 'receiver' ? .55 : family === 'threshold' && variant === 8 ? .51 : .46;
      for (const zz of [-z, z]) {
        cabinet(g, [w - .48, .14, .13], [0, top - .07, zz], frame, .02);
        for (const x of [-w * .32, w * .32]) foot(x, zz, top - .08);
      }
      cabinet(g,[.14,.14,z*2+.13],[-.48,top-.07,0],frame,.018);
    } else if (family === 'receiver' && variant === 5) {
      g.userData.supportStyle = 'rotary-column';
      cylinder(g, .45, .48, .1, [0, .05, 0], frame); cylinder(g, .26, .29, .34, [0, .27, 0], steel);
    } else if (family === 'receiver' && variant === 0) {
      g.userData.supportStyle = 'hopper-feet';
      for (const x of [-.55, .92]) for (const z of [-.51, .52]) foot(x, z);
    } else if ((family === 'input' && variant === 0) || family === 'utility') {
      g.userData.supportStyle = 'open-chassis';
      skid([-.98,1.02],[-.62,.61],.46);
      // A central cross-member reaches both narrow control cabinets and shells.
      cabinet(g,[.14,.14,1.37],[.79,.39,-.005],frame,.018);
    } else {
      g.userData.supportStyle = ['input', 'list', 'writer'].includes(family) ? 'workbench-legs' : 'cabinet-feet';
      const h = family === 'list' && variant === 1 ? .55 : (family === 'list' && variant === 2) || (family === 'input' && variant === 1) ? .6 : family === 'reject' || (family === 'storage' && variant === 3) ? .44 : .4;
      for (const x of [-Math.min(1.02, w * .34), Math.min(1.02, w * .34)]) for (const z of [-Math.min(.72, d * .31), Math.min(.72, d * .31)]) foot(x, z,h);
    }
    for (const part of g.children.slice(supportStart)) part.userData.factorySupport = true;
  }
  function panel(g, x, y, z, w = .58, h = .35, mat = cream) {
    cabinet(g, [w, h, .075], [x, y, z], frame, .02);
    box(g, [w - .075, h - .07, .016], [x, y, z + .046], mat);
    detail(box(g, [w * .36, .028, .02], [x, y + h * .12, z + .058], steel));
  }
  function vents(g, x, y, z, n = 4, w = .48) {
    for (let i = 0; i < n; i++) detail(box(g, [w, .035, .025], [x, y + i * .09, z], frame));
  }
  function dial(g, at, radius = .18) {
    cylinder(g, radius + .035, radius + .035, .085, at, frame, [Math.PI / 2, 0, 0]);
    cylinder(g, radius, radius, .025, [at[0], at[1], at[2] + .054], cream, [Math.PI / 2, 0, 0]);
    const pointer = detail(box(g, [.025, radius * 1.1, .025], [at[0] + radius * .12, at[1] + radius * .17, at[2] + .075], mats.dark));
    pointer.rotation.z = -.55;
  }
  function warningLamp(g, x, y, z) {
    cylinder(g, .11, .14, .09, [x, y, z], frame);
    cylinder(g, .085, .1, .16, [x, y + .11, z], lamp);
    cylinder(g, .1, .1, .025, [x, y + .205, z], brass);
  }
  function handwheel(g, x, y, z, radius = .35) {
    ring(g, radius, .045, [x, y, z], brass);
    cylinder(g, .075, .075, .11, [x, y, z], frame);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      pipe(g, [[x, y, z], [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius]], .026, brass);
    }
  }
  function rail(g, a, b, height = .5) {
    for (const p of [a, b]) cylinder(g, .035, .035, height, [p[0], p[1] + height / 2, p[2]], brass);
    pipe(g, [[a[0], a[1] + height, a[2]], [b[0], b[1] + height, b[2]]], .035, brass);
    pipe(g, [[a[0], a[1] + height * .5, a[2]], [b[0], b[1] + height * .5, b[2]]], .025, brass);
  }
  function pairedSockets(g, role) {
    for (const side of ['left', 'right']) {
      const [x, y, z] = machineSocket(role, side);
      socket(g, x + (side === 'left' ? .155 : -.155), y, z, side === 'left' ? -1 : 1);
    }
  }
  function motor(g, x, y, z, size = .34) {
    cylinder(g, size, size, .62, [x, y, z], mats.teal, [0, 0, Math.PI / 2]);
    for (const offset of [-.22, 0, .22]) cylinder(g, size + .025, size + .025, .045, [x + offset, y, z], frame, [0, 0, Math.PI / 2]);
    cabinet(g, [.63, .13, .56], [x, y - size, z], steel, .025);
    cabinet(g, [.29, .2, .24], [x, y + size, z], cream, .025);
  }
  function horizontalTank(g, x, y, z, length = 1.75, radius = .48) {
    cylinder(g, radius, radius, length, [x, y, z], cream, [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) {
      cylinder(g, radius * .9, radius * .9, .09, [x + side * length / 2, y, z], mats.teal, [0, 0, Math.PI / 2]);
      ring(g, radius + .015, .04, [x + side * length * .31, y, z], steel, [0, Math.PI / 2, 0]);
      cabinet(g, [.23, y - .35, radius * 1.5], [x + side * length * .31, .35 + (y - .35) / 2, z], frame, .025);
    }
  }
  function rollers(g, { w = 2.65, d = 1.32, y = .66, z = 0, count = 8 } = {}) {
    box(g, [w, .14, d], [0, y - .14, z], rubber);
    for (const zz of [-d / 2, d / 2]) cabinet(g, [w + .08, .19, .12], [0, y, z + zz], mats.teal, .025);
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + .14 + i * (w - .28) / (count - 1);
      cylinder(g, .095, .095, d - .08, [x, y + .04, z], steel, [Math.PI / 2, 0, 0]);
    }
  }
  function sheet(g, x, y, z, w = .75, d = .7) {
    box(g, [w, .055, d], [x, y, z], cream);
    for (let i = 0; i < 3; i++) detail(box(g, [w * (.7 - i * .1), .015, .035], [x - w * .05, y + .036, z - d * .24 + i * d * .22], mats.dark));
  }
  function socket(g, x, y, z, outward = 1) {
    cylinder(g, .15, .15, .22, [x, y, z], frame, [0, 0, Math.PI / 2]);
    const flange = cylinder(g, .205, .205, .07, [x + outward * .12, y, z], steel, [0, 0, Math.PI / 2]);
    // Keep an inspectable contract on the actual flange, including its outer
    // face. Four-sided routing may choose either end even for inlet/outlet roles.
    flange.userData.factoryPort = { side: outward < 0 ? 'left' : 'right', face: [x + outward * .155, y, z] };
  }
  function receiver(g) {
    plinth(g);
    cabinet(g, [1.7, .57, 1.4], [.22, .68, .05], mats.teal);
    panel(g, .27, .68, .79, .7, .3); vents(g, -.34, .56, .79, 3, .24);
    for (const x of [-.63, .63]) cylinder(g, .07, .07, .82, [x, 1.34, -.46], steel);
    // Wide open hopper, rather than a solid cone pretending to contain material.
    mesh(g, new THREE.CylinderGeometry(.67, .31, .66, 20, 1, true), mats.light, [0, 1.59, -.2]);
    cylinder(g, .3, .3, .03, [0, 1.265, -.2], rubber);
    ring(g, .67, .055, [0, 1.92, -.2], mats.teal);
    ring(g, .32, .055, [0, 1.27, -.2], steel);
    for (let i = 0; i < 3; i++) {
      const chunk = box(g, [.36, .11, .29], [-.18 + i * .17, 1.48 + i * .1, -.22], i === 1 ? brass : cream);
      chunk.rotation.z = -.18 + i * .16;
    }
    cabinet(g, [.72, .12, 1.04], [1, .89, .04], frame, .025);
    for (let i = 0; i < 3; i++) cylinder(g, .065, .065, .8, [.78 + i * .2, 1, .04], steel, [Math.PI / 2, 0, 0]);
    pipe(g, [[-1.3, .58, 0], [-.98, .58, 0], [-.98, 1.24, 0], [-.67, 1.55, -.2]], .12, mats.teal);
    socket(g, -1.35, .58, 0, -1); socket(g, 1.35, .58, 0);
    dial(g, [.78, 1.14, .65], .145);
  }
  function lengthCheck(g) {
    plinth(g); rollers(g);
    for (const x of [-1, 1]) cabinet(g, [.18, 1.31, .2], [x, 1.03, -.77], mats.teal, .025);
    cabinet(g, [2.35, .24, .28], [0, 1.76, -.77], mats.teal);
    box(g, [2.12, .16, .04], [0, 1.77, -.61], cream);
    for (let i = 0; i < 12; i++) detail(box(g, [.025, i % 3 ? .055 : .105, .015], [-.98 + i * .18, 1.75, -.581], frame));
    cabinet(g, [.15, 1.02, 1.24], [.7, 1.21, -.01], mats.light, .025);
    box(g, [.025, .64, 1.04], [.61, 1.2, -.01], brass);
    box(g, [1.5, .05, .52], [-.35, .86, .04], cream);
    box(g, [.04, .08, .68], [-.96, .94, .04], brass);
    cabinet(g, [.55, .54, .37], [-.93, 1.1, .78], mats.teal, .04);
    dial(g, [-.93, 1.13, .99], .16);
    socket(g, -1.39, .58, 0, -1); socket(g, 1.39, .58, 0);
  }
  function parser(g) {
    plinth(g); rollers(g, { d: 1.5, count: 9 });
    sheet(g, -.86, .85, 0, .7, .98);
    for (const z of [-.8, .8]) cabinet(g, [.28, 1.37, .22], [-.1, 1.13, z], mats.light, .035);
    cabinet(g, [.6, .32, 1.92], [-.1, 1.96, 0], mats.teal);
    cabinet(g, [.36, .21, 1.2], [-.1, 1.7, 0], frame);
    // One source sheet becomes separate, orderly fields on an output sorting bed.
    for (let i = 0; i < 3; i++) {
      const z = -.5 + i * .5;
      cabinet(g, [.76, .16, .4], [.88, .94, z], i === 1 ? brass : mats.light, .025);
      detail(box(g, [.42, .018, .035], [.88, 1.03, z], frame));
    }
    panel(g, -.08, 1.96, 1, .4, .2);
    warningLamp(g, -.1, 2.15, -.54);
    socket(g, -1.39, .58, 0, -1); socket(g, 1.39, .58, 0);
  }
  function validator(g) {
    plinth(g); rollers(g, { d: 1.4, count: 9 }); sheet(g, -.7, .85, 0);
    for (const z of [-.81, .81]) {
      cabinet(g, [.55, 1.4, .32], [.15, 1.1, z], mats.teal);
      cabinet(g, [.32, 1.18, .045], [.15, 1.13, z + (z > 0 ? .175 : -.175)], mats.light, .02);
    }
    cabinet(g, [.7, .35, 2.02], [.15, 1.98, 0], mats.teal);
    for (const z of [-.61, .61]) cylinder(g, .045, .045, 1.12, [.2, 1.25, z], steel);
    cabinet(g, [.13, .45, 1.21], [.15, 1.51, 0], brass, .02);
    box(g, [.03, .055, 1.15], [-.18, 1.04, 0], lamp);
    panel(g, .15, 1.43, 1.025, .36, .28);
    warningLamp(g, .15, 2.17, -.62);
    socket(g, -1.39, .58, 0, -1); socket(g, 1.39, .58, 0);
  }
  function writer(g) {
    plinth(g);
    cabinet(g, [2.45, .46, 1.64], [0, .6, .04], mats.teal);
    cabinet(g, [2.13, .14, 1.43], [0, .9, .04], steel, .025);
    box(g, [1.55, .09, 1.18], [0, 1.01, .14], rubber); sheet(g, .03, 1.09, .17, 1.13, .88);
    for (const x of [-.89, .89]) {
      cylinder(g, .12, .12, 1.35, [x, 1.43, -.5], steel);
      cylinder(g, .19, .19, .17, [x, .95, -.5], frame);
    }
    cabinet(g, [2.43, .44, .96], [0, 2.06, -.35], mats.teal);
    cylinder(g, .25, .25, .47, [0, 1.65, -.2], steel);
    cabinet(g, [1.1, .23, .78], [0, 1.37, -.2], brass);
    pipe(g, [[-1.05, .8, -.63], [-1.34, 1.06, -.63], [-1.34, 1.89, -.63], [-.91, 2.06, -.7]], .07, rubber);
    vents(g, -.6, .5, .88, 3, .55); panel(g, .7, .65, .9, .5, .27);
    dial(g, [.69, 2.09, .16], .15);
    socket(g, -1.39, .58, 0, -1); socket(g, 1.39, .58, 0);
  }
  function storage(g) {
    plinth(g, 2.75, 2.28);
    for (const x of [-1.08, 1.08]) for (const z of [-.8, .8]) {
      cabinet(g, [.14, 1.99, .14], [x, 1.36, z], mats.teal, .02);
      box(g, [.22, .08, .22], [x, .43, z], steel);
    }
    for (let i = 0; i < 3; i++) {
      const y = .52 + i * .61;
      cabinet(g, [2.32, .13, 1.86], [0, y, 0], steel, .02);
      for (const x of [-.52, .52]) {
        cabinet(g, [.93, .4, 1.32], [x, y + .27, .03], i === 2 ? mats.light : cream, .04);
        box(g, [.34, .11, .025], [x, y + .26, .705], frame);
        detail(box(g, [.19, .045, .01], [x, y + .26, .723], brass));
      }
    }
    cabinet(g, [2.38, .14, 1.9], [0, 2.38, 0], mats.teal, .025);
    // Cross-bracing is physical structure visible from an oblique camera.
    for (const sign of [-1, 1]) {
      const brace = box(g, [.055, 2.41, .055], [0, 1.4, -.855], frame); brace.rotation.z = sign * .61;
    }
    socket(g, -1.34, .58, 0, -1); socket(g, 1.34, .58, 0);
  }
  function reject(g) {
    plinth(g, 2.65, 2.18);
    cabinet(g, [2.1, .16, 1.54], [0, .5, 0], frame);
    for (const x of [-.98, .98]) cabinet(g, [.16, .89, 1.64], [x, .99, 0], mats.teal, .025);
    cabinet(g, [2.1, .89, .16], [0, .99, -.74], mats.teal);
    cabinet(g, [2.1, .52, .16], [0, .81, .74], mats.teal);
    box(g, [1.78, .07, 1.36], [0, .62, 0], rubber);
    for (let i = 0; i < 3; i++) {
      const block = cabinet(g, [.61, .12, .45], [-.35 + i * .28, .74 + i * .09, -.05 + i * .12], i === 1 ? brass : cream, .02);
      block.rotation.y = i * .34;
    }
    cylinder(g, .055, .055, 1.46, [1.05, 1.25, -.8], frame);
    cabinet(g, [.54, .5, .1], [.95, 1.91, -.8], mats.teal);
    box(g, [.3, .075, .025], [.95, 1.91, -.735], cream);
    panel(g, 0, .84, .84, .65, .24);
    warningLamp(g, 1.05, 2.07, -.8);
    socket(g, -1.32, .58, 0, -1); socket(g, 1.32, .58, 0);
  }
  function input(g) {
    plinth(g, 3.12, 2.44);
    cabinet(g, [1.65, .98, 1.45], [.35, .88, -.12], mats.teal);
    cabinet(g, [1.82, .13, 1.58], [.35, 1.43, -.12], mats.light, .035);
    const board = new THREE.Group(); board.position.set(.35, 1.5, -.12); board.rotation.x = .2; g.add(board);
    cabinet(board, [1.42, .08, 1.12], [0, 0, 0], frame, .025); sheet(board, 0, .07, 0, 1.2, .94);
    cabinet(g, [.55, .62, 1.09], [-.97, .75, -.05], mats.light);
    box(g, [.38, .13, .65], [-.97, 1.1, -.05], rubber);
    for (let i = 0; i < 3; i++) box(g, [.3, .055, .49], [-.97, 1.17 + i * .06, -.02 - i * .03], cream);
    panel(g, .5, .91, .66, .69, .3); vents(g, -.04, .68, .66, 4, .24);
    cylinder(g, .035, .035, .61, [.87, 1.78, -.56], brass, [0, 0, -.3]);
    socket(g, -1.45, .58, 0, -1); socket(g, 1.45, .58, 0);
  }
  function list(g) {
    plinth(g, 3.12, 2.44);
    cabinet(g, [2.45, .44, 1.94], [0, .6, -.05], mats.teal);
    for (let i = 0; i < 3; i++) {
      const y = .91 + i * .27, z = .49 - i * .53;
      cabinet(g, [2.2, .17, .65], [0, y, z], frame, .02);
      sheet(g, .1, y + .13, z, 1.75, .5);
      box(g, [.15, .03, .16], [-.62, y + .18, z], mats.teal);
    }
    for (const x of [-1.16, 1.16]) cabinet(g, [.14, .97, 1.88], [x, 1.16, -.05], mats.light, .025);
    cabinet(g, [2.47, .16, .25], [0, 1.72, -.91], mats.teal, .025);
    panel(g, .72, .62, .96, .55, .26); vents(g, -.53, .51, .96, 3, .6);
    socket(g, -1.45, .58, 0, -1); socket(g, 1.45, .58, 0);
  }
  function fallback(g) {
    plinth(g); cabinet(g, [1.88, 1.33, 1.46], [0, 1.06, 0], mats.teal);
    cabinet(g, [2.05, .14, 1.62], [0, 1.8, 0], mats.light, .025);
    panel(g, 0, 1.2, .77, .9, .43); vents(g, 0, .65, .78, 4, 1.12);
    dial(g, [.64, 1.58, .78], .13);
    socket(g, -1.39, .58, 0, -1); socket(g, 1.39, .58, 0);
  }
  const machines = { input, list, receiver, 'length-check': lengthCheck, parser, validator, writer, storage, reject };

  // The alternatives change the silhouette and construction, not just its paint.
  // They all keep the same semantic family and the same external connection faces.
  function valveMachine(g, style, role) {
    plinth(g); pairedSockets(g, role);
    pipe(g, [[-1.39, .58, 0], [-.86, .58, 0], [-.86, .9, 0], [.86, .9, 0], [.86, .58, 0], [1.39, .58, 0]], .17, steel);
    if (style === 1) {
      cylinder(g, .38, .38, .7, [0, .94, 0], mats.teal, [0, 0, Math.PI / 2]);
      for (const x of [-.4, .4]) cylinder(g, .43, .43, .1, [x, .94, 0], steel, [0, 0, Math.PI / 2]);
      cylinder(g, .22, .31, .44, [0, 1.31, 0], mats.teal);
      cylinder(g, .075, .075, .48, [0, 1.72, 0], steel);
      handwheel(g, 0, 1.97, 0, .48); dial(g, [.65, 1.05, .47], .19);
      cabinet(g, [.43, .58, .4], [-1, .75, .64], cream); panel(g, -1, .78, .86, .3, .29);
    } else if (style === 2) {
      horizontalTank(g, 0, 1.08, -.29, 1.65, .36);
      cabinet(g, [.76, .56, .43], [.15, 1.53, -.29], mats.teal);
      panel(g, .15, 1.56, -.04, .57, .33); dial(g, [-.68, 1.48, .25], .22);
      pipe(g, [[-.85, .9, 0], [-.85, .9, .63], [.85, .9, .63], [.85, .9, 0]], .075, brass);
      handwheel(g, .75, 1.13, .64, .22);
      rail(g, [-1.2, .4, -.88], [1.2, .4, -.88], .5);
    } else if (style === 3) {
      cylinder(g, .32, .32, .72, [0, .95, 0], mats.teal, [0, 0, Math.PI / 2]);
      cylinder(g, .08, .08, .64, [0, 1.35, 0], steel);
      cabinet(g, [.85, .53, .63], [0, 1.85, 0], mats.teal);
      cabinet(g, [.31, .28, .45], [.57, 1.84, 0], steel);
      panel(g, 0, 1.85, .34, .58, .29); warningLamp(g, .25, 2.18, -.14);
      pipe(g, [[-.6, .9, 0], [-.6, 1.66, -.53], [0, 1.66, -.53]], .045, rubber);
      cabinet(g, [.54, .61, .4], [-.96, .76, .65], cream); dial(g, [-.96, .8, .88], .16);
    } else if (style === 4) {
      box(g, [2.3, .18, 1.05], [0, .64, 0], rubber);
      for (const z of [-.59, .59]) cabinet(g, [.29, 1.65, .24], [0, 1.26, z], mats.teal);
      cabinet(g, [.36, .18, 1.48], [0, 2.12, 0], steel);
      cabinet(g, [.17, .7, 1.04], [0, 1.35, 0], brass, .02);
      cylinder(g, .055, .055, .64, [0, 1.98, 0], frame); handwheel(g, 0, 2.35, 0, .29);
      panel(g, .64, .8, .72, .55, .29);
    } else if (style === 5) {
      cylinder(g, .33, .33, .75, [0, .94, 0], mats.teal, [0, 0, Math.PI / 2]);
      cylinder(g, .44, .44, .16, [0, 1.24, 0], steel);
      cylinder(g, .26, .39, .65, [0, 1.62, 0], mats.teal);
      cylinder(g, .12, .14, .19, [0, 2.04, 0], brass);
      dial(g, [.65, 1.43, .24], .27);
      pipe(g, [[.72, .9, 0], [.72, 1.18, 0], [.65, 1.43, .2]], .055, steel);
      pipe(g, [[-.73, .9, 0], [-.73, 1.7, -.47], [-.22, 1.7, -.47]], .045, brass);
    } else if (style === 6) {
      // A thin sliding knife blade above a round bore, distinct from a portal.
      cylinder(g, .46, .46, .34, [0, .98, 0], mats.teal, [0, 0, Math.PI / 2]);
      for (const x of [-.22, .22]) cylinder(g, .51, .51, .07, [x, .98, 0], steel, [0, 0, Math.PI / 2]);
      cabinet(g, [.19, .93, .79], [0, 1.56, 0], cream, .025);
      for (const z of [-.47, .47]) cabinet(g, [.17, 1.34, .12], [0, 1.56, z], frame, .02);
      cabinet(g, [.35, .17, 1.13], [0, 2.28, 0], mats.teal, .025);
      cylinder(g, .065, .065, .61, [0, 2.0, 0], steel); handwheel(g, 0, 2.45, 0, .32);
      dial(g, [.67, 1.13, .44], .17);
    } else if (style === 7) {
      // Butterfly body and a vertical hand wheel read clearly from above/side.
      cylinder(g, .61, .61, .25, [0, 1.02, 0], mats.teal, [0, 0, Math.PI / 2]);
      for (const x of [-.17, .17]) ring(g, .58, .055, [x, 1.02, 0], steel, [0, Math.PI / 2, 0]);
      cylinder(g, .07, .07, .58, [0, 1.72, 0], steel);
      cabinet(g, [.46, .3, .39], [0, 1.95, 0], frame);
      const wheel = new THREE.Group(); wheel.position.set(.09, 1.99, .48); wheel.rotation.x = Math.PI / 2; g.add(wheel);
      handwheel(wheel, 0, 0, 0, .38);
      cabinet(g, [.44, .41, .32], [.83, .73, -.46], cream); panel(g, .83, .78, -.27, .3, .25);
    } else if (style === 8) {
      // Low, wide weighing station: a measuring deck and a separate display.
      cabinet(g, [2.24, .18, 1.48], [0, .57, .03], frame, .025);
      for (const x of [-.83, .83]) for (const z of [-.49, .49]) cylinder(g, .11, .14, .22, [x, .75, z], steel);
      cabinet(g, [2.12, .17, 1.39], [0, .95, .03], cream, .025);
      for (const x of [-.8, .8]) box(g, [.11, .04, 1.2], [x, 1.06, .03], brass);
      cylinder(g, .065, .065, 1.47, [-1.08, 1.15, -.78], frame);
      cabinet(g, [.77, .49, .17], [-.82, 1.94, -.78], mats.teal, .035);
      panel(g, -.82, 1.94, -.67, .59, .3); sheet(g, .17, 1.09, .04, 1.08, .82);
    } else {
      // Two compact regulators connected through a bypass rather than one box.
      for (const x of [-.6, .6]) {
        cylinder(g, .27, .27, .48, [x, .98, 0], mats.teal, [0, 0, Math.PI / 2]);
        cylinder(g, .21, .28, .46, [x, 1.38, 0], cream);
        handwheel(g, x, 1.72, 0, .26); dial(g, [x, 1.2, .47], .16);
      }
      pipe(g, [[-.86, .91, 0], [-.86, .91, -.72], [.86, .91, -.72], [.86, .91, 0]], .095, steel);
      cylinder(g, .1, .1, .24, [0, 1.07, -.72], frame); handwheel(g, 0, 1.24, -.72, .2);
      cabinet(g, [.45, .6, .36], [0, .75, .68], cream); panel(g, 0, .86, .89, .31, .25);
    }
  }

  function alternateReceiver(g, style, role) {
    plinth(g); pairedSockets(g, role);
    if (style === 1) {
      motor(g, .58, .91, -.22, .36);
      cylinder(g, .43, .43, .47, [-.19, .91, -.22], mats.teal, [0, 0, Math.PI / 2]);
      pipe(g, [[-1.36, .58, 0], [-.83, .58, 0], [-.83, .91, -.22], [-.43, .91, -.22]], .15, steel);
      pipe(g, [[-.18, 1.19, -.22], [-.18, 1.52, -.22], [1.1, 1.52, -.22], [1.1, .58, 0], [1.36, .58, 0]], .15, mats.teal);
      cabinet(g, [.6, .84, .45], [-.75, .85, .65], cream); panel(g, -.75, .98, .9, .4, .34);
      dial(g, [.35, 1.68, .01], .18); rail(g, [-1.2, .4, -.91], [1.2, .4, -.91], .56);
    } else if (style === 2) {
      pipe(g, [[-1.36, .58, 0], [-.91, .58, 0], [-.91, 1.25, 0], [.92, 1.25, 0], [.92, .58, 0], [1.36, .58, 0]], .19, mats.teal);
      for (const x of [-.58, 0, .58]) {
        pipe(g, [[x, 1.25, 0], [x, 1.25, .64], [x, .65, .64]], .09, steel);
        cylinder(g, .12, .12, .25, [x, 1.43, .33], frame); handwheel(g, x, 1.61, .33, .19);
      }
      for (const x of [-.92, .92]) cabinet(g, [.17, .77, .5], [x, .74, -.16], frame, .02);
      cabinet(g, [.8, .52, .45], [0, .65, -.63], cream); warningLamp(g, .97, 1.46, -.38);
    } else if (style === 3) {
      rollers(g, { count: 7, d: 1.48, y: .75 });
      for (const z of [-.88, .88]) cabinet(g, [1.65, .44, .12], [-.28, 1.04, z], mats.teal);
      cabinet(g, [.6, .85, .52], [1.02, .83, -.54], cream); panel(g, 1.02, .92, -.25, .37, .35);
      cabinet(g, [.83, .59, .88], [-.46, 1.18, 0], mats.light);
      box(g, [.16, .6, .89], [-.46, 1.18, 0], brass);
      rail(g, [-1.2, .45, -.98], [.4, .45, -.98], .65);
    } else if (style === 4) {
      // Vertical receiving tower with a visible loading mouth and discharge.
      for (const x of [-.64, .64]) for (const z of [-.5, .5]) cabinet(g, [.12, 1.96, .12], [x, 1.04, z], frame, .018);
      mesh(g, new THREE.CylinderGeometry(.8, .35, .77, 4, 1, true), cream, [0, 1.85, 0], [0, Math.PI / 4, 0]);
      ring(g, .37, .055, [0, 1.48, 0], steel);
      cylinder(g, .27, .27, .44, [0, 1.23, 0], mats.teal);
      cabinet(g, [1.18, .18, .86], [0, .92, .04], steel, .025);
      pipe(g, [[-1.35, .58, 0], [-.93, .58, 0], [-.93, 1.85, 0], [-.58, 1.85, 0]], .13, mats.teal);
      pipe(g, [[0, 1.01, 0], [.87, 1.01, 0], [.87, .58, 0], [1.35, .58, 0]], .13, steel);
      panel(g, .86, .96, .66, .56, .34);
    } else {
      // Circular feed bowl and a tangential output neck, with no square plinth.
      cylinder(g, .74, .56, .65, [0, .72, -.03], mats.teal);
      mesh(g, new THREE.CylinderGeometry(.94, .73, .4, 24, 1, true), cream, [0, 1.23, -.03]);
      cylinder(g, .72, .72, .045, [0, 1.05, -.03], frame);
      ring(g, .94, .065, [0, 1.43, -.03], steel);
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        box(g, [.29, .12, .22], [Math.cos(angle) * .43, 1.14, -.03 + Math.sin(angle) * .43], brass);
      }
      cabinet(g, [.77, .16, .52], [.98, 1.01, .23], mats.teal, .025);
      pipe(g, [[-1.35, .58, 0], [-.84, .58, 0], [-.64, .83, 0]], .13, steel);
      pipe(g, [[1.22, 1.01, .23], [1.31, .58, 0]], .12, steel);
      cabinet(g, [.42, .61, .32], [-1.03, .72, -.63], cream); panel(g, -1.03, .86, -.44, .28, .28);
    }
  }

  function alternateParser(g, style, role) {
    plinth(g); pairedSockets(g, role);
    if (style === 1) {
      horizontalTank(g, -.07, 1.13, -.14, 1.55, .53);
      cylinder(g, .39, .39, .12, [.76, 1.13, -.14], glass, [0, 0, Math.PI / 2]);
      motor(g, -.94, .8, -.24, .22);
      for (let i = 0; i < 3; i++) {
        const x = -.7 + i * .67;
        cabinet(g, [.55, .25, .53], [x, .66, .7], i === 1 ? brass : cream, .025);
        pipe(g, [[x, 1.13, .28], [x, .91, .7]], .075, steel);
      }
      panel(g, .55, 1.77, .1, .65, .34); rail(g, [-1.2, .42, -.94], [1.2, .42, -.94], .56);
    } else {
      cabinet(g, [1.13, 1.25, 1.38], [-.59, 1.04, -.12], mats.teal);
      panel(g, -.59, 1.19, .61, .8, .45); vents(g, -.59, .65, .62, 3, .68);
      cylinder(g, .4, .4, .13, [-.59, 1.74, -.12], steel);
      for (let i = 0; i < 3; i++) {
        const z = -.63 + i * .62;
        pipe(g, [[-.04, .91, z], [.58, .91, z], [.98, .71, z]], .11, steel);
        cabinet(g, [.65, .17, .44], [.92, .64, z], i === 1 ? brass : mats.light, .025);
        box(g, [.36, .1, .27], [.92, .79, z], cream);
      }
      warningLamp(g, -.9, 1.77, -.48);
    }
  }

  function alternateWriter(g, style, role) {
    plinth(g); pairedSockets(g, role);
    if (style === 1) {
      cabinet(g, [1.58, .62, 1.29], [.35, .73, .15], cream);
      cabinet(g, [1.74, .12, 1.45], [.35, 1.1, .15], steel, .025); sheet(g, .35, 1.2, .15, .9, .84);
      cylinder(g, .36, .43, .38, [-.96, .56, -.38], mats.teal);
      const arm = box(g, [.23, 1.02, .25], [-.78, 1.15, -.38], mats.teal); arm.rotation.z = -.38;
      cylinder(g, .19, .19, .35, [-.59, 1.62, -.38], steel, [Math.PI / 2, 0, 0]);
      const forearm = box(g, [1.05, .19, .24], [-.08, 1.73, -.38], brass); forearm.rotation.z = .18;
      cylinder(g, .13, .13, .4, [.42, 1.66, -.38], frame);
      for (const x of [.32, .52]) box(g, [.07, .18, .23], [x, 1.38, -.38], steel);
      panel(g, .43, .77, .83, .72, .32); rail(g, [-1.18, .39, -.96], [1.18, .39, -.96], .68);
    } else if (style === 2) {
      horizontalTank(g, .17, 1.07, -.14, 1.6, .57); motor(g, -.95, .81, -.18, .27);
      cylinder(g, .27, .27, .18, [.17, 1.71, -.14], steel);
      cabinet(g, [.78, .42, .57], [.17, 1.93, -.14], mats.teal);
      panel(g, .17, 1.95, .17, .54, .23);
      cabinet(g, [1.24, .12, .69], [.16, .7, .68], frame, .02); sheet(g, .16, .8, .68, .94, .45);
      pipe(g, [[.97, 1.07, -.14], [1.22, 1.07, -.14], [1.22, .58, 0]], .11, brass);
      dial(g, [.73, 1.35, .47], .16);
    } else if (style === 3) {
      // A mixing vessel and offset drive: a tall process unit instead of a hall.
      cylinder(g, .65, .65, 1.09, [0, 1.1, 0], cream);
      cylinder(g, .65, .24, .27, [0, .43, 0], mats.teal);
      cylinder(g, .65, .65, .12, [0, 1.72, 0], steel);
      ring(g, .67, .045, [0, .72, 0], steel);
      cabinet(g, [1.35, .14, .31], [0, 1.9, 0], frame, .02);
      motor(g, -.11, 2.13, 0, .24); cylinder(g, .065, .065, .44, [.42, 1.96, 0], steel);
      pipe(g, [[-1.39, .58, 0], [-.93, .58, 0], [-.93, 1.38, 0], [-.64, 1.38, 0]], .115, mats.teal);
      pipe(g, [[.23, .43, 0], [.93, .43, 0], [.93, .58, 0], [1.39, .58, 0]], .12, steel);
      panel(g, .83, 1.01, .65, .52, .38); dial(g, [0, 1.2, .7], .2);
    } else {
      // Paired working rolls expose the processing action in the silhouette.
      cabinet(g, [2.36, .36, 1.53], [0, .58, 0], frame);
      for (const z of [-.4, .4]) {
        cylinder(g, .31, .31, 1.46, [0, 1.01, z], steel, [0, 0, Math.PI / 2]);
        for (const x of [-.86, .86]) cabinet(g, [.23, .8, .69], [x, 1.03, z], mats.teal, .035);
      }
      motor(g, 1.13, 1.09, -.38, .25);
      mesh(g, new THREE.CylinderGeometry(.71, .3, .56, 4, 1, true), cream, [0, 1.65, -.01], [0, Math.PI / 4, 0]);
      cabinet(g, [1.3, .14, .48], [0, .74, .87], brass, .025); sheet(g, 0, .85, .87, .9, .4);
      panel(g, -.84, 1.03, .8, .33, .3);
    }
  }

  function alternateStorage(g, style, role) {
    plinth(g, 2.9, 2.26); pairedSockets(g, role);
    if (style === 1) {
      for (const x of [-.65, .65]) {
        for (const z of [-.45, .45]) cabinet(g, [.12, .54, .14], [x, .6, z], frame, .02);
        cylinder(g, .49, .49, 1.25, [x, 1.44, -.12], cream);
        cylinder(g, .49, .12, .35, [x, .64, -.12], steel);
        cylinder(g, .18, .49, .24, [x, 2.18, -.12], mats.teal);
        ring(g, .5, .035, [x, 1.05, -.12], steel); ring(g, .5, .035, [x, 1.91, -.12], steel);
        box(g, [.16, .66, .025], [x, 1.45, .38], glass);
        pipe(g, [[x, .57, -.12], [x, .57, .74], [x > 0 ? 1.34 : -1.34, .58, 0]], .09, mats.teal);
      }
      cabinet(g, [.46, .64, .37], [0, .75, .74], mats.teal); panel(g, 0, .85, .95, .3, .29);
    } else if (style === 2) {
      horizontalTank(g, 0, 1.08, -.12, 2.12, .62);
      cylinder(g, .26, .26, .13, [0, 1.76, -.12], steel); handwheel(g, 0, 1.9, -.12, .22);
      pipe(g, [[-1.34, .58, 0], [-1.22, .58, 0], [-1.22, 1.08, -.12]], .13, mats.teal);
      pipe(g, [[1.08, 1.08, -.12], [1.25, 1.08, -.12], [1.25, .58, 0], [1.34, .58, 0]], .13, mats.teal);
      dial(g, [.72, 1.34, .46], .2); rail(g, [-1.18, .41, -.96], [1.18, .41, -.96], .55);
    } else if (style === 3) {
      for (let i = 0; i < 3; i++) {
        const x = -.86 + i * .86;
        cabinet(g, [.74, .96 + i * .15, 1.45], [x, .9 + i * .075, -.04], i === 1 ? mats.teal : cream);
        cabinet(g, [.79, .13, 1.5], [x, 1.44 + i * .15, -.04], steel, .02);
        cabinet(g, [.54, .29, .09], [x, .98, .73], frame, .02);
        box(g, [.3, .1, .025], [x, .98, .79], brass);
      }
      pipe(g, [[-1.34, .58, 0], [-1.24, .58, .92], [1.24, .58, .92], [1.34, .58, 0]], .08, steel);
    } else if (style === 4) {
      // A large open bulk bin on four structural columns.
      for (const x of [-.91, .91]) for (const z of [-.52, .52]) cabinet(g, [.14, 1.46, .14], [x, 1.14, z], frame, .018);
      mesh(g, new THREE.CylinderGeometry(.85, .38, .91, 4, 1, true), cream, [0, 1.43, 0], [0, Math.PI / 4, 0]);
      cabinet(g, [1.96, .11, .1], [0, 1.89, .57], mats.teal, .02);
      cabinet(g, [1.96, .11, .1], [0, 1.89, -.57], mats.teal, .02);
      cylinder(g, .25, .25, .39, [0, .77, 0], mats.teal); handwheel(g, .48, .82, .47, .24);
      pipe(g, [[-1.34, .58, 0], [-1.12, .58, 0], [-1.12, 1.66, 0], [-.8, 1.66, 0]], .12, steel);
      pipe(g, [[0, .58, 0], [1.34, .58, 0]], .15, mats.teal);
      panel(g, -.85, 1.14, .62, .45, .31);
    } else {
      cylinder(g, .68, .68, 1.55, [0, 1.14, 0], cream);
      cylinder(g, .24, .68, .28, [0, 2.05, 0], mats.teal);
      cylinder(g, .2, .2, .13, [0, 2.25, 0], steel);
      for (const y of [.55, 1.81]) ring(g, .69, .04, [0, y, 0], steel);
      box(g, [.15, .94, .028], [.17, 1.17, .68], glass);
      for (const z of [-.14, .29]) cabinet(g, [.045, 1.84, .045], [.84, 1.13, z], steel, .009);
      for (let i = 0; i < 6; i++) detail(box(g, [.055, .04, .47], [.84, .42 + i * .27, .075], brass));
      pipe(g, [[-1.34, .58, 0], [-.65, .58, 0]], .13, mats.teal);
      pipe(g, [[.65, .58, 0], [1.34, .58, 0]], .13, mats.teal);
      dial(g, [-.38, 1.2, .64], .19);
    }
  }

  function alternateReject(g, style, role) {
    plinth(g, 2.65, 2.18); pairedSockets(g, role);
    if (style === 1) {
      cylinder(g, .55, .55, .76, [.35, .89, -.04], cream);
      cylinder(g, .59, .59, .1, [.35, 1.3, -.04], mats.teal);
      cylinder(g, .1, .1, .49, [.35, 1.6, -.04], steel);
      cylinder(g, .35, .18, .16, [.35, 1.91, -.04], brass);
      pipe(g, [[-1.32, .58, 0], [-.65, .58, 0], [-.65, 1.03, 0], [-.2, 1.03, 0]], .16, mats.teal);
      dial(g, [.35, .98, .55], .2); warningLamp(g, 1, .92, -.72);
      rail(g, [-.93, .38, -.91], [.94, .38, -.91], .54);
    } else {
      cabinet(g, [2.05, .38, 1.53], [0, .59, 0], frame);
      cabinet(g, [1.58, .51, 1.08], [.06, 1.04, -.1], mats.teal);
      box(g, [1.32, .035, .83], [.06, 1.31, -.1], rubber);
      for (const x of [-.88, .88]) {
        cabinet(g, [.12, .93, .16], [x, 1.21, .63], steel, .02);
        cabinet(g, [.12, .93, .16], [x, 1.21, -.68], steel, .02);
      }
      rail(g, [-.88, 1.18, -.68], [.88, 1.18, -.68], .35);
      panel(g, 0, .62, .81, .74, .25); warningLamp(g, .94, 1.65, -.61);
      sheet(g, .04, 1.36, -.12, .82, .65);
    }
  }

  function alternateInterface(g, style, role, family) {
    plinth(g, 3.12, 2.44); pairedSockets(g, role);
    if (family === 'input' && style === 2) {
      cabinet(g, [2.29, .72, 1.43], [0, .75, -.07], cream);
      const desk = new THREE.Group(); desk.position.set(0, 1.22, -.07); desk.rotation.x = .25; g.add(desk);
      cabinet(desk, [2.42, .18, 1.5], [0, 0, 0], mats.teal);
      for (const x of [-.57, .57]) { box(desk, [.86, .035, .79], [x, .12, -.18], rubber); box(desk, [.72, .025, .65], [x, .145, -.18], glass); }
      for (const x of [-.82, -.48, .48, .82]) cylinder(desk, .08, .08, .05, [x, .14, .5], x < 0 ? brass : cream);
      panel(g, 0, .76, .69, .73, .29); vents(g, -.83, .55, .69, 3, .38);
    } else if (family === 'list' && style === 1) {
      for (const x of [-1.05, 1.05]) cabinet(g, [.17, 1.72, .18], [x, 1.24, -.65], mats.teal);
      for (let row = 0; row < 3; row++) {
        cabinet(g, [2.37, .13, 1.4], [0, .6 + row * .55, -.04], steel, .02);
        for (const x of [-.57, .57]) { cabinet(g, [.95, .36, 1.16], [x, .84 + row * .55, -.04], cream, .025); box(g, [.43, .12, .025], [x, .85 + row * .55, .56], glass); }
      }
      rail(g, [-1.18, .4, -.99], [1.18, .4, -.99], .57);
    } else {
      rollers(g, { w: 2.8, d: 1.4, count: 8, y: .8 });
      cabinet(g, [.56, .95, .52], [-1.04, .9, -.75], mats.teal); panel(g, -1.04, 1.08, -.46, .36, .34);
      if (family === 'list') {
        for (const z of [-.45, .45]) { sheet(g, .5, .99, z, .94, .56); box(g, [1.25, .13, .055], [.48, 1, z > 0 ? .76 : -.76], brass); }
        cabinet(g, [.14, .45, 1.48], [0, 1.12, 0], mats.teal, .02);
      } else {
        sheet(g, .14, .99, 0, 1.15, .9);
        for (const z of [-.8, .8]) cabinet(g, [1.58, .31, .11], [.22, 1.01, z], mats.teal, .02);
      }
      warningLamp(g, -1.04, 1.43, -.75);
    }
  }

  function alternateUtility(g, style, role) {
    plinth(g); pairedSockets(g, role);
    if (style === 1) {
      motor(g, -.35, 1.04, -.16, .5);
      cabinet(g, [.92, 1.2, .67], [.78, 1.03, -.04], cream);
      panel(g, .78, 1.25, .32, .61, .36); vents(g, .78, .65, .33, 3, .58);
      pipe(g, [[-.35, .57, -.16], [-.35, .57, .7], [.78, .57, .7], [.78, .71, .3]], .065, rubber);
    } else {
      cabinet(g, [1.52, .71, 1.38], [-.4, .78, -.04], cream);
      cylinder(g, .42, .42, .6, [-.4, 1.48, -.04], mats.teal);
      ring(g, .35, .05, [-.4, 1.8, -.04], steel); cylinder(g, .25, .25, .03, [-.4, 1.81, -.04], rubber);
      cabinet(g, [.58, 1.08, .61], [.9, .96, -.26], mats.teal); panel(g, .9, 1.11, .08, .4, .32);
      vents(g, -.4, .63, .69, 4, .95);
      pipe(g, [[.4, .87, -.04], [.9, .87, -.04]], .1, steel);
    }
  }

  function wallWindow(g, x, y, z, w = .48, h = .38) {
    cabinet(g, [w + .08, h + .08, .05], [x, y, z], mats.dark, .015);
    box(g, [w, h, .015], [x, y, z + .033], glass);
    detail(box(g, [.025, h, .02], [x, y, z + .045], cream));
  }
  function roofPrism(g, x0, x1, z0, z1, y0, yPeak, mat) {
    // A triangular cross-section extruded along x. The roof has physical thickness.
    const shape = new THREE.Shape();
    shape.moveTo(z0, y0); shape.lineTo((z0 + z1) / 2, yPeak); shape.lineTo(z1, y0);
    shape.lineTo(z1, y0 - .1); shape.lineTo((z0 + z1) / 2, yPeak - .1); shape.lineTo(z0, y0 - .1); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
    // local x is roof-z, local y is height, extrusion-z becomes world-x.
    const roof = mesh(g, geometry, mat, [x0, 0, 0], [0, Math.PI / 2, 0]);
    roof.scale.x = -1;
    return roof;
  }
  function industrialYard(g, role, index) {
    const family = deviceFamily(role), machinery = new THREE.Group(); g.add(machinery);
    machinery.scale.set(1.2, .9, 1.13); machinery.position.y = .03;
    buildMachine(machinery, role, { index: index || 1 });
    cabinet(g, [4.5, .14, 3.1], [0, .15, 0], steel, .025);
    for (const z of [-1.35, 1.35]) rail(g, [-2.07, .25, z], [2.07, .25, z], .48);
    if (family === 'writer' || family === 'parser') {
      for (const x of [-1.89, 1.89]) for (const z of [-1.12, 1.12]) cabinet(g, [.17, 1.99, .17], [x, 1.25, z], frame, .02);
      cabinet(g, [4.08, .24, .27], [0, 2.37, -.78], brass);
      cabinet(g, [4.08, .24, .27], [0, 2.37, .78], brass);
      cabinet(g, [.56, .26, 1.92], [.72, 2.56, 0], mats.teal);
      cylinder(g, .04, .04, .45, [.72, 2.25, 0], steel);
    } else if (family !== 'storage') {
      cabinet(g, [1.02, .79, .56], [-1.47, .68, -.89], cream);
      panel(g, -1.47, .75, -.58, .67, .36);
    }
    panel(g, .9, .48, 1.48, .8, .26);
  }

  function buildBuilding(g, role, roof = 'pitched', choice) {
    const index = variantIndex(role, choice), family = deviceFamily(role);
    // Facilities can be open process yards, tank farms or gantry workcells. A
    // container remains one semantic module regardless of its architectural skin.
    if (roof !== 'open' && ((family === 'storage' && index > 0) ||
      (['receiver', 'parser', 'writer', 'threshold'].includes(family) && index % 2 === 1))) {
      industrialYard(g, role, index); return;
    }
    const open = roof === 'open';
    if (open) {
      // An outdoor assembly yard reads as a container without hiding its contents.
      for (const x of [-2.16, 2.16]) for (const z of [-1.43, 1.43]) {
        cabinet(g, [.18, .78, .18], [x, .59, z], mats.teal, .025);
        cabinet(g, [.28, .1, .28], [x, 1.02, z], mats.light, .02);
      }
      for (const z of [-1.43, 1.43]) {
        box(g, [4.2, .12, .12], [0, .58, z], mats.light);
        box(g, [4.25, .05, .09], [0, .91, z], steel);
      }
      box(g, [.12, .22, 2.82], [2.16, .58, 0], mats.light);
      panel(g, 0, .67, 1.52, .8, .29);
      return;
    }
    // Thin walls leave the nested factory genuinely hollow. No solid interior box.
    cabinet(g, [4.32, 1.255, .14], [0, .8275, -1.39], mats.light, .025);
    for (const x of [-2.12, 2.12]) cabinet(g, [.14, 1.255, 2.84], [x, .8275, 0], mats.light, .025);
    // The front facade is built around a real loading-bay recess.
    for (const x of [-1.41, 1.41]) cabinet(g, [1.4, 1.255, .14], [x, .8275, 1.39], mats.light, .025);
    box(g, [1.45, .27, .14], [0, 1.32, 1.39], mats.teal);
    box(g, [1.36, .86, .065], [0, .82, 1.33], rubber);
    for (let i = 0; i < 6; i++) detail(box(g, [1.3, .027, .025], [0, .51 + i * .12, 1.37], steel));
    for (const x of [-2.18, 2.18]) for (const z of [-1.44, 1.44]) cabinet(g, [.15, 1.375, .15], [x, .8875, z], mats.teal, .025);
    for (const x of [-1.45, 1.45]) wallWindow(g, x, 1.03, 1.485, .62, .4);
    // Side window strips make the second visible face legible from an isometric view.
    for (const z of [-.72, .15, .89]) {
      box(g, [.04, .4, .49], [2.205, 1.06, z], mats.dark);
      box(g, [.022, .32, .41], [2.233, 1.06, z], glass);
    }
    cabinet(g, [4.55, .13, 3.07], [0, 1.51, 0], mats.teal, .03);
    if (roof === 'sawtooth') {
      for (let i = 0; i < 3; i++) {
        const z = -1.5 + i;
        // Asymmetric ridges and vertical clerestory faces, not stacked flat plates.
        const shape = new THREE.Shape();
        shape.moveTo(z, 1.55); shape.lineTo(z + .78, 1.99); shape.lineTo(z + .78, 1.55); shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.42, bevelEnabled: false, curveSegments: 1 });
        const saw = mesh(g, geo, mats.teal, [-2.21, 0, 0], [0, Math.PI / 2, 0]); saw.scale.x = -1;
        box(g, [3.94, .29, .035], [0, 1.73, z + .8], glass);
        for (const x of [-1.33, 0, 1.33]) detail(box(g, [.045, .29, .04], [x, 1.73, z + .825], mats.light));
      }
    } else {
      roofPrism(g, -2.28, 2.28, -1.57, 1.57, 1.6, 2.05, mats.teal);
      box(g, [4.61, .09, .14], [0, 2.07, 0], mats.light);
      for (const x of [-1.3, 1.3]) {
        const skylight = box(g, [.77, .045, .59], [x, 1.87, .69], glass);
        skylight.rotation.x = .28;
      }
    }
    if (role !== 'intake') {
      cylinder(g, .21, .23, .5, [-1.54, 2.03, -.67], frame);
      cylinder(g, .29, .29, .12, [-1.54, 2.33, -.67], steel);
      cylinder(g, .22, .22, .015, [-1.54, 2.4, -.67], rubber);
    } else {
      cabinet(g, [.72, .32, .57], [-1.33, 1.93, -.68], mats.light);
      vents(g, -1.33, 1.85, -.37, 3, .51);
    }
    box(g, [1.6, .28, .28], [0, .34, 1.56], steel);
    for (const x of [-.67, .67]) cylinder(g, .055, .055, .4, [x, .52, 1.58], brass);
    // A service deck, rooftop plant and a safety ladder give the building a
    // recognisable industrial scale without multiplying tiny decorative bolts.
    cabinet(g, [.87, .28, .69], [1.36, 1.97, -.65], cream);
    cylinder(g, .2, .2, .07, [1.36, 2.14, -.65], frame);
    ring(g, .15, .025, [1.36, 2.18, -.65], steel);
    for (const z of [-.52, -.09]) box(g, [.055, 1.48, .055], [2.26, .99, z], steel);
    for (let i = 0; i < 6; i++) detail(box(g, [.07, .055, .46], [2.27, .4 + i * .23, -.305], brass));
    for (const x of [-1.42, 1.42]) box(g, [.47, .06, .38], [x, .27, 1.52], steel);
  }
  function buildTray(g, { width = 4.8, depth = 3.6, kind = 'module' } = {}) {
    const w = Number.isFinite(width) && width > 0 ? width : 4.8;
    const d = Number.isFinite(depth) && depth > 0 ? depth : 3.6;
    g.userData.floorTop = .08;
    g.userData.floorKind = kind;
    // One thin shared floor replaces the double display slab and continuous rim.
    // Its upper face is .08 in native coordinates; the hierarchy places feet here.
    cabinet(g, [w, .08, d], [0, .04, 0], concrete, .018);
    const inset = Math.min(.1, w / 10, d / 10), mark = Math.min(.37, w / 4, d / 4);
    const corners = kind === 'workspace' || kind === 'workcell' ? [[-1, -1], [1, 1]] : [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [sx, sz] of corners) {
      const x = sx * (w / 2 - inset), z = sz * (d / 2 - inset);
      box(g, [mark, .012, .035], [x - sx * mark / 2, .086, z], steel);
      box(g, [.035, .012, mark], [x, .086, z - sz * mark / 2], steel);
    }
  }
  function variantIndex(role, variant) {
    const count = DEVICE_VARIANTS[deviceFamily(role)].length;
    const value = typeof variant === 'number' ? variant : variant?.index;
    return Number.isInteger(value) ? ((value % count) + count) % count : 0;
  }
  function buildMachine(group, role, variant) {
    const family = deviceFamily(role), index = variantIndex(role, variant);
    group.userData.semanticFamily = family;
    group.userData.deviceVariant = index;
    if (!index) {
      const canonical = { threshold: role === 'length-check' ? 'length-check' : 'validator', utility: '' }[family] ?? family;
      (machines[role] || machines[canonical] || fallback)(group); return;
    }
    if (family === 'threshold') valveMachine(group, index, role);
    else if (family === 'receiver') alternateReceiver(group, index, role);
    else if (family === 'parser') alternateParser(group, index, role);
    else if (family === 'writer') alternateWriter(group, index, role);
    else if (family === 'storage') alternateStorage(group, index, role);
    else if (family === 'reject') alternateReject(group, index, role);
    else if (family === 'input' || family === 'list') alternateInterface(group, index, role, family);
    else alternateUtility(group, index, role);
  }
  return {
    buildMachine,
    buildAuxiliarySocket(group, role, side, offset) {
      if (side !== 'top' && side !== 'bottom') return;
      const [x, y, z] = machineSocket(role, side, offset), sign = side === 'top' ? -1 : 1;
      // A visible, supported front/back manifold for loop and rejection branches.
      // Its outer flange face is exactly machineSocket(), shared with the router.
      cabinet(group, [.28, .25, .24], [x, .455, z - sign * .12], frame, .025);
      cylinder(group, .12, .12, .18, [x, y, z - sign * .10], frame, [Math.PI / 2, 0, 0]);
      cylinder(group, .19, .19, .055, [x, y, z - sign * .0275], steel, [Math.PI / 2, 0, 0]);
    },
    buildBuilding,
    buildTray,
  };
}
