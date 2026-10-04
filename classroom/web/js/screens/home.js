import { el } from '../util.js';
import { state, peekToday, streakNow } from '../state.js';
import { levelInfo } from '../levels.js';
import { dict } from '../dict.js';
import { BADGES } from '../badges.js';
import { go } from '../router.js';
import { mascot } from '../ui.js';
import { homeLine, NO_WORDS } from '../strings.js';
import { sfx } from '../sound.js';
import { speak } from '../speech.js';

const TILES = [
  { icon: '📖', title: 'Szókártyák', sub: 'Nézd meg, hallgasd meg, mondd ki', c1: '#818cf8', c2: '#4f46e5', mode: 'learn' },
  { icon: '🎧', title: 'Hallás után', sub: 'Melyik szót hallod?', c1: '#38bdf8', c2: '#0284c7', mode: 'listen' },
  { icon: '🃏', title: 'Párkereső', sub: 'Kép és szó párban', c1: '#f472b6', c2: '#db2777', mode: 'memory' },
  { icon: '⌨️', title: 'Gépelés', sub: 'Írd be a szót angolul', c1: '#4ade80', c2: '#16a34a', mode: 'typing' },
];

function ring(done, goal) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const pct = Math.min(1, done / goal);
  const wrap = el('div', { class: 'ring-wrap' });
  wrap.innerHTML = `<svg viewBox="0 0 80 80" class="ring" aria-hidden="true">
    <circle cx="40" cy="40" r="${R}" class="ring-bg"/>
    <circle cx="40" cy="40" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 40 40)"/>
  </svg>`;
  wrap.append(el('span', { class: 'ring-icon' }, done >= goal ? '🎁' : '🎯'));
  return wrap;
}

const pill = (cls, icon, label, value, screen) => el('button', { class: `pill ${cls}`, type: 'button', onclick: () => go(screen) },
  el('span', { class: 'pill-icon' }, icon), el('span', {}, label, value != null && el('b', {}, value)));

export function render(app) {
  const d = state.data;
  const p = d.player;
  const li = levelInfo(p.xp);
  const today = peekToday();
  const goal = d.settings.dailyGoal;
  const streak = streakNow();
  const gold = dict.words.filter(w => (d.words[w.key]?.lvl ?? -1) >= 5).length;
  const earned = BADGES.filter(b => d.badges[b.id]).length;

  const buddy = el('button', {
    class: 'hero-mascot', type: 'button', 'aria-label': 'Köszönj az avatarodnak',
    onclick: e => {
      sfx('pop');
      speak('Hello!');
      e.currentTarget.classList.remove('jump');
      void e.currentTarget.offsetWidth;
      e.currentTarget.classList.add('jump');
    },
  }, mascot({ size: 'xl' }));

  app.append(
    el('section', { class: 'hero card' },
      el('div', { class: 'hero-left' }, buddy, el('div', { class: 'bubble big pop' }, homeLine())),
      el('div', { class: 'hero-info' },
        el('h1', { class: 'title' }, `Szia, ${p.name}!`),
        el('div', { class: 'level-row' },
          el('span', { class: 'level-emoji' }, li.emoji),
          el('div', { class: 'level-text' },
            el('div', { class: 'level-title' }, `${li.level}. szint · ${li.title}`),
            el('div', { class: 'xp-bar' }, el('i', { style: { width: Math.round(li.pct * 100) + '%' } })),
            el('div', { class: 'xp-label' }, `${p.xp - li.from} / ${li.to - li.from} XP a következő szintig`))),
        el('div', { class: 'goal-row' },
          ring(today.done, goal),
          el('div', { class: 'goal-text' },
            el('div', { class: 'goal-title' }, today.goalDone ? 'Mai cél: kész ✔' : 'Mai cél'),
            el('div', {}, `${Math.min(today.done, goal)} / ${goal} szó`)),
          el('div', { class: 'streak-box' }, el('span', { class: 'streak-fire' }, '🔥'),
            el('div', {}, el('b', {}, streak), ' nap'), el('div', { class: 'small' }, 'sorozat'))))),

    el('h2', { class: 'section-title' }, 'Játékok'),
    dict.words.length === 0
      ? el('p', { class: 'empty card' }, NO_WORDS)
      : el('section', { class: 'tiles' }, TILES.map(t => el('button', {
        class: 'tile', type: 'button',
        style: { '--c1': t.c1, '--c2': t.c2 },
        onclick: () => { sfx('click'); go('topics', { mode: t.mode }); },
      }, el('span', { class: 'tile-icon' }, t.icon),
      el('span', { class: 'tile-text' }, el('span', { class: 'tile-title' }, t.title), el('span', { class: 'tile-sub' }, t.sub)),
      el('span', { class: 'tile-arrow', 'aria-hidden': 'true' }, '›')))),

    el('h2', { class: 'section-title' }, 'Eredmények'),
    el('nav', { class: 'pills' },
      pill('pill-gold', '🗂️', 'Gyűjtemény', `${gold}/${dict.words.length} arany`, 'album'),
      pill('pill-pink', '🏆', 'Trófeák', `${earned}/${BADGES.length}`, 'trophies'),
      pill('pill-blue', p.mascot, 'Avatar', `⭐ ${p.stars}`, 'shop'),
      pill('pill-grey', '⚙️', 'Beállítások', null, 'parent')));
}
