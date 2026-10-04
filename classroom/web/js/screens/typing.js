// Game 3 - "Írd be!": see the picture and the Hungarian word, hear the English one, type it.
//
// Scaffolding by word level: new words start with the first letter filled in; words she knows
// well are not read out automatically. A wrong try keeps the right (green) letters.
// After 3 failed tries the answer is shown and she types it once to remember it.

import { el, sleep, lettersOnly } from '../util.js';
import { wordRec } from '../state.js';
import { visual, noteLine } from '../dict.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { sfx } from '../sound.js';
import { startSession, pickWords } from '../session.js';
import { showPreview } from '../preview.js';
import { gameBar, coach, speakerBtn, confirmDialog, modalOpen } from '../ui.js';
import { celebrate } from '../rewards.js';
import { praise, oops } from '../strings.js';

const ROUND = 8;
const MAX_TRIES = 3;

export function render(app, { topic }) {
  let alive = true;
  let question = null; // handlers of the question currently on screen
  const session = startSession('typing', topic);
  const words = pickWords(topic, ROUND, 3);
  const stage = el('div', { class: 'stage' });
  const bar = gameBar({
    title: '⌨️ Gépelés',
    onExit: async () => { if (await confirmDialog('Kilépsz a játékból?', { icon: '🚪', yes: 'Kilépek', no: 'Maradok' })) go('home'); },
  });
  app.append(bar.node, stage);

  const onKey = e => {
    if (!question || modalOpen() || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter') { e.preventDefault(); question.submit(); }
    else if (e.key === 'Backspace') { e.preventDefault(); question.back(); }
    else if (e.key === ' ') e.preventDefault();
    else if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); question.type(e.key.toLowerCase()); }
  };
  document.addEventListener('keydown', onKey);

  async function run() {
    if (!words.length) { stage.append(el('p', { class: 'empty' }, 'Ebben a témában nincs szó.')); return; }
    const fresh = words.filter(w => !wordRec(w.key));
    if (fresh.length) { await showPreview(stage, fresh); if (!alive) return; }
    for (let i = 0; i < words.length; i++) {
      bar.set(i, words.length, session.combo);
      await ask(words[i]);
      if (!alive) return;
    }
    bar.set(words.length, words.length);
    go('results', session.finish(), { replace: true });
  }

  function ask(word) {
    return new Promise(resolve => {
      const lvl = wordRec(word.key)?.lvl ?? 0;
      const accepted = word.alts.map(lettersOnly);
      const slots = [...word.english].map(ch => ({ ch: ch.toLowerCase(), letter: /[a-z]/i.test(ch), typed: '', locked: false, status: '' }));
      const L = slots.filter(s => s.letter);
      let tries = 0;
      let hints = 0;
      let copyMode = false;
      let busy = false;
      let solved = false;

      const c = coach('Írd be angolul! Segítség: nyomd meg a 💡 gombot.');
      const msg = el('div', { class: 'feedback' });
      const answerShow = el('div', { class: 'answer-show' });
      const slotEls = slots.map(s => (s.letter
        ? el('div', { class: 'slot' })
        : el('div', { class: s.ch === ' ' ? 'slot-gap' : 'slot-fixed' }, s.ch === ' ' ? '' : s.ch)));
      const hintBtn = el('button', { class: 'btn btn-yellow', type: 'button', onclick: e => { e.currentTarget.blur(); hint(); } }, '💡 Segítség');
      const okBtn = el('button', { class: 'btn btn-green btn-big', type: 'button', onclick: e => { e.currentTarget.blur(); submit(); } }, 'Kész ✔');

      stage.replaceChildren(
        el('div', { class: 'prompt pop' },
          el('div', { class: 'prompt-label' }, 'Írd be angolul!'),
          visual(word, 'prompt-visual'),
          el('div', { class: 'prompt-hu' }, word.hu),
          noteLine(word, 'prompt-note'),
          el('div', { class: 'prompt-tools' }, speakerBtn(word.english, { big: true }), speakerBtn(word.english, { slow: true, big: true }))),
        answerShow,
        el('div', { class: 'slots' }, slotEls),
        msg,
        el('div', { class: 'type-actions' }, hintBtn, okBtn),
        c.node);

      // New / shaky words: the first letter is already there.
      if (lvl <= 1 && L.length > 2) { L[0].typed = L[0].ch; L[0].locked = true; }
      if (lvl < 4) setTimeout(() => { if (alive && !solved) speak(word.english); }, 400);
      draw();

      function draw() {
        slots.forEach((s, i) => {
          if (!s.letter) return;
          const n = slotEls[i];
          n.textContent = s.typed;
          n.className = 'slot' + (s.typed ? ' filled' : '') + (s.locked ? ' locked' : '') + (s.status ? ` ${s.status}` : '');
        });
        const free = L.filter(s => !s.locked).length;
        hintBtn.disabled = copyMode || solved || free <= 1;
      }

      function shake() {
        const row = stage.querySelector('.slots');
        row.classList.remove('shake');
        void row.offsetWidth;
        row.classList.add('shake');
      }

      function typeChar(ch) {
        if (busy || solved) return;
        const s = L.find(x => !x.locked && !x.typed);
        if (!s) return;
        s.typed = ch;
        sfx('click');
        draw();
      }

      function back() {
        if (busy || solved) return;
        const typed = L.filter(x => !x.locked && x.typed);
        if (typed.length) { typed[typed.length - 1].typed = ''; draw(); }
      }

      function hint() {
        if (busy || solved || copyMode) return;
        const s = L.find(x => !x.locked);
        if (!s || L.filter(x => !x.locked).length <= 1) return;
        s.typed = s.ch; s.locked = true; s.status = '';
        hints++;
        sfx('pop');
        draw();
      }

      async function submit() {
        if (busy || solved) return;
        const typed = L.map(s => s.typed).join('');
        if (!typed) return;
        const isRight = accepted.includes(typed);
        const full = L.every(s => s.typed);

        if (copyMode) {
          if (isRight) { await success(false); return; }
          L.forEach(s => { if (!s.locked) s.typed = ''; });
          shake(); sfx('wrong'); draw();
          msg.className = 'feedback show no'; msg.textContent = 'Nézd meg a szót, és próbáld újra!';
          return;
        }
        if (isRight) { await success(true); return; }
        if (!full) {
          shake(); sfx('wrong');
          msg.className = 'feedback show no'; msg.textContent = 'Még hiányoznak betűk! Vagy nyomd meg a 💡 gombot.';
          return;
        }

        tries++;
        busy = true;
        L.forEach(s => { if (s.typed === s.ch) { s.locked = true; s.status = 'good'; } else s.status = 'bad'; });
        draw(); shake(); sfx('wrong');
        if (tries >= MAX_TRIES) {
          c.say(oops(), 'sad');
          await sleep(1100);
          if (!alive) return;
          startCopy();
          return;
        }
        msg.className = 'feedback show no';
        msg.textContent = `Majdnem! A zöld betűk jók. Még ${MAX_TRIES - tries} próbálkozásod van.`;
        c.say('Majdnem! Próbáld újra!', 'sad');
        await sleep(1100);
        if (!alive) return;
        L.forEach(s => { if (s.status === 'bad') s.typed = ''; s.status = ''; });
        busy = false;
        draw();
      }

      function startCopy() {
        copyMode = true;
        session.answer(word, 'wrong', 15);
        L.forEach(s => { s.typed = ''; s.locked = false; s.status = ''; });
        answerShow.textContent = word.english;
        answerShow.classList.add('show');
        msg.className = 'feedback show no';
        msg.textContent = 'Ez a helyes szó. Írd be te is, hogy megjegyezd!';
        c.say('Semmi baj! Másold le a szót!', 'sad');
        speak(word.english);
        busy = false;
        draw();
      }

      async function success(scored) {
        solved = true;
        busy = true;
        L.forEach(s => { s.typed = s.ch; s.status = 'good'; });
        draw();
        sfx('correct');
        if (scored) {
          const r = session.answer(word, tries === 0 && hints === 0 ? 'right' : 'half', 15);
          celebrate(r, word, slotEls.find(n => n.classList.contains('slot')));
          c.say(tries === 0 && hints === 0 ? praise() : 'Ügyes! Legközelebb segítség nélkül is menni fog!', 'happy');
        } else {
          c.say('Így van! Most már ismerős lesz!', 'happy');
        }
        msg.className = 'feedback show ok';
        msg.textContent = `${word.english} = ${word.hu}`;
        bar.set(session.right + session.half + session.wrong, words.length, session.combo);
        await Promise.all([speak(word.english), sleep(1100)]);
        question = null;
        resolve();
      }

      question = { type: typeChar, back, submit };
    });
  }

  run();
  return () => { alive = false; question = null; document.removeEventListener('keydown', onKey); };
}
