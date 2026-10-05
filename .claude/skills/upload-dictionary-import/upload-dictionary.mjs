#!/usr/bin/env node
// Loads the topics and entries of an import file into the classroom dictionary through the teacher API
// (docs/teacher-dictionary.md), so every entry gets the same validation, generated id, `updatedBy` and cache
// invalidation as one typed into the Szótár form. Developer tooling, not part of the app.
//
//   node upload-dictionary.mjs <import-file.json> --check
//   node upload-dictionary.mjs <import-file.json> [--target local|web] [--url <base url>]
//                              [--dry-run | --apply | --confirm] [--ask-password]
//   node upload-dictionary.mjs --list [--target local|web] [--url <base url>] [--ask-password]
//
// --check     validate the import file offline (no API, no password) and exit.
// --list      show the topics already in the dictionary and exit.
// --target local (default): http://localhost:7071 (the Functions host), writes right away. Password: the first
//   teacher in classroom/api/local.settings.json, else in local.settings.example.json (the test values the local
//   setup uses); ENGLISHTUTOR_TEACHER_PASSWORD is not used here.
// --target web: https://www.erkel2023b.hu (--url overrides, https only). The API may need a few seconds to wake
//   up, so the login is retried for about 30 s. Password: the environment variable ENGLISHTUTOR_TEACHER_PASSWORD,
//   else a hidden prompt (needs a real terminal; that way the password never passes through a chat or a file).
//   Teachers and pupils see what is written there, so it never writes unasked: in a terminal it shows the plan and
//   asks you to type "yes"; without a terminal it only plans, unless --apply is given.
// --dry-run   only show what would happen.      --apply    write without asking.
// --confirm   show the plan, then ask (terminal only).   --ask-password   always prompt for the password.
//
// Safe to repeat: an existing topic is reused by name, an entry whose spelling is already in the dictionary is
// skipped ("already there", or a conflict when its Hungarian meaning differs), and nothing existing is ever
// changed or deleted: corrections are made in the Szótár form. The password is never printed or stored.
//
// The import file format is described in .claude/skills/prepare-dictionary-import/references/import-file-format.md.
// Exit code 0: everything is in the dictionary (or would be). 1: a problem, conflict or error.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const PASSWORD_HEADER = 'X-EnglishTutor-Password';
const WEB_PASSWORD_VARIABLE = 'ENGLISHTUTOR_TEACHER_PASSWORD';
const WEB_URL = 'https://www.erkel2023b.hu';
const LOCAL_URL = 'http://localhost:7071';
const WEB_START_ATTEMPTS = 6;
const WEB_START_WAIT_MS = 5000;
const WEB_START_TIMEOUT_MS = 30000;
const CALL_TIMEOUT_MS = 20000;
const USAGE = 'Usage: node upload-dictionary.mjs <import-file.json> [--check | --target local|web] [--url <base url>] [--dry-run | --apply | --confirm] [--ask-password]\n' +
  '       node upload-dictionary.mjs --list [--target local|web] [--url <base url>] [--ask-password]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// The limits of DictionaryRules.cs; the API is the one that counts, this only catches mistakes early.
const MAX_TOPICS = 50;
const MAX_ENTRIES = 1000;
const MAX_ENGLISH = 60;
const MAX_ALSO_ACCEPTED = 5;
const MAX_HU = 60;
const MAX_NOTE = 80;
const MAX_TOPIC_NAME = 30;
const MIN_TOPIC_ENTRIES = 4;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const importFile = options.list ? null : loadImportFile(options.filePath);
  if (options.check) {
    printCheck(importFile);
    return;
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const mode = options.list ? 'list' : chooseMode(options, interactive);
  const target = await resolveTarget(options, interactive);

  const api = createApi(target);
  const identity = await logIn(api, target);
  const modeNote = { plan: ' - DRY RUN, nothing is written', confirm: ' - will ask before writing' }[mode] ?? '';
  console.log(`Target: ${options.target} (${target.url}), logged in as ${identity.name}${modeNote}\n`);

  if (mode === 'list') {
    printTopics(await readDictionary(api));
    return;
  }

  let result = await runImport(api, importFile, mode !== 'apply');
  let wrote = mode === 'apply';
  if (mode === 'plan' && options.target === 'web' && !options.dryRun) {
    console.log('\nNothing was written. Run it in a terminal to be asked, or add --apply.');
  }
  if (mode === 'confirm') {
    if (result.created + result.topicsCreated === 0) {
      console.log('\nNothing new to write.');
    } else if (await confirm(`\nWrite these changes to ${target.url}? Type yes: `)) {
      console.log('');
      result = await runImport(api, importFile, false);
      wrote = true;
    } else {
      console.log('Cancelled, nothing was written.');
    }
  }

  const allThere = !wrote || await verify(api, importFile);
  // Not process.exit(): on Windows it can abort Node while the fetch connections are still closing.
  process.exitCode = result.conflicts + result.failed > 0 || !allThere ? 1 : 0;
}

// --- arguments, import file, target -----------------------------------------------------------------------------

function parseArguments(args) {
  const options = { target: 'local', url: null, list: false, check: false, dryRun: false, apply: false, confirm: false, askPassword: false, filePath: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target') options.target = args[++i];
    else if (arg === '--url') options.url = args[++i];
    else if (arg === '--list') options.list = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--confirm') options.confirm = true;
    else if (arg === '--ask-password') options.askPassword = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}\n${USAGE}`);
    else options.filePath = arg;
  }
  if (!options.list && !options.filePath) throw new Error(USAGE);
  if (options.target !== 'local' && options.target !== 'web') throw new Error(`--target must be local or web, not '${options.target}'`);
  return options;
}

/** plan: show only; apply: write; confirm: show, then write if the user types yes. */
function chooseMode(options, interactive) {
  if (options.dryRun) return 'plan';
  if (options.apply) return 'apply';
  if (options.target === 'web' || options.confirm) {
    if (interactive) return 'confirm';
    if (options.confirm) throw new Error('--confirm needs a terminal to ask in.');
    return 'plan';
  }
  return 'apply';
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

function loadImportFile(path) {
  let file;
  try {
    file = readJson(path);
  } catch (error) {
    throw new Error(`Cannot read the import file ${path}: ${error.message}`);
  }
  const { errors, warnings } = validateImportFile(file);
  if (errors.length > 0) {
    throw new Error(`The import file has ${errors.length} problem(s):\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return { topics: file.topics ?? [], entries: file.entries ?? [], warnings };
}

function printCheck(importFile) {
  const withoutPicture = importFile.entries.filter(e => !e.visual).length;
  console.log(`Import file OK: ${importFile.topics.length} topics, ${importFile.entries.length} entries (${withoutPicture} without a picture).`);
  for (const warning of importFile.warnings) console.log(`  warning: ${warning}`);
}

function textProblem(value, label, max, required) {
  if (typeof value !== 'string') return required ? `${label} is missing.` : null;
  const text = value.trim();
  if (text.length === 0) return required ? `${label} is empty.` : null;
  if (text.length > max) return `${label} is longer than ${max} characters.`;
  if (CONTROL_CHARACTERS.test(text)) return `${label} has a line break or control character.`;
  return null;
}

/** One emoji as the user sees it, and not a plain letter or digit (like DictionaryRules.IsOneEmoji). */
function isOneEmoji(text) {
  const characters = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)];
  return characters.length === 1 && /[^\u0000-\u007f]/.test(text) && !/^\p{L}/u.test(text);
}

/** Every problem at once, so the import file can be fixed in one go. */
function validateImportFile(file) {
  const errors = [];
  const warnings = [];
  if (!file || !Array.isArray(file.topics) || !Array.isArray(file.entries)) {
    return { errors: ['The file must have a "topics" list and an "entries" list.'], warnings };
  }
  if (file.topics.length > MAX_TOPICS) errors.push(`More than ${MAX_TOPICS} topics.`);
  if (file.entries.length > MAX_ENTRIES) errors.push(`More than ${MAX_ENTRIES} entries.`);

  const topicNames = new Set();
  for (const topic of file.topics) {
    const label = `Topic '${topic?.name}'`;
    const problem = textProblem(topic?.name, label, MAX_TOPIC_NAME, true);
    if (problem) errors.push(problem);
    else if (topicNames.has(topic.name.trim().toLowerCase())) errors.push(`${label} is listed twice.`);
    else topicNames.add(topic.name.trim().toLowerCase());
    if (typeof topic?.emoji !== 'string' || !isOneEmoji(topic.emoji.trim())) errors.push(`${label} needs exactly one emoji.`);
    if (!HEX_COLOR.test(topic?.color ?? '')) errors.push(`${label} needs a color like #ffa94d.`);
  }

  const owners = new Map();
  const perTopic = new Map();
  for (const entry of file.entries) {
    const label = `Entry '${entry?.english}'`;
    const before = errors.length;
    const english = textProblem(entry?.english, `${label}: the English text`, MAX_ENGLISH, true);
    if (english) errors.push(english);
    else if (lettersOnly(entry.english).length === 0) errors.push(`${label}: the English text needs a letter a-z.`);
    const hu = textProblem(entry?.hu, `${label}: the Hungarian meaning`, MAX_HU, true);
    if (hu) errors.push(hu);
    const note = textProblem(entry?.note, `${label}: the note`, MAX_NOTE, false);
    if (note) errors.push(note);

    if (entry?.kind !== undefined && entry.kind !== 'word' && entry.kind !== 'phrase') errors.push(`${label}: kind must be word or phrase.`);
    if (!topicNames.has(String(entry?.topic ?? '').trim().toLowerCase())) errors.push(`${label}: the topic '${entry?.topic}' is not listed under "topics".`);

    const others = entry?.alsoAccepted ?? [];
    if (!Array.isArray(others) || others.length > MAX_ALSO_ACCEPTED) {
      errors.push(`${label}: alsoAccepted must be a list of at most ${MAX_ALSO_ACCEPTED}.`);
    } else {
      for (const other of others) {
        const problem = textProblem(other, `${label}: the accepted spelling '${other}'`, MAX_ENGLISH, true);
        if (problem) errors.push(problem);
        else if (lettersOnly(other).length === 0) errors.push(`${label}: the accepted spelling '${other}' needs a letter a-z.`);
      }
    }

    const visual = typeof entry?.visual === 'string' ? entry.visual.trim() : '';
    if (entry?.visual !== undefined && typeof entry.visual !== 'string') errors.push(`${label}: visual must be text.`);
    else if (visual && !isOneEmoji(visual) && !(visual.startsWith('color:') && HEX_COLOR.test(visual.slice(6)))) {
      errors.push(`${label}: visual must be one emoji, color:#rrggbb, or empty.`);
    }

    if (errors.length === before) {
      const topicKey = entry.topic.trim().toLowerCase();
      perTopic.set(topicKey, (perTopic.get(topicKey) ?? 0) + 1);
      for (const key of spellingKeys([entry.english, ...others])) {
        const first = owners.get(key);
        if (first && first !== entry) errors.push(`${label} and '${first.english}' share the spelling '${key}' (compared by letters only, like the typing game).`);
        else owners.set(key, entry);
      }
    }
  }

  for (const topic of file.topics) {
    const count = perTopic.get(String(topic?.name ?? '').trim().toLowerCase()) ?? 0;
    if (count < MIN_TOPIC_ENTRIES) {
      warnings.push(`Topic '${topic?.name}' has ${count} entries in this file (the games like at least ${MIN_TOPIC_ENTRIES} per topic, counting entries already in the dictionary).`);
    }
  }
  return { errors, warnings };
}

async function resolveTarget(options, interactive) {
  const ask = async url => {
    if (!interactive) throw new Error(`No password: set ${WEB_PASSWORD_VARIABLE}, or run this in a terminal to be asked.`);
    return promptHidden(`Teacher password for ${url} (not shown): `);
  };

  if (options.target === 'web') {
    const url = (options.url ?? WEB_URL).replace(/\/+$/, '');
    if (!url.startsWith('https://')) throw new Error('The web target needs an https URL.');
    const fromEnvironment = process.env[WEB_PASSWORD_VARIABLE];
    const password = options.askPassword || !fromEnvironment ? await ask(url) : fromEnvironment;
    return {
      url, password,
      attempts: WEB_START_ATTEMPTS, waitMs: WEB_START_WAIT_MS, timeoutMs: WEB_START_TIMEOUT_MS,
      hint: `Is it a teacher's password, and is TEACHERS_JSON set on the Static Web App?`,
      unreachable: 'Is the Static Web App deployed, and is the URL right?',
    };
  }

  const url = (options.url ?? LOCAL_URL).replace(/\/+$/, '');
  const password = options.askPassword ? await ask(url) : localTeacherPassword();
  if (!password) throw new Error('No local teacher password: create classroom/api/local.settings.json, or use --ask-password.');
  return {
    url, password,
    attempts: 1, waitMs: 0, timeoutMs: CALL_TIMEOUT_MS,
    hint: 'The local API may use other settings: use --ask-password.',
    unreachable: 'Start the Cosmos emulator (docker start englishtutor-cosmos) and the API (func start, in classroom/api).',
  };
}

function localTeacherPassword() {
  for (const file of ['local.settings.json', 'local.settings.example.json']) {
    const path = resolve(repoRoot, 'classroom/api', file);
    if (!existsSync(path)) continue;
    const teachers = JSON.parse(readJson(path).Values?.TEACHERS_JSON ?? '[]');
    if (teachers.length > 0) return teachers[0].password;
  }
  return null;
}

// --- terminal prompts -------------------------------------------------------------------------------------------

/** Reads a line without echoing it, so the password does not stay on the screen or in a terminal log. */
function promptHidden(question) {
  return new Promise((resolvePassword, reject) => {
    const stdin = process.stdin;
    let value = '';
    const finish = (error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolvePassword(value);
    };
    const onData = chunk => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0003') return finish(new Error('Cancelled.'));
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function confirm(question) {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await lines.question(question)).trim().toLowerCase() === 'yes';
  } finally {
    lines.close();
  }
}

// --- the API ----------------------------------------------------------------------------------------------------

function createApi(target) {
  return {
    async call(method, path, body, timeoutMs = CALL_TIMEOUT_MS) {
      const headers = { [PASSWORD_HEADER]: target.password };
      if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
      const response = await fetch(target.url + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: response.status, json, text };
    },
  };
}

/**
 * Logs in, and waits for an API that is still starting: no answer or a 5xx is retried (the deployed Functions can
 * take a few seconds after being idle). Any other answer, including a wrong password, is final.
 */
async function logIn(api, target) {
  let problem = '';
  for (let attempt = 1; attempt <= target.attempts; attempt++) {
    let login = null;
    try {
      login = await api.call('POST', '/api/login', { password: target.password }, target.timeoutMs);
    } catch (error) {
      problem = error.name === 'TimeoutError' ? 'no answer in time' : error.cause?.code ?? error.cause?.errors?.[0]?.code ?? error.message;
    }
    if (login && login.status < 500) {
      if (login.status === 200 && login.json?.role === 'teacher') return login.json;
      const notDeployed = login.status === 404 ? ' A 404 usually means the API is not deployed.' : '';
      throw new Error(`Login to ${target.url} failed (HTTP ${login.status}). ${target.hint}${notDeployed}`);
    }
    if (login) problem = `HTTP ${login.status}`;
    if (attempt < target.attempts) {
      console.log(`The API is not answering yet (${problem}); waiting ${target.waitMs / 1000} s (try ${attempt} of ${target.attempts})...`);
      await new Promise(done => setTimeout(done, target.waitMs));
    }
  }
  throw new Error(`Cannot reach ${target.url} (${problem}). ${target.unreachable}`);
}

async function readDictionary(api) {
  const response = await api.call('GET', '/api/dictionary');
  if (response.status !== 200) throw new Error(`Reading the dictionary failed (HTTP ${response.status}): ${response.text}`);
  return response.json;
}

/** The same comparison as Spelling.LettersOnly and the typing game: lower-case a-z without accents. */
function lettersOnly(text) {
  return (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
}

function spellingKeys(spellings) {
  return [...new Set(spellings.map(lettersOnly).filter(key => key.length > 0))];
}

/** Hungarian accents carry meaning (ló / lo), so only case and spacing are ignored. */
function sameMeaning(a, b) {
  const clean = text => (text ?? '').trim().normalize('NFC').toLowerCase();
  return clean(a) === clean(b);
}

function describe(response) {
  return `HTTP ${response.status} ${response.json?.error ?? response.text}`;
}

// --- listing, topics and entries --------------------------------------------------------------------------------

function printTopics(dictionary) {
  const counts = new Map();
  for (const word of dictionary.words) counts.set(word.topicId, (counts.get(word.topicId) ?? 0) + 1);
  console.log(`${dictionary.topics.length} topics, ${dictionary.words.length} words:`);
  for (const topic of dictionary.topics) console.log(`  ${topic.emoji} ${topic.name}  (${counts.get(topic.id) ?? 0})  ${topic.color}`);
  for (const warning of dictionary.warnings) console.log(`  warning: ${warning}`);
}

async function runImport(api, importFile, dryRun) {
  const before = await readDictionary(api);
  console.log(`Dictionary now: ${before.topics.length} topics, ${before.words.length} words\n`);

  const result = { topicsCreated: 0, topicsReused: 0, created: 0, alreadyThere: 0, conflicts: 0, failed: 0 };
  const topicIds = await ensureTopics(api, importFile.topics, before.topics, dryRun, result);
  await addEntries(api, importFile.entries, topicIds, before.words, dryRun, result);

  console.log(`\nTopics: ${result.topicsCreated} ${dryRun ? 'to create' : 'created'}, ${result.topicsReused} reused. ` +
    `Entries: ${result.created} ${dryRun ? 'to create' : 'created'}, ${result.alreadyThere} already there, ${result.conflicts} conflicts, ${result.failed} failed.`);
  return result;
}

async function ensureTopics(api, fileTopics, existingTopics, dryRun, result) {
  const ids = new Map(existingTopics.map(t => [t.name.toLowerCase(), t.id]));
  for (const topic of fileTopics) {
    const name = topic.name.trim();
    const key = name.toLowerCase();
    if (ids.has(key)) {
      console.log(`= topic ${topic.emoji} ${name} exists`);
      result.topicsReused++;
      continue;
    }
    if (dryRun) {
      ids.set(key, `(new) ${name}`);
      console.log(`+ topic ${topic.emoji} ${name} would be created`);
      result.topicsCreated++;
      continue;
    }
    const response = await api.call('POST', '/api/teacher/topics', { name, emoji: topic.emoji.trim(), color: topic.color });
    if (response.status !== 201) throw new Error(`Creating the topic '${name}' failed: ${describe(response)}`);
    ids.set(key, response.json.id);
    console.log(`+ topic ${topic.emoji} ${name}`);
    result.topicsCreated++;
  }
  return ids;
}

async function addEntries(api, entries, topicIds, existingWords, dryRun, result) {
  // Which entry owns each spelling, including the ones added during this run.
  const owners = new Map();
  for (const word of existingWords) {
    for (const key of spellingKeys(word.alts)) owners.set(key, word);
  }

  for (const entry of entries) {
    const alsoAccepted = entry.alsoAccepted ?? [];
    const keys = spellingKeys([entry.english, ...alsoAccepted]);
    const owner = keys.map(key => owners.get(key)).find(Boolean);
    const label = `${entry.english} - ${entry.hu}  [${entry.topic}]`;

    if (owner?.fromImportFile) {
      console.log(`! ${label} CONFLICT: the import file lists '${owner.english}' already, with the same spelling`);
      result.conflicts++;
      continue;
    }
    if (owner) {
      if (sameMeaning(owner.hu, entry.hu)) {
        console.log(`= ${label} already there`);
        result.alreadyThere++;
      } else {
        console.log(`! ${label} CONFLICT: '${owner.english}' is already there with the meaning '${owner.hu}'`);
        result.conflicts++;
      }
      continue;
    }

    const body = {
      kind: entry.kind ?? (/\s/.test(entry.english.trim()) ? 'phrase' : 'word'),
      topicId: topicIds.get(entry.topic.trim().toLowerCase()),
      english: entry.english,
      alsoAccepted,
      hu: entry.hu,
      note: entry.note ?? '',
      visual: entry.visual ?? '',
    };
    if (dryRun) {
      console.log(`+ ${label} ${body.visual} (${body.kind}) would be created`);
      for (const key of keys) owners.set(key, { english: entry.english, hu: entry.hu, fromImportFile: true });
      result.created++;
      continue;
    }
    const response = await api.call('POST', '/api/teacher/entries', body);
    if (response.status === 201) {
      console.log(`+ ${label} ${body.visual} (${body.kind})`);
      for (const key of keys) owners.set(key, { english: entry.english, hu: entry.hu, fromImportFile: true });
      result.created++;
    } else {
      console.log(`x ${label} NOT SAVED: ${describe(response)}${response.json?.field ? ` (field: ${response.json.field})` : ''}`);
      result.failed++;
    }
  }
}

/** Reads the dictionary back and checks that every entry of the import file is in it with its Hungarian meaning. */
async function verify(api, importFile) {
  const after = await readDictionary(api);
  const byKey = new Map();
  for (const word of after.words) {
    for (const key of spellingKeys(word.alts)) byKey.set(key, word);
  }
  const missing = importFile.entries.filter(entry => {
    const word = byKey.get(spellingKeys([entry.english])[0]);
    return !word || !sameMeaning(word.hu, entry.hu);
  });

  console.log(`\nRead back: ${after.topics.length} topics, ${after.words.length} words. ` +
    (missing.length === 0 ? `All ${importFile.entries.length} entries of the import file are there with their meanings.` : `MISSING or different: ${missing.map(e => e.english).join(', ')}`));
  const counts = new Map();
  for (const word of after.words) counts.set(word.topic, (counts.get(word.topic) ?? 0) + 1);
  for (const topic of after.topics) console.log(`  ${topic.emoji} ${topic.name}: ${counts.get(topic.name) ?? 0}`);
  for (const warning of after.warnings) console.log(`  warning: ${warning}`);
  return missing.length === 0;
}
