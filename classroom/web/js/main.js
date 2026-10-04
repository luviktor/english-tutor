import { $, el, shuffle } from './util.js';
import * as api from './api.js';
import { loadState, setReplacedHandler } from './state.js';
import { loadDictionary } from './dict.js';
import { initSpeech } from './speech.js';
import { register, go } from './router.js';
import { initHud } from './hud.js';
import { toast } from './fx.js';
import { setTheme } from './theme.js';
import { runSplash } from './splash.js';

import * as teacher from './screens/teacher.js';
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
const loading = text => el('div', { class: 'loading' }, '🦊 ', text);

/** Floating emoji in the background (the pupils' look; the teachers' stylesheet hides them). */
function initBackground() {
  const items = shuffle(['☁️', '⭐', '🎈', '🌈', '🍭', '✨', '🦋', '🌟', '🪁', '🧁', '☁️', '🎵', '🍀', '🐝']);
  $('#bg').append(...items.map((emoji, i) => el('span', {
    class: 'bg-item',
    style: {
      left: `${(i * 97) % 100}%`,
      top: `${(i * 53 + 11) % 100}%`,
      fontSize: `${28 + ((i * 17) % 40)}px`,
      animationDuration: `${14 + ((i * 7) % 14)}s`,
      animationDelay: `${-(i * 3)}s`,
    },
  }, emoji)));
}

function showError() {
  app.className = 'screen';
  app.replaceChildren(el('div', { class: 'card error-card' },
    el('div', { class: 'big-emoji' }, '📡'),
    el('h2', {}, 'Nem érem el a szervert'),
    el('p', {}, 'Ellenőrizd az internetkapcsolatot, majd próbáld újra.'),
    el('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '🔄 Újra')));
}

/**
 * Loads what the person needs and shows their first screen. `splash` is the login screen, when the person has just
 * logged in: it keeps covering the page while the data loads and fades out when everything is ready.
 */
async function start(identity, splash = null) {
  const isTeacher = identity.role === 'teacher';
  app.className = 'screen';
  app.replaceChildren(loading('Töltés…'));
  try {
    // The teacher needs the speech voices for the 🔊 button of the preview in the dictionary form.
    await Promise.all(isTeacher ? [loadDictionary(), initSpeech()] : [loadState(identity), loadDictionary(), initSpeech()]);
  } catch (err) {
    console.error(err);
    await splash?.leave();
    showError();
    return;
  }
  await splash?.leave();
  if (isTeacher) {
    await splash?.gone; // the teachers' stylesheet would restyle the login screen while it fades out
    setTheme('teacher');
    app.replaceChildren();
    app.className = 'screen screen-teacher';
    teacher.render(app, identity);
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
  initBackground();
  // The stored password stopped working (e.g. the teacher changed it): back to the login screen.
  api.setUnauthorizedHandler(() => { api.forgetPassword(); location.reload(); });
  let identity = null;
  let message = '';
  if (api.hasPassword()) {
    app.replaceChildren(loading('Kapcsolódás…'));
    try {
      identity = await api.whoAmI();
    } catch (err) {
      if (!(err instanceof api.ApiError && err.status === 401)) {
        showError();
        return;
      }
      api.forgetPassword();
      message = 'A jelszavad megváltozott. Kérd el az újat a tanárodtól!';
    }
  }
  if (identity) {
    await start(identity);
    return;
  }
  const splash = await runSplash({ message });
  await start(splash.identity, splash);
}

boot();
