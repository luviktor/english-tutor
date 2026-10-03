// Login: pupils (and the teacher) type their password once per device. Not a router screen,
// because main.js passes it a callback.

import { el } from '../util.js';
import * as api from '../api.js';
import { APP_TITLE } from '../strings.js';

/** Fills `app`; calls onLogin({ id, name, role }) after a successful login. */
export function render(app, { onLogin, message = '' }) {
  const input = el('input', {
    class: 'text-input login-input', type: 'password', autocomplete: 'current-password',
    autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Jelszó', placeholder: 'pl. piros-roka-7',
  });
  const toggle = el('button', {
    class: 'btn btn-ghost btn-small', type: 'button',
    onclick: () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? '🙈 Elrejt' : '👁 Mutasd';
      input.focus();
    },
  }, '👁 Mutasd');
  const msg = el('div', { class: `feedback${message ? ' show no' : ''}` }, message);
  const submit = el('button', { class: 'btn btn-big login-submit', type: 'submit' }, 'Belépés');
  const busy = el('div', { class: 'login-busy', hidden: true },
    el('div', { class: 'spinner' }), 'Kapcsolódás… Az első belépés néhány másodpercig is eltarthat.');

  const say = text => { msg.className = 'feedback show no'; msg.textContent = text; };
  const setBusy = on => { submit.disabled = on; input.disabled = on; busy.hidden = !on; };

  async function tryLogin(e) {
    e.preventDefault();
    if (!api.normalizePassword(input.value)) {
      say('Írd be a jelszavadat!');
      input.focus();
      return;
    }
    setBusy(true);
    msg.className = 'feedback';
    try {
      onLogin(await api.login(input.value));
    } catch (err) {
      setBusy(false);
      say(err instanceof api.ApiError && err.status === 401
        ? 'Ez a jelszó nem jó. Nézd meg még egyszer, és próbáld újra!'
        : 'Nem érem el a szervert. Van internet? Próbáld újra egy kicsit később!');
      input.focus();
      input.select();
    }
  }

  app.append(el('form', { class: 'card login-card', onsubmit: tryLogin },
    el('div', { class: 'login-logo', 'aria-hidden': 'true' }, 'Aa'),
    el('h1', { class: 'title' }, APP_TITLE),
    el('p', { class: 'lead' }, 'Írd be a jelszavadat, amit a tanárodtól kaptál.'),
    el('div', { class: 'login-row' }, input, toggle),
    submit, busy, msg));
  input.focus();
}
