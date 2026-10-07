// The Szótár tab of the teacher's view: the class's topics with their entries, a search across all of them,
// topic management (add, rename, recolour, reorder, delete) and the form for entering and changing words and
// phrases, with a live preview of the card the pupils will see.
//
// The page keeps no copy of its own: it changes the shared `dict` (see dict.js) with what the server answers to
// each change, so there is no need to load the dictionary again (another Functions instance might still hand out
// an older copy for a few seconds). Everything a teacher typed goes into the page as text (el() children), never
// as HTML. The forms check the same limits as the API (DictionaryRules.cs); the API's check is the one that counts.

import { el, fold, isOneEmoji, lettersOnly, relativeDay } from '../util.js';
import * as api from '../api.js';
import { dict, setDictionary, loadDictionary, visualOrInitial, noteLine } from '../dict.js';
import { confirmDialog, speakerBtn } from '../ui.js';

/** Fewer entries than this leave too few wrong answers for the multiple-choice and pair games (the server warns too). */
const MIN_TOPIC_ENTRIES = 4;
const MAX_TEXT = 60;
const MAX_NOTE = 80;
const MAX_ALSO_ACCEPTED = 5;
const DEFAULT_TOPIC_COLOR = '#74c0fc';
const DEFAULT_PICTURE_COLOR = '#ff8800';
const EMOJI_CHOICES = ['👋', '🐶', '🎨', '🔢', '👨‍👩‍👧', '🍎', '🎒', '🏠', '🖐️', '🌈', '😀', '⚽', '🚗', '🎵', '📚', '🌍'];
const NETWORK_ERROR = 'Nem sikerült elérni a szervert. Próbáld újra egy kicsit később!';

const wordsOfTopic = topic => dict.words.filter(w => w.topicId === topic.id);

/** What the entry form starts with: the entry's values, or a blank form for a new one. */
function entryDraft(entry, topicId) {
  const visual = entry?.visual ?? '';
  return {
    kind: entry?.kind ?? 'word',
    topicId: entry?.topicId ?? topicId ?? '',
    english: entry?.english ?? '',
    also: entry ? entry.alts.slice(1).join('\n') : '',
    hu: entry?.hu ?? '',
    note: entry?.note ?? '',
    pictureMode: visual.startsWith('color:') ? 'color' : 'emoji', // an empty emoji means no picture
    emoji: visual.startsWith('color:') ? '' : visual,
    color: visual.startsWith('color:') ? visual.slice(6) : DEFAULT_PICTURE_COLOR,
  };
}

/** The `visual` the API stores for the form's picture fields. */
const visualOf = d => (d.pictureMode === 'color' ? `color:${d.color}` : d.emoji.trim());

const alsoLines = text => text.split('\n').map(s => s.trim()).filter(Boolean);

/** The first rule the entry breaks, as { field, text }, or null. Mirrors DictionaryRules.cs. */
function entryProblem(d) {
  const english = d.english.trim();
  if (!english) return { field: 'english', text: 'Az angol szöveg kötelező.' };
  if (english.length > MAX_TEXT) return { field: 'english', text: `Az angol szöveg legfeljebb ${MAX_TEXT} karakter lehet.` };
  if (!lettersOnly(english)) return { field: 'english', text: 'Az angol szövegben legalább egy angol betűnek (a–z) lennie kell.' };
  const also = alsoLines(d.also);
  if (also.length > MAX_ALSO_ACCEPTED) return { field: 'also', text: `Legfeljebb ${MAX_ALSO_ACCEPTED} más elfogadott alak adható meg.` };
  const badAlso = also.find(a => a.length > MAX_TEXT || !lettersOnly(a));
  if (badAlso) return { field: 'also', text: `A(z) „${badAlso}” nem jó elfogadott alak: legfeljebb ${MAX_TEXT} karakter, és legyen benne angol betű.` };
  const hu = d.hu.trim();
  if (!hu) return { field: 'hu', text: 'A magyar jelentés kötelező.' };
  if (hu.length > MAX_TEXT) return { field: 'hu', text: `A magyar jelentés legfeljebb ${MAX_TEXT} karakter lehet.` };
  if (d.note.trim().length > MAX_NOTE) return { field: 'note', text: `A megjegyzés legfeljebb ${MAX_NOTE} karakter lehet.` };
  if (!d.topicId) return { field: 'topicId', text: 'Válassz témát.' };
  if (d.pictureMode === 'emoji' && d.emoji.trim() && !isOneEmoji(d.emoji.trim())) return { field: 'emoji', text: 'A kép egyetlen emoji legyen, vagy hagyd üresen.' };
  return null;
}

/** Fills `container`; returns { reload } for the 🔄 chip. */
export function mount(container) {
  let query = '';
  let editing = null;        // what has its form open: a topic id, an entry key, 'new-topic' or 'new-entry'; null for none
  let formError = null;      // { text, field } shown in the open form
  let draft = null;          // what the open form starts with: what was typed when it was saved (so a rejection does not wipe it), or a blank entry
  let formNode = null;       // the open form's DOM, kept across redraws so that e.g. typing in the search box does not rebuild it
  let lastTopicId = null;    // the topic of the last entry saved: the next new entry starts there
  let busy = false;          // a request is running: the buttons are off
  let warningsStale = false; // the warnings are from the last load; the changes since then are not in them
  let message = null;        // { text, kind: 'ok' | 'no' } above the list
  const folded = new Set();  // ids of the topics whose entries are hidden; kept for as long as the page is open

  const messageBox = el('div', { class: 'dict-message', role: 'status' });
  const warningBox = el('div');
  const list = el('div', { class: 'dict-list' });
  const search = el('input', {
    class: 'text-input dict-search', type: 'search', placeholder: 'Keresés a szavak és kifejezések között…', 'aria-label': 'Keresés',
    oninput: e => { query = e.target.value; draw(); },
  });
  const newEntry = el('button', { class: 'btn btn-small btn-green', type: 'button', onclick: () => openNewEntry() }, '＋ Új szó / kifejezés');
  const newTopic = el('button', { class: 'btn btn-small btn-blue', type: 'button', onclick: () => open('new-topic') }, '＋ Új téma');
  const foldAll = el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => toggleAll() });
  container.replaceChildren(el('div', { class: 'dict-toolbar' }, search, newEntry, newTopic, foldAll), messageBox, warningBox, list);
  draw();
  return { reload };

  // --- state ---------------------------------------------------------------------------------------------------

  /** Opens the form of `id` (see `editing`), or closes the open one with null. */
  function open(id, startDraft = null) {
    editing = id;
    formError = null;
    draft = startDraft;
    formNode = null;
    message = null;
    draw();
  }

  function openNewEntry(topicId) {
    if (dict.topics.length === 0) {
      open('new-topic');
      say('Előbb hozz létre egy témát!', 'no');
      draw();
      return;
    }
    open('new-entry', entryDraft(null, topicId ?? lastTopicId ?? dict.topics[0].id));
  }

  function say(text, kind) { message = { text, kind }; }

  /** Folds or unfolds one topic. The redraw replaces its button, so the keyboard focus is put back on the new one. */
  function toggleTopic(id) {
    if (folded.has(id)) folded.delete(id); else folded.add(id);
    draw();
    [...list.querySelectorAll('.dict-topic-toggle')].find(b => b.dataset.topic === id)?.focus();
  }

  /** Folds every topic, or unfolds them all when they are all folded already. */
  function toggleAll() {
    if (allFolded()) folded.clear(); else dict.topics.forEach(t => folded.add(t.id));
    draw();
  }

  function allFolded() { return dict.topics.length > 0 && dict.topics.every(t => folded.has(t.id)); }

  /** The open form: built once, then reused by every redraw until something asks for a fresh one (`formNode = null`). */
  function formFor(make) {
    formNode ??= make();
    return formNode;
  }

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
    const action = async () => { await loadDictionary(); warningsStale = false; editing = null; formError = null; draft = null; formNode = null; };
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

  /** The topic or entry as the server has it now, after "someone else changed it". */
  function takeCurrent(current) {
    if (current.key) update({ words: dict.words.map(w => (w.key === current.key ? current : w)) });
    else update({ topics: dict.topics.map(t => (t.id === current.id ? current : t)) });
  }

  /** A save the server refused for a reason the teacher can fix: shown in the form, which stays open with the typed text. */
  function refused(err, typed) {
    // Anything but "fix this and save again" (the thing is gone, no connection, ...) is for run() to report.
    if (!(err instanceof api.ApiError) || !err.body?.error || err.status === 404) throw err;
    formError = { text: err.body.error, field: err.body.field ?? (err.body.reason === 'duplicate' ? 'english' : undefined) };
    draft = typed;
    formNode = null;
    if (err.body.reason === 'stale' && err.body.current) {
      // Show what the other teacher saved instead of what was typed.
      takeCurrent(err.body.current);
      draft = null;
      formError.text += ' Az új értékeket betöltöttem; nézd át őket, és mentsd újra, ha kell.';
    }
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
        formNode = null;
        say(topic ? 'Elmentve.' : `A(z) „${saved.name}” téma elkészült.`, 'ok');
      } catch (err) {
        refused(err, values);
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

  // --- entry changes -------------------------------------------------------------------------------------------

  function saveEntry(entry, values) {
    draft = values;
    return run(async () => {
      try {
        const body = {
          kind: values.kind, topicId: values.topicId, english: values.english.trim(), alsoAccepted: alsoLines(values.also),
          hu: values.hu.trim(), note: values.note.trim(), visual: visualOf(values),
        };
        const saved = entry ? await api.updateEntry(entry.key, { ...body, revision: entry.revision }) : await api.addEntry(body);
        update({ words: entry ? dict.words.map(w => (w.key === saved.key ? saved : w)) : [...dict.words, saved] });
        lastTopicId = saved.topicId;
        folded.delete(saved.topicId); // so that the entry just saved is in sight
        formError = null;
        formNode = null;
        if (entry) {
          editing = null;
          draft = null;
          say('Elmentve.', 'ok');
        } else {
          // Stay in the form for the next entry of the same topic: this is how the first set of words is typed in.
          draft = entryDraft(null, saved.topicId);
          say(`Elmentve: ${saved.english}`, 'ok');
        }
      } catch (err) {
        refused(err, values);
      }
    });
  }

  function deleteEntry(word) {
    return run(async () => {
      const sure = await confirmDialog(`Törlöd a(z) „${word.english}” bejegyzést? A tanulók ezen elért eredménye is elvész.`,
        { icon: '🗑️', yes: 'Törlöm', no: 'Mégse' });
      if (!sure) return;
      try {
        await api.deleteEntry(word.key, word.revision);
      } catch (err) {
        if (err instanceof api.ApiError && err.body?.reason === 'stale' && err.body.current) takeCurrent(err.body.current);
        throw err;
      }
      update({ words: dict.words.filter(w => w.key !== word.key) });
      say(`A(z) „${word.english}” törölve.`, 'ok');
    });
  }

  // --- drawing -------------------------------------------------------------------------------------------------

  function draw() {
    newEntry.disabled = busy;
    newTopic.disabled = busy;
    formNode?.querySelectorAll('button[type=submit]').forEach(b => { b.disabled = busy; });
    messageBox.className = message ? `dict-message show ${message.kind}` : 'dict-message';
    messageBox.textContent = message?.text ?? '';
    warningBox.replaceChildren(...warnings());

    const q = fold(query.trim());
    foldAll.textContent = allFolded() ? '▸ Mind kinyitása' : '▾ Mind összecsukása';
    foldAll.disabled = dict.topics.length === 0 || q !== ''; // a search shows every topic it finds, open
    const matches = w => !q || fold([w.english, ...w.alts, w.hu, w.note, w.topic].join(' ')).includes(q);
    const cards = [];
    if (editing === 'new-topic') cards.push(el('section', { class: 'card dict-topic' }, formFor(() => topicForm(null))));
    if (editing === 'new-entry') cards.push(el('section', { class: 'card dict-topic' }, formFor(() => entryForm(null))));
    dict.topics.forEach((topic, index) => {
      const all = wordsOfTopic(topic);
      // The search never hides the entry or topic that is being edited.
      const shown = all.filter(w => matches(w) || w.key === editing);
      if (q && shown.length === 0 && topic.id !== editing) return;
      cards.push(topicCard(topic, index, all, shown, q !== ''));
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

  function topicCard(topic, index, all, shown, searching) {
    // A search lists what it found, and the entry being edited stays in sight: neither can be folded away.
    const stayOpen = searching ? 'Keresés közben minden téma nyitva van.'
      : all.some(w => w.key === editing) ? 'Szerkesztés közben a téma nyitva marad.'
        : null;
    const hidden = folded.has(topic.id) && !stayOpen;
    const head = editing === topic.id
      ? formFor(() => topicForm(topic))
      : el('div', { class: 'dict-topic-head' },
        el('h3', {}, el('button', {
          class: 'dict-topic-toggle', type: 'button', dataset: { topic: topic.id }, 'aria-expanded': String(!hidden),
          title: stayOpen ?? (hidden ? 'Kinyitás' : 'Összecsukás'), disabled: stayOpen !== null, onclick: () => toggleTopic(topic.id),
        },
        el('span', { class: 'dict-chevron', 'aria-hidden': 'true' }, hidden ? '▸' : '▾'),
        el('span', { class: 'dict-topic-emoji', 'aria-hidden': 'true' }, topic.emoji),
        topic.name)),
        el('span', { class: 'small' }, `${all.length} bejegyzés`),
        el('div', { class: 'dict-actions' },
          iconButton('＋', 'Új szó vagy kifejezés ebbe a témába', () => openNewEntry(topic.id)),
          iconButton('✏️', 'Átnevezés, jel és szín', () => open(topic.id)),
          !searching && iconButton('▲', 'Feljebb', () => moveTopic(index, -1), index === 0),
          !searching && iconButton('▼', 'Lejjebb', () => moveTopic(index, 1), index === dict.topics.length - 1),
          iconButton('🗑️', all.length > 0 ? 'Csak üres téma törölhető' : 'Törlés', () => deleteTopic(topic), all.length > 0)));
    return el('section', { class: 'card dict-topic', style: { '--c': topic.color } },
      head,
      !searching && !hidden && all.length < MIN_TOPIC_ENTRIES && el('p', { class: 'dict-hint' }, all.length === 0
        ? `Üres téma. A feleletválasztós és a párosító játékokhoz legalább ${MIN_TOPIC_ENTRIES} bejegyzés kell.`
        : `Csak ${all.length} bejegyzés van; a feleletválasztós és a párosító játékokhoz legalább ${MIN_TOPIC_ENTRIES} kell.`),
      !hidden && shown.length > 0 && el('ul', { class: 'dict-entries' }, shown.map(entryRow)));
  }

  function entryRow(word) {
    if (editing === word.key) return el('li', { class: 'dict-entry dict-entry-editing' }, formFor(() => entryForm(word)));
    return el('li', { class: 'dict-entry' },
      visualOrInitial(word, 'dict-visual'),
      el('div', { class: 'dict-entry-text' },
        el('div', { class: 'dict-entry-main' },
          el('b', {}, word.english),
          word.kind === 'phrase' && el('span', { class: 'badge' }, 'kifejezés'),
          word.alts.length > 1 && el('span', { class: 'small' }, `másképp: ${word.alts.slice(1).join(', ')}`)),
        el('div', {}, word.hu, word.note && el('span', { class: 'dict-note-inline' }, ` – ${word.note}`)),
        el('div', { class: 'small', title: new Date(word.updatedAt).toLocaleString('hu-HU') }, `${word.updatedBy} · ${relativeDay(word.updatedAt)}`)),
      el('div', { class: 'dict-actions' },
        iconButton('✏️', 'Módosítás', () => open(word.key)),
        iconButton('🗑️', 'Törlés', () => deleteEntry(word))));
  }

  function iconButton(icon, label, onclick, disabled = false) {
    return el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick, disabled: disabled || busy }, icon);
  }

  /** Puts the cursor in the field the server complained about (or `fallback`) and brings the form into view. */
  function focusLater(form, fields, fallback) {
    setTimeout(() => {
      (fields[formError?.field] ?? fallback).focus();
      form.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  /** The form for a new topic (`topic` is null) or for changing one. */
  function topicForm(topic) {
    const start = draft ?? { name: topic?.name ?? '', emoji: topic?.emoji ?? '📚', color: topic?.color ?? DEFAULT_TOPIC_COLOR };
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

    const form = el('form', { class: 'dict-form', onsubmit: submit, novalidate: true },
      el('label', {}, el('span', {}, 'Név'), name),
      el('label', {}, el('span', {}, 'Jel'), emoji),
      choices,
      el('label', {}, el('span', {}, 'Szín'), color),
      error,
      el('div', { class: 'dict-form-actions' },
        el('button', { class: 'btn btn-small btn-green', type: 'submit', disabled: busy }, 'Mentés'),
        el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => open(null) }, 'Mégse')));
    focusLater(form, { name, emoji, color }, name);
    return form;
  }

  /** The form for a new entry (`entry` is null) or for changing one, with the card the pupils will see beside it. */
  function entryForm(entry) {
    const d = draft ?? entryDraft(entry, lastTopicId ?? dict.topics[0]?.id);
    // The kind follows the English text (a space means a phrase) until the teacher chooses it themself.
    let kindTouched = entry != null || d.kindTouched === true;

    const kind = el('select', { class: 'text-input', 'aria-label': 'Fajta', onchange: () => { kindTouched = true; } },
      el('option', { value: 'word', selected: d.kind === 'word' }, 'Szó'),
      el('option', { value: 'phrase', selected: d.kind === 'phrase' }, 'Kifejezés'));
    const english = el('input', {
      class: 'text-input', type: 'text', maxlength: MAX_TEXT, value: d.english, placeholder: 'pl. How do you do?', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Angol',
      oninput: () => {
        if (!kindTouched) kind.value = english.value.trim().includes(' ') ? 'phrase' : 'word';
        showPreview();
      },
    });
    const also = el('textarea', { class: 'text-input', rows: 2, placeholder: 'pl. thanks (soronként egy)', spellcheck: 'false', 'aria-label': 'Más elfogadott alakok' }, d.also);
    const hu = el('input', { class: 'text-input', type: 'text', maxlength: MAX_TEXT, value: d.hu, placeholder: 'pl. Üdvözlöm!', 'aria-label': 'Magyar', oninput: () => showPreview() });
    const note = el('input', { class: 'text-input', type: 'text', maxlength: MAX_NOTE, value: d.note, placeholder: 'pl. hivatalos bemutatkozáskor', 'aria-label': 'Megjegyzés', oninput: () => showPreview() });
    const topic = el('select', { class: 'text-input', 'aria-label': 'Téma' },
      dict.topics.map(t => el('option', { value: t.id, selected: t.id === d.topicId }, `${t.emoji} ${t.name}`)));

    const emoji = el('input', { class: 'text-input dict-emoji-input', type: 'text', value: d.emoji, placeholder: '😀', 'aria-label': 'Emoji', oninput: () => showPreview() });
    const color = el('input', { class: 'dict-color-input', type: 'color', value: d.color, 'aria-label': 'Szín', onchange: () => showPreview() });
    const radio = (mode, label) => el('label', { class: 'dict-radio' },
      el('input', { type: 'radio', name: 'picture-mode', value: mode, checked: d.pictureMode === mode, onchange: () => { pictureMode = mode; showPictureInputs(); showPreview(); } }),
      label);
    let pictureMode = d.pictureMode;
    const pictureInputs = el('div', { class: 'dict-picture-inputs' });
    const showPictureInputs = () => {
      pictureInputs.replaceChildren(pictureMode === 'emoji' ? emoji : pictureMode === 'color' ? color : null);
    };
    showPictureInputs();

    const preview = el('div', { class: 'dict-preview', 'aria-label': 'Így látják a tanulók' });
    const read = () => ({
      kind: kind.value, kindTouched, topicId: topic.value, english: english.value, also: also.value, hu: hu.value, note: note.value,
      pictureMode, emoji: emoji.value, color: color.value,
    });
    function showPreview() {
      const values = read();
      const word = { english: values.english.trim() || '?', hu: values.hu.trim() || '…', note: values.note.trim(), visual: visualOf(values) };
      preview.replaceChildren(el('div', { class: 'pv-card dict-pv' },
        visualOrInitial(word, 'pv-visual'),
        el('div', { class: 'pv-en' }, word.english),
        el('div', { class: 'pv-hu' }, word.hu),
        noteLine(word),
        values.english.trim() && speakerBtn(values.english.trim())));
    }
    showPreview();

    const error = el('p', { class: 'form-error' }, formError?.text ?? '');
    const submit = ev => {
      ev.preventDefault();
      const values = read();
      const problem = entryProblem(values);
      if (problem) {
        error.textContent = problem.text;
        ({ english, also, hu, note, topicId: topic, emoji }[problem.field] ?? english).focus();
        return;
      }
      saveEntry(entry, values);
    };

    const form = el('form', { class: 'dict-form dict-entry-form', onsubmit: submit, novalidate: true },
      el('div', { class: 'dict-entry-fields' },
        el('label', {}, el('span', {}, 'Angol'), english),
        el('label', {}, el('span', {}, 'Magyar'), hu),
        el('label', {}, el('span', {}, 'Fajta'), kind),
        el('label', {}, el('span', {}, 'Téma'), topic),
        el('label', { class: 'wide' }, el('span', {}, 'Más elfogadott alakok (soronként egy)'), also),
        el('label', { class: 'wide' }, el('span', {}, 'Megjegyzés (nem kötelező)'), note),
        el('div', { class: 'wide' },
          el('span', { class: 'dict-label' }, 'Kép'),
          el('div', { class: 'dict-picture' }, radio('emoji', 'Emoji'), radio('color', 'Szín'), pictureInputs),
          el('span', { class: 'small' }, 'Emoji nélkül a szó kép nélkül, szöveggel gyakorolható.'))),
      el('div', { class: 'dict-entry-side' },
        el('span', { class: 'dict-label' }, 'Így látják a tanulók'),
        preview),
      el('div', { class: 'wide' }, error,
        el('div', { class: 'dict-form-actions' },
          el('button', { class: 'btn btn-small btn-green', type: 'submit', disabled: busy }, entry ? 'Mentés' : 'Mentés és a következő'),
          el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => open(null) }, entry ? 'Mégse' : 'Kész'))));
    focusLater(form, { english, alsoAccepted: also, hu, note, topicId: topic, kind, emoji, visual: emoji, also }, english);
    return form;
  }
}
