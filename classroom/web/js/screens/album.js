// Word-card collection: every word is a card that gets more colourful as the pupil learns it, up to gold.

import { el } from '../util.js';
import { state } from '../state.js';
import { dict, wordsOf, practiceTopics, visualOrInitial, pictureIcon } from '../dict.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { sfx } from '../sound.js';
import { toast } from '../fx.js';

const stage = lvl => (lvl < 0 ? 'locked' : lvl <= 2 ? 'learning' : lvl <= 4 ? 'good' : 'gold');

export function render(app) {
  const lv = w => state.data.words[w.key]?.lvl ?? -1;
  const gold = dict.words.filter(w => lv(w) >= 5).length;

  const sections = practiceTopics().map(t => {
    const ws = wordsOf(t.name);
    const goldHere = ws.filter(w => lv(w) >= 5).length;
    return el('section', { class: 'album-topic', style: { '--c': t.color } },
      el('h3', {}, `${t.emoji} ${t.name}`, el('small', {}, `${goldHere}/${ws.length} 🥇`)),
      el('div', { class: 'sticker-grid' }, ws.map(w => {
        const st = stage(lv(w));
        return el('button', {
          class: `sticker ${st}`, type: 'button',
          onclick: () => {
            if (st === 'locked') { toast('❔', 'Ezt a szót még nem ismered. Tanuld meg!'); return; }
            sfx('pop'); speak(w.english); toast(pictureIcon(w), `${w.english} = ${w.hu}`, { ms: 2200 });
          },
        }, st === 'locked' ? el('span', { class: 'emoji' }, '❔') : visualOrInitial(w, 'st-visual'),
        el('span', { class: 'st-word' }, st === 'locked' ? '???' : w.english));
      })));
  });

  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('home') }, '◀ Vissza'),
      el('h2', { class: 'screen-title' }, '🗂️ Gyűjtemény')),
    el('p', { class: 'lead' }, `Arany kártyák: ${gold} / ${dict.words.length}. Ha egy szót több napon is jól tudsz, a kártyája aranyra vált.`),
    el('div', { class: 'legend' },
      el('span', { class: 'sticker locked mini' }, '❔ új'),
      el('span', { class: 'sticker learning mini' }, '🌱 tanulom'),
      el('span', { class: 'sticker good mini' }, '👍 tudom'),
      el('span', { class: 'sticker gold mini' }, '🥇 arany')),
    ...sections);
}
