// The class's dictionary, as the teachers entered it (GET /api/dictionary).

import { getDictionary } from './api.js';
import { el, shuffle } from './util.js';

export const dict = { words: [], topics: [], byKey: new Map(), warnings: [] };

export async function loadDictionary() {
  const d = await getDictionary();
  dict.words = d.words;
  dict.topics = d.topics;
  dict.warnings = d.warnings || [];
  dict.byKey = new Map(d.words.map(w => [w.key, w]));
}

/** '*' means every word. */
export const wordsOf = topic => (topic === '*' ? dict.words : dict.words.filter(w => w.topic === topic));
export const topicInfo = name => dict.topics.find(t => t.name === name);

/** Not every word has a picture: the dictionary leaves `visual` empty, and the games then use text only. */
export const hasPicture = word => word.visual !== '';

/** A small symbol for a toast: the word's emoji, or a stand-in when it has another kind of picture or none. */
export function pictureIcon(word) {
  const v = word.visual;
  return v.startsWith('color:') ? '🎨' : v.startsWith('img:') ? '🖼️' : v || '🔤';
}

/** A tile with the first letter, standing in for a picture that is missing or fails to load. */
const initialTile = (word, extraClass) =>
  el('span', { class: `nopic ${extraClass}`, dataset: { letter: word.english[0].toUpperCase() } });

/**
 * The picture of a word: an emoji, a colour swatch ("color:#ff0000") or an image ("img:cat.png").
 * Returns null when the word has no picture; use visualOrInitial() where a card needs something to show.
 */
export function visual(word, extraClass = '') {
  const v = word.visual;
  if (!v) return null;
  if (v.startsWith('color:')) {
    return el('span', { class: `swatch ${extraClass}`, style: { background: v.slice(6).trim() } });
  }
  if (v.startsWith('img:')) {
    const img = el('img', { class: `pic ${extraClass}`, src: 'img/' + v.slice(4).trim(), alt: '' });
    img.addEventListener('error', () => img.replaceWith(initialTile(word, extraClass)), { once: true });
    return img;
  }
  return el('span', { class: `emoji ${extraClass}` }, v);
}

/** visual(), but a word without a picture gets a neutral tile with its first letter. */
export const visualOrInitial = (word, extraClass = '') => visual(word, extraClass) ?? initialTile(word, extraClass);

/**
 * Wrong answers that look different from the right one; same topic first.
 * With `pictured`, only words that have a picture qualify (for questions where the answers are pictures).
 */
export function distractors(word, n, { pictured = false } = {}) {
  const sameTopic = shuffle(dict.words.filter(w => w.key !== word.key && w.topic === word.topic));
  const others = shuffle(dict.words.filter(w => w.topic !== word.topic));
  const usedVisual = new Set([word.visual]);
  const usedHu = new Set([word.hu]);
  const out = [];
  for (const w of [...sameTopic, ...others]) {
    if (out.length >= n) break;
    if (pictured && !hasPicture(w)) continue;
    // Words without a picture all share the empty visual; they are told apart by their text.
    if ((hasPicture(w) && usedVisual.has(w.visual)) || usedHu.has(w.hu)) continue;
    usedVisual.add(w.visual);
    usedHu.add(w.hu);
    out.push(w);
  }
  return out;
}
