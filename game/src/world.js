// world.js — the archipelago of LANGIT NUSANTARA.
// One job: answer "what is at (x, z)?" deterministically, and hand the
// renderer the fixed scenery (islands, runways, clouds, birds, ships).
// No rendering here, no flight state — pure world data.
'use strict';

const LNWorld = (() => {
  // Small deterministic PRNG so the world is identical every load.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20261126);

  // ---- Islands: gaussian bumps with a ridged detail term. ----
  // { x, z, radius, height, volcano? }
  const ISLANDS = [
    { x: 0, z: 0, r: 950, h: 95, name: 'Pulau Merpati' },       // home island
    { x: 750, z: -650, r: 720, h: 210, volcano: true, name: 'Gunung Api' },
    { x: -850, z: -950, r: 640, h: 80, name: 'Pulau Padi' },
    { x: 350, z: 1250, r: 520, h: 65, name: 'Pulau Karang' },
    { x: -550, z: 1450, r: 680, h: 110, name: 'Pulau Hijau' },
    { x: 1450, z: 850, r: 560, h: 75, name: 'Pulau Timur' },
    { x: -1400, z: 500, r: 600, h: 90, name: 'Pulau Barat' },
    { x: 150, z: -1500, r: 480, h: 55, name: 'Pulau Utara' },
  ];

  function smooth01(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  // Cheap ridged detail: layered sines, no noise texture needed.
  function detail(x, z) {
    return (
      Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017 - 0.6) * 0.5 +
      Math.sin(x * 0.043 - z * 0.031) * 0.3 +
      Math.cos(x * 0.008 + z * 0.011) * 0.2
    );
  }

  function islandFalloff(ix, iz, isl) {
    const dx = ix - isl.x;
    const dz = iz - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
    if (d >= 1) return 0;
    return smooth01(1 - d);
  }

  // Terrain height in metres. Sea level is 0; land rises above it.
  function terrainHeight(x, z) {
    let h = 0;
    let mask = 0;
    for (const isl of ISLANDS) {
      const f = islandFalloff(x, z, isl);
      if (f <= 0) continue;
      mask = Math.max(mask, f);
      const peak = isl.volcano ? Math.pow(f, 1.6) : f;
      h += isl.h * peak;
    }
    if (mask <= 0) return -6; // open sea floor, safely below the water plane
    // Flatten the two runway strips so landings are fair.
    for (const rw of RUNWAYS) {
      const flat = runwayFlatness(x, z, rw);
      if (flat > 0) {
        const target = rw.elevation;
        h = h * (1 - flat) + target * flat;
      }
    }
    return h + detail(x, z) * 7 * mask;
  }

  function groundKind(x, z) {
    const h = terrainHeight(x, z);
    if (h < 1.5) return 'sand';
    if (h < 4) return 'grass';
    // Rice paddies: banded fields on the gentle slopes of Pulau Padi.
    const padi = Math.sin(x * 0.05) * Math.sin(z * 0.05);
    if (h < 26 && padi > 0.25) return 'rice';
    if (h > 120) return 'rock';
    // Forest patches on the higher green slopes.
    const forest = Math.sin(x * 0.013 + 4) * Math.cos(z * 0.011 - 2);
    if (h > 40 && forest > 0.35) return 'forest';
    return 'grass';
  }

  // ---- Runways ----
  // heading is the runway direction in radians (0 = +Z north, PI/2 = +X east).
  const RUNWAYS = [
    {
      id: 0, name: 'Merpati Intl', x: 60, z: 120, heading: Math.PI / 2,
      length: 420, width: 34, elevation: 6, lights: true,
    },
    {
      id: 1, name: 'Padi Field', x: -850, z: -950, heading: 0.15,
      length: 360, width: 30, elevation: 5, lights: true,
    },
  ];

  function runwayFlatness(x, z, rw) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    const c = Math.cos(-rw.heading);
    const s = Math.sin(-rw.heading);
    const along = dx * c - dz * s;
    const across = dx * s + dz * c;
    const a = 1 - Math.abs(along) / (rw.length * 0.75);
    const b = 1 - Math.abs(across) / (rw.width * 2.2);
    return smooth01(Math.min(a, b));
  }

  function onRunway(x, z) {
    for (const rw of RUNWAYS) {
      const dx = x - rw.x;
      const dz = z - rw.z;
      const c = Math.cos(-rw.heading);
      const s = Math.sin(-rw.heading);
      const along = dx * c - dz * s;
      const across = dx * s + dz * c;
      if (Math.abs(along) <= rw.length / 2 && Math.abs(across) <= rw.width / 2) return rw;
    }
    return null;
  }

  // ---- Rings (fixed course, part of the mission script) ----
  function ringCourse() {
    return [
      { x: -120, y: 150, z: 260 },
      { x: 120, y: 170, z: -80 },
      { x: 430, y: 200, z: -380 },
      { x: 700, y: 230, z: -520 },
      { x: 480, y: 180, z: -820 },
      { x: -180, y: 160, z: -700 },
      { x: -560, y: 150, z: -950 },
      { x: -760, y: 120, z: -1150 },
      { x: -850, y: 90, z: -1330 },
      { x: -850, y: 60, z: -1500 },
    ];
  }

  // ---- Scenery, placed once with the seeded RNG. ----
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: (rng() - 0.5) * 4200,
      y: 260 + rng() * 180,
      z: (rng() - 0.5) * 4200,
      s: 60 + rng() * 130,
      puffs: 3 + Math.floor(rng() * 3),
      seed: rng() * 10,
    });
  }

  const birds = [];
  for (let i = 0; i < 26; i++) {
    birds.push({
      x: (rng() - 0.5) * 2600,
      y: 90 + rng() * 130,
      z: (rng() - 0.5) * 2600,
      phase: rng() * Math.PI * 2,
      speed: 0.25 + rng() * 0.35,
      size: 4 + rng() * 4,
    });
  }

  const ships = [];
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = 700 + rng() * 1300;
    ships.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      heading: rng() * Math.PI * 2,
      size: 26 + rng() * 30,
      ferry: rng() > 0.5,
    });
  }

  // Trees cluster on grass/forest ground, never on runways or water.
  const trees = [];
  let guard = 0;
  while (trees.length < 420 && guard++ < 8000) {
    const x = (rng() - 0.5) * 3400;
    const z = (rng() - 0.5) * 3400;
    const h = terrainHeight(x, z);
    if (h < 6 || h > 110) continue;
    if (onRunway(x, z)) continue;
    if (groundKind(x, z) === 'rice') continue;
    trees.push({ x, z, h, s: 7 + rng() * 9, shade: rng() });
  }

  // Small towns: house clusters near each runway and on the home island.
  const houses = [];
  const townSpots = [
    { x: 260, z: 260, n: 26 },
    { x: -180, z: -120, n: 18 },
    { x: -700, z: -800, n: 16 },
    { x: 420, z: 1150, n: 12 },
  ];
  for (const t of townSpots) {
    for (let i = 0; i < t.n; i++) {
      const x = t.x + (rng() - 0.5) * 260;
      const z = t.z + (rng() - 0.5) * 260;
      const h = terrainHeight(x, z);
      if (h < 3 || onRunway(x, z)) continue;
      houses.push({ x, z, h, w: 10 + rng() * 8, rot: rng() * Math.PI, roof: rng() });
    }
  }

  // Volcano smoke columns, anchored to the volcano peak.
  const volcano = ISLANDS.find((i) => i.volcano);
  const smoke = [];
  for (let i = 0; i < 14; i++) {
    smoke.push({ t: i / 14, drift: (rng() - 0.5) * 40, s: 18 + rng() * 26 });
  }

  return {
    ISLANDS, RUNWAYS, clouds, birds, ships, trees, houses, smoke,
    volcano, terrainHeight, groundKind, onRunway, ringCourse, rng,
  };
})();
