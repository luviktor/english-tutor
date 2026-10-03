// Game 1 - "Hallgasd és válassz!": hear or read a word, pick the matching picture (or word).

import { el, shuffle, pick, sleep } from '../util.js';
import { wordRec } from '../state.js';
import { distractors, visual } from '../dict.js';
import { go } from '../router.js';
import { speak } from '../speech.js';
import { sfx } from '../sound.js';
import { startSession, pickWords } from '../session.js';
import { showPreview } from '../preview.js';
import { gameBar, coach, speakerBtn, confirmDialog } from '../ui.js';
import { celebrate } from '../rewards.js';
import { praise, oops } from '../strings.js';

const ROUND = 10;

export function render(app, { topic }) {
  let alive = true;
  const session = startSession('listen', topic);
  const words = pickWords(topic, ROUND);
  const stage = el('div', { class: 'stage' });
  const bar = gameBar({
    title: '🎧 Hallgasd és válassz!',
    onExit: async () => { if (await confirmDialog('Kilépsz a játékból?', { icon: '🚪', yes: 'Kilépek', no: 'Maradok' })) go('home'); },
  });
  app.append(bar.node, stage);

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
      const mode = pick(lvl <= 1 ? ['ear', 'ear', 'read'] : ['ear', 'read', 'pic']);
      const options = shuffle([word, ...distractors(word, 3)]);
      const c = coach({ ear: 'Hallgasd meg, és koppints a helyes képre!', read: 'Olvasd el, és keresd meg a képet!', pic: 'Mi ez angolul?' }[mode]);
      const feedback = el('div', { class: 'feedback' });
      let locked = false;

      const prompt = el('div', { class: 'prompt pop' });
      if (mode === 'ear') {
        prompt.append(el('div', { class: 'prompt-label' }, 'Mit hallasz?'),
          el('div', { class: 'prompt-tools' }, speakerBtn(word.english, { big: true }), speakerBtn(word.english, { slow: true, big: true })));
      } else if (mode === 'read') {
        prompt.append(el('div', { class: 'prompt-label' }, 'Melyik kép illik a szóhoz?'),
          el('div', { class: 'prompt-word' }, word.english),
          el('div', { class: 'prompt-tools' }, speakerBtn(word.english)));
      } else {
        prompt.append(el('div', { class: 'prompt-label' }, 'Mi ez angolul?'), visual(word, 'prompt-visual'));
      }

      const buttons = options.map(opt => {
        const b = el('button', {
          class: 'option', type: 'button',
          onclick: () => choose(opt, b),
        }, mode === 'pic' ? el('span', { class: 'opt-text' }, opt.english) : visual(opt, 'opt-visual'));
        return b;
      });
      const grid = el('div', { class: `options ${mode === 'pic' ? 'options-text' : 'options-pics'}` }, buttons);
      stage.replaceChildren(prompt, grid, feedback, c.node);

      if (mode === 'ear') setTimeout(() => { if (alive && !locked) speak(word.english); }, 450);
      if (mode === 'read') setTimeout(() => { if (alive && !locked) speak(word.english); }, 450);

      async function choose(opt, btn) {
        if (locked) return;
        locked = true;
        const right = opt.key === word.key;
        buttons.forEach(b => { b.disabled = true; });
        if (right) {
          btn.classList.add('right');
          sfx('correct');
          const r = session.answer(word, 'right');
          celebrate(r, word, btn);
          c.say(praise(), 'happy');
        } else {
          btn.classList.add('wrong');
          buttons[options.indexOf(word)].classList.add('right', 'reveal');
          sfx('wrong');
          session.answer(word, 'wrong');
          c.say(oops(), 'sad');
        }
        feedback.textContent = `${word.english} = ${word.hu}`;
        feedback.className = `feedback show ${right ? 'ok' : 'no'}`;
        bar.set(session.right + session.half + session.wrong, words.length, session.combo);
        await Promise.all([speak(word.english), sleep(right ? 1000 : 1900)]);
        resolve();
      }
    });
  }

  run();
  return () => { alive = false; };
}
