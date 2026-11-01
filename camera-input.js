/** Canvas-local trackpad input for an orthographic MapControls view. */
export function attachMapInput({ element, camera, controls, THREE, onStart, onChange, getMode }) {
  if (!camera?.isOrthographicCamera) throw new TypeError('Map input requires an orthographic camera');
  if (!element?.addEventListener || !controls?.target) throw new TypeError('Map input requires an element and MapControls');

  const listeners = [], touches = new Set();
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane();
  const pointer = new THREE.Vector2(), normal = new THREE.Vector3();
  const before = new THREE.Vector3(), after = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), shift = new THREE.Vector3();
  let disposed = false, quiet = false, gestureActive = false, lastScale = 1;
  let suppressWheelUntil = 0, lastInputAt = -Infinity, lastPointer = null;
  const previousTwoTouch = controls.touches?.TWO;
  if (controls.touches) controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  const now = () => globalThis.performance?.now() ?? Date.now();

  function listen(type, handler, options) {
    element.addEventListener(type, handler, options);
    listeners.push(() => element.removeEventListener(type, handler, options));
  }
  function consume(event) {
    event.preventDefault();
    event.stopPropagation();
    // Also covers callers that pass the controls' own canvas as `element`.
    event.stopImmediatePropagation?.();
  }
  function rect() {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 ? bounds : null;
  }
  function coordinates(event, bounds) {
    const point = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : lastPointer ?? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    pointer.set((point.x - bounds.left) / bounds.width * 2 - 1, 1 - (point.y - bounds.top) / bounds.height * 2);
    return point;
  }
  const changed = () => { if (!quiet && !disposed) onChange?.(); };
  const started = () => { if (!disposed) onStart?.(); };
  controls.addEventListener('start', started);
  controls.addEventListener('change', changed);

  function begin() {
    started(); // The scene can cancel a focus tween before we read its pose.
    const time = now();
    if (time - lastInputAt > 180 && controls.enableDamping) {
      // Interrupt leftover drag inertia without jumping to its eventual pose.
      // Use public update(), then restore the pose and synchronize the controls.
      const position = camera.position.clone(), target = controls.target.clone();
      const quaternion = camera.quaternion.clone(), zoom = camera.zoom;
      const damping = controls.enableDamping;
      quiet = true;
      try {
        controls.enableDamping = false;
        controls.update();
        camera.position.copy(position); camera.quaternion.copy(quaternion);
        camera.zoom = zoom; controls.target.copy(target);
        camera.updateProjectionMatrix();
        controls.update();
      } finally { controls.enableDamping = damping; quiet = false; }
    }
    lastInputAt = time;
    camera.updateMatrixWorld(true);
  }
  function commit() {
    quiet = true;
    try { controls.update(); camera.updateMatrixWorld(true); }
    finally { quiet = false; }
    changed();
  }
  function pan(dx, dy, bounds) {
    if (controls.enablePan === false || (!dx && !dy)) return;
    begin();
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const speed = Number.isFinite(controls.panSpeed) ? controls.panSpeed : 1;
    const x = dx * (camera.right - camera.left) / camera.zoom / bounds.width * speed;
    const y = dy * (camera.top - camera.bottom) / camera.zoom / bounds.height * speed;
    // Wheel deltas follow scroll coordinates: positive x/y moves content left/up.
    shift.copy(right).multiplyScalar(x).addScaledVector(up, -y);
    camera.position.add(shift); controls.target.add(shift);
    commit();
  }
  function zoom(factor, event, bounds) {
    if (controls.enableZoom === false || !Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    begin();
    const minimum = Math.max(Number.EPSILON, Number.isFinite(controls.minZoom) ? controls.minZoom : Number.EPSILON);
    const maximum = Math.max(minimum, Number.isFinite(controls.maxZoom) ? controls.maxZoom : Infinity);
    const next = Math.max(minimum, Math.min(maximum, camera.zoom * factor));
    if (next === camera.zoom) return;
    coordinates(event, bounds);
    camera.getWorldDirection(normal);
    plane.setFromNormalAndCoplanarPoint(normal, controls.target);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, before)) return;
    camera.zoom = next;
    camera.updateProjectionMatrix();
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(plane, after)) {
      shift.subVectors(before, after);
      camera.position.add(shift); controls.target.add(shift);
    }
    commit();
  }
  function rotate(dx, dy, bounds) {
    if (controls.enableRotate === false || (!dx && !dy)) return;
    begin();
    const speed = Number.isFinite(controls.rotateSpeed) ? controls.rotateSpeed : 1;
    // Trackpads report many small wheel deltas. Half the native pointer-drag
    // sensitivity gives useful fine control without changing the pan gesture.
    const radiansPerPixel = Math.PI / bounds.height * speed;
    const damping = controls.enableDamping;
    quiet = true;
    try {
      // Public MapControls methods apply its polar/azimuth limits. Temporarily
      // disable damping so one wheel event is one complete, target-fixed turn;
      // otherwise two public update() calls leave rotation inertia behind.
      controls.enableDamping = false;
      if (dx) controls.rotateLeft(dx * radiansPerPixel);
      if (dy) controls.rotateUp(dy * radiansPerPixel);
    } finally { controls.enableDamping = damping; quiet = false; }
    commit();
  }
  function wheel(event) {
    if (disposed || controls.enabled === false) return;
    consume(event);
    if (gestureActive || now() < suppressWheelUntil || touches.size > 1) return;
    const bounds = rect();
    if (!bounds || !Number.isFinite(event.deltaX) || !Number.isFinite(event.deltaY)) return;
    const xUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.width : 1;
    const yUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    if (event.ctrlKey || event.metaKey) {
      const speed = Number.isFinite(controls.zoomSpeed) ? controls.zoomSpeed : 1;
      zoom(Math.exp(Math.max(-4, Math.min(4, -event.deltaY * yUnit * 0.01 * speed))), event, bounds);
    } else if (event.altKey || getMode?.() === 'rotate') {
      rotate(event.deltaX * xUnit, event.deltaY * yUnit, bounds);
    } else pan(event.deltaX * xUnit, event.deltaY * yUnit, bounds);
  }
  function gestureStart(event) {
    if (disposed || controls.enabled === false) return;
    consume(event);
    gestureActive = true;
    lastScale = Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
    suppressWheelUntil = now() + 180;
    if (touches.size < 2) begin();
  }
  function gestureChange(event) {
    if (disposed || controls.enabled === false) return;
    consume(event);
    const bounds = rect();
    if (!bounds || !Number.isFinite(event.scale) || event.scale <= 0) return;
    // WebKit's scale is cumulative; dividing avoids multiplying it repeatedly.
    const factor = event.scale / (gestureActive ? lastScale : 1);
    gestureActive = true; lastScale = event.scale;
    suppressWheelUntil = now() + 180;
    // Real touch pointers remain owned by MapControls, including DOLLY_PAN.
    if (touches.size < 2) zoom(factor, event, bounds);
  }
  function gestureEnd(event) {
    if (disposed || !gestureActive) return;
    consume(event);
    gestureActive = false; lastScale = 1;
    suppressWheelUntil = now() + 180; // Ignore a trailing synthetic pinch wheel.
  }
  function trackPointer(event) {
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) lastPointer = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') touches.add(event.pointerId);
  }
  const releasePointer = event => { touches.delete(event.pointerId); };
  const capture = { capture: true, passive: false };
  listen('wheel', wheel, capture);
  listen('gesturestart', gestureStart, capture);
  listen('gesturechange', gestureChange, capture);
  listen('gestureend', gestureEnd, capture);
  listen('pointerdown', trackPointer, { capture: true, passive: true });
  listen('pointermove', trackPointer, { capture: true, passive: true });
  listen('pointerup', releasePointer, { capture: true, passive: true });
  listen('pointercancel', releasePointer, { capture: true, passive: true });

  return function dispose() {
    if (disposed) return;
    disposed = true;
    for (const remove of listeners) remove();
    controls.removeEventListener('start', started);
    controls.removeEventListener('change', changed);
    if (controls.touches?.TWO === THREE.TOUCH.DOLLY_PAN) controls.touches.TWO = previousTwoTouch;
    touches.clear(); gestureActive = false;
  };
}
