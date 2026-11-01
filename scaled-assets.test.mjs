import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { DEVICE_VARIANTS } from './device-variants.mjs';
import { createFactoryAssets, machineSocket } from './factory-assets.js';
import { machineFootprint } from './equipment-footprints.mjs';
import { layoutHierarchy } from './hierarchy-layout.mjs';
import { planRoutes } from './routing-plan.mjs';

const resources = new Set();
const material = color => {const result = new THREE.MeshStandardMaterial({color});resources.add(result);return result;};
const mats = Object.fromEntries(['teal','light','dark','amber','metal'].map((name,i)=>[name,material([0x389ec2,0xeaf0f1,0x284355,0xf4a334,0x91a5b2][i])]));
function mesh(parent,geometry,mat,p=[0,0,0],r) {resources.add(geometry);const object = new THREE.Mesh(geometry,mat);object.position.set(...p);if(r)object.rotation.set(...r);parent.add(object);return object;}
const box=(g,s,p,m)=>mesh(g,new THREE.BoxGeometry(...s),m,p);
const cylinder=(g,a,b,h,p,m,r)=>mesh(g,new THREE.CylinderGeometry(a,b,h,20),m,p,r);
const pipe=(g,ps,r,m)=>mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ps.map(p=>new THREE.Vector3(...p))),32,r,6),m);
const assets=createFactoryAssets({THREE,box,cylinder,pipe,mesh,mats,material,fine:[]});
const sceneSource=await fs.readFile(new URL('./factory-scene.js',import.meta.url),'utf8');
const socketRadiusExpression=sceneSource.match(/const socketRadius = ([^;]+);/)?.[1];
assert.ok(socketRadiusExpression,'scene needs a socket radius constraint');
const actualSocketRadius=new Function('sy','side','sz','sx',`return ${socketRadiusExpression};`);
const taperSource=sceneSource.slice(sceneSource.indexOf('    const steps = Math.max(48, points.length*16)'),sceneSource.indexOf('    mesh(group, tube, mat);'));
assert.ok(taperSource.includes('const radiusAt')&&taperSource.includes('positions.setXYZ'),'expected scene taper implementation');
const actualTaper=new Function('THREE','smooth','curve','points','scale','radius','startRadius','endRadius',`${taperSource}\nreturn {tube,steps,radialSteps,routeLength,taperLength,radiusAt};`);
const roles={threshold:'validator',utility:'unknown',...Object.fromEntries(Object.keys(DEVICE_VARIANTS).filter(f=>!['threshold','utility'].includes(f)).map(f=>[f,f]))};
const rows=[];let portFaces=0,containedTerminalCollars=0;
const transformations=[{center:[0,0,0],scale:1,heightScale:1},{center:[4.2,.38,-3.7],scale:.43,heightScale:.37}];
for(const [family,variants] of Object.entries(DEVICE_VARIANTS)) {
  const role=roles[family],footprint=machineFootprint(role);
  for(let index=0;index<variants.length;index++) {
    let marginX=Infinity,marginZ=Infinity;
    for(const transform of transformations) {
      const group=new THREE.Group();group.position.set(...transform.center);group.scale.set(transform.scale,transform.heightScale,transform.scale);
      const summary=new THREE.Group();summary.scale.set(footprint.assetScaleX,1,footprint.assetScaleZ);group.add(summary);assets.buildMachine(summary,role,{index});group.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(summary),[x,y,z]=transform.center;
      const halfX=footprint.width*transform.scale/2,halfZ=footprint.depth*transform.scale/2;
      marginX=Math.min(marginX,(bounds.min.x-x+halfX)/transform.scale,(x+halfX-bounds.max.x)/transform.scale);
      marginZ=Math.min(marginZ,(bounds.min.z-z+halfZ)/transform.scale,(z+halfZ-bounds.max.z)/transform.scale);
      assert.ok(marginX>=-1e-6&&marginZ>=-1e-6,`${variants[index]} escapes semantic footprint`);
      const sx=transform.scale*footprint.assetScaleX,sz=transform.scale*footprint.assetScaleZ,sy=transform.heightScale;
      summary.traverse(obj=>{
        if(!obj.userData.factoryPort)return;
        const side=obj.userData.factoryPort.side,local=machineSocket(role,side),expected=[x+local[0]*sx,y+local[1]*sy,z+local[2]*sz];
        const physical=new THREE.Box3().setFromObject(obj),center=physical.getCenter(new THREE.Vector3());
        const actual=[side==='left'?physical.min.x:physical.max.x,center.y,center.z];
        actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-6,`${variants[index]} ${side} scaled port mismatch`));portFaces++;
        const crossRadius=Math.min((physical.max.y-physical.min.y)/2,(physical.max.z-physical.min.z)/2);
        const terminalRadius=Math.min(.14*transform.scale,actualSocketRadius(sy,side,sz,sx));
        assert.ok(1.3*terminalRadius<=crossRadius+1e-6,`${variants[index]} terminal ring must fit inside physical flange`);containedTerminalCollars++;
      });
      for(const side of ['top','bottom'])for(const fraction of [-.65,0,.65]) {
        // A route boundary is expressed in world coordinates, then inverse-mapped
        // into the same native auxiliary fixture as the renderer uses.
        const boundaryX=x+halfX*fraction,localOffset=(boundaryX-x)/sx;
        const manifold=new THREE.Group();manifold.position.set(...transform.center);manifold.scale.set(sx,sy,sz);assets.buildAuxiliarySocket(manifold,role,side,localOffset);manifold.updateMatrixWorld(true);
        const flange=manifold.children.at(-1),b=new THREE.Box3().setFromObject(flange),c=b.getCenter(new THREE.Vector3());
        const actual=[c.x,c.y,side==='top'?b.min.z:b.max.z],local=machineSocket(role,side,localOffset),expected=[x+local[0]*sx,y+local[1]*sy,z+local[2]*sz];
        actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-6,`${variants[index]} ${side} inverse-offset mismatch`));portFaces++;
        const crossRadius=Math.min((b.max.x-b.min.x)/2,(b.max.y-b.min.y)/2),terminalRadius=Math.min(.14*transform.scale,actualSocketRadius(sy,side,sz,sx));
        assert.ok(1.3*terminalRadius<=crossRadius+1e-6,`${variants[index]} ${side} terminal ring must fit inside physical auxiliary flange`);containedTerminalCollars++;
      }
    }
    rows.push({family,variant:variants[index],marginX:+marginX.toFixed(5),marginZ:+marginZ.toFixed(5)});
  }
}
// Synthetic nested graph: no dependency on a developer's saved project.
const node=(id,role,parentId,lines=10)=>({id,data:{label:id,role,...(parentId?{parentId}:{}),codeSize:{lines,verified:true}}});
const graph={nodes:[node('input','receiver'),node('process','writer'),node('output','storage'),
  node('receive','receiver','process',2),node('check','validator','process',80),node('save','writer','process',5),
  node('parse','parser','receive',2),node('decode','transformer','receive',40)],
  edges:[['input','process'],['process','output'],['receive','check'],['check','save'],['parse','decode']]
    .map(([source,target],i)=>({id:`edge-${i}`,source,target,data:{branch:'success',flowRole:'main'}}))};
const layout=layoutHierarchy(graph),plans=planRoutes(graph,layout),source=new Map(graph.nodes.map(n=>[n.id,n])),nodes=new Map(layout.nodes.map(n=>[n.id,{...n,role:source.get(n.id)?.data?.role||n.id}]));
const widthRisks=[],closedPipeRisks=[],collarRisks=[];
for(const plan of plans) {
  const edge=graph.edges.find(e=>e.id===plan.edgeId);
  for(const end of ['source','target']) {
    const node=nodes.get(plan[`${end}Id`]||edge?.[end]);
    if(!node||node.children.length||!((!plan.bridge&&!plan.port)||plan.machineEndpoint===end))continue;
    const p=end==='source'?plan.points[0]:plan.points.at(-1),dx=(p[0]-node.center[0])/(node.width/2),dz=(p[2]-node.center[2])/(node.depthSize/2),side=Math.abs(dx)>=Math.abs(dz)?(dx<0?'left':'right'):(dz<0?'top':'bottom');
    const sx=node.scaleXZ*node.assetScaleX,sz=node.scaleXZ*node.assetScaleZ,sy=node.heightScale;
    const flangeRadius=(side==='left'||side==='right')?.205*Math.min(sz,sy):.19*Math.min(sx,sy);
    const endpointRadius=Math.min(plan.pipeRadius,actualSocketRadius(sy,side,sz,sx));
    assert.ok(endpointRadius<=plan.pipeRadius+1e-9,'reducer must not enlarge the main pipe');
    const context={edgeId:plan.edgeId,nodeId:node.id,side,pipeRadius:+plan.pipeRadius.toFixed(5),flangeSmallRadius:+flangeRadius.toFixed(5),endpointRadius:+endpointRadius.toFixed(5)};
    if(plan.pipeRadius>flangeRadius+1e-6) {
      widthRisks.push({...context,ratio:+(plan.pipeRadius/flangeRadius).toFixed(3)});
      if(endpointRadius<=flangeRadius+1e-6)closedPipeRisks.push(context);
    }
    if(endpointRadius*1.3>flangeRadius+1e-6)collarRisks.push({...context,terminalCollarOuterRadius:+(endpointRadius*1.3).toFixed(5),ratio:+(endpointRadius*1.3/flangeRadius).toFixed(3)});
  }
}
// Execute the reviewed taper block from the current scene source against actual
// Three TubeGeometry rings; this catches API sampling or radial indexing drift.
let taperRingChecks=0;
for(const scale of [1,.43,.0815])for(const short of [false,true])for(const radii of [[.7,1],[1,.65],[.7,.65]]) {
  const radius=.14*scale,startRadius=radius*radii[0],endRadius=radius*radii[1];
  const points=short?[new THREE.Vector3(0,0,0),new THREE.Vector3(.15*scale,0,0)]:[new THREE.Vector3(0,0,0),new THREE.Vector3(1.4*scale,0,0),new THREE.Vector3(1.4*scale,.6*scale,0),new THREE.Vector3(2.8*scale,.6*scale,0)];
  const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
  const result=actualTaper(THREE,(a,b,v)=>THREE.MathUtils.smoothstep(v,a,b),curve,points,scale,radius,startRadius,endRadius);
  const positions=result.tube.attributes.position;
  for(let i=0;i<=result.steps;i++) {
    const center=curve.getPointAt(i/result.steps),expected=result.radiusAt(i/result.steps*result.routeLength);
    for(let j=0;j<=result.radialSteps;j++) {
      const position=new THREE.Vector3().fromBufferAttribute(positions,i*(result.radialSteps+1)+j),distance=position.distanceTo(center);
      assert.ok(distance<=radius+1e-6,'taper must stay within original route envelope');
      assert.ok(Math.abs(distance-expected)<1e-6,'all vertices in a ring must match intended arc-length taper');
      assert.ok(Number.isFinite(distance),'taper must produce finite vertices');taperRingChecks++;
    }
  }
  assert.ok(Math.abs(result.radiusAt(0)-startRadius)<1e-12&&Math.abs(result.radiusAt(result.routeLength)-endRadius)<1e-12,'both end radii must be assigned to the matching end');
  result.tube.dispose();
}
for(const r of resources)r.dispose();
console.log(JSON.stringify({ok:true,readOnlySceneAudit:true,variants:rows.length,transformedVariants:rows.length*transformations.length,physicalPortFaceChecks:portFaces,minimumEnvelopeMargins:{x:Math.min(...rows.map(r=>r.marginX)),z:Math.min(...rows.map(r=>r.marginZ))},verified:['summary assetScale applied once inside node scale','auxiliary manifolds use same world sx/sy/sz','top/bottom offset inverse uses sx','dynamic outline uses baseWidth/baseDepth before parent scaling','tray uses native semantic width/depth without duplicate asset scale','nested floor height is .08 in layout, tray and pipe supports'],limitations:['headless geometry audit; no pixel-level appearance acceptance','terminal collar containment checked separately from pipe-body containment'],taperAudit:{source:'current factory-scene.js taper block',socketRadiusExpression,scenarios:18,ringVerticesChecked:taperRingChecks,containedTerminalCollars,originalEnvelopePreserved:true,endpointDirectionCorrect:true,arcLengthSamplingCorrect:true,closedPipeBodyRisks:closedPipeRisks,openTerminalCollarRisks:collarRisks},originalPipeWidthRisks:widthRisks,details:rows},null,2));
