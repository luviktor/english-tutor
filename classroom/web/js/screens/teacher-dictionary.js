// The Szótár tab of the teacher's view: the class's topics with their entries, a search across all of them, and
// topic management (add, rename, recolour, reorder, delete).
//
// The page keeps no copy of its own: it changes the shared `dict` (see dict.js) with what the server answers to
// each change, so there is no need to load the dictionary again (another Functions instance might still hand out
// an older copy for a few seconds). Everything a teacher typed goes into the page as text (el() children), never
// as HTML.

import { el, fold, isOneEmoji, relativeDay } from '../util.js';
import * as api from '../api.js';
import { dict, setDictionary, loadDictionary, visualOrInitial } from '../dict.js';
import { confirmDialog } from '../ui.js';

/** Fewer entries than this leave too few wrong answers for the multiple-choice and pair games (the server warns too). */
const MIN_TOPIC_ENTRIES = 4;
const DEFAULT_COLOR = '#74c0fc';
const EMOJI_CHOICES = ['👋', '🐶', '🎨', '🔢', '👨‍👩‍👧', '🍎', '🎒', '🏠', '🖐️', '🌈', '😀', '⚽', '🚗', '🎵', '📚', '🌍'];
const NETWORK_ERROR = 'Nem sikerült elérni a szervert. Próbáld újra egy kicsit később!';

const wordsOfTopic = topic => dict.words.filter(w => w.topicId === topic.id);

/** Fills `container`; returns { reload } for the 🔄 chip. */
export function mount(container) {
  let query = '';
  let editing = null;        // the id of the topic whose form is open, 'new' for the new-topic form, or null
  let formError = null;      // { text, field } shown in the open form
  let draft = null;          // what was typed in the open form when it was saved, so a rejection does not wipe it
  let busy = false;          // a request is running: the buttons are off
  let warningsStale = false; // the warnings are from the last load; the changes since then are not in them
  let message = null;        // { text, kind: 'ok' | 'no' } above the list

  const messageBox = el('div', { class: 'dict-message', role: 'status' });
  const warningBox = el('div');
  const list = el('div', { class: 'dict-list' });
  const search = el('input', {
    class: 'text-input dict-search', type: 'search', placeholder: 'Keresés a szavak és kifejezések között…', 'aria-label': 'Keresés',
    oninput: e => { query = e.target.value; draw(); },
  });
  const newTopic = el('button', { class: 'btn btn-small btn-blue', type: 'button', onclick: () => open('new') }, '＋ Új téma');
  container.replaceChildren(el('div', { class: 'dict-toolbar' }, search, newTopic), messageBox, warningBox, list);
  draw();
  return { reload };

  // --- state ---------------------------------------------------------------------------------------------------

  function open(id) {
    editing = id;
    formError = null;
    draft = null;
    message = null;
    draw();
  }

  function say(text, kind) { message = { text, kind }; }

  /** Runs a request with the buttons off, then redraws. */
  async function run(action) {
    if (busy) return;
    busy = true;
    draw();
    try {
      await action();
    } catch (err) {
      console.error(err);
      say(err instanceof api.ApiError && err.body?.error ? err.body.error : NETWORK_ERROR, 'no');
      // Something is gone or changed under us: show what is there now.
      if (err instanceof api.ApiError && (err.status === 404 || (err.status === 409 && !err.body?.current))) await reload(true);
    } finally {
      busy = false;
      draw();
    }
  }

  async function reload(inRun = false) {
    const action = async () => { await loadDictionary(); warningsStale = false; editing = null; formError = null; };
    if (inRun) { try { await action(); } catch (err) { console.error(err); } } else { message = null; await run(action); }
  }

  /** Puts the server's answer into the shared dictionary. Entries follow their topic's name and order. */
  function update({ topics = dict.topics, words = dict.words }) {
    const position = new Map(topics.map((t, i) => [t.id, i]));
    const name = new Map(topics.map(t => [t.id, t.name]));
    const sorted = words
      .filter(w => position.has(w.topicId))
      .map(w => (w.topic === name.get(w.topicId) ? w : { ...w, topic: name.get(w.topicId) }))
      .sort((a, b) => position.get(a.topicId) - position.get(b.topicId)
        || a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }));
    setDictionary({ topics, words: sorted, warnings: dict.warnings });
    warningsStale = true;
  }

  /** The topic as the server has it now, after "someone else changed it". */
  function takeCurrent(topic) {
    update({ topics: dict.topics.map(t => (t.id === topic.id ? topic : t)) });
  }

  // --- topic changes -------------------------------------------------------------------------------------------

  function saveTopic(topic, values) {
    draft = values;
    return run(async () => {
      try {
        const saved = topic ? await api.updateTopic(topic.id, { ...values, revision: topic.revision }) : await api.addTopic(values);
        update({ topics: topic ? dict.topics.map(t => (t.id === saved.id ? saved : t)) : [...dict.topics, saved] });
        editing = null;
        formError = null;
        draft = null;
        say(topic ? 'Elmentve.' : `A(z) „${saved.name}” téma elkészült.`, 'ok');
      } catch (err) {
        if (!(err instanceof api.ApiError) || !err.body?.error) throw err;
        formError = { text: err.body.error, field: err.body.field };
        if (err.body.reason === 'stale' && err.body.current) {
          // Show what the other teacher saved instead of what was typed.
          takeCurrent(err.body.current);
          draft = null;
          formError.text += ' Az új értékeket betöltöttem; nézd át őket, és mentsd újra, ha kell.';
        }
      }
    });
  }

  function moveTopic(index, by) {
    return run(async () => {
      const ids = dict.topics.map(t => t.id);
      [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
      update({ topics: await api.setTopicOrder(ids) });
    });
  }

  function deleteTopic(topic) {
    return run(async () => {
      if (!(await confirmDialog(`Törlöd a(z) „${topic.name}” témát?`, { icon: '🗑️', yes: 'Törlöm', no: 'Mégse' }))) return;
      try {
        await api.deleteTopic(topic.id, topic.revision);
      } catch (err) {
        if (err instanceof api.ApiError && err.body?.reason === 'stale' && err.body.current) takeCurrent(err.body.current);
        throw err;
      }
      update({ topics: dict.topics.filter(t => t.id !== topic.id) });
      say(`A(z) „${topic.name}” téma törölve.`, 'ok');
    });
  }

  // --- drawing -------------------------------------------------------------------------------------------------

  function draw() {
    newTopic.disabled = busy;
    messageBox.className = message ? `dict-message show ${message.kind}` : 'dict-message';
    messageBox.textContent = message?.text ?? '';
    warningBox.replaceChildren(...warnings());

    const q = fold(query.trim());
    const matches = w => !q || fold([w.english, ...w.alts, w.hu, w.note, w.topic].join(' ')).includes(q);
    const cards = [];
    if (editing === 'new') cards.push(el('section', { class: 'card dict-topic' }, topicForm(null)));
    dict.topics.forEach((topic, index) => {
      const all = wordsOfTopic(topic);
      const shown = all.filter(matches);
      if (q && shown.length === 0) return;
      cards.push(topicCard(topic, index, all, shown, !q));
    });
    if (cards.length === 0) {
      cards.push(el('p', { class: 'empty' }, q ? 'Nincs találat.' : 'Még nincs téma. Kezdd egy új témával!'));
    }
    list.replaceChildren(...cards);
  }

  function warnings() {
    if (dict.warnings.length === 0) return [];
    return [el('div', { class: 'warn-box' },
      el('b', {}, 'Figyelmeztetések:'),
      el('ul', {}, dict.warnings.map(w => el('li', {}, w))),
      warningsStale && el('p', { class: 'small' }, 'A figyelmeztetések a legutóbbi betöltéskor készültek; a 🔄 Frissítés gombbal újra elkészülnek.'))];
  }

  function topicCard(topic, index, all, shown, reorderable) {
    const head = editing === topic.id
      ? topicForm(topic)
      : el('div', { class: 'dict-topic-head' },
        el('span', { class: 'dict-topic-emoji', 'aria-hidden': 'true' }, topic.emoji),
        el('h3', {}, topic.name),
        el('span', { class: 'small' }, `${all.length} bejegyzés`),
        el('div', { class: 'dict-actions' },
          iconButton('✏️', 'Átnevezés, jel és szín', () => open(topic.id)),
          reorderable && iconButton('▲', 'Feljebb', () => moveTopic(index, -1), index === 0),
          reorderable && iconButton('▼', 'Lejjebb', () => moveTopic(index, 1), index === dict.topics.length - 1),
          iconButton('🗑️', all.length > 0 ? 'Csak üres téma törölhető' : 'Törlés', () => deleteTopic(topic), all.length > 0)));
    return el('section', { class: 'card dict-topic', style: { '--c': topic.color } },
      head,
      reorderable && all.length < MIN_TOPIC_ENTRIES && el('p', { class: 'dict-hint' }, all.length === 0
        ? `Üres téma. A feleletválasztós és a párosító játékokhoz legalább ${MIN_TOPIC_ENTRIES} bejegyzés kell.`
        : `Csak ${all.length} bejegyzés van; a feleletválasztós és a párosító játékokhoz legalább ${MIN_TOPIC_ENTRIES} kell.`),
      shown.length > 0 && el('ul', { class: 'dict-entries' }, shown.map(entryRow)));
  }

  function entryRow(word) {
    return el('li', { class: 'dict-entry' },
      visualOrInitial(word, 'dict-visual'),
      el('div', { class: 'dict-entry-text' },
        el('div', { class: 'dict-entry-main' },
          el('b', {}, word.english),
          word.kind === 'phrase' && el('span', { class: 'badge' }, 'kifejezés'),
          word.alts.length > 1 && el('span', { class: 'small' }, `másképp: ${word.alts.slice(1).join(', ')}`)),
        el('div', {}, word.hu, word.note && el('span', { class: 'dict-note-inline' }, ` – ${word.note}`)),
        el('div', { class: 'small', title: new Date(word.updatedAt).toLocaleString('hu-HU') }, `${word.updatedBy} · ${relativeDay(word.updatedAt)}`)));
  }

  function iconButton(icon, label, onclick, disabled = false) {
    return el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick, disabled: disabled || busy }, icon);
  }

  /** The form for a new topic (`topic` is null) or for changing one. */
  function topicForm(topic) {
    const start = draft ?? { name: topic?.name ?? '', emoji: topic?.emoji ?? '📚', color: topic?.color ?? DEFAULT_COLOR };
    const name = el('input', { class: 'text-input', type: 'text', maxlength: 30, value: start.name, placeholder: 'pl. Köszönések', 'aria-label': 'A téma neve' });
    const emoji = el('input', { class: 'text-input dict-emoji-input', type: 'text', value: start.emoji, 'aria-label': 'A téma jele (egy emoji)' });
    const color = el('input', { class: 'dict-color-input', type: 'color', value: start.color, 'aria-label': 'A téma színe' });
    const error = el('p', { class: 'form-error' }, formError?.text ?? '');
    const choices = el('div', { class: 'dict-emoji-choices' }, EMOJI_CHOICES.map(e => el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': `Jel: ${e}`, onclick: () => { emoji.value = e; },
    }, e)));

    const submit = ev => {
      ev.preventDefault();
      const values = { name: name.value.trim(), emoji: emoji.value.trim(), color: color.value };
      const problem = !values.name || values.name.length > 30 ? [name, 'A téma nevét 1–30 karakterrel add meg.']
        : !isOneEmoji(values.emoji) ? [emoji, 'A téma jele egyetlen emoji legyen.']
          : null;
      if (problem) {
        error.textContent = problem[1];
        problem[0].focus();
        return;
      }
      saveTopic(topic, values);
    };
    // Put the cursor in the field the server complained about, or in the name.
    setTimeout(() => (({ name, emoji, color })[formError?.field] ?? name).focus(), 0);

    return el('form', { class: 'dict-form', onsubmit: submit, novalidate: true },
      el('label', {}, el('span', {}, 'Név'), name),
      el('label', {}, el('span', {}, 'Jel'), emoji),
      choices,
      el('label', {}, el('span', {}, 'Szín'), color),
      error,
      el('div', { class: 'dict-form-actions' },
        el('button', { class: 'btn btn-small btn-green', type: 'submit', disabled: busy }, 'Mentés'),
        el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => open(null) }, 'Mégse')));
  }
}
