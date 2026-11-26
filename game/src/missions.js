// missions.js — the sortie script: rings, landings, fuel, damage, score.
// One job: own the objective state machine and the numbers on the HUD.
// The flight model moves the plane; this file decides what that means.
'use strict';

const LNMissions = (() => {
  const C = LN_CONFIG;

  // The sortie: two ring runs and two landings, in order.
  function buildScript() {
    const rings = LNWorld.ringCourse();
    return [
      { type: 'ring', label: 'RING RUN 1 — terbang lewat 5 ring emas', rings: rings.slice(0, 5) },
      { type: 'land', label: 'ISLAND HOP — mendarat di Padi Field', runway: 1 },
      { type: 'ring', label: 'RING RUN 2 — 5 ring di atas Gunung Api', rings: rings.slice(5, 10) },
      { type: 'land', label: 'PULANG — mendarat di Merpati Intl', runway: 0 },
    ];
  }

  function newRun() {
    return {
      script: buildScript(),
      stepIndex: 0,
      ringIndex: 0,
      score: 0,
      combo: 0,
      comboTimer: 0,
      ringsHit: 0,
      landings: 0,
      elapsed: 0,
      parTime: 300,
      status: 'briefing', // briefing | flying | complete | crashed
      message: '',
      messageTimer: 0,
      lastEvent: '',
      bestCombo: 0,
      fuelWarnings: 0,
    };
  }

  function currentStep(run) { return run.script[run.stepIndex] || null; }

  function objectiveText(run) {
    const step = currentStep(run);
    if (!step) return 'SORTIE SELESAI';
    if (step.type === 'ring') {
      return step.label + '  (' + run.ringIndex + '/' + step.rings.length + ')';
    }
    const rw = LNWorld.RUNWAYS[step.runway];
    return step.label + ' — ' + rw.name;
  }

  function nextRingTarget(run) {
    const step = currentStep(run);
    if (!step || step.type !== 'ring') return null;
    return step.rings[run.ringIndex] || null;
  }

  function flash(run, text, seconds) {
    run.message = text;
    run.messageTimer = seconds || 2.5;
  }

  function addScore(run, base, why) {
    const mult = 1 + run.combo * 0.5;
    const gained = Math.round(base * mult);
    run.score += gained;
    run.lastEvent = why + ' +' + gained;
    return gained;
  }

  // Called every frame with the plane and the flight event of that frame.
  function update(run, plane, flightEvent, dt) {
    if (run.status === 'briefing' || run.status === 'complete' || run.status === 'crashed') {
      if (run.messageTimer > 0) run.messageTimer -= dt;
      return;
    }
    run.elapsed += dt;
    if (run.comboTimer > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) run.combo = 0;
    }
    if (run.messageTimer > 0) run.messageTimer -= dt;

    // Fuel warnings: the decision fuel makes, spoken early.
    if (plane.fuel < 25 && plane.fuel > 0) {
      if (run.messageTimer <= 0) flash(run, 'BAHAN BAKAR MENIPIS — cari landasan!', 1.2);
    }
    if (plane.fuel <= 0 && run.messageTimer <= 0) {
      flash(run, 'TANGKI KOSONG — meluncur, cari landasan!', 1.5);
    }

    if (flightEvent === 'crash') {
      plane.damage = Math.min(100, plane.damage);
      if (plane.damage >= 100) {
        run.status = 'crashed';
        flash(run, 'PESAWAT HANCUR — tekan R untuk terbang lagi', 999);
        return;
      }
      flash(run, 'BENTURAN! Kerusakan ' + Math.round(plane.damage) + '%', 2);
    }
    if (flightEvent === 'scrape') {
      flash(run, 'Sayap menyenggol terrain — hati-hati!', 1.5);
    }
    if (flightEvent === 'landed') {
      onLanding(run, plane);
    }
    if (flightEvent === 'takeoff') {
      flash(run, 'LEPAS LANDAS — roda terangkat!', 2);
    }

    // Ring pass check: inside the torus, close to its centre plane.
    const target = nextRingTarget(run);
    if (target) {
      const dx = plane.x - target.x;
      const dy = plane.y - target.y;
      const dz = plane.z - target.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < C.ringRadius) {
        run.ringsHit += 1;
        run.combo += 1;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        run.comboTimer = C.comboWindow;
        addScore(run, C.ringScore, 'RING ' + run.ringsHit);
        flash(run, 'RING! Combo x' + run.combo, 1.6);
        run.ringIndex += 1;
        const step = currentStep(run);
        if (run.ringIndex >= step.rings.length) {
          run.stepIndex += 1;
          run.ringIndex = 0;
          flash(run, 'RING RUN SELESAI — lanjut misi berikutnya', 3);
        }
      }
    }

    // Landing step completes when the wheels touch its runway.
    const step = currentStep(run);
    if (step && step.type === 'land' && flightEvent === 'landed') {
      const rw = LNWorld.RUNWAYS[step.runway];
      const here = LNWorld.onRunway(plane.x, plane.z);
      if (here && here.id === rw.id) {
        run.landings += 1;
        const fuelBonus = Math.round(plane.fuel * 2);
        const gained = addScore(run, C.landingScore + fuelBonus, 'MENDARAT ' + rw.name);
        plane.damage = Math.max(0, plane.damage - C.repairOnLanding);
        plane.fuel = Math.min(C.fuelCapacity, plane.fuel + 45); // refuel on the ground
        flash(run, 'MENDARAT SEMPURNA di ' + rw.name + ' +' + gained, 3);
        run.stepIndex += 1;
        run.ringIndex = 0;
        if (run.stepIndex >= run.script.length) {
          finishRun(run);
        }
      }
    }
  }

  function finishRun(run) {
    run.status = 'complete';
    const under = Math.max(0, run.parTime - run.elapsed);
    const bonus = Math.round(under * C.timeBonusRate);
    run.score += bonus;
    flash(run, 'SORTIE SELESAI! Bonus waktu +' + bonus, 999);
  }

  function reset(run) {
    const fresh = newRun();
    Object.assign(run, fresh);
  }

  return { newRun, currentStep, objectiveText, nextRingTarget, update, reset, flash, finishRun };
})();
