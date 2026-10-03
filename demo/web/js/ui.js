// Reusable UI pieces: mascot, speech bubble coach, speaker button, dialogs, game bar.

import { el } from './util.js';
import { state } from './state.js';
import { speak } from './speech.js';
import { sfx } from './sound.js';

/** The fox (or whatever skin was bought) with its hat and glasses. */
export function mascot({ size = 'md' } = {}) {
  const p = state.data.player;
  return el('div', { class: `mascot mascot-${size}` },
    el('span', { class: 'mascot-body' }, p.mascot),
    p.hat && el('span', { class: 'mascot-hat' }, p.hat),
    p.face && el('span', { class: 'mascot-face' }, p.face));
}

/** Mascot + speech bubble. say(text, 'happy'|'sad') changes what it says. */
export function coach(text = '') {
  const m = mascot({ size: 'sm' });
  const bubble = el('div', { class: 'bubble' }, text);
  const node = el('div', { class: 'coach' }, m, bubble);
  return {
    node,
    say(t, mood = '') {
      bubble.textContent = t;
      bubble.classList.remove('pop');
      m.classList.remove('happy', 'sad');
      void bubble.offsetWidth; // restart the animations
      bubble.classList.add('pop');
      if (mood) m.classList.add(mood);
    },
  };
}

export function speakerBtn(text, { slow = false, big = false } = {}) {
  const b = el('button', {
    class: `btn-speak${slow ? ' slow' : ''}${big ? ' big' : ''}`,
    type: 'button',
    'aria-label': slow ? 'Lassan' : 'Meghallgatom',
    title: slow ? 'Lassan' : 'Meghallgatom',
    onclick: () => {
      sfx('click');
      b.classList.add('speaking');
      speak(text, { slow }).then(() => b.classList.remove('speaking'));
    },
  }, slow ? '🐢' : '🔊');
  return b;
}

export function confirmDialog(message, { yes = 'Igen', no = 'Mégse', icon = '🤔' } = {}) {
  return new Promise(resolve => {
    const done = v => { back.remove(); resolve(v); };
    const back = el('div', { class: 'modal-back' },
      el('div', { class: 'modal' },
        el('div', { class: 'modal-icon' }, icon),
        el('p', {}, message),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => done(false) }, no),
          el('button', { class: 'btn btn-green', type: 'button', onclick: () => done(true) }, yes))));
    document.body.append(back);
  });
}

export const modalOpen = () => !!document.querySelector('.modal-back');

/** Top strip of a game: exit button, title, progress bar, combo and counter. */
export function gameBar({ title, onExit }) {
  const fill = el('i');
  const combo = el('div', { class: 'combo' });
  const count = el('div', { class: 'game-count' });
  const node = el('div', { class: 'game-bar' },
    el('button', { class: 'btn btn-small btn-ghost', type: 'button', 'aria-label': 'Kilépés', title: 'Kilépés', onclick: onExit }, '✖'),
    el('div', { class: 'game-title' }, title),
    el('div', { class: 'bar' }, fill),
    combo,
    count);
  return {
    node,
    set(done, total, comboN = 0) {
      fill.style.width = (total ? (done / total) * 100 : 0) + '%';
      count.textContent = `${Math.min(done + 1, total)}/${total}`;
      combo.textContent = comboN >= 2 ? `🔥 ${comboN}` : '';
      combo.classList.toggle('on', comboN >= 2);
    },
  };
}
