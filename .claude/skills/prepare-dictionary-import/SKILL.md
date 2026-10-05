---
name: prepare-dictionary-import
description: Turn a photo or screenshot of an exercise-book or textbook page (word pairs, phrases, grammar example sentences, or a mix), or a typed list, into a reviewed import file for the EnglishTutor classroom dictionary. Identifies words, phrases and sentences, translates missing Hungarian or English itself and flags it for review, groups the entries into topics with the user, and saves a validated JSON file. Writes nothing to the app.
argument-hint: "[image path(s)]"
disable-model-invocation: true
---

# Prepare a dictionary import

Run on demand (`/prepare-dictionary-import`). It produces an **import file**: a small JSON file with topics and
English-Hungarian entries that the user can read and change before anything reaches a dictionary. Nothing here
talks to the app's data; loading is the job of `/upload-dictionary-import`. Keeping them apart means the part that
needs judgement (reading the page, choosing phrases, translating, grouping) is finished and reviewed before the part
with side effects starts.

What the pupils practise comes straight from this file, so a misread word or a wrong translation ends up in
children's heads and in the typing game's marking. That is why the steps below stop for the user's confirmation.

## What the user gives you

- One or more images (a path given with the command, an attachment, or an image already in the conversation), or a
  typed list. If there is none, ask for it.
- Their own thoughts: translations they prefer, topic ideas, things to leave out. Their wording wins over the page and
  over your reading of it.

The page is rarely a tidy list of pairs. It can mix word pairs (English on one side, Hungarian on the other), phrases,
grammar example sentences, short rule explanations, exercise instructions, gap-fill sentences, headings, dates and
doodles, in print or handwriting, across one image or several. Work out what is on it before deciding what to import.

## Steps

### 1. Read the page and sort what you see

Sort every item into one of these and say which you chose:

- **word**: a single word with its translation.
- **phrase**: a chunk that belongs together (`in the garden`, `How do you do?`, `look at`). Identification is best
  effort: when the page has running text or sentences, pick out the chunks the lesson seems to teach (repeated
  structures, underlined or highlighted parts, expressions that do not translate word for word) and offer them as
  candidates the user keeps or drops. Do not flood the list with every possible chunk.
- **sentence or pattern**: a grammar example sentence (`Max has got a bag`) becomes a phrase entry as a whole, if it
  fits in 60 characters (ask before shortening a longer one). A structure the page is clearly teaching can also become a
  pattern with dots, `she has got ...` with `van neki ...`, with the example sentences as separate entries.
- **rule explanation**: a grammar rule in Hungarian or English is not an entry. Offer to condense it into a short
  `note` (up to 80 characters) on the matching pattern entry; otherwise leave it out.
- **leave out**: exercise instructions, headings, page numbers, dates, pupils' names on the page, doodles, and gap-fill
  sentences with blanks (use one only if its answer is written in; otherwise ask).

Name what you left out, so the user can overrule it.

### 2. Fill in what is missing

- Hungarian missing: translate it yourself. English missing: translate it to English the same way.
- Write for a 9-year-old: simple, natural wording a Hungarian teacher would use, not a word-for-word rendering. Where a
  word has several meanings, take the one that fits the lesson's theme and mention the other if it could confuse.
- Mark every translation you wrote as yours. Pupils will learn it as the truth, so the user must review it.
- Never overwrite what the page says. If it looks wrong, ask.

### 3. Show the table and get corrections

Show a numbered table: # | English | Hungarian | kind | remark (`page`, `translated by me`, `unsure: ...`). Then stop and
ask the user to correct it, and continue only when they have. These traps are common:

- A phrase's Hungarian can run over two lines while the English sits on one, and arrows can link one line to another.
- A row with text on one side only is either something to translate (step 2) or a margin note; do not guess which.
- Handwritten names are easy to misread (`Rae` was really `Max`); ask.
- Handwriting often drops or blurs Hungarian accents (ő, ű, ö, ü); check every word that should carry one.
- A word written twice on the page: keep one, and say so.
- Spelling mistakes in the English (a child may have written the page): correct them, and say which.
- Margin notes such as `she's got = she has got` are lessons, not pairs. A good shape is the pattern `she has got ...`
  with `she's got` as an accepted spelling.

### 4. Look at what the dictionary already has (optional)

```
node .claude/skills/upload-dictionary-import/upload-dictionary.mjs --list
```

lists the topics with their entry counts (it needs the local API; add `--target web` for the web app, which asks for
the password in a terminal). If the API is not running, carry on and tell the user the topics could not be compared;
the upload skill can start it. Reuse an existing topic's name exactly: topics are matched by name when uploading, and
a near miss creates a second topic.

### 5. Shape the entries with the user

Propose, let the user react, adjust, repeat. Show the result grouped by topic.

- **Topics**: group by meaning, Hungarian names of at most 30 characters, one emoji and a colour each. The
  multiple-choice and pair games need at least 4 words in a topic, so prefer fewer, fuller topics; a small topic is
  allowed, it only gets a hint.
- **Kind**: `word` or `phrase`; leave it out and a space in the English text decides. Sentences are phrases.
- **Patterns**: `she has got ...` with `van neki ...` is fine. The typing game ignores the dots and the browser voice
  does not read them.
- **`alsoAccepted`**: only spellings that are correct English, such as short forms (`she's got`).
- **`note`**: a short Hungarian hint, shown under the meaning and in the typing prompt. Never put the English answer in it.
- **`visual`**: one emoji where an obvious one exists; leave abstract entries (season, time, in the garden) empty rather than
  forcing a misleading picture. `color:#rrggbb` suits colour words.
- **Hungarian wording**: keep what the page or the user says. Fix a slip only after they agree.
- Do not add words that are not on the page unless the user asks.

### 6. Write the import file

Save it as `classroom/imports/<YYYY-MM-DD>-<short-ascii-slug>.json`, creating the folder if needed (it is gitignored, so
word lists stay out of the repository). Keep the file name ASCII so it can be typed into a terminal command. The format,
with its limits, is in [references/import-file-format.md](references/import-file-format.md); a complete file is
[references/example-import.json](references/example-import.json). Put where the list came from in `source`.

### 7. Check it

```
node .claude/skills/upload-dictionary-import/upload-dictionary.mjs classroom/imports/<file>.json --check
```

This validates the file offline and lists every problem at once. Fix errors and re-run; warnings (such as a topic with
fewer than 4 entries) are hints for the user to weigh.

### 8. Hand off

Tell the user the file path and the counts per topic, which entries have a Hungarian or English text you wrote, and that
they can edit the file by hand and re-run the check. To load it, they run `/upload-dictionary-import` with the target
`local`, `web` or `both`.
