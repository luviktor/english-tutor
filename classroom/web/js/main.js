import { $, el } from './util.js';
import { loadState } from './state.js';
import { loadDictionary } from './dict.js';
import { initSpeech } from './speech.js';
import { register, go } from './router.js';
import { initHud } from './hud.js';

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

async function boot() {
  try {
    await Promise.all([loadState(), loadDictionary(), initSpeech()]);
  } catch (err) {
    console.error(err);
    $('#app').replaceChildren(el('div', { class: 'card error-card' },
      el('div', { class: 'big-emoji' }, '😵'),
      el('h2', {}, 'Hoppá, nem érem el a szervert!'),
      el('p', {}, 'Ellenőrizd az internetkapcsolatot, majd frissítsd az oldalt (F5).')));
    return;
  }
  initHud();
  go('home', {}, { replace: true });
}

boot();
