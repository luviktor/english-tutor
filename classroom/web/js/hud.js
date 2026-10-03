// The strip at the top of every screen: home button, level, streak and stars.

import { el, $ } from './util.js';
import { state, onChange, streakNow } from './state.js';
import { levelInfo } from './levels.js';
import { go, onScreen } from './router.js';

let refs = null;
let last = { stars: null, streak: null, level: null };

export function initHud() {
  const hud = $('#hud');
  refs = {
    home: el('button', { class: 'hud-home', type: 'button', 'aria-label': 'Főoldal', title: 'Főoldal', onclick: () => go('home') }, '🏠'),
    lvEmoji: el('span', { class: 'lv-emoji' }),
    lvText: el('span', { class: 'lv-text' }),
    lvFill: el('i'),
    streak: el('b'),
    stars: el('b'),
    warn: el('span', { class: 'save-warn', title: 'Nem sikerült menteni! Fut még a program?', hidden: true }, '💾❗'),
  };
  const level = el('div', { class: 'chip chip-level' }, refs.lvEmoji, refs.lvText, el('div', { class: 'mini-bar' }, refs.lvFill));
  refs.levelChip = level;
  refs.streakChip = el('div', { class: 'chip chip-streak', title: 'Napok egymás után' }, '🔥 ', refs.streak);
  refs.starChip = el('div', { class: 'chip chip-stars', title: 'Csillagok' }, '⭐ ', refs.stars);
  hud.replaceChildren(
    refs.home,
    el('div', { class: 'hud-title' }, 'Nóra angol kalandja'),
    el('div', { class: 'hud-chips' }, refs.warn, level, refs.streakChip, refs.starChip));
  onChange(update);
  onScreen(name => { refs.home.classList.toggle('hidden', name === 'home'); });
  update();
}

function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function update() {
  if (!refs || !state.data) return;
  const li = levelInfo(state.data.player.xp);
  const streak = streakNow();
  const stars = state.data.player.stars;
  refs.lvEmoji.textContent = li.emoji;
  refs.lvText.textContent = `${li.level}. szint`;
  refs.lvFill.style.width = Math.round(li.pct * 100) + '%';
  refs.streak.textContent = streak;
  refs.stars.textContent = stars;
  refs.warn.hidden = !state.saveError;
  if (last.stars !== null && stars > last.stars) bump(refs.starChip);
  if (last.streak !== null && streak > last.streak) bump(refs.streakChip);
  if (last.level !== null && li.level > last.level) bump(refs.levelChip);
  last = { stars, streak, level: li.level };
}
