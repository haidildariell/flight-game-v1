// flight.js — the Merpati-7 flight model.
// One job: integrate the plane's state from the control vector, and
// decide what the ground does to it (landing, scrape, crash).
// Arcade physics: honest enough that throttle and turn discipline
// matter, forgiving enough that a first flight feels good.
'use strict';

const LNFlight = (() => {
  const C = LN_CONFIG;

  function newPlane() {
    return {
      x: 0, y: 140, z: 420,          // metres; y is altitude above sea level
      heading: Math.PI / 2,         // 0 = north (+Z), PI/2 = east (+X)
      pitch: 0,                     // nose up positive
      roll: 0,                      // bank, positive = right wing down
      speed: 34,                    // m/s
      throttle: 0.6,                // 0..1
      fuel: C.fuelCapacity,
      damage: 0,
      flaps: false,
      gearDown: true,
      verticalSpeed: 0,
      onGround: false,
      airborne: false,
    };
  }

  function forwardVector(p) {
    return {
      x: Math.sin(p.heading) * Math.cos(p.pitch),
      y: Math.sin(p.pitch),
      z: Math.cos(p.heading) * Math.cos(p.pitch),
    };
  }

  // One fixed step. Returns an event string or null:
  // 'crash' | 'scrape' | 'landed' | 'takeoff' | 'fuel-empty' | null.
  function step(p, ctl, dt) {
    const prevY = p.y;
    const ground = LNWorld.terrainHeight(p.x, p.z);
    const runway = LNWorld.onRunway(p.x, p.z);

    // Throttle: W/S move it, brake cuts it fast.
    if (ctl.throttleUp) p.throttle = Math.min(1, p.throttle + dt * 0.55);
    if (ctl.throttleDown) p.throttle = Math.max(0, p.throttle - dt * 0.55);
    if (ctl.brake) p.throttle = Math.max(0, p.throttle - dt * 1.4);
    if (ctl.flaps) p.flaps = !p.flaps;

    // Fuel: throttle drinks it; empty tank means gliding, not falling.
    const burn = (C.fuelBurnIdle + (C.fuelBurnFull - C.fuelBurnIdle) * p.throttle) * dt;
    let fuelEmpty = false;
    if (p.fuel > 0) {
      p.fuel = Math.max(0, p.fuel - burn);
      if (p.fuel === 0) fuelEmpty = true;
    }
    const thrust = p.fuel > 0 ? p.throttle : 0;

    // Speed chases the throttle target; flaps trade speed for lift.
    const target = thrust * C.maxSpeed * (p.flaps ? 0.82 : 1);
    const accel = target > p.speed ? C.accelRate : C.accelRate * 1.6;
    p.speed += Math.max(-accel * dt, Math.min(accel * dt, target - p.speed));
    if (p.brake && p.onGround) p.speed = Math.max(0, p.speed - 22 * dt);

    // Pitch: stick up/down, eased toward the commanded angle.
    let pitchTarget = 0;
    if (ctl.pitchUp) pitchTarget = C.climbPitchMax;
    else if (ctl.pitchDown) pitchTarget = C.divePitchMax;
    const pitchRate = 1.6;
    p.pitch += Math.max(-pitchRate * dt, Math.min(pitchRate * dt, pitchTarget - p.pitch));

    // Roll: A/D bank the wings; the bank turns the heading.
    let rollTarget = 0;
    if (ctl.rollLeft) rollTarget = -C.bankMax;
    else if (ctl.rollRight) rollTarget = C.bankMax;
    p.roll += Math.max(-C.rollRate * dt, Math.min(C.rollRate * dt, rollTarget - p.roll));
    // Gentle rudder assist so Q/E can fine-tune a turn.
    let yawAssist = 0;
    if (ctl.yawLeft) yawAssist = -0.35;
    if (ctl.yawRight) yawAssist = 0.35;
    p.heading += (-Math.sin(p.roll) * C.turnFactor * (p.speed / 40) + yawAssist * 0.4) * dt;

    // Vertical speed: climb from pitch and speed, sink when stalled.
    let vy = Math.sin(p.pitch) * p.speed;
    if (p.speed < C.stallSpeed && !p.onGround) {
      vy -= C.sinkRate * (1 - p.speed / C.stallSpeed);
    }
    if (p.flaps && p.speed > 12) vy += 2.5;
    p.verticalSpeed = vy;

    // Integrate.
    const f = forwardVector(p);
    p.x += f.x * p.speed * dt;
    p.z += f.z * p.speed * dt;
    p.y += vy * dt;

    // Stay inside the archipelago; the sea is the edge of the map.
    const R = 2100;
    const dist = Math.hypot(p.x, p.z);
    if (dist > R) {
      const s = R / dist;
      p.x *= s; p.z *= s;
      p.heading += Math.PI; // soft bounce: turn back toward the islands
    }
    if (p.y > 600) { p.y = 600; p.pitch = Math.min(p.pitch, 0); }

    // ---- Ground contact ----
    const clearance = p.y - ground;
    if (clearance <= 0.5) {
      const onStrip = runway !== null;
      const gentle = Math.abs(vy) < 4.5 && p.speed > 14 && p.speed < 46;
      const level = Math.abs(p.roll) < 0.35 && Math.abs(p.pitch) < 0.22;
      if (onStrip && gentle && level) {
        if (!p.onGround) {
          p.onGround = true;
          p.y = ground + 0.5;
          p.pitch = 0; p.roll = 0;
          return 'landed';
        }
        p.onGround = true;
        p.y = ground + 0.5;
        p.pitch = 0;
        p.speed = Math.max(0, p.speed - 6 * dt); // rolling friction
        return null;
      }
      // Not a landing: a hit. Hard if fast or steep, a scrape otherwise.
      p.y = ground + 0.5;
      if (Math.abs(vy) > 7 || p.speed > 50) {
        p.damage += C.damageCrash;
        p.speed *= 0.35;
        p.pitch = 0.1;
        return 'crash';
      }
      p.damage += C.damageScrape;
      p.speed *= 0.7;
      p.y = ground + 2;
      return 'scrape';
    }
    if (p.onGround && clearance > 3 && p.speed > 20) {
      p.onGround = false;
      return 'takeoff';
    }
    if (p.onGround) p.onGround = false;
    return fuelEmpty ? 'fuel-empty' : null;
  }

  function knots(p) { return p.speed * 1.94384; }
  function altitudeFt(p) { return p.y * 3.28084; }
  function headingDeg(p) {
    let d = ((p.heading * 180) / Math.PI) % 360;
    if (d < 0) d += 360;
    return d;
  }

  return { newPlane, step, forwardVector, knots, altitudeFt, headingDeg };
})();
