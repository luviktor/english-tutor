// Everything a pupil has achieved. One JSON object per pupil, saved through api.js to the server.
//
// words[key] = { lvl 0..5, ok, bad, last, upDay, upCount }   (key = lower-case English word)
//   lvl: 0 = just met, 1-2 = learning, 3-4 = knows it, 5 = mastered (gold card)
//   absent = never seen.
//
// Saving: every change goes to a local copy in localStorage at once, and to the server at most every
// SAVE_EVERY ms, right away at the end of a round (saveNow) and when the page is hidden. Failed saves
// are retried with a growing delay, and the local copy survives closing the browser, so flaky Wi-Fi
// loses nothing. Each save names the server revision it is based on: if another device saved in the
// meantime, the server's newer copy wins and replaces this one.

import * as api from './api.js';
import { todayStr, daysBetween } from './util.js';
import { levelInfo } from './levels.js';

/** pupil = { id, name } from the login. */
export const state = { data: null, saveError: false, pupil: null };

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => listeners.forEach(fn => fn());

const defaults = () => ({
  version: 1,
  player: { name: '', xp: 0, stars: 0, starsTotal: 0, mascot: '🦊', hat: null, face: null, createdAt: new Date().toISOString() },
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

/** A saved object completed with today's defaults; the name always comes from the login. */
function withDefaults(saved) {
  const d = defaults();
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(d)) {
      if (saved[k] === undefined || saved[k] === null) continue;
      d[k] = MERGE_KEYS.includes(k) ? { ...d[k], ...saved[k] } : saved[k];
    }
  }
  d.player.name = state.pupil.name;
  return d;
}

// ------------------------------------------------------------------ saving

const SAVE_EVERY = 5000;
const RETRY_MAX = 60000;
const REFRESH_AFTER_HIDDEN = 60000;

let revision = 0;    // the server revision state.data is based on
let dirty = false;   // changes the server has not acknowledged yet
let saving = null;   // the save request in flight
let timer = null;
let lastSent = 0;
let failures = 0;
let hiddenAt = 0;
let onReplaced = () => {};

/** fn() runs after the progress was replaced by a newer copy saved on another device. */
export function setReplacedHandler(fn) { onReplaced = fn; }

const localKey = () => `englishtutor-progress-${state.pupil.id}`;

function writeLocal() {
  try { localStorage.setItem(localKey(), JSON.stringify({ revision, dirty, data: state.data })); } catch { /* full or private mode */ }
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(localKey()) || 'null'); } catch { return null; }
}

export async function loadState(pupil) {
  state.pupil = pupil;
  const server = await api.loadProgress(); // offline: throws, the caller shows an error
  const local = readLocal();
  revision = server?.revision ?? 0;
  if (local?.dirty && local.revision === revision) {
    // Changes that never reached the server last time, made on top of its current copy.
    state.data = withDefaults(local.data);
    commit();
  } else {
    state.data = withDefaults(server?.data);
    if (server) writeLocal();
    else commit(); // a new pupil: create the document right away
  }
}

export function commit() {
  dirty = true;
  writeLocal();
  notify();
  schedule(Math.max(0, lastSent + SAVE_EVERY - Date.now()));
}

function schedule(delay) {
  if (timer || saving) return; // a running save schedules the next one when it ends
  timer = setTimeout(() => { timer = null; flush(); }, delay);
}

/** Sends the changes now instead of waiting, e.g. at the end of a round. */
export function saveNow() {
  if (dirty) flush();
}

export function flush({ keepalive = false } = {}) {
  clearTimeout(timer);
  timer = null;
  if (saving) return saving;
  if (!dirty) return Promise.resolve();
  const d = state.data;
  if (d.history.length > 80) d.history = d.history.slice(-80);
  const dayKeys = Object.keys(d.days).sort();
  for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - 400))) delete d.days[k];

  dirty = false;
  lastSent = Date.now();
  saving = api.saveProgress(d, revision, { keepalive })
    .then(saved => {
      revision = saved.revision;
      failures = 0;
      state.saveError = false;
    })
    .catch(err => {
      if (err instanceof api.ApiError && err.status === 409 && err.body?.data) {
        adopt(err.body);
        return;
      }
      dirty = true;
      failures++;
      state.saveError = failures >= 2;
    })
    .finally(() => {
      saving = null;
      writeLocal();
      notify();
      if (dirty) schedule(failures ? Math.min(RETRY_MAX, SAVE_EVERY * 2 ** failures) : Math.max(0, lastSent + SAVE_EVERY - Date.now()));
    });
  return saving;
}

/** Takes over the server's newer copy, dropping this device's unsaved changes. */
function adopt(server) {
  revision = server.revision;
  state.data = withDefaults(server.data);
  dirty = false;
  failures = 0;
  state.saveError = false;
  writeLocal();
  onReplaced();
}

/** After a long time in the background another device may have saved: fetch its newer copy. */
async function refresh() {
  if (dirty || saving) return;
  try {
    const server = await api.loadProgress();
    if (server && server.revision > revision && !dirty && !saving) adopt(server);
  } catch { /* offline: the next save finds out */ }
}

addEventListener('pagehide', () => { if (state.pupil && dirty) flush({ keepalive: true }); });
document.addEventListener('visibilitychange', () => {
  if (!state.pupil) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (dirty) flush({ keepalive: true });
  } else if (hiddenAt && Date.now() - hiddenAt > REFRESH_AFTER_HIDDEN) {
    refresh();
  }
});

/** Saves what is left before logging out. True when everything reached the server. */
export async function closeSession() {
  for (let attempt = 0; attempt < 3 && (dirty || saving); attempt++) await flush();
  clearTimeout(timer);
  timer = null;
  if (dirty) return false;
  try { localStorage.removeItem(localKey()); } catch { /* ignore */ }
  return true;
}

/** Replaces the whole progress, e.g. with a file exported earlier or the demo's progress.json. */
export function replaceData(saved) {
  state.data = withDefaults(saved);
  commit();
  return flush();
}

export function resetAll() {
  return replaceData(null);
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
// Spread over the defaults: a day from an imported or older file may lack some fields.
export const peekToday = () => ({ ...emptyDay(), ...state.data.days[todayStr()] });
function today() {
  const t = todayStr();
  return (state.data.days[t] = { ...emptyDay(), ...state.data.days[t] });
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
