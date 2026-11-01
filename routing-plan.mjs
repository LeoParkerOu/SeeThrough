// Deterministic shortest clear orthogonal routes; semantics never force perimeter detours.
import { encodePipe } from './visual-encoding.mjs';
const EPS = 1e-9;
const same = (a, b) => Math.abs(a - b) < EPS;
const heightScale = node => node.heightScale ?? node.scale;
// A thicker pipe and its <=1.3r flange must remain above the deck.
const deckY = node => node.center[1] + .08 * heightScale(node) + .22 * node.scale;
const pipeClearance = (spec, scale, unit) => spec.flangeRadiusLimit + .10 * scale + .02 * unit;

function compact(points) {
  const result = [];
  for (const point of points) {
    if (result.length && point.every((v, i) => same(v, result.at(-1)[i]))) continue;
    while (result.length > 1) {
      const a = result.at(-2), b = result.at(-1);
      const changing = [0, 1, 2].filter(i => !same(a[i], b[i]) || !same(b[i], point[i]));
      if (changing.length !== 1) break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

function inside(point, rect) {
  return point[0] > rect.left + EPS && point[0] < rect.right - EPS && point[1] > rect.top + EPS && point[1] < rect.bottom - EPS;
}

function crosses(a, b, rect) {
  if (same(a[0], b[0])) {
    return a[0] > rect.left + EPS && a[0] < rect.right - EPS && Math.max(a[1], b[1]) > rect.top + EPS && Math.min(a[1], b[1]) < rect.bottom - EPS;
  }
  return a[1] > rect.top + EPS && a[1] < rect.bottom - EPS && Math.max(a[0], b[0]) > rect.left + EPS && Math.min(a[0], b[0]) < rect.right - EPS;
}

// A small visibility grid contains only obstacle boundaries and requested endpoints.
// No dependency or graph-wide force solver is needed for this 11-node sample.
function corridor(start, end, bounds, obstacles, scale, context = {}) {
  const fail = message => {
    const detail = { ...context, start, end };
    const error = new Error(`${message}；路由上下文 ${JSON.stringify(detail)}`);
    error.routeContext = detail; throw error;
  };
  const values = (list, min, max) => [...new Set(list.filter(v => v >= min - EPS && v <= max + EPS))].sort((a, b) => a - b);
  const xs = values([start[0], end[0], bounds.left, bounds.right, ...obstacles.flatMap(o => [o.left, o.right])], bounds.left, bounds.right);
  const zs = values([start[1], end[1], bounds.top, bounds.bottom, ...obstacles.flatMap(o => [o.top, o.bottom])], bounds.top, bounds.bottom);
  if (xs.length * zs.length > 16_384) fail('路由网格超过当前支持规模，请按真实职责拆分模块');
  const key = (x, z) => `${x},${z}`;
  const startX = xs.findIndex(x => same(x, start[0])), startZ = zs.findIndex(z => same(z, start[1]));
  const endX = xs.findIndex(x => same(x, end[0])), endZ = zs.findIndex(z => same(z, end[1]));
  if ([startX, startZ, endX, endZ].some(i => i < 0)) fail('路由端点超出所属模块边界');
  const valid = new Map();
  for (let x = 0; x < xs.length; x++) for (let z = 0; z < zs.length; z++) valid.set(key(x, z), !obstacles.some(o => inside([xs[x], zs[z]], o)));
  const first = { x: startX, z: startZ, axis: -1, cost: 0, path: [[...start]] };
  const open = [first], distance = new Map([[`${key(first.x, first.z)},-1`, 0]]);
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const state = open.shift(), stateKey = `${key(state.x, state.z)},${state.axis}`;
    if (state.cost > distance.get(stateKey) + EPS) continue;
    if (state.x === endX && state.z === endZ) return state.path;
    const a = [xs[state.x], zs[state.z]];
    for (const [dx, dz, axis] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const x = state.x + dx, z = state.z + dz;
      if (x < 0 || x >= xs.length || z < 0 || z >= zs.length || !valid.get(key(x, z))) continue;
      const b = [xs[x], zs[z]];
      if (obstacles.some(o => crosses(a, b, o))) continue;
      const cost = state.cost + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + (state.axis !== -1 && state.axis !== axis ? .12 * scale : 0);
      const nextKey = `${key(x, z)},${axis}`;
      if (cost + EPS >= (distance.get(nextKey) ?? Infinity)) continue;
      distance.set(nextKey, cost); open.push({ x, z, axis, cost, path: [...state.path, b] });
    }
  }
  fail('没有找到满足设备和标签间距的可用通道');
}

function endpoint(node, side, y, clearance, topOffset = 0) {
  const point = [node.center[0], y, node.center[2]];
  const stub = [...point];
  if (side === 'left' || side === 'right') {
    const sign = side === 'left' ? -1 : 1;
    point[0] += sign * node.width / 2;
    point[2] += topOffset * node.depthSize;
    stub[2] = point[2];
    stub[0] = point[0] + sign * clearance;
  } else {
    point[0] += topOffset * node.width;
    stub[0] = point[0];
    const sign = side === 'bottom' ? 1 : -1;
    point[2] += sign * node.depthSize / 2;
    stub[2] = point[2] + sign * clearance;
  }
  return { point, stub };
}

function endpointCandidates(node, y, clearance, bounds, obstacles, toward, offset = 0) {
  const dx = toward[0] - node.center[0], dz = toward[2] - node.center[2];
  const preferred = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 'right' : 'left') : (dz >= 0 ? 'bottom' : 'top');
  return [...new Set([preferred, 'right', 'left', 'top', 'bottom'])].map(side => {
    const extension = side === 'bottom' ? Math.max(0, (obstacles.find(o => o.id === node.id)?.bottom ?? 0) - node.center[2] - node.depthSize / 2) : 0;
    return endpoint(node, side, y, Math.max(clearance, extension + .03 * node.scale), offset);
  }).filter(value => {
    const [x, , z] = value.stub;
    return x >= bounds.left - EPS && x <= bounds.right + EPS && z >= bounds.top - EPS && z <= bounds.bottom + EPS && !obstacles.some(rect => inside([x, z], rect));
  });
}

function shortestConnection(starts, finishes, bounds, obstacles, unit, context) {
  if (!starts.length || !finishes.length) throw new Error(`设备接口没有可用间距：${JSON.stringify(context)}`);
  const length = points => points.slice(1).reduce((sum, p, i) => sum + p.reduce((n, v, axis) => n + Math.abs(v - points[i][axis]), 0), 0);
  const candidates = starts.flatMap(start => finishes.map(finish => ({ start, finish, lower: length([start.point, start.stub, finish.stub, finish.point]) })));
  candidates.sort((a, b) => a.lower - b.lower);
  let best, lastError;
  for (const candidate of candidates) {
    if (best && candidate.lower > best.cost + EPS) continue;
    const { start, finish } = candidate;
    try {
      const route = corridor([start.stub[0], start.stub[2]], [finish.stub[0], finish.stub[2]], bounds, obstacles, unit, context);
      const points = compact([start.point, start.transition ?? start.point, start.stub, ...route.map(([x, z]) => [x, start.stub[1], z]), finish.stub, finish.transition ?? finish.point, finish.point]);
      const cost = length(points) + Math.max(0, points.length - 2) * .12 * unit;
      if (!best || cost < best.cost - EPS) best = { start, finish, points, cost };
    } catch (error) { lastError = error; }
  }
  if (!best) throw lastError ?? new Error('设备之间没有可用通道');
  return best;
}

function declaredPorts(graph, nodes, edgeMap) {
  const ports = new Map();
  for (const node of graph.nodes) {
    const declarations = node.data?.flowPorts ?? [];
    if (!Array.isArray(declarations)) throw new Error(`${node.id}.flowPorts 必须是数组`);
    const ids = new Set();
    for (const port of declarations) {
      if (!port?.id || typeof port.id !== 'string' || ids.has(port.id)) throw new Error(`${node.id} 的接口 ID 缺失或重复`);
      ids.add(port.id);
      if (!['in', 'out'].includes(port.direction) || !['left', 'right'].includes(port.side)) throw new Error(`${node.id}:${port.id} 的接口方向或边界方向无效`);
      if (!Number.isFinite(port.offset ?? 0) || Math.abs(port.offset ?? 0) > .4) throw new Error(`${node.id}:${port.id} 的 offset 必须在 -0.4 到 0.4 之间`);
      if (!Array.isArray(port.connections) || !port.connections.length) throw new Error(`${node.id}:${port.id} 必须明确连接的内部组件`);
      const connectionIds = new Set();
      for (const connection of port.connections) {
        if (nodes.get(connection.nodeId)?.parentId !== node.id) throw new Error(`${node.id}:${port.id} 只能映射直属子组件，嵌套连接须使用 portId`);
        const connectionId = `${connection.nodeId}:${connection.portId ?? ''}`;
        if (connectionIds.has(connectionId)) throw new Error(`${node.id}:${port.id} 的内部连接重复`);
        connectionIds.add(connectionId);
      }
      if (port.edgeIds !== undefined && !Array.isArray(port.edgeIds)) throw new Error(`${node.id}:${port.id}.edgeIds 必须是数组`);
      for (const edgeId of port.edgeIds ?? []) {
        const edge = edgeMap.get(edgeId);
        if (!edge || (port.direction === 'in' ? edge.target : edge.source) !== node.id) throw new Error(`${node.id}:${port.id} 的 edgeIds 与接口方向不匹配`);
        if ((port.branch ?? 'success') !== (edge.data?.branch ?? 'success')) throw new Error(`${node.id}:${port.id} 的分支与逻辑边 ${edgeId} 不一致`);
      }
    }
    ports.set(node.id, declarations);
  }
  for (const [nodeId, declarations] of ports) {
    const bound = new Set();
    for (const port of declarations) {
      for (const edgeId of port.edgeIds ?? []) {
        const key = `${port.direction}:${edgeId}`;
        if (bound.has(key)) throw new Error(`${nodeId} 的逻辑边 ${edgeId} 被重复映射到同方向接口`);
        bound.add(key);
      }
      for (const connection of port.connections) {
        if (connection.portId !== undefined) {
          const childPort = ports.get(connection.nodeId)?.find(p => p.id === connection.portId);
          if (!childPort || childPort.direction !== port.direction || (childPort.branch ?? 'success') !== (port.branch ?? 'success')) throw new Error(`${nodeId}:${port.id} 的子接口不存在或方向/分支不匹配`);
        } else if (nodes.get(connection.nodeId).children.length) {
          throw new Error(`${nodeId}:${port.id} 连接的是子模块，必须显式指定 portId`);
        }
        if (connection.viaEdgeId !== undefined) {
          const edge = edgeMap.get(connection.viaEdgeId);
          if (!edge) throw new Error(`${nodeId}:${port.id} 引用了不存在的细化边`);
          if ((edge.data?.branch ?? 'success') !== (port.branch ?? 'success')) throw new Error(`${nodeId}:${port.id} 的细化边分支不一致`);
        }
      }
    }
  }
  return ports;
}

function portGeometry(node, declaration, nodes) {
  const parent = nodes.get(node.parentId);
  // A boundary joins both decks. Keep even the larger endpoint flange above
  // either floor, then make the small height change outside the module.
  const y = Math.max(parent ? deckY(parent) : .08 + .22 * node.scale, deckY(node));
  const position = [
    node.center[0] + (declaration.side === 'left' ? -1 : 1) * node.width / 2,
    y,
    node.center[2] + (declaration.offset ?? 0) * node.depthSize,
  ];
  return { id: `${node.id}:${declaration.id}`, nodeId: node.id, flowPortId: declaration.id, side: declaration.side, position, purpose: declaration.branch ?? 'success', direction: declaration.direction };
}

function portEndpoint(port, y, clearance) {
  const point = [...port.position], transition = [...point];
  transition[0] += (port.side === 'left' ? -1 : 1) * clearance;
  const stub = [transition[0], y, transition[2]];
  return { point, transition, stub };
}

export function planRoutes(graph, layout) {
  if (!Array.isArray(graph?.edges) || !Array.isArray(layout?.nodes)) throw new Error('路由需要 graph.edges 和 layout.nodes');
  const nodes = new Map(layout.nodes.map(n => [n.id, n]));
  const edgeMap = new Map(graph.edges.map(e => [e.id, e]));
  const declarations = declaredPorts(graph, nodes, edgeMap);
  const findPort = (nodeId, edgeId, direction) => declarations.get(nodeId)?.find(p => p.direction === direction && p.edgeIds?.includes(edgeId));
  const plans = graph.edges.map(edge => {
    const from = nodes.get(edge.source), to = nodes.get(edge.target);
    if (!from || !to) throw new Error(`连线 ${edge.id} 引用了未知组件`);
    const branch = edge.data?.branch ?? 'success';
    const ownerId = edge.data?.parentId ?? (from.parentId === to.parentId ? from.parentId : null);
    const owner = ownerId === null ? null : nodes.get(ownerId);
    if (ownerId !== null && !owner) throw new Error(`连线 ${edge.id} 引用了未知所属模块`);
    // Reserve actual pipe/flange radius plus .25 * scale corner-rounding clearance.
    const scale = Math.min(from.scale, to.scale), spec = encodePipe(edge, scale);
    const unit = owner?.scale ?? 1, clearance = Math.max(.08 * unit, pipeClearance(spec, scale, unit)), stubGap = clearance + .03 * unit;
    const peers = owner ? owner.children.map(id => nodes.get(id)) : layout.roots.map(id => nodes.get(id));
    const y = owner ? deckY(owner) : .08 + .22 * Math.max(1, ...peers.map(n => n.scale));
    const bounds = owner ? {
      left: owner.center[0] - owner.width / 2 + .22 * unit,
      right: owner.center[0] + owner.width / 2 - .22 * unit,
      top: owner.center[2] - owner.depthSize / 2 + .22 * unit,
      bottom: owner.center[2] + owner.depthSize / 2 - .22 * unit,
    } : {
      left: Math.min(...peers.map(n => n.center[0] - n.width / 2)) - .65,
      right: Math.max(...peers.map(n => n.center[0] + n.width / 2)) + .65,
      top: Math.min(...peers.map(n => n.center[2] - n.depthSize / 2)) - .65,
      bottom: Math.max(...peers.map(n => n.center[2] + n.depthSize / 2)) + .65,
    };
    const obstacles = peers.map(n => ({
      id: n.id,
      left: n.center[0] - n.width / 2 - clearance,
      right: n.center[0] + n.width / 2 + clearance,
      top: n.center[2] - n.depthSize / 2 - clearance,
      bottom: n.center[2] + n.depthSize / 2 + .18 * unit + clearance,
    }));
    const crossBoundary = owner && from.parentId === owner.id && to.parentId !== owner.id;
    const parallel = graph.edges.filter(e => (e.source === edge.source && e.target === edge.target) || (e.source === edge.target && e.target === edge.source));
    const parallelOffset = parallel.length > 1 ? (parallel.findIndex(e => e.id === edge.id) - (parallel.length - 1) / 2) * Math.min(.16, .56 / parallel.length) : 0;
    const physicalEndpoints = (node, direction, toward, offset = parallelOffset) => {
      const declaration = findPort(node.id, edge.id, direction);
      return declaration ? [portEndpoint(portGeometry(node, declaration, nodes), y, stubGap)] : endpointCandidates(node, y, stubGap, bounds, obstacles, toward, offset);
    };
    let starts, finishes, port, preservesParentEdge;
    if (crossBoundary) {
      const parentEdge = edgeMap.get(edge.data?.refines);
      if (!parentEdge || parentEdge.source !== owner.id || parentEdge.target !== to.id) throw new Error(`跨层连线 ${edge.id} 缺少对应父级汇总边`);
      const declaration = findPort(owner.id, parentEdge.id, 'out');
      if (declaration && !declaration.connections.some(c => c.nodeId === from.id && c.viaEdgeId === edge.id)) throw new Error(`细化边 ${edge.id} 不在已声明的模块接口映射中`);
      const side = declaration?.side ?? (to.center[0] < owner.center[0] ? 'left' : 'right');
      const outsideOwner = owner.parentId === null ? null : nodes.get(owner.parentId);
      const externalY = Math.max(outsideOwner ? deckY(outsideOwner) : .08 + .22 * owner.scale, y);
      const declaredPort = declaration ? portGeometry(owner, declaration, nodes) : null;
      const portPosition = declaredPort?.position ?? [owner.center[0] + (side === 'left' ? -1 : 1) * owner.width / 2, externalY, owner.center[2]];
      const stub = [side === 'left' ? bounds.left : bounds.right, y, portPosition[2]];
      starts = physicalEndpoints(from, 'out', stub);
      finishes = [{ point: [portPosition[0], y, portPosition[2]], stub }];
      port = declaredPort ?? { id: `${owner.id}:${branch === 'error' ? 'error' : 'output'}`, nodeId: owner.id, side, position: portPosition, purpose: branch === 'error' ? 'error' : 'success' };
      preservesParentEdge = parentEdge.id;
    } else {
      if (from.parentId !== to.parentId || from.parentId !== ownerId) throw new Error(`连线 ${edge.id} 不属于当前支持的同层或父级端口细化关系`);
      if (from.id === to.id) {
        const fromPort = findPort(from.id, edge.id, 'out'), toPort = findPort(to.id, edge.id, 'in');
        starts = fromPort ? [portEndpoint(portGeometry(from, fromPort, nodes), y, stubGap)] : [endpoint(from, 'top', y, stubGap, -.2)];
        finishes = toPort ? [portEndpoint(portGeometry(to, toPort, nodes), y, stubGap)] : [endpoint(to, 'top', y, stubGap, .2)];
      } else {
        starts = physicalEndpoints(from, 'out', to.center);
        finishes = physicalEndpoints(to, 'in', from.center);
      }
    }
    const connection = shortestConnection(starts, finishes, bounds, obstacles, unit, { edgeId: edge.id, ownerId, sourceId: from.id, targetId: to.id });
    const path = connection.points;
    if (port) path.push(port.position);
    return {
      id: edge.id, edgeId: edge.id, ownerId,
      points: compact(path), branch, scale, ...spec,
      ...(edge.data?.refines ? { refines: edge.data.refines } : {}),
      kind: crossBoundary || ownerId === null ? 'boundary' : 'internal',
      ...(port ? { port, noReplace: true, preservesParentEdge } : {}),
      label: edge.label ?? '',
      sourceId: from.id, targetId: crossBoundary ? owner.id : to.id,
      logicalSourceId: from.id, logicalTargetId: to.id,
      ...(crossBoundary ? { machineEndpoint: from.children.length ? null : 'source' } : {}),
      ...(owner ? { channelBounds: bounds } : {}),
      labelClearance: .18 * unit,
      obstacleClearance: clearance, roundedCornerRadius: .25 * scale,
    };
  });

  // Interfaces add visible continuity, not new logical calls or execution events.
  // A nested module must name its child port explicitly; no first/last-child guessing.
  const expanded = new Set();
  function bridgePort(ownerId, declaration, logicalEdgeId, anchorPlanId, anchorPoint) {
    const visit = `${ownerId}:${declaration.id}:${logicalEdgeId}`;
    if (expanded.has(visit)) return;
    expanded.add(visit);
    const owner = nodes.get(ownerId), unit = owner.scale, y = deckY(owner);
    const branch = declaration.branch ?? 'success', direction = declaration.direction;
    const ownPort = portGeometry(owner, declaration, nodes);
    if (anchorPoint.some((v, i) => !same(v, ownPort.position[i]))) throw new Error(`接口 ${ownPort.id} 未与外层线路精确对齐`);
    const bounds = {
      left: owner.center[0] - owner.width / 2 + .22 * unit,
      right: owner.center[0] + owner.width / 2 - .22 * unit,
      top: owner.center[2] - owner.depthSize / 2 + .22 * unit,
      bottom: owner.center[2] + owner.depthSize / 2 - .22 * unit,
    };
    for (const connection of declaration.connections) {
      const child = nodes.get(connection.nodeId);
      const scale = Math.min(owner.scale, child.scale);
      const spec = encodePipe({ ...edgeMap.get(logicalEdgeId), data: { ...edgeMap.get(logicalEdgeId)?.data, branch } }, scale);
      const clearance = Math.max(.08 * unit, pipeClearance(spec, scale, unit)), stubGap = clearance + .03 * unit;
      const obstacles = owner.children.map(id => nodes.get(id)).map(n => ({
        id: n.id, left: n.center[0] - n.width / 2 - clearance,
        right: n.center[0] + n.width / 2 + clearance,
        top: n.center[2] - n.depthSize / 2 - clearance,
        bottom: n.center[2] + n.depthSize / 2 + .18 * unit + clearance,
      }));
      const childDeclaration = connection.portId === undefined ? null : declarations.get(child.id).find(p => p.id === connection.portId);
      if (connection.viaEdgeId) {
        const existing = plans.find(p => p.edgeId === connection.viaEdgeId && !p.bridge);
        const fineEdge = edgeMap.get(connection.viaEdgeId), logicalEdge = edgeMap.get(logicalEdgeId);
        if (direction !== 'out' || !existing || fineEdge.source !== child.id || fineEdge.target !== logicalEdge.target || fineEdge.data?.refines !== logicalEdgeId) throw new Error(`接口 ${ownPort.id} 的 viaEdgeId 不对应声明的细化关系`);
        if (existing.points.at(-1).some((v, i) => !same(v, ownPort.position[i]))) throw new Error(`已有细化边 ${existing.id} 没有接到声明端口`);
        existing.flowPortId = declaration.id;
        existing.logicalEdgeIds = [...new Set([...(existing.logicalEdgeIds ?? []), logicalEdgeId])];
        existing.joinsPlanId = anchorPlanId;
        if (childDeclaration) bridgePort(child.id, childDeclaration, logicalEdgeId, existing.id, existing.points[0]);
        continue;
      }

      const childPort = childDeclaration ? portGeometry(child, childDeclaration, nodes) : null;
      const boundaryPoint = [ownPort.position[0], y, ownPort.position[2]];
      const boundaryStub = [declaration.side === 'left' ? bounds.left : bounds.right, y, ownPort.position[2]];
      const childEnds = childPort ? [portEndpoint(childPort, y, stubGap)] : endpointCandidates(child, y, stubGap, bounds, obstacles, boundaryStub);
      const boundaryEnd = { point: boundaryPoint, stub: boundaryStub };
      const connectionPlan = shortestConnection(direction === 'in' ? [boundaryEnd] : childEnds, direction === 'in' ? childEnds : [boundaryEnd], bounds, obstacles, unit, { edgeId: logicalEdgeId, ownerId, flowPortId: declaration.id, sourceId: direction === 'in' ? ownerId : child.id, targetId: direction === 'in' ? child.id : ownerId });
      const points = direction === 'in' ? [ownPort.position, ...connectionPlan.points] : [...connectionPlan.points, ownPort.position];
      const logicalEdge = edgeMap.get(logicalEdgeId);
      const plan = {
        id: `flow:${ownerId}:${declaration.id}:${child.id}:${logicalEdgeId}`,
        edgeId: logicalEdgeId, logicalEdgeIds: [logicalEdgeId], ownerId,
        points: compact(points), branch, scale, ...spec,
        kind: 'boundary', bridge: true, direction, flowPortId: declaration.id,
        noReplace: true, preservesParentEdge: logicalEdgeId, joinsPlanId: anchorPlanId,
        port: ownPort, ...(childPort ? { childPort } : {}),
        sourceId: direction === 'in' ? ownerId : child.id,
        targetId: direction === 'in' ? child.id : ownerId,
        logicalSourceId: logicalEdge.source, logicalTargetId: logicalEdge.target,
        machineEndpoint: child.children.length ? null : direction === 'in' ? 'target' : 'source',
        label: '', channelBounds: bounds, labelClearance: .18 * unit,
        obstacleClearance: clearance, roundedCornerRadius: .25 * scale,
      };
      plans.push(plan);
      if (childDeclaration) bridgePort(child.id, childDeclaration, logicalEdgeId, plan.id, direction === 'in' ? plan.points.at(-1) : plan.points[0]);
    }
  }
  for (const [ownerId, ports] of declarations) {
    for (const declaration of ports) for (const edgeId of declaration.edgeIds ?? []) {
      const plan = plans.find(p => p.edgeId === edgeId && !p.bridge);
      bridgePort(ownerId, declaration, edgeId, plan.id, declaration.direction === 'in' ? plan.points.at(-1) : plan.points[0]);
    }
  }
  return plans;
}
