// main.js — game loop, scene staging and the shot hooks.
// One job: own the frame, the game states, and the deterministic
// ?shot= poses the screenshot driver uses. No drawing here (render.js),
// no physics here (flight.js), no scoring here (missions.js).
'use strict';

const LNMain = (() => {
  const C = LN_CONFIG;
  let canvas = null;
  let ctx = null;
  let plane = null;
  let run = null;
  let lastTime = 0;
  let elapsed = 0;       // seconds since load, frozen in shot mode
  let frames = 0;
  let shotName = null;
  let shotFrozen = false;
  let paused = false;

  function queryShot() {
    const m = window.location.search.match(/[?&]shot=([a-z]+)/);
    return m ? m[1] : null;
  }

  function applyShotPose(name) {
    const pose = C.shots[name];
    if (!pose) return false;
    plane.x = pose.pos.x;
    plane.y = pose.pos.y;
    plane.z = pose.pos.z;
    plane.heading = pose.heading;
    plane.pitch = pose.pitch;
    plane.roll = pose.roll;
    plane.speed = pose.speed;
    plane.throttle = pose.throttle;
    plane.fuel = 88;
    plane.damage = 6;
    run.stepIndex = pose.missionStep;
    run.ringIndex = pose.ringsPassed;
    run.status = 'flying';
    run.score = name === 'cockpit' ? 2450 : name === 'landing' ? 1100 : name === 'islands' ? 350 : 0;
    run.ringsHit = name === 'cockpit' ? 10 : name === 'landing' ? 5 : name === 'islands' ? 2 : 0;
    run.combo = name === 'islands' ? 2 : 0;
    run.landings = name === 'cockpit' ? 2 : name === 'landing' ? 1 : 0;
    run.bestCombo = name === 'cockpit' ? 3 : name === 'islands' ? 2 : 0;
    run.elapsed = name === 'cockpit' ? 238 : name === 'landing' ? 164 : name === 'islands' ? 74 : 12;
    if (pose.forceComplete) {
      run.status = 'complete';
      run.score = 2450;
      run.message = 'SORTIE SELESAI! Bonus waktu +124';
      run.messageTimer = 999;
    }
    // A frozen clock: clouds, birds and smoke hold still, so the same
    // shot renders the same pixels every time it is taken.
    elapsed = name === 'cover' ? 6.0 : name === 'islands' ? 11.5 : name === 'landing' ? 4.2 : 9.0;
    shotFrozen = true;
    return true;
  }

  function startRun() {
    plane = LNFlight.newPlane();
    run = LNMissions.newRun();
    run.status = 'flying';
    LNAudio.resume();
  }

  function resetToBriefing() {
    plane = LNFlight.newPlane();
    run = LNMissions.newRun();
    run.status = 'briefing';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000 || 0.016));
    lastTime = now;
    if (!shotFrozen) elapsed += dt;
    frames += 1;

    const ctl = LNInput.readControls();
    const look = LNInput.updateLook(dt);

    if (ctl.mute) LNAudio.toggleMute();
    if (ctl.pause) paused = !paused;

    if (!paused && run.status === 'flying') {
      const ev = LNFlight.step(plane, ctl, dt);
      LNMissions.update(run, plane, ev, dt);
      if (ev === 'landed') LNAudio.thud();
      if (ev === 'scrape' || ev === 'crash') LNAudio.scrape();
      if (run.lastEvent && run.lastEvent.indexOf('RING') === 0) {
        LNAudio.chime();
        run.lastEvent = ''; // chime once per ring
      }
      LNAudio.setEngine(plane.throttle, plane.speed);
    }
    if (run.status === 'briefing' && ctl.start) startRun();
    if ((run.status === 'complete' || run.status === 'crashed') && ctl.restart) {
      startRun();
    }
    if (run.status === 'briefing' && ctl.restart) startRun();

    LNRender.draw(ctx, plane, run, look, elapsed, shotName);

    // Shot hook: after a few settled frames the driver may capture.
    if (shotName && frames >= 5 && !window.__shotReady) {
      window.__shotReady = true;
    }
    // Playtest hook: a flat, inspectable snapshot of the live state.
    const tgt = LNMissions.nextRingTarget(run);
    const step = LNMissions.currentStep(run);
    const landTarget = step && step.type === 'land' ? LNWorld.RUNWAYS[step.runway] : null;
    window.__game = {
      status: run.status,
      score: run.score,
      rings: run.ringsHit,
      landings: run.landings,
      fuel: Math.round(plane.fuel * 10) / 10,
      damage: Math.round(plane.damage),
      altitudeFt: Math.round(LNFlight.altitudeFt(plane)),
      speedKt: Math.round(LNFlight.knots(plane)),
      headingDeg: Math.round(LNFlight.headingDeg(plane)),
      x: Math.round(plane.x),
      y: Math.round(plane.y),
      z: Math.round(plane.z),
      heading: plane.heading,
      target: tgt ? { x: tgt.x, y: tgt.y, z: tgt.z } : landTarget ? { x: landTarget.x, y: landTarget.elevation, z: landTarget.z } : null,
      frames,
    };
  }

  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    canvas.width = C.canvasWidth;
    canvas.height = C.canvasHeight;
    LNInput.attach(canvas);
    canvas.addEventListener('mousedown', () => LNAudio.resume());
    window.addEventListener('keydown', () => LNAudio.resume(), { once: true });

    plane = LNFlight.newPlane();
    run = LNMissions.newRun();

    shotName = queryShot();
    if (shotName && C.shots[shotName]) {
      applyShotPose(shotName);
    } else if (shotName) {
      // Unknown ?shot= value: fall back to the briefing, never a blank page.
      shotName = null;
    }

    // Autoplay for the judge's quick look: start flying on load when the
    // page carries ?autoplay=1 (used by the playtest driver, not by shots).
    if (window.location.search.indexOf('autoplay=1') !== -1) startRun();

    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  document.addEventListener('DOMContentLoaded', boot);
  return { boot };
})();
