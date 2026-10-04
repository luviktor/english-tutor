// Topic picker used by every game.

import { el } from '../util.js';
import { state } from '../state.js';
import { dict, wordsOf, practiceTopics } from '../dict.js';
import { go } from '../router.js';
import { sfx } from '../sound.js';
import { NO_WORDS } from '../strings.js';

const MODES = {
  learn: { title: '📖 Szókártyák – válassz témát', mix: false },
  listen: { title: '🎧 Hallás után – válassz témát', mix: true },
  memory: { title: '🃏 Párkereső – válassz témát', mix: true },
  typing: { title: '⌨️ Gépelés – válassz témát', mix: true },
};

function progress(words) {
  const lv = w => state.data.words[w.key]?.lvl ?? -1;
  const known = words.filter(w => lv(w) >= 3).length;
  const pct = words.length ? words.reduce((s, w) => s + Math.max(0, lv(w)), 0) / (5 * words.length) : 0;
  return { known, pct };
}

function card({ emoji, name, color, words, onClick }) {
  const pr = progress(words);
  return el('button', { class: 'topic-card', type: 'button', style: { '--c': color }, onclick: onClick },
    el('span', { class: 'topic-emoji' }, emoji),
    el('span', { class: 'topic-name' }, name),
    el('span', { class: 'topic-bar' }, el('i', { style: { width: Math.round(pr.pct * 100) + '%' } })),
    el('span', { class: 'topic-count' }, `${pr.known}/${words.length} szót tudsz`));
}

export function render(app, { mode = 'listen' } = {}) {
  const m = MODES[mode] || MODES.listen;
  const open = topic => { sfx('click'); go(mode, { topic }); };
  const cards = practiceTopics().map(t => card({
    emoji: t.emoji, name: t.name, color: t.color, words: wordsOf(t.name), onClick: () => open(t.name),
  }));
  if (m.mix && cards.length > 0) cards.unshift(card({ emoji: '🎲', name: 'Mindenből', color: '#8a5cf6', words: dict.words, onClick: () => open('*') }));
  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('home') }, '◀ Vissza'),
      el('h2', { class: 'screen-title' }, m.title)),
    cards.length > 0 ? el('div', { class: 'topic-grid' }, cards) : el('p', { class: 'empty' }, NO_WORDS));
}
