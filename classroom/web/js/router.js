// Minimal screen router. Each screen is a function (container, params) that fills the container
// and may return a cleanup function. The browser's back button works through the History API.

import { $ } from './util.js';
import { stopSpeaking } from './speech.js';

const registry = {};
const screenListeners = new Set();
let cleanup = null;
let currentName = null;

export const register = (name, fn) => { registry[name] = fn; };
export const currentScreen = () => currentName;
export const onScreen = fn => screenListeners.add(fn);

export function go(name, params = {}, { replace = false, fromPop = false } = {}) {
  if (cleanup) {
    try { cleanup(); } catch (e) { console.error(e); }
    cleanup = null;
  }
  stopSpeaking();
  const app = $('#app');
  app.replaceChildren();
  app.className = `screen screen-${name}`;
  currentName = name;
  if (!fromPop) {
    const entry = { name, params };
    if (replace) history.replaceState(entry, '');
    else history.pushState(entry, '');
  }
  const result = registry[name](app, params);
  cleanup = typeof result === 'function' ? result : null;
  window.scrollTo(0, 0);
  screenListeners.forEach(fn => fn(name));
}

addEventListener('popstate', e => {
  if (!currentName) return; // still on the login screen: entries from before a logout
  const s = e.state;
  if (s && registry[s.name]) go(s.name, s.params || {}, { fromPop: true });
  else go('home', {}, { replace: true });
});
