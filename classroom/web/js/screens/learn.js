// Flashcards: look, listen, say it out loud.

import { el } from '../util.js';
import { state, wordRec, introduce, addXP, touchStreak, commit } from '../state.js';
import { wordsOf, topicInfo, visualOrInitial, noteLine } from '../dict.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { sfx } from '../sound.js';
import { speakerBtn, coach } from '../ui.js';
import { confetti } from '../fx.js';

export function render(app, { topic }) {
  const words = wordsOf(topic);
  const info = topicInfo(topic);
  let i = Math.max(0, words.findIndex(w => !wordRec(w.key)));
  let alive = true;
  let newCount = 0;
  const stage = el('div', { class: 'learn' });

  const onKey = e => {
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  };
  document.addEventListener('keydown', onKey);

  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('topics', { mode: 'learn' }) }, '◀ Témák'),
      el('h2', { class: 'screen-title' }, `${info?.emoji || ''} ${topic}`)),
    stage);

  function show() {
    const w = words[i];
    if (introduce(w.key)) { newCount++; addXP(2); touchStreak(); commit(); }
    const c = coach('Mondd ki hangosan te is!');
    stage.replaceChildren(
      el('div', { class: 'learn-card pop' },
        visualOrInitial(w, 'learn-visual'),
        el('div', { class: 'learn-en' }, w.english),
        el('div', { class: 'learn-hu' }, w.hu),
        noteLine(w, 'learn-note'),
        el('div', { class: 'learn-tools' }, speakerBtn(w.english, { big: true }), speakerBtn(w.english, { slow: true, big: true }))),
      el('div', { class: 'learn-nav' },
        el('button', { class: 'btn btn-blue', type: 'button', onclick: prev, disabled: i === 0 }, '◀'),
        el('div', { class: 'dots' }, words.map((_, k) => el('i', { class: k === i ? 'on' : k < i ? 'done' : '' }))),
        el('button', { class: 'btn btn-green', type: 'button', onclick: next }, i === words.length - 1 ? 'Kész ✔' : '▶')),
      c.node);
    setTimeout(() => { if (alive) speak(w.english); }, 250);
  }

  function prev() { if (i > 0) { i--; sfx('click'); show(); } }
  function next() {
    sfx('click');
    if (i < words.length - 1) { i++; show(); } else finish();
  }

  function finish() {
    sfx('win');
    confetti({ count: 120 });
    const c = coach(`Szép munka, ${state.data.player.name}! Most gyakorold a szavakat egy játékban.`);
    const play = (icon, label, screen, cls) => el('button', {
      class: `btn btn-big ${cls}`, type: 'button', onclick: () => go(screen, { topic }, { replace: false }),
    }, `${icon} ${label}`);
    stage.replaceChildren(
      el('div', { class: 'learn-card done pop' },
        el('div', { class: 'learn-done-emoji' }, '🎉'),
        el('div', { class: 'learn-en' }, 'Kész!'),
        el('div', { class: 'learn-hu' }, newCount ? `${newCount} új szót ismertél meg.` : 'Mehet a játék!')),
      el('div', { class: 'learn-play' },
        play('🎧', 'Hallás után', 'listen', 'btn-blue'),
        play('🃏', 'Párkereső', 'memory', 'btn-pink'),
        play('⌨️', 'Gépelés', 'typing', 'btn-green')),
      c.node);
  }

  show();
  return () => { alive = false; document.removeEventListener('keydown', onKey); };
}
