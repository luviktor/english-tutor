// End-of-round summary.

import { el } from '../util.js';
import { state } from '../state.js';
import { dict } from '../dict.js';
import { BADGES } from '../badges.js';
import { LEVELS, levelInfo } from '../levels.js';
import { go } from '../router.js';
import { sfx } from '../sound.js';
import { confetti } from '../fx.js';
import { mascot, speakerBtn } from '../ui.js';
import { finishLine } from '../strings.js';

const TITLES = { 3: 'Kiváló!', 2: 'Szép munka!', 1: 'Jó kezdés!' };

export function render(app, s) {
  if (!s || !s.game) { go('home', {}, { replace: true }); return; }
  const levelUp = s.levelAfter > s.levelBefore;
  const li = levelInfo(state.data.player.xp);
  const badges = s.newBadges.map(id => BADGES.find(b => b.id === id)).filter(Boolean);
  const stickers = s.mastered.map(k => dict.byKey.get(k)).filter(Boolean);

  const starsRow = el('div', { class: 'big-stars' }, [1, 2, 3].map(n =>
    el('span', { class: `big-star${n <= s.rating ? ' on' : ''}`, style: { '--d': `${0.25 + n * 0.3}s` } }, '⭐')));

  const wordChips = s.answers.map(a => {
    const w = dict.byKey.get(a.key);
    if (!w) return null;
    const mark = { right: '✅', half: '🟡', wrong: '❌' }[a.outcome];
    return el('div', { class: `rword ${a.outcome}` }, el('span', {}, mark), el('b', {}, w.english), el('span', { class: 'rhu' }, w.hu), speakerBtn(w.english));
  });

  app.append(
    el('section', { class: 'results card pop' },
      mascot({ size: 'lg' }),
      el('h2', { class: 'title' }, TITLES[s.rating]),
      starsRow,
      el('p', { class: 'result-line' }, finishLine(s.rating)),
      el('div', { class: 'result-stats' },
        el('div', { class: 'stat' }, el('span', {}, '🎯'), el('b', {}, `${s.right}/${s.total}`), el('small', {}, 'hibátlan')),
        el('div', { class: 'stat' }, el('span', {}, '✨'), el('b', {}, `+${s.xp}`), el('small', {}, 'XP')),
        el('div', { class: 'stat' }, el('span', {}, '⭐'), el('b', {}, `+${s.stars}`), el('small', {}, 'csillag'))),
      s.perfect && el('div', { class: 'banner gold' }, '💯 Hibátlan kör! +30 XP és +3 ⭐ bónusz'),
      s.goal && el('div', { class: 'banner pink' }, `🎁 Napi cél teljesítve! +${s.goal.xp} XP és +${s.goal.stars} ⭐`),
      levelUp && el('div', { class: 'banner purple' }, `${LEVELS[Math.min(li.level, LEVELS.length) - 1].emoji} Szintet léptél! Most ${li.level}. szint: ${li.title}`),
      stickers.length > 0 && el('div', { class: 'result-block' },
        el('h3', {}, '🥇 Új arany kártya!'),
        el('div', { class: 'row-wrap' }, stickers.map(w => el('span', { class: 'chip-sticker' }, w.english)))),
      badges.length > 0 && el('div', { class: 'result-block' },
        el('h3', {}, '🏆 Új trófea!'),
        el('div', { class: 'row-wrap' }, badges.map(b => el('div', { class: 'mini-badge' }, el('span', {}, b.emoji), el('div', {}, el('b', {}, b.name), el('small', {}, b.desc)))))),
      el('div', { class: 'result-block' }, el('h3', {}, 'A szavak'), el('div', { class: 'rwords' }, wordChips)),
      el('div', { class: 'result-actions' },
        el('button', { class: 'btn btn-green btn-big', type: 'button', onclick: () => go(s.game, { topic: s.topic }, { replace: true }) }, '🔁 Még egyszer'),
        el('button', { class: 'btn btn-blue', type: 'button', onclick: () => go('topics', { mode: s.game }) }, '📚 Másik téma'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go('home') }, '🏠 Főoldal'))));

  if (levelUp) { sfx('levelup'); confetti({ count: 220, power: 1.2 }); }
  else if (s.rating >= 2) { sfx('win'); confetti({ count: 140 }); }
  else sfx('correct');
}
