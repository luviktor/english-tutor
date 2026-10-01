// Parents' corner: progress overview, sound / voice settings, dictionary status, reset.
// Protected by a small multiplication so that a 9-year-old does not wander in by accident.

import { el, dayStr } from '../util.js';
import { state, commit, resetAll } from '../state.js';
import { dict, loadDictionary } from '../dict.js';
import { go } from '../router.js';
import { speak, englishVoices, hasEnglishVoice, bestVoice } from '../speech.js';
import { confirmDialog } from '../ui.js';
import { sfx } from '../sound.js';

export function render(app) {
  const root = el('div', { class: 'parent' });
  app.append(
    el('div', { class: 'screen-head' },
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => go('home') }, '◀ Vissza'),
      el('h2', { class: 'screen-title' }, '⚙️ Szülőknek')),
    root);
  gate();

  function gate() {
    const a = 12 + Math.floor(Math.random() * 8);
    const b = 12 + Math.floor(Math.random() * 8);
    const input = el('input', { type: 'number', class: 'gate-input', inputmode: 'numeric', 'aria-label': 'Válasz' });
    const msg = el('div', { class: 'feedback' });
    const tryIt = () => {
      if (Number(input.value) === a * b) panel();
      else { msg.className = 'feedback show no'; msg.textContent = 'Nem jó. Próbáld újra!'; input.select(); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    root.replaceChildren(el('div', { class: 'card gate' },
      el('div', { class: 'gate-icon' }, '🔐'),
      el('h3', {}, 'Szülői zár'),
      el('p', {}, `Ez a rész a felnőtteknek szól. Mennyi ${a} × ${b}?`),
      input, el('button', { class: 'btn btn-blue', type: 'button', onclick: tryIt }, 'Belépés'), msg));
    input.focus();
  }

  function panel() {
    const d = state.data;
    const words = dict.words;
    const lvl = w => d.words[w.key]?.lvl ?? -1;
    const dayList = Object.entries(d.days).filter(([, v]) => v.answers > 0);
    const known = words.filter(w => lvl(w) >= 3).length;
    const gold = words.filter(w => lvl(w) >= 5).length;
    const acc = d.stats.answers ? Math.round((d.stats.correct / d.stats.answers) * 100) : 0;

    // last 14 days
    const bars = [];
    const max = Math.max(1, ...dayList.map(([, v]) => v.answers));
    for (let i = 13; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dayStr(dt);
      const n = d.days[key]?.answers || 0;
      bars.push(el('div', { class: 'day-bar', title: `${key}: ${n} válasz` },
        el('i', { style: { height: Math.max(n ? 6 : 2, (n / max) * 100) + '%' } }),
        el('small', {}, dt.getDate())));
    }

    const hard = Object.entries(d.words)
      .filter(([k, r]) => r.bad > 0 && dict.byKey.has(k))
      .sort((x, y) => y[1].bad / (y[1].ok + y[1].bad) - x[1].bad / (x[1].ok + x[1].bad) || y[1].bad - x[1].bad)
      .slice(0, 8);

    // settings widgets
    const voices = englishVoices();
    const voiceSel = el('select', { onchange: e => { d.settings.voice = e.target.value; commit(); speak('Hello! This is my voice.'); } },
      el('option', { value: '' }, 'Automatikus'),
      voices.map(v => el('option', { value: v.name, selected: d.settings.voice === v.name }, `${v.name} (${v.lang})`)));
    const rate = el('input', { type: 'range', min: 0.5, max: 1.1, step: 0.05, value: d.settings.rate, oninput: e => { d.settings.rate = Number(e.target.value); commit(); } });
    const goal = el('select', { onchange: e => { d.settings.dailyGoal = Number(e.target.value); commit(); } },
      [5, 10, 15, 20, 30, 40].map(n => el('option', { value: n, selected: d.settings.dailyGoal === n }, `${n} szó`)));
    const nameInput = el('input', { type: 'text', value: d.player.name, maxlength: 20, onchange: e => { d.player.name = e.target.value.trim() || 'Nóra'; commit(); } });
    const voice = bestVoice();

    const dictBox = el('div', {});
    const drawDict = () => {
      dictBox.replaceChildren(
        el('p', {}, `${dict.words.length} szó, ${dict.topics.length} téma. Szerkeszd a `, el('code', {}, 'data\\dictionary.csv'),
          ' fájlt (Excelben vagy Jegyzettömbben), mentsd el, majd töltsd újra a szótárat.'),
        el('div', { class: 'row-wrap' }, dict.topics.map(t => el('span', { class: 'chip-topic', style: { '--c': t.color } }, `${t.emoji} ${t.name} (${dict.words.filter(w => w.topic === t.name).length})`))),
        dict.warnings.length > 0 && el('div', { class: 'warn-box' }, el('b', {}, 'Figyelmeztetések:'), el('ul', {}, dict.warnings.map(w => el('li', {}, w)))),
        el('button', { class: 'btn btn-blue btn-small', type: 'button', onclick: async () => { await loadDictionary(); drawDict(); sfx('pop'); } }, '🔄 Szótár újratöltése'));
    };
    drawDict();

    root.replaceChildren(
      el('section', { class: 'card' },
        el('h3', {}, `📊 ${d.player.name} eredményei`),
        el('div', { class: 'kpis' },
          kpi('📅', dayList.length, 'gyakorlónap'),
          kpi('🔥', d.streak.best, 'leghosszabb sorozat'),
          kpi('💬', d.stats.answers, 'válasz'),
          kpi('🎯', acc + '%', 'pontosság'),
          kpi('🌱', `${known}/${words.length}`, 'szót tud'),
          kpi('🥇', `${gold}/${words.length}`, 'arany matrica'),
          kpi('🎮', d.stats.rounds, 'befejezett kör')),
        el('h4', {}, 'Az utolsó 14 nap (válaszok száma)'),
        el('div', { class: 'day-chart' }, bars)),
      el('section', { class: 'card' },
        el('h3', {}, '🧩 Nehéz szavak'),
        hard.length
          ? el('div', { class: 'row-wrap' }, hard.map(([k, r]) => {
            const w = dict.byKey.get(k);
            return el('div', { class: 'hard-word' }, el('b', {}, w.english), ` – ${w.hu} `, el('small', {}, `✔${r.ok} ✖${r.bad}`));
          }))
          : el('p', {}, 'Még nincs elég adat.')),
      el('section', { class: 'card settings' },
        el('h3', {}, '🔧 Beállítások'),
        field('Név', nameInput),
        field('Napi cél', goal),
        field('Hangeffektek', el('input', { type: 'checkbox', checked: d.settings.sound, onchange: e => { d.settings.sound = e.target.checked; commit(); sfx('pop'); } })),
        field('Angol hang', voiceSel),
        field('Beszéd sebessége', rate),
        el('div', { class: hasEnglishVoice() ? 'voice-ok' : 'warn-box' },
          hasEnglishVoice()
            ? `✅ Angol hang: ${voice?.name}`
            : '⚠️ Nem találtam angol beszédhangot. Telepíts angol (USA) nyelvi csomagot a Windows beállításaiban, és indítsd újra a böngészőt.',
          ' ', el('button', { class: 'btn btn-blue btn-small', type: 'button', onclick: () => speak('Hello! Welcome to English adventure!') }, '🔊 Kipróbálom'))),
      el('section', { class: 'card' }, el('h3', {}, '📚 Szótár'), dictBox),
      el('section', { class: 'card danger' },
        el('h3', {}, '🗑️ Eredmények törlése'),
        el('p', {}, 'Minden eredmény, matrica és csillag törlődik. (A korábbi napi mentések a data\\backups mappában megmaradnak.)'),
        el('button', {
          class: 'btn btn-red btn-small', type: 'button',
          onclick: async () => {
            if (await confirmDialog('Biztosan törlöd az összes eredményt?', { icon: '⚠️', yes: 'Törlöm', no: 'Mégse' })) {
              await resetAll();
              go('home');
            }
          },
        }, 'Mindent törlök')),
      el('p', { class: 'small center' }, 'Az eredmények a data/progress.json fájlban vannak.'));
  }
}

const kpi = (icon, value, label) => el('div', { class: 'kpi' }, el('span', {}, icon), el('b', {}, value), el('small', {}, label));
const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
