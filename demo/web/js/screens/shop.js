// Wardrobe: spend stars on a new buddy, hats and glasses.

import { el } from '../util.js';
import { state, spendStars, commit } from '../state.js';
import { SKINS, HATS, FACES } from '../shop-items.js';
import { go } from '../router.js';
import { mascot } from '../ui.js';
import { sfx } from '../sound.js';
import { confetti, toast } from '../fx.js';
import { grantBadges } from '../badges.js';

const SECTIONS = [
  { slot: 'skin', title: '🐾 Új barát', items: SKINS, field: 'mascot' },
  { slot: 'hat', title: '🎩 Kalapok', items: HATS, field: 'hat' },
  { slot: 'face', title: '😎 Szemüvegek', items: FACES, field: 'face' },
];

export function render(app) {
  const root = el('div', { class: 'shop' });
  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('home') }, '◀ Vissza'),
      el('h2', { class: 'screen-title' }, '👒 Öltöző')),
    root);

  const owned = (slot, item) => item.cost === 0 || state.data.shop.owned.includes(`${slot}:${item.id}`);

  function pickItem(sec, item) {
    const p = state.data.player;
    if (owned(sec.slot, item)) {
      if (p[sec.field] === item.id) { if (sec.slot !== 'skin') p[sec.field] = null; }
      else p[sec.field] = item.id;
      sfx('pop');
      commit();
    } else if (spendStars(item.cost)) {
      state.data.shop.owned.push(`${sec.slot}:${item.id}`);
      p[sec.field] = item.id;
      sfx('coin');
      confetti({ count: 100 });
      commit();
      grantBadges().forEach(b => toast(b.emoji, `Új trófea: ${b.name}!`));
    } else {
      sfx('wrong');
      toast('🔒', `Még ${item.cost - p.stars} ⭐ kell hozzá!`);
      return;
    }
    draw();
  }

  function draw() {
    const p = state.data.player;
    root.replaceChildren(
      el('div', { class: 'shop-top card' },
        mascot({ size: 'xl' }),
        el('div', {}, el('div', { class: 'shop-stars' }, `⭐ ${p.stars}`), el('p', {}, 'Itt költheted el a csillagaidat. Koppints egy dologra!'))),
      ...SECTIONS.map(sec => el('section', {},
        el('h3', { class: 'shop-h' }, sec.title),
        el('div', { class: 'shop-grid' }, sec.items.map(item => {
          const have = owned(sec.slot, item);
          const on = p[sec.field] === item.id;
          return el('button', {
            class: `shop-item${on ? ' on' : ''}${have ? '' : ' locked'}${!have && p.stars < item.cost ? ' poor' : ''}`,
            type: 'button', onclick: () => pickItem(sec, item),
          }, el('span', { class: 'shop-emoji' }, item.id), el('span', { class: 'shop-name' }, item.name),
          el('span', { class: 'shop-price' }, on ? '✔ rajtad van' : have ? 'Felveszem' : `⭐ ${item.cost}`));
        })))));
  }

  draw();
}
