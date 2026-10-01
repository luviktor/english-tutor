// The dictionary as the server parsed it from data/dictionary.csv.

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

/** The picture of a word: an emoji, a colour swatch ("color:#ff0000") or an image ("img:cat.png"). */
export function visual(word, extraClass = '') {
  const v = word.visual;
  if (v.startsWith('color:')) {
    return el('span', { class: `swatch ${extraClass}`, style: { background: v.slice(6).trim() } });
  }
  if (v.startsWith('img:')) {
    return el('img', { class: `pic ${extraClass}`, src: '/img/' + v.slice(4).trim(), alt: '' });
  }
  return el('span', { class: `emoji ${extraClass}` }, v);
}

/** Wrong answers that look different from the right one; same topic first. */
export function distractors(word, n) {
  const sameTopic = shuffle(dict.words.filter(w => w.key !== word.key && w.topic === word.topic));
  const others = shuffle(dict.words.filter(w => w.topic !== word.topic));
  const usedVisual = new Set([word.visual]);
  const usedHu = new Set([word.hu]);
  const out = [];
  for (const w of [...sameTopic, ...others]) {
    if (out.length >= n) break;
    if (usedVisual.has(w.visual) || usedHu.has(w.hu)) continue;
    usedVisual.add(w.visual);
    usedHu.add(w.hu);
    out.push(w);
  }
  return out;
}
