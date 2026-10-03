// Pronunciation: the browser's built-in speech synthesis (Windows ships English voices,
// no internet needed). Voice and speed are set in the parents' corner.

import { state } from './state.js';

let voices = [];
let current = null; // keep a reference, otherwise Chrome may garbage-collect the utterance mid-speech

const supported = () => 'speechSynthesis' in window;
const refresh = () => { voices = supported() ? speechSynthesis.getVoices() : []; return voices; };

export function initSpeech() {
  if (!supported()) return Promise.resolve(false);
  return new Promise(resolve => {
    if (refresh().length) return resolve(true);
    speechSynthesis.addEventListener('voiceschanged', () => { refresh(); resolve(true); }, { once: true });
    setTimeout(() => resolve(refresh().length > 0), 1500);
  });
}

export const englishVoices = () => refresh().filter(v => /^en[-_]/i.test(v.lang));

export function bestVoice() {
  const en = englishVoices();
  const chosen = state.data?.settings?.voice;
  return en.find(v => v.name === chosen)
    || en.find(v => /^en[-_]US/i.test(v.lang) && v.localService)
    || en.find(v => /^en[-_]US/i.test(v.lang))
    || en[0]
    || null;
}

export const hasEnglishVoice = () => englishVoices().length > 0;

export function stopSpeaking() {
  try { if (supported()) speechSynthesis.cancel(); } catch { /* ignore */ }
}

/** Speaks English text. Resolves when finished (or after a safety timeout). */
export function speak(text, { slow = false } = {}) {
  return new Promise(resolve => {
    if (!supported()) return resolve();
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoice();
    u.lang = v ? v.lang : 'en-US';
    if (v) u.voice = v;
    const base = state.data?.settings?.rate ?? 0.85;
    u.rate = slow ? Math.min(base, 0.55) : base;
    u.pitch = 1.05;
    let done = false;
    const timeout = setTimeout(() => finish(), 6000);
    function finish() { if (!done) { done = true; clearTimeout(timeout); resolve(); } }
    u.onend = finish;
    u.onerror = finish;
    current = u;
    try { speechSynthesis.speak(u); } catch { finish(); }
  });
}
