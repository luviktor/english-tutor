// Little sound effects made with the Web Audio API (no sound files needed).

import { state } from './state.js';

let ctx = null;

function audio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(c, { freq, at = 0, dur = 0.15, type = 'sine', gain = 0.18, to = null }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const notes = (c, freqs, step, opts = {}) =>
  freqs.forEach((freq, i) => tone(c, { freq, at: i * step, ...opts }));

const SOUNDS = {
  click: c => tone(c, { freq: 660, dur: 0.06, type: 'triangle', gain: 0.1 }),
  flip: c => tone(c, { freq: 520, to: 700, dur: 0.07, type: 'triangle', gain: 0.1 }),
  pop: c => tone(c, { freq: 400, to: 900, dur: 0.1, gain: 0.14 }),
  correct: c => notes(c, [784, 988, 1175], 0.08, { dur: 0.18, type: 'triangle' }),
  match: c => notes(c, [659, 880, 1318], 0.09, { dur: 0.2, type: 'triangle' }),
  wrong: c => tone(c, { freq: 240, to: 150, dur: 0.28, type: 'triangle', gain: 0.16 }),
  coin: c => notes(c, [988, 1319], 0.07, { dur: 0.16, type: 'square', gain: 0.07 }),
  win: c => notes(c, [523, 659, 784, 1046, 784, 1046], 0.11, { dur: 0.3, type: 'triangle' }),
  levelup: c => notes(c, [392, 523, 659, 784, 1046, 1319], 0.09, { dur: 0.28, type: 'triangle', gain: 0.2 }),
};

export function sfx(name) {
  if (state.data && !state.data.settings.sound) return;
  const c = audio();
  if (c && SOUNDS[name]) SOUNDS[name](c);
}
