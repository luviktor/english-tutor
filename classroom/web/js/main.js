import { $, el, shuffle } from './util.js';
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

/** Floating emoji in the background. */
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

async function boot() {
  initBackground();
  try {
    await Promise.all([loadState(), loadDictionary(), initSpeech()]);
  } catch (err) {
    console.error(err);
    $('#app').replaceChildren(el('div', { class: 'card error-card' },
      el('div', { class: 'big-emoji' }, '😵'),
      el('h2', {}, 'Hoppá, nem érem el a szervert!'),
      el('p', {}, 'Indítsd el a programot a start.bat fájllal, majd frissítsd az oldalt (F5).')));
    return;
  }
  initHud();
  go('home', {}, { replace: true });
}

boot();
