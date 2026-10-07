// The login screen, in the demo's splash design: a short animation (the school drawn as a wireframe, the
// title), then a box that asks for the password. The look and the animation timeline are CSS (section "splash"
// in style.css); this file builds the DOM, reveals the box when the animation has played (or on a tap / key
// press) and logs in. Not a router screen: it is an overlay on top of the page.

import { el, sleep } from './util.js';
import * as api from './api.js';
import { sfx } from './sound.js';
import { confetti } from './fx.js';
import { schoolWireframeSvg } from './school-wireframe.js';

const READY_MS = 3700;     // the password box appears after the title has dropped in
const CHEER_MS = 1200;     // how long the fox cheers after a login before the splash may leave
const LEAVE_MS = 700;      // fade-out of the whole splash
const LETTER_COLORS = ['pink', 'orange', 'yellow', 'green', 'blue', 'purple'];
const TITLE = [['English', 'Tutor'], ['for', 'Erkel']];
const SPARKLES = [['✨', 7, 12], ['⭐', 91, 9], ['💫', 3, 56], ['✨', 95, 48], ['🌟', 14, 88], ['✨', 86, 90]];
const HELLO = 'Szia! Írd be a jelszavadat, amit a tanárodtól kaptál, és kezdődhet a kaland!';

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

/**
 * Shows the login screen; `message` is what the fox says first instead of the greeting (e.g. "your password changed").
 * Resolves once a password was accepted, with:
 *  - identity: what POST /api/login returned ({ id, name, role }),
 *  - leave(): lets the splash go once the fox has cheered long enough; resolves when it starts to fade out,
 *  - gone: resolves when the splash has left the page.
 * The splash stays on screen until leave() is called, so the caller can load what the person needs behind it.
 */
export function runSplash({ message = '' } = {}) {
  return new Promise(resolve => {
    let ready = false;
    let busy = false;
    let readyTimer = 0;
    let leaving = null;
    let cheerUntil = 0;
    let goneResolve;
    const gone = new Promise(r => { goneResolve = r; });

    // ---- the password box
    const fox = el('div', { class: 'mascot mascot-sm' }, el('span', { class: 'mascot-body' }, '🦊'));
    fox.addEventListener('animationend', () => fox.classList.remove('happy', 'sad'));
    const bubble = el('div', { class: 'bubble', id: 'sp-say', 'aria-live': 'polite' }, message || HELLO);
    const input = el('input', {
      class: 'sp-input', type: 'password', placeholder: 'Írd ide…', enterkeyhint: 'go',
      autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
      'aria-label': 'Jelszó', 'aria-describedby': 'sp-say',
    });
    const toggle = el('button', {
      class: 'btn btn-ghost btn-small sp-toggle', type: 'button',
      onclick: () => {
        const hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        toggle.textContent = hidden ? '🙈 Elrejt' : '👁 Mutasd';
        input.focus();
      },
    }, '👁 Mutasd');
    const enter = el('button', { class: 'btn btn-green btn-big', type: 'submit' }, 'Mehet! 🚀');
    const card = el('form', { class: 'card sp-card', novalidate: true, onsubmit: submit },
      el('div', { class: 'coach sp-coach' }, fox, bubble),
      el('div', { class: 'sp-row' }, input, toggle),
      enter);

    // ---- the version, faint at the bottom; it appears when the API has answered (which also wakes the API up)
    const version = el('div', { class: 'sp-version' });
    api.getVersion().then(v => { if (v) version.textContent = `v${v}`; });

    // ---- the whole splash
    const root = el('div', { class: 'splash', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Belépés' },
      el('div', { class: 'sp-sky', 'aria-hidden': 'true' },
        [0, 1, 2, 3].map(i => el('i', { class: 'sp-cloud', style: { '--i': i } })),
        SPARKLES.map(([emoji, x, y], i) => el('span', { class: 'sp-spark', style: { left: x + '%', top: y + '%', '--i': i } }, emoji))),
      // the school, as wide as the window and drawn over the sky; the title and the password box lie on top of it
      el('div', { class: 'sp-wire', html: schoolWireframeSvg() }),
      version,
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

    function react(text, mood = '') {
      bubble.textContent = text;
      bubble.classList.remove('pop');
      fox.classList.remove('happy', 'sad');
      void bubble.offsetWidth; // restart the animations
      bubble.classList.add('pop');
      if (mood) fox.classList.add(mood);
    }

    function shake() {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }

    function setBusy(on) {
      busy = on;
      input.disabled = toggle.disabled = enter.disabled = on;
    }

    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      if (!api.normalizePassword(input.value)) {
        react('Írd be a jelszavadat!', 'sad');
        input.focus();
        return;
      }
      setBusy(true);
      react('Kapcsolódás… Az első belépés néhány másodpercig is eltarthat.');
      let identity;
      try {
        identity = await api.login(input.value);
      } catch (err) {
        setBusy(false);
        sfx('wrong');
        shake();
        react(err instanceof api.ApiError && err.status === 401
          ? 'Hoppá, ez a jelszó nem jó. Nézd meg még egyszer, és próbáld újra!'
          : 'Nem érem el a szervert. Van internet? Próbáld újra egy kicsit később!', 'sad');
        input.focus();
        input.select();
        return;
      }
      card.classList.add('is-done');
      sfx('win');
      confetti({ count: 160, y: 0.55 });
      react('Szuper! Jöhet a kaland! 🎉', 'happy');
      cheerUntil = Date.now() + CHEER_MS;
      resolve({ identity, leave, gone });
    }

    function leave() {
      leaving ??= (async () => {
        await sleep(Math.max(0, cheerUntil - Date.now()));
        removeEventListener('keydown', skip);
        behind.forEach(n => { n.inert = false; });
        root.classList.add('is-leaving');
        setTimeout(() => { root.remove(); goneResolve(); }, LEAVE_MS);
      })();
      return leaving;
    }

    root.addEventListener('pointerdown', skip);
    addEventListener('keydown', skip);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    readyTimer = setTimeout(reveal, reduced ? 0 : READY_MS);
  });
}
