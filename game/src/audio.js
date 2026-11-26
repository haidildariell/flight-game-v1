// audio.js — every sound in LANGIT NUSANTARA is synthesised live.
// One job: WebAudio oscillators and noise, no audio files anywhere.
// Engine hum follows the throttle; rings chime; landings thud.
'use strict';

const LNAudio = (() => {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low saw + a sub sine, detuned for a twin-prop growl.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sine';
      engineOsc2.frequency.value = 31;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a bandpass, gain follows airspeed.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(bp);
      bp.connect(windGain);
      windGain.connect(master);
      noise.start();
      started = true;
      return true;
    } catch (_e) {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function setEngine(throttle, speed) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
    engineOsc.frequency.setTargetAtTime(58 + throttle * 55, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(29 + throttle * 27, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0016), t, 0.15);
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t = (when || ctx.currentTime) + 0.01;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.25, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function chime() {
    // Ring passed: a bright two-note chime, E5 then B5.
    tone(659.25, 0.35, 'sine', 0.3);
    tone(987.77, 0.5, 'sine', 0.28, ctx ? ctx.currentTime + 0.09 : 0);
  }

  function thud() {
    // Landing: a low filtered noise burst + a 70 Hz thump.
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = ctx.sampleRate * 0.25;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t);
    tone(70, 0.3, 'sine', 0.4, t);
  }

  function scrape() {
    if (!ctx || muted) return;
    tone(180, 0.25, 'sawtooth', 0.12);
    tone(120, 0.3, 'sawtooth', 0.1, ctx.currentTime + 0.05);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { ensure, resume, setEngine, chime, thud, scrape, toggleMute, get started() { return started; } };
})();
