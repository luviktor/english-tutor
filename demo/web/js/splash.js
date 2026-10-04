// Splash screen: a short animation (the school drawn as a wireframe, the title), then a box that
// asks for the access code. runSplash() resolves once a valid code was entered. The look and the
// animation timeline are CSS (section "splash" in style.css); this file builds the DOM, reveals the
// code box when the animation has played (or on a tap / key press) and checks the code.

import { el } from './util.js';
import { sfx } from './sound.js';
import { confetti } from './fx.js';
import { tryLogin } from './auth.js';
import { schoolWireframeSvg } from './school-wireframe.js';

const READY_MS = 3700;   // the code box appears after the title has dropped in
const LEAVE_MS = 700;    // fade-out of the whole splash
const LETTER_COLORS = ['pink', 'orange', 'yellow', 'green', 'blue', 'purple'];
const TITLE = [['English', 'Tutor'], ['for', 'Erkel']];
const SPARKLES = [['✨', 7, 12], ['⭐', 91, 9], ['💫', 3, 56], ['✨', 95, 48], ['🌟', 14, 88], ['✨', 86, 90]];

/** "English Tutor / for Erkel", every letter its own colour and its own drop-in delay. */
function titleNode() {
  let n = 0;
  const lines = TITLE.map(words => el('span', { class: 'sp-line' },
    words.map(word => el('span', { class: `sp-word sp-${word.toLowerCase()}` },
      [...word].map(ch => {
        const i = n++;
        return el('span', { class: 'sp-ch intro', 'aria-hidden': 'true', style: { '--i': i } },
          el('span', { class: 'sp-jig', style: { '--c': `var(--${LETTER_COLORS[i % LETTER_COLORS.length]})` } }, ch));
      })))));
  return el('h1', { class: 'sp-title', 'aria-label': 'English Tutor for Erkel' }, lines);
}

export function runSplash() {
  return new Promise(resolve => {
    let ready = false;
    let done = false;
    let readyTimer = 0;

    // ---- the code box
    const fox = el('div', { class: 'mascot mascot-sm' }, el('span', { class: 'mascot-body' }, '🦊'));
    fox.addEventListener('animationend', () => fox.classList.remove('happy', 'sad'));
    const bubble = el('div', { class: 'bubble', id: 'sp-say', 'aria-live': 'polite' },
      'Szia! Írd be a titkos kódot, és kezdődhet a kaland!');
    const input = el('input', {
      class: 'sp-input', type: 'text', maxlength: 24, placeholder: 'Írd ide…', enterkeyhint: 'go',
      autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
      'aria-label': 'Titkos kód', 'aria-describedby': 'sp-say',
    });
    const stay = el('input', { class: 'sp-stay-box', type: 'checkbox' });
    const enter = el('button', { class: 'btn btn-green btn-big', type: 'submit' }, 'Mehet! 🚀');
    const card = el('form', { class: 'card sp-card', novalidate: true, onsubmit: submit },
      el('div', { class: 'coach sp-coach' }, fox, bubble),
      input,
      el('label', { class: 'sp-stay' }, stay, 'Maradjak belépve'),
      enter);
    stay.addEventListener('change', () => sfx('click'));

    // ---- the whole splash
    const root = el('div', { class: 'splash', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Belépés' },
      el('div', { class: 'sp-sky', 'aria-hidden': 'true' },
        [0, 1, 2, 3].map(i => el('i', { class: 'sp-cloud', style: { '--i': i } })),
        SPARKLES.map(([emoji, x, y], i) => el('span', { class: 'sp-spark', style: { left: x + '%', top: y + '%', '--i': i } }, emoji))),
      // the school, as wide as the window and drawn over the sky; the title and the code box lie on top of it
      el('div', { class: 'sp-wire', html: schoolWireframeSvg() }),
      el('div', { class: 'sp-stage' },
        el('div', { class: 'sp-intro' }, titleNode()),
        el('div', { class: 'sp-login' }, el('div', { class: 'sp-login-in' }, card))));

    // Everything behind the splash is out of reach (tab key, screen readers) until it is gone.
    const behind = [...document.querySelectorAll('#bg, #hud, #app')];
    behind.forEach(n => { n.inert = true; });
    document.body.append(root);

    function reveal({ fast = false } = {}) {
      if (ready) return;
      ready = true;
      clearTimeout(readyTimer);
      root.classList.add('is-ready');
      setTimeout(() => input.focus({ preventScroll: true }), fast ? 60 : 700);
    }

    /** A tap or key press while the animation plays jumps to the end of it. */
    function skip() {
      if (ready) return;
      root.classList.add('is-skipped');
      reveal({ fast: true });
    }

    function react(text, mood) {
      bubble.textContent = text;
      bubble.classList.remove('pop');
      fox.classList.remove('happy', 'sad');
      void bubble.offsetWidth; // restart the animations
      bubble.classList.add('pop');
      fox.classList.add(mood);
    }

    function shake() {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }

    function submit(e) {
      e.preventDefault();
      if (done) return;
      if (!input.value.trim()) {
        react('Írd be a titkos kódot!', 'sad');
        input.focus();
        return;
      }
      if (!tryLogin(input.value, { stay: stay.checked })) {
        sfx('wrong');
        shake();
        react('Hoppá, ez nem jó kód. Próbáld újra!', 'sad');
        input.select();
        return;
      }
      done = true;
      input.disabled = stay.disabled = enter.disabled = true;
      sfx('win');
      confetti({ count: 160, y: 0.55 });
      react('Szuper! Jöhet a kaland! 🎉', 'happy');
      setTimeout(leave, 1200);
    }

    function leave() {
      removeEventListener('keydown', skip);
      behind.forEach(n => { n.inert = false; });
      root.classList.add('is-leaving');
      setTimeout(() => root.remove(), LEAVE_MS);
      resolve();
    }

    root.addEventListener('pointerdown', skip);
    addEventListener('keydown', skip);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    readyTimer = setTimeout(reveal, reduced ? 0 : READY_MS);
  });
}
