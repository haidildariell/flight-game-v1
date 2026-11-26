// config.js — every tunable number of LANGIT NUSANTARA lives here.
// Palette: bright, saturated tropical noon. One style, one light.
'use strict';

const LN_CONFIG = {
  canvasWidth: 1280,
  canvasHeight: 720,
  focalLength: 760,          // projection focal length (px at 1 m depth)
  drawDistance: 1500,        // how far terrain is meshed (m)
  meshStep: 55,              // terrain grid step (m)
  meshLateral: 720,          // half-width of meshed strip (m)

  // Flight envelope (arcade, forgiving but honest).
  maxSpeed: 68,              // m/s at full throttle
  cruiseSpeed: 42,
  stallSpeed: 17,            // below this the nose drops
  climbPitchMax: 0.42,       // rad, ~24 deg
  divePitchMax: -0.38,
  rollRate: 1.9,             // rad/s toward commanded bank
  bankMax: 0.85,             // rad
  turnFactor: 0.55,          // heading rate per bank rad
  accelRate: 9,              // m/s^2 toward throttle target
  sinkRate: 6,               // m/s sink when stalled

  fuelCapacity: 100,
  fuelBurnFull: 0.55,        // fuel units per second at full throttle
  fuelBurnIdle: 0.10,
  damageCrash: 55,           // damage from a hard terrain hit
  damageScrape: 18,          // damage from a grazing hit
  damageHardLanding: 30,
  repairOnLanding: 25,       // damage patched when a landing succeeds

  ringRadius: 26,            // ring pass radius (m)
  ringScore: 100,
  landingScore: 500,
  comboWindow: 12,           // seconds a combo stays alive
  timeBonusRate: 2,          // points per second under par, on mission end

  planeName: 'Merpati-7',
  homeRunway: 0,
  destRunway: 1,

  palette: {
    skyTop: '#2f7fe0',
    skyMid: '#6db4f2',
    skyHorizon: '#cfe9ff',
    sun: '#fff3b0',
    seaDeep: '#0a5fb4',
    seaShallow: '#1f9fd8',
    sand: '#f2d492',
    grass: '#4fae4a',
    rice: '#8fd14f',
    forest: '#2e7d32',
    townRoof: '#e4572e',
    townWall: '#fff1d6',
    rock: '#7d7468',
    volcanoRock: '#5d5348',
    lava: '#ff6b1a',
    runway: '#3c4148',
    runwayLine: '#ffe45c',
    cloud: '#ffffff',
    ringGold: '#ffc21c',
    ringGlow: '#ffdf6b',
    hudInk: '#ffffff',
    hudPanel: 'rgba(8, 24, 48, 0.62)',
    hudAccent: '#ffc21c',
    hudGood: '#4ade80',
    hudWarn: '#fbbf24',
    hudBad: '#f87171',
  },

  keys: {
    throttleUp: ['KeyW'],
    throttleDown: ['KeyS'],
    pitchUp: ['ArrowUp'],
    pitchDown: ['ArrowDown'],
    rollLeft: ['KeyA', 'ArrowLeft'],
    rollRight: ['KeyD', 'ArrowRight'],
    yawLeft: ['KeyQ'],
    yawRight: ['KeyE'],
    brake: ['KeyB'],
    flaps: ['KeyF'],
    restart: ['KeyR'],
    mute: ['KeyM'],
    pause: ['KeyP', 'Escape'],
    start: ['Enter', 'Space'],
  },

  // Deterministic shot staging: ?shot=<name> puts the plane in a fixed
  // pose and freezes ambient motion so the capture is reproducible.
  shots: {
    cover: {
      pos: { x: -260, y: 150, z: 420 },
      heading: 2.37, pitch: -0.02, roll: 0.10, speed: 46, throttle: 0.72,
      missionStep: 0, ringsPassed: 0, cameraDistance: 16, cameraHeight: 4.5,
    },
    islands: {
      pos: { x: -620, y: 64, z: -420 },
      heading: 0.55, pitch: -0.04, roll: -0.16, speed: 40, throttle: 0.62,
      missionStep: 0, ringsPassed: 2, cameraDistance: 17, cameraHeight: 5,
    },
    landing: {
      pos: { x: -880, y: 42, z: -1330 },
      heading: 0.0, pitch: -0.10, roll: 0.02, speed: 30, throttle: 0.34,
      missionStep: 1, ringsPassed: 5, cameraDistance: 15, cameraHeight: 3.5,
    },
    cockpit: {
      pos: { x: 120, y: 190, z: -120 },
      heading: 2.4, pitch: 0.0, roll: 0.0, speed: 44, throttle: 0.68,
      missionStep: 3, ringsPassed: 5, cameraDistance: 7.5, cameraHeight: 2.2,
      forceComplete: true,
    },
  },
};

// Freeze the config object so a typo elsewhere fails loudly instead of
// silently inventing a new field.
Object.freeze(LN_CONFIG);
Object.freeze(LN_CONFIG.palette);
Object.freeze(LN_CONFIG.keys);
Object.freeze(LN_CONFIG.shots);
