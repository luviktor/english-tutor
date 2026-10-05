# EnglishTutor – classroom version

The English-learning game of [`demo/`](../demo/) for a whole class, hosted on Azure for free
(see [`docs/azure-plan.md`](../docs/azure-plan.md)). Pupils see it as **Angol kaland**.

| Folder | What |
|---|---|
| `web/` | Vanilla JS frontend (copied from `demo/web`) and `staticwebapp.config.json`. Pupils and the login screen look like the demo (`css/style.css`), the teacher's view is calmer (`css/teacher.css`) |
| `api/` | `EnglishTutor.Api`: Azure Functions, C# .NET 10 isolated worker, served by Static Web Apps under `/api` |
| `tests/` | xUnit tests of the API |

## Login

There are no accounts: the pupils, the teachers and their passwords are listed in the API's settings. The login
screen is the demo's splash: the school drawn as a wireframe (`web/js/school-wireframe.js`, a copy of the demo's file), then a box where the fox asks for the password (`web/js/splash.js`).

| Setting | Content |
|---|---|
| `PUPILS_JSON` | `[{"id":"p01","name":"Kék bagoly","password":"piros-roka-7"}, ...]` |
| `TEACHERS_JSON` | `[{"id":"t01","name":"Éva néni","password":"hosszu-tanari-jelszo-1"}, ...]` |
| `COSMOS_CONNECTION_STRING` | Where the progress is stored |

* A pupil types only their own password; it identifies them. Passwords are compared by their letters and
  digits only, ignoring case and accents: `Piros róka 7` works for `piros-roka-7`. Give each pupil a
  different, easy one, e.g. colour–animal–number.
* **Pupils get aliases, not their own names:** `name` is a made-up player name or a code that has nothing to
  do with the child's name or nickname. The parents are told that nothing in Azure identifies their child, so
  keep the list of who is who on paper, never in Azure or in the repository. The API drops `player.name`
  before saving, so the database holds no name at all; the alias exists only in the `PUPILS_JSON` setting
  and in the browser while the child plays.
* `id`: English letters, digits, `-` and `_`. **Progress is stored by the id**, so a pupil keeps it when
  their password changes. Changing a password logs the pupil out on every device.
* Each teacher has their own long password (at least 8 letters or digits) and the same kind of `id` and
  `name`. The login shows the teacher's name in the top right.
* Ids and passwords must be unique across both lists. If a pupil clashes with a teacher, the pupil is left out.
* The browser keeps the password, so a pupil types it once per device. On shared school computers they
  should log out (the name chip at the top right).
* Mistakes in either list (duplicate ids or passwords, missing names, too short passwords) skip that entry;
  they are logged and shown in the teacher's view, without the passwords.

## Teacher's view

A teacher's password opens the teacher's view instead of the game, with the teacher's name in the top right
and two tabs.

* **Osztály** is the class table: every pupil with level and XP, words per level (new / learning / known /
  gold), accuracy, current and longest streak, answers in the last 14 days and when they last played.
  Columns sort on click. Below it: problems in the pupil and teacher lists. The data is the summary each
  pupil's last save stored, so it's cheap to read; it counts only words that are still in the dictionary,
  and a word deleted later drops out at the pupil's next save. A teacher who wants to play adds themself to
  `PUPILS_JSON`.
* **Szótár** is where the teachers enter and manage the class's words, see [The dictionary](#the-dictionary).

## Saving

Each pupil's progress is one document in Cosmos DB. The browser saves at most every 5 seconds, at the end
of every round and when the page is hidden. Every change is also kept in `localStorage` first, and failed
saves are retried, so a flaky connection or closing the browser loses nothing; after two failed
attempts the top bar shows 💾❗ until a save succeeds.

Every save names the revision it is based on. If the pupil played on another device in the meantime, the
server answers `409 Conflict` with its newer copy, and the browser switches to that copy (the few
unsaved changes of the older device are dropped).

**Importing earlier results** (e.g. the demo's `demo/data/progress.json`): log in as the pupil,
then ⚙️ Beállítások → 💾 Mentés fájlba → 📥 Betöltés fájlból. The same place offers a download.

## API

All endpoints except login need the password in the `X-EnglishTutor-Password` header.

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/dictionary` | pupil or teacher | `{ topics, words, warnings }`: the class's own dictionary from the Cosmos container `dictionary`. Built at most every 30 s per Functions instance; browsers revalidate with the ETag (`Cache-Control: private, no-cache`, 304 when unchanged). If Cosmos can't be read it serves the last good copy, or 503 when it has none. |
| `POST /api/login` | anyone | `{"password": "..."}` → `{ id, name, role }` (`pupil` or `teacher`), or 401 |
| `GET /api/progress` | pupil | `{ revision, updatedAt, data }`, or 204 when there is nothing yet |
| `PUT /api/progress` | pupil | `{ revision, data }` → `{ revision, updatedAt }`; 409 with the newer copy when `revision` is stale |
| `GET /api/teacher/class` | teacher | `{ pupils: [{ id, name, revision, updatedAt, summary }], problems }`; `summary` is null for pupils who haven't played |
| `POST /api/teacher/entries`, `PUT`/`DELETE /api/teacher/entries/{id}` | teacher | Add, change and delete a word or phrase |
| `POST /api/teacher/topics`, `PUT`/`DELETE /api/teacher/topics/{id}`, `PUT /api/teacher/topic-order` | teacher | Add, change, delete and reorder topics |

The teacher endpoints take and return the same JSON shape as `GET /api/dictionary`. A change names the `revision`
it is based on. Errors: 400 `{ error, field }` for a broken rule, 404 when the entry or topic is already gone, and
409 `{ error, reason, current }` when another teacher got there first (`stale`), another entry already has the
spelling (`duplicate`), or a topic still has entries (`topic-not-empty`). The messages are in Hungarian. Details:
[`docs/teacher-dictionary.md`](../docs/teacher-dictionary.md#teacher-api).

## Run it locally

Tools: .NET SDK 10, Azure Functions Core Tools 4, Node.js, the Static Web Apps CLI
(`npm i -g @azure/static-web-apps-cli`) and Docker for the Cosmos DB emulator.

```bash
docker run --detach --name englishtutor-cosmos --publish 8081:8081 --publish 8080:8080 --publish 1234:1234 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-latest --protocol https
cp api/local.settings.example.json api/local.settings.json   # once
swa start englishtutor
```

Run the last two from this folder, then open `http://localhost:4280`. Later, `docker start englishtutor-cosmos`
restarts the emulator; its data explorer is at `http://localhost:1234`.

* `local.settings.json` is gitignored. The example points at the emulator (its well-known key) and has two
  test pupils (`teszt-roka-1`, `teszt-bagoly-2`) and two test teachers (`teszt-tanar-jelszo`,
  `teszt-tanarno-jelszo`). Never use these in Azure.
* In Development, the API talks to the emulator over HTTPS in Gateway mode, accepts its self-signed
  certificate, and creates the database and container on first use.
* `swa-cli.config.json` starts the Functions host (`func start`, port 7071) and serves `web/` with `/api`
  proxied to it. (The SWA CLI would start Core Tools by itself, but refuses to under Node.js 24.) The preview
  config `classroom` in `.claude/launch.json` runs the same from the repository root.
* SWA CLI 2.0.10 doesn't know `dotnet-isolated:10.0` yet, so it prints a schema error and ignores
  `staticwebapp.config.json` locally (headers, fallback route). Azure accepts the value.

Tests: `dotnet test EnglishTutor.slnx`.

## The dictionary

There are no built-in words: the class practises exactly what the teachers entered, and the demo's
`demo/data/dictionary.csv` is not used here. The dictionary is empty until the teachers fill it in, so
the pupils should get their passwords only after that. The words, phrases and topics are documents in the Cosmos
container `dictionary` (design and rules: [`docs/teacher-dictionary.md`](../docs/teacher-dictionary.md)).

**Entering words** (teacher's view → Szótár):

* Create the topics first (**＋ Új téma**: name, emoji, colour), then **＋ Új szó / kifejezés**. The form keeps
  itself open after each save, so the first set can be typed in quickly. A topic's own **＋** starts it in that topic.
* An entry has a kind (*szó* or *kifejezés*; the form suggests a phrase when the English text has a space), the
  English text that is shown and spoken, other accepted spellings (one per line, up to 5, e.g. `thanks` next to
  `thank you`), the Hungarian meaning, an optional note, a topic and a picture (an emoji or a colour; an
  empty emoji means no picture). A live preview shows the card the pupils will see, and its 🔊 button speaks
  the English text with the browser's voice.
* Limits: 60 characters for the English and Hungarian text, 80 for the note, 30 for a topic name, 50 topics
  and 1000 entries. No two entries may share a spelling; spellings are compared by letters only, ignoring case,
  accents and punctuation, the way the typing game compares answers.
* The note is a short hint on when a phrase is used (*hivatalos bemutatkozáskor*). Pupils see it in small text
  under the Hungarian meaning on the new-word preview, the flashcards and the typing game.
* Both teachers can work at the same time. If the other teacher changed the same entry or topic first, the
  save is refused, their version is loaded into the form with their name, and nothing is overwritten.
* Deleting an entry also loses the pupils' progress on it (their saved data keeps the record, unused). A topic
  can be deleted only when it has no entries. Correcting a spelling keeps the progress, because progress is
  keyed by the entry's generated id, not by its text.
* Warnings (entries without a picture, possible duplicates, topics with fewer than 4 entries, which is too few
  for the multiple-choice and pair games) appear above the list, as of the last load.

An entry may have no picture (an empty `visual`). It is shown as a tile with its first letter, and the games
practise it with text only (hear it and pick the English word, or see the Hungarian word and pick the English
one; in the pair game it is matched with its Hungarian meaning). An `img:` picture that fails to load falls back
to the same tile. `kind` is stored but the games don't use it yet.

**Caching:** the API reads the whole dictionary from Cosmos at most every 30 s per Functions instance, and
a change made through an instance shows there at once. Browsers ask on every load and get 304 when nothing
changed, so new words show at the pupils' next app load. When Cosmos can't be read, the last good copy is
served.

## Deployment

`.github/workflows/azure-static-web-apps.yml` runs the tests, publishes the API and deploys
`web/` + the API on every push to `master` that touches `classroom/`. One-time Azure setup and the
settings above: [`infra/README.md`](../infra/README.md). When a release needs a new Cosmos container (the
`dictionary` container was the first), deploy `infra/main.bicep` before pushing the code: the API's key
can't create containers in Azure.

The class uses the custom domain `https://erkel2023b.hu` (also `https://www.erkel2023b.hu`); the DNS records
are described in [`infra/README.md`](../infra/README.md#5-custom-domain). The default `*.azurestaticapps.net`
address works as well. A browser keeps the saved password and the local copy per address, so a device that
used another address logs in once more; the progress is on the server.
