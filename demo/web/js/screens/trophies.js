import { el } from '../util.js';
import { state } from '../state.js';
import { BADGES } from '../badges.js';
import { go } from '../router.js';

export function render(app) {
  const got = state.data.badges;
  const count = BADGES.filter(b => got[b.id]).length;
  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('home') }, '◀ Vissza'),
      el('h2', { class: 'screen-title' }, '🏆 Trófeák')),
    el('p', { class: 'lead' }, `${count} / ${BADGES.length} trófeát szereztél meg.`),
    el('div', { class: 'badge-grid' }, BADGES.map(b => el('div', { class: `badge${got[b.id] ? ' earned' : ''}` },
      el('div', { class: 'badge-emoji' }, got[b.id] ? b.emoji : '🔒'),
      el('div', { class: 'badge-name' }, b.name),
      el('div', { class: 'badge-desc' }, b.desc),
      got[b.id] && el('div', { class: 'badge-date' }, got[b.id])))));
}
