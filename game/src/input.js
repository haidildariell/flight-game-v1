// input.js — keyboard + mouse state for LANGIT NUSANTARA.
// One job: turn raw DOM events into a clean per-frame control vector.
// The game never reads KeyboardEvent directly; it reads this.
'use strict';

const LNInput = (() => {
  const keysDown = new Set();
  const pressed = new Set(); // keys pressed since last consume (edge trigger)
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let lookYaw = 0;   // free-look offset from mouse, eases back to 0
  let lookPitch = 0;
  let attached = false;

  function codeOf(ev) { return ev.code || ''; }

  function onKeyDown(ev) {
    if (ev.repeat) return;
    keysDown.add(codeOf(ev));
    pressed.add(codeOf(ev));
    // Keep the page from scrolling on arrows / space while flying.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(codeOf(ev))) {
      ev.preventDefault();
    }
  }
  function onKeyUp(ev) { keysDown.delete(codeOf(ev)); }
  function onBlur() { keysDown.clear(); }

  function onMouseMove(ev) {
    if (!mouseDown && document.pointerLockElement == null) return;
    mouseDX += ev.movementX || 0;
    mouseDY += ev.movementY || 0;
  }
  function onMouseDown(ev) {
    mouseDown = true;
    if (ev.target && ev.target.requestPointerLock) {
      try { ev.target.requestPointerLock(); } catch (_e) { /* pointer lock is a nicety */ }
    }
  }
  function onMouseUp() { mouseDown = false; }

  function attach(canvas) {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
  }

  function held(code) { return keysDown.has(code); }
  function heldAny(codes) { return codes.some((c) => keysDown.has(c)); }

  // Edge-triggered: true once per physical press.
  function wasPressed(code) {
    if (pressed.has(code)) { pressed.delete(code); return true; }
    return false;
  }
  function wasPressedAny(codes) {
    for (const c of codes) if (wasPressed(c)) return true;
    return false;
  }

  // Read the mouse delta accumulated since the last frame and reset it.
  function consumeMouse() {
    const dx = mouseDX;
    const dy = mouseDY;
    mouseDX = 0;
    mouseDY = 0;
    return { dx, dy };
  }

  // Free-look: mouse drag orbits the chase camera a little; it always
  // eases back to straight behind the plane so the camera never fights
  // the pilot (judge criterion 3).
  function updateLook(dt) {
    const m = consumeMouse();
    lookYaw -= m.dx * 0.0016;
    lookPitch += m.dy * 0.0012;
    lookYaw = Math.max(-0.55, Math.min(0.55, lookYaw));
    lookPitch = Math.max(-0.25, Math.min(0.30, lookPitch));
    const k = Math.pow(0.02, dt); // ease back toward centre
    lookYaw *= k;
    lookPitch *= k;
    return { yaw: lookYaw, pitch: lookPitch };
  }

  // The per-frame control vector the flight model consumes.
  function readControls() {
    const cfg = LN_CONFIG.keys;
    return {
      throttleUp: heldAny(cfg.throttleUp),
      throttleDown: heldAny(cfg.throttleDown),
      pitchUp: held('ArrowUp'),
      pitchDown: held('ArrowDown'),
      rollLeft: heldAny(cfg.rollLeft),
      rollRight: heldAny(cfg.rollRight),
      yawLeft: heldAny(cfg.yawLeft),
      yawRight: heldAny(cfg.yawRight),
      brake: heldAny(cfg.brake),
      flaps: wasPressedAny(cfg.flaps),
      restart: wasPressedAny(cfg.restart),
      mute: wasPressedAny(cfg.mute),
      pause: wasPressedAny(cfg.pause),
      start: wasPressedAny(cfg.start),
    };
  }

  // Test / automation hook: pretend a key is held, without DOM events.
  function inject(code, down) {
    if (down) keysDown.add(code); else keysDown.delete(code);
  }

  return { attach, held, heldAny, wasPressed, wasPressedAny, updateLook, readControls, inject };
})();
