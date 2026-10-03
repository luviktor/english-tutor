// Everything Nóra has achieved. One JSON object, saved via api.js (server.py -> data/progress.json, or localStorage on static hosting).
//
// words[key] = { lvl 0..5, ok, bad, last, upDay, upCount }   (key = lower-case English word)
//   lvl: 0 = just met, 1-2 = learning, 3-4 = knows it, 5 = mastered (gold sticker)
//   absent = never seen.

import * as api from './api.js';
import { todayStr, daysBetween } from './util.js';
import { levelInfo } from './levels.js';

export const state = { data: null, saveError: false };

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => listeners.forEach(fn => fn());

const defaults = () => ({
  version: 1,
  player: { name: 'Nóra', xp: 0, stars: 0, starsTotal: 0, mascot: '🦊', hat: null, face: null, createdAt: new Date().toISOString() },
  settings: { sound: true, voice: '', rate: 0.85, dailyGoal: 15 },
  words: {},
  days: {},
  streak: { current: 0, best: 0, lastDay: null },
  badges: {},
  shop: { owned: [] },
  stats: { rounds: 0, answers: 0, correct: 0, typedOk: 0, listenOk: 0, perfectRounds: 0, bestCombo: 0, memoryPerfect: 0, goalDays: 0 },
  history: [],
});

const MERGE_KEYS = ['player', 'settings', 'streak', 'shop', 'stats'];

export async function loadState() {
  let saved = null;
  try { saved = await api.loadProgress(); } catch { state.saveError = true; }
  const d = defaults();
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(d)) {
      if (saved[k] === undefined) continue;
      d[k] = MERGE_KEYS.includes(k) ? { ...d[k], ...saved[k] } : saved[k];
    }
  }
  state.data = d;
  if (!saved) commit(); // create the file right away
}

// ------------------------------------------------------------------ saving

let timer = null;

export function commit() {
  notify();
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

export async function flush(opts) {
  clearTimeout(timer);
  timer = null;
  const d = state.data;
  if (d.history.length > 80) d.history = d.history.slice(-80);
  const dayKeys = Object.keys(d.days).sort();
  for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - 400))) delete d.days[k];
  try { await api.saveProgress(d, opts); state.saveError = false; } catch { state.saveError = true; }
  notify();
}

addEventListener('pagehide', () => { if (timer) flush({ keepalive: true }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && timer) flush({ keepalive: true });
});

export async function resetAll() {
  state.data = defaults();
  await flush();
}

// ------------------------------------------------------------------- words

export const wordRec = key => state.data.words[key] || null;
export const wordLevel = key => state.data.words[key]?.lvl ?? -1;

/** Marks a word as "met". Returns true when it was new. */
export function introduce(key) {
  const words = state.data.words;
  if (words[key]) return false;
  words[key] = { lvl: 0, ok: 0, bad: 0, last: todayStr(), upDay: null, upCount: 0 };
  commit();
  return true;
}

/**
 * outcome: 'right' (level up), 'half' (solved with help, no change), 'wrong' (level down).
 * Max +2 levels per word per day, so a word needs a few different days to become mastered.
 */
export function recordAnswer(key, outcome, game) {
  introduce(key);
  const w = state.data.words[key];
  const t = todayStr();
  const day = today();
  const st = state.data.stats;
  let mastered = false;
  day.answers++;
  st.answers++;
  if (outcome === 'right') {
    w.ok++; day.correct++; day.done++; st.correct++;
    if (game === 'typing') st.typedOk++;
    if (game === 'listen') st.listenOk++;
    if (w.upDay !== t) { w.upDay = t; w.upCount = 0; }
    if (w.upCount < 2 && w.lvl < 5) {
      w.lvl++;
      w.upCount++;
      mastered = w.lvl === 5;
    }
  } else if (outcome === 'half') {
    day.done++;
  } else {
    w.bad++;
    w.lvl = Math.max(0, w.lvl - 1);
  }
  w.last = t;
  touchStreak();
  commit();
  return { mastered, lvl: w.lvl };
}

// ------------------------------------------------------------ days & streak

const emptyDay = () => ({ answers: 0, correct: 0, done: 0, xp: 0, goalDone: false });
export const peekToday = () => state.data.days[todayStr()] || emptyDay();
function today() {
  const t = todayStr();
  return (state.data.days[t] ||= emptyDay());
}

export function touchStreak() {
  const s = state.data.streak;
  const t = todayStr();
  if (s.lastDay === t) return;
  s.current = s.lastDay && daysBetween(s.lastDay, t) === 1 ? s.current + 1 : 1;
  s.best = Math.max(s.best, s.current);
  s.lastDay = t;
}

export function streakNow() {
  const s = state.data.streak;
  if (!s.lastDay) return 0;
  return daysBetween(s.lastDay, todayStr()) <= 1 ? s.current : 0;
}

// --------------------------------------------------------- xp, stars, goal

export function addXP(n) {
  if (!n) return { levelUp: false };
  const p = state.data.player;
  const before = levelInfo(p.xp).level;
  p.xp += n;
  today().xp += n;
  const after = levelInfo(p.xp).level;
  commit();
  return { levelUp: after > before, level: after };
}

export function addStars(n) {
  if (!n) return;
  const p = state.data.player;
  p.stars += n;
  p.starsTotal = (p.starsTotal || 0) + n;
  commit();
}

export function spendStars(n) {
  const p = state.data.player;
  if (p.stars < n) return false;
  p.stars -= n;
  commit();
  return true;
}

/** Gives the daily chest once per day. Returns the reward or null. */
export function checkDailyGoal() {
  const d = today();
  if (d.goalDone || d.done < state.data.settings.dailyGoal) return null;
  d.goalDone = true;
  state.data.stats.goalDays++;
  const reward = { xp: 40, stars: 20 };
  addXP(reward.xp);
  addStars(reward.stars);
  return reward;
}
