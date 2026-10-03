import { $, el } from './util.js';
import * as api from './api.js';
import { loadState, setReplacedHandler } from './state.js';
import { loadDictionary } from './dict.js';
import { initSpeech } from './speech.js';
import { register, go } from './router.js';
import { initHud } from './hud.js';
import { toast } from './fx.js';

import * as login from './screens/login.js';
import * as home from './screens/home.js';
import * as topics from './screens/topics.js';
import * as learn from './screens/learn.js';
import * as listen from './screens/listen.js';
import * as memory from './screens/memory.js';
import * as typing from './screens/typing.js';
import * as results from './screens/results.js';
import * as album from './screens/album.js';
import * as trophies from './screens/trophies.js';
import * as shop from './screens/shop.js';
import * as parent from './screens/parent.js';

const SCREENS = { home, topics, learn, listen, memory, typing, results, album, trophies, shop, parent };
for (const [name, mod] of Object.entries(SCREENS)) register(name, mod.render);

const app = $('#app');
const loading = text => el('div', { class: 'loading' }, el('div', { class: 'spinner' }), text);

function showLogin(message = '') {
  app.replaceChildren();
  app.className = 'screen screen-login';
  login.render(app, { message, onLogin: start });
}

function showError() {
  app.className = 'screen';
  app.replaceChildren(el('div', { class: 'card error-card' },
    el('div', { class: 'big-emoji' }, '📡'),
    el('h2', {}, 'Nem érem el a szervert'),
    el('p', {}, 'Ellenőrizd az internetkapcsolatot, majd próbáld újra.'),
    el('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '🔄 Újra')));
}

async function start(identity) {
  app.className = 'screen';
  app.replaceChildren(loading('Töltés…'));
  if (identity.role !== 'pupil') {
    app.replaceChildren(el('div', { class: 'card error-card' },
      el('div', { class: 'big-emoji' }, '🧑‍🏫'),
      el('h2', {}, 'Tanári belépés'),
      el('p', {}, 'Az osztály áttekintése hamarosan itt lesz.')));
    return;
  }
  try {
    await Promise.all([loadState(identity), loadDictionary(), initSpeech()]);
  } catch (err) {
    console.error(err);
    showError();
    return;
  }
  setReplacedHandler(() => {
    toast('🔄', 'Másik eszközön is játszottál, betöltöttem a legfrissebb állást.', { ms: 5000 });
    go('home', {}, { replace: true });
  });
  initHud();
  go('home', {}, { replace: true });
}

async function boot() {
  // The stored password stopped working (e.g. the teacher changed it): back to the login screen.
  api.setUnauthorizedHandler(() => { api.forgetPassword(); location.reload(); });
  if (!api.hasPassword()) {
    showLogin();
    return;
  }
  app.replaceChildren(loading('Kapcsolódás…'));
  let identity;
  try {
    identity = await api.whoAmI();
  } catch (err) {
    if (err instanceof api.ApiError && err.status === 401) {
      api.forgetPassword();
      showLogin('A jelszavad megváltozott. Kérd el az újat a tanárodtól!');
    } else {
      showError();
    }
    return;
  }
  start(identity);
}

boot();
