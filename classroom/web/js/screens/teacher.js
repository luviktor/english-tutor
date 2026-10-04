// The teacher's view: the whole class in one sortable table, the dictionary's status and problems in the
// pupil list. Not a router screen: main.js renders it after a teacher login.

import { $, el, dayStr, todayStr, daysBetween } from '../util.js';
import * as api from '../api.js';
import { dict } from '../dict.js';
import { levelInfo } from '../levels.js';
import { APP_TITLE } from '../strings.js';
import { logout } from '../account.js';
import { logoutIcon } from '../ui.js';

const DAYS = 14;

/** Word levels as the pupils see them in their collection. */
const GROUPS = [
  { label: 'új', levels: [0], cls: 'g-new' },
  { label: 'tanulja', levels: [1, 2], cls: 'g-learning' },
  { label: 'tudja', levels: [3, 4], cls: 'g-known' },
  { label: 'arany', levels: [5], cls: 'g-gold' },
];

const groupCounts = p => GROUPS.map(g => g.levels.reduce((n, lvl) => n + (p.summary?.wordsByLevel?.[lvl] ?? 0), 0));
const knownWords = p => { const c = groupCounts(p); return c[2] + c[3]; };
const accuracy = p => (p.summary?.answers ? Math.round((p.summary.correct / p.summary.answers) * 100) : null);
const activeStreak = p => (p.summary?.lastDay && daysBetween(p.summary.lastDay, todayStr()) <= 1 ? p.summary.streak : 0);
const daysAgo = iso => daysBetween(dayStr(new Date(iso)), todayStr());

/** Answers per day for the last `n` days, oldest first. */
function recentDays(p, n = DAYS) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(p.summary?.recentDays?.[dayStr(d)] ?? 0);
  }
  return out;
}
const recentTotal = (p, n) => recentDays(p, n).reduce((a, b) => a + b, 0);

const COLUMNS = [
  { key: 'name', label: 'Név', value: p => p.name, text: true },
  { key: 'xp', label: 'Szint', value: p => p.summary?.xp ?? -1 },
  { key: 'words', label: 'Szavak', value: knownWords },
  { key: 'accuracy', label: 'Pontosság', value: p => accuracy(p) ?? -1 },
  { key: 'streak', label: 'Sorozat', value: activeStreak },
  { key: 'recent', label: `Utolsó ${DAYS} nap`, value: p => recentTotal(p, DAYS) },
  { key: 'last', label: 'Utoljára', value: p => (p.updatedAt ? Date.parse(p.updatedAt) : 0) },
];

/** `identity` is the { id, name, role } the login returned; its name goes on the chip. */
export function render(app, identity) {
  let report = null;
  let sort = { key: 'name', dir: 1 };
  const body = el('div', { class: 'teacher' });

  $('#hud').replaceChildren(el('div', { class: 'hud-inner' },
    el('div', { class: 'brand' }, el('span', { class: 'logo', 'aria-hidden': 'true' }, 'Aa'),
      el('span', { class: 'hud-title' }, `${APP_TITLE} – tanári nézet`)),
    el('div', { class: 'hud-chips' },
      el('button', { class: 'chip', type: 'button', onclick: load }, '🔄 Frissítés'),
      el('button', { class: 'chip chip-user', type: 'button', title: 'Kilépés', onclick: logout }, el('span', { class: 'user-name' }, identity.name), logoutIcon()))));
  app.append(body);
  load();

  async function load() {
    body.replaceChildren(el('div', { class: 'loading' }, el('div', { class: 'spinner' }), 'Töltés…'));
    try {
      report = await api.getClass();
    } catch (err) {
      console.error(err);
      body.replaceChildren(el('div', { class: 'card error-card' },
        el('div', { class: 'big-emoji' }, '📡'), el('h2', {}, 'Nem érem el a szervert'),
        el('button', { class: 'btn', type: 'button', onclick: load }, '🔄 Újra')));
      return;
    }
    draw();
  }

  function draw() {
    const pupils = report.pupils;
    const today = todayStr();
    const played = pupils.filter(p => p.summary);
    body.replaceChildren(...[
      el('div', { class: 'screen-head' }, el('h2', { class: 'screen-title' }, '🧑‍🏫 Az osztály')),
      el('div', { class: 'kpis teacher-kpis' },
        kpi('👥', pupils.length, 'tanuló'),
        kpi('🎮', played.length, 'játszott már'),
        kpi('📅', pupils.filter(p => p.summary?.lastDay === today).length, 'ma gyakorolt'),
        kpi('🗓️', pupils.filter(p => recentTotal(p, 7) > 0).length, 'gyakorolt az elmúlt 7 napban')),
      el('section', { class: 'card table-card' }, table(), legend()),
      report.problems.length > 0 && el('section', { class: 'card warn-card' },
        el('h3', {}, '⚠️ Hibák a tanulók és tanárok listájában'),
        el('p', { class: 'small' }, 'A PUPILS_JSON és a TEACHERS_JSON beállítás a Static Web App környezeti változói között van.'),
        el('ul', {}, report.problems.map(t => el('li', {}, t)))),
      el('section', { class: 'card' },
        el('h3', {}, '📚 Szótár'),
        el('p', {}, `${dict.words.length} szó, ${dict.topics.length} téma.`),
        el('div', { class: 'row-wrap' }, dict.topics.map(t => el('span', { class: 'chip-topic', style: { '--c': t.color } },
          `${t.emoji} ${t.name} (${dict.words.filter(w => w.topic === t.name).length})`))),
        dict.warnings.length > 0 && el('div', { class: 'warn-box' }, el('b', {}, 'Figyelmeztetések:'),
          el('ul', {}, dict.warnings.map(w => el('li', {}, w))))),
    ].filter(Boolean));
  }

  function table() {
    const col = COLUMNS.find(c => c.key === sort.key);
    const rows = [...report.pupils].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      const order = col.text ? String(x).localeCompare(String(y), 'hu') : x - y;
      return order * sort.dir || a.name.localeCompare(b.name, 'hu');
    });
    const max = Math.max(1, ...report.pupils.flatMap(p => recentDays(p)));
    const head = el('tr', {}, COLUMNS.map(c => el('th', { 'aria-sort': c.key === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
      el('button', {
        type: 'button', class: 'th-sort',
        onclick: () => {
          sort = sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: c.text ? 1 : -1 };
          draw();
        },
      }, c.label, c.key === sort.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''))));
    return el('div', { class: 'table-wrap' }, el('table', { class: 'class-table' },
      el('thead', {}, head),
      el('tbody', {}, rows.map(p => row(p, max)))));
  }

  function row(p, max) {
    const s = p.summary;
    if (!s) {
      return el('tr', { class: 'idle' }, el('td', {}, nameCell(p)), el('td', { colspan: COLUMNS.length - 2, class: 'muted' }, 'Még nem játszott.'), el('td', { class: 'muted' }, '–'));
    }
    const li = levelInfo(s.xp);
    const counts = groupCounts(p);
    const total = Math.max(dict.words.length, counts.reduce((a, b) => a + b, 0));
    const acc = accuracy(p);
    const streak = activeStreak(p);
    const ago = daysAgo(p.updatedAt);
    return el('tr', {},
      el('td', {}, nameCell(p)),
      el('td', { class: 'nowrap' }, el('span', { class: 'lv' }, li.emoji), ` ${li.level}. szint`, el('small', {}, `${s.xp} XP`)),
      el('td', { title: GROUPS.map((g, i) => `${g.label}: ${counts[i]}`).join(', ') },
        el('div', { class: 'word-bar' }, GROUPS.map((g, i) => el('i', { class: g.cls, style: { width: `${(counts[i] / total) * 100}%` } }))),
        el('small', {}, `${counts[2] + counts[3]} tudja · ${counts[3]} arany · ${total} szóból`)),
      el('td', { class: 'num' }, acc == null ? '–' : `${acc}%`, el('small', {}, `${s.answers} válasz`)),
      el('td', { class: 'num' }, streak ? `🔥 ${streak}` : '0', el('small', {}, `leghosszabb: ${s.bestStreak}`)),
      el('td', {}, el('div', { class: 'spark', title: `${recentTotal(p, DAYS)} válasz az utolsó ${DAYS} napban` },
        recentDays(p).map(n => el('i', { style: { height: `${n ? Math.max(12, (n / max) * 100) : 4}%` }, class: n ? '' : 'zero' })))),
      el('td', { class: 'nowrap', title: new Date(p.updatedAt).toLocaleString('hu-HU') },
        ago <= 0 ? 'ma' : ago === 1 ? 'tegnap' : `${ago} napja`));
  }
}

const nameCell = p => [el('b', {}, p.name), el('small', {}, p.id)];
const kpi = (icon, value, label) => el('div', { class: 'kpi' }, el('span', {}, icon), el('b', {}, value), el('small', {}, label));
const legend = () => el('div', { class: 'legend teacher-legend' },
  GROUPS.map(g => el('span', {}, el('i', { class: g.cls }), g.label)),
  el('span', {}, el('i', { class: 'g-none' }), 'még nem látta'));
