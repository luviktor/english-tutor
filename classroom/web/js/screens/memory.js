// Game 2 - "Párkereső": flip cards and match each picture with its English word.

import { el, shuffle, sleep } from '../util.js';
import { wordRec } from '../state.js';
import { wordsOf, visual } from '../dict.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { sfx } from '../sound.js';
import { startSession, pickWords } from '../session.js';
import { showPreview } from '../preview.js';
import { gameBar, coach, confirmDialog } from '../ui.js';
import { celebrate } from '../rewards.js';
import { praise } from '../strings.js';

export function render(app, { topic }) {
  let alive = true;
  const session = startSession('memory', topic);
  const pool = wordsOf(topic);
  const avgLvl = pool.length ? pool.reduce((s, w) => s + Math.max(0, wordRec(w.key)?.lvl ?? 0), 0) / pool.length : 0;
  const pairs = pool.length >= 8 && avgLvl >= 2 ? 8 : Math.min(6, pool.length);
  const words = pickWords(topic, pairs);
  const stage = el('div', { class: 'stage' });
  const bar = gameBar({
    title: '🃏 Párkereső',
    onExit: async () => { if (await confirmDialog('Kilépsz a játékból?', { icon: '🚪', yes: 'Kilépek', no: 'Maradok' })) go('home'); },
  });
  app.append(bar.node, stage);

  async function run() {
    if (words.length < 2) { stage.append(el('p', { class: 'empty' }, 'Ehhez a témához kevés a szó.')); return; }
    const fresh = words.filter(w => !wordRec(w.key));
    if (fresh.length) { await showPreview(stage, fresh); if (!alive) return; }
    play();
  }

  function play() {
    const n = words.length;
    const cards = shuffle(words.flatMap(w => [
      { word: w, type: 'pic', open: false, matched: false },
      { word: w, type: 'word', open: false, matched: false },
    ]));
    const misses = {};
    let moves = 0;
    let matched = 0;
    let opened = [];
    let busy = false;

    const c = coach('Fordíts fel két kártyát: egy képet és a hozzá tartozó szót!');
    const counter = el('div', { class: 'moves' }, '👣 Lépések: 0');
    const cols = n * 2 === 12 || n * 2 === 16 ? 4 : n * 2 <= 6 ? 3 : n * 2 === 8 ? 4 : 5;
    const els = cards.map(card => {
      const front = el('div', { class: 'mface mfront' },
        card.type === 'pic'
          ? visual(card.word, 'mc-visual')
          : [el('div', { class: 'mc-word' }, card.word.english), el('div', { class: 'mc-hu' }, card.word.hu)]);
      const node = el('button', { class: 'mcard', type: 'button', 'aria-label': 'Kártya', onclick: () => flip(card) },
        el('div', { class: 'mcard-inner' }, el('div', { class: 'mface mback' }, '?'), front));
      card.node = node;
      return node;
    });
    stage.replaceChildren(
      el('div', { class: 'memory-grid', style: { '--cols': cols } }, els),
      counter, c.node);
    bar.set(0, n, 0);

    function flip(card) {
      if (busy || card.open || card.matched) return;
      card.open = true;
      card.node.classList.add('open');
      sfx('flip');
      if (card.type === 'word') speak(card.word.english);
      opened.push(card);
      if (opened.length === 2) check();
    }

    async function check() {
      busy = true;
      moves++;
      counter.textContent = `👣 Lépések: ${moves}`;
      const [a, b] = opened;
      opened = [];
      if (a.word.key === b.word.key) {
        await sleep(350);
        a.matched = b.matched = true;
        a.node.classList.add('matched');
        b.node.classList.add('matched');
        const wc = a.type === 'word' ? a : b;
        wc.node.classList.add('show-hu');
        sfx('match');
        const miss = misses[a.word.key] || 0;
        const r = session.answer(a.word, miss === 0 ? 'right' : miss <= 3 ? 'half' : 'wrong');
        celebrate(r, a.word, a.node);
        c.say(praise(), 'happy');
        matched++;
        bar.set(matched, n, session.combo);
        speak(a.word.english);
        if (matched === n) { await sleep(1300); finish(); return; }
        busy = false;
      } else {
        misses[a.word.key] = (misses[a.word.key] || 0) + 1;
        misses[b.word.key] = (misses[b.word.key] || 0) + 1;
        c.say('Nem pár. Jegyezd meg, hol vannak!', 'sad');
        await sleep(1000);
        if (!alive) return;
        a.open = b.open = false;
        a.node.classList.remove('open');
        b.node.classList.remove('open');
        busy = false;
      }
    }

    function finish() {
      if (!alive) return;
      const rating = moves <= n + Math.ceil(n * 0.6) ? 3 : moves <= n * 2 ? 2 : 1;
      go('results', session.finish({ rating, memoryPerfect: moves <= n + 2 }), { replace: true });
    }
  }

  run();
  return () => { alive = false; };
}
