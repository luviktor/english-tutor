// "New words!" card sheet shown before a game when some words have never been seen.

import { el, sleep } from './util.js';
import { introduce } from './state.js';
import { visualOrInitial } from './dict.js';
import { speak } from './speech.js';
import { sfx } from './sound.js';
import { coach } from './ui.js';

/** Fills `stage` and resolves when the pupil presses "Kezdjük!". */
export function showPreview(stage, words) {
  return new Promise(resolve => {
    words.forEach(w => introduce(w.key));
    let token = 0;
    const cards = words.map(w => el('button', {
      class: 'pv-card', type: 'button',
      onclick: () => { token++; sfx('pop'); speak(w.english); },
    }, visualOrInitial(w, 'pv-visual'), el('div', { class: 'pv-en' }, w.english), el('div', { class: 'pv-hu' }, w.hu)));

    const playAll = async () => {
      const mine = ++token;
      for (let i = 0; i < words.length; i++) {
        if (mine !== token || !stage.isConnected) return;
        cards[i].classList.add('hl');
        await speak(words[i].english);
        cards[i].classList.remove('hl');
        await sleep(200);
      }
    };

    const c = coach('Ezeket a szavakat még nem ismered. Koppints a kártyákra, és hallgasd meg őket!');
    stage.replaceChildren(
      el('h2', { class: 'screen-title' }, '✨ Új szavak!'),
      el('div', { class: 'pv-grid' }, cards),
      el('div', { class: 'pv-actions' },
        el('button', { class: 'btn btn-blue', type: 'button', onclick: playAll }, '🔊 Mind meghallgatom'),
        el('button', { class: 'btn btn-green btn-big', type: 'button', onclick: () => { token++; resolve(); } }, 'Kezdjük! ▶')),
      c.node);
  });
}
