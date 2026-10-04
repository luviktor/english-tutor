# EnglishTutor – classroom version

The English-learning game of [`demo/`](../demo/) for a whole class, hosted on Azure for free
(see [`docs/azure-plan.md`](../docs/azure-plan.md)). Pupils see it as **Angol kaland**.

| Folder | What |
|---|---|
| `web/` | Vanilla JS frontend (copied from `demo/web`, restyled) and `staticwebapp.config.json` |
| `api/` | `EnglishTutor.Api`: Azure Functions, C# .NET 10 isolated worker, served by Static Web Apps under `/api` |
| `api/data/` | `dictionary.csv` and `topics.csv`, bundled with the API (same format as in the demo) |
| `tests/` | xUnit tests of the API |

## Login

There are no accounts: the pupils, the teachers and their passwords are listed in the API's settings. The login
screen shows the school as a wireframe drawing (`web/js/school-wireframe.js`, a copy of the demo's file).

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

A teacher's password opens the class table instead of the game: every pupil with level and XP,
words per level (new / learning / known / gold), accuracy, current and longest streak, answers in the last
14 days and when they last played. Columns sort on click. Below it: problems in the pupil and teacher lists
and the dictionary's status with its warnings. The data is the summary each pupil's last save stored, so
it's always up to date and cheap to read. A teacher who wants to play adds themself to `PUPILS_JSON`.

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

All endpoints except the dictionary and login need the password in the `X-EnglishTutor-Password` header.

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/dictionary` | anyone | The words and topics parsed from `api/data/*.csv`, a C# port of the reader in `demo/server.py`. Cached by browsers for 5 minutes. |
| `POST /api/login` | anyone | `{"password": "..."}` → `{ id, name, role }` (`pupil` or `teacher`), or 401 |
| `GET /api/progress` | pupil | `{ revision, updatedAt, data }`, or 204 when there is nothing yet |
| `PUT /api/progress` | pupil | `{ revision, data }` → `{ revision, updatedAt }`; 409 with the newer copy when `revision` is stale |
| `GET /api/teacher/class` | teacher | `{ pupils: [{ id, name, revision, updatedAt, summary }], problems }`; `summary` is null for pupils who haven't played |

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

Edit `api/data/dictionary.csv` (format: [`demo/README.md`](../demo/README.md#the-dictionary--datadictionarycsv)) and
push to `master`; the deployment rebuilds the API. Progress is keyed by the lower-case English word,
so changing a word's English spelling loses its progress.

The `emoji` column may be left empty: such a word has no picture. It is shown as a tile with its first
letter, and the games practise it with text only (hear it and pick the English word, or see the Hungarian
word and pick the English one; in the pair game it is matched with its Hungarian meaning). The teacher's
view shows one warning with the number of words without a picture. An `img:` picture that fails to load
falls back to the same tile.

## Deployment

`.github/workflows/azure-static-web-apps.yml` runs the tests, publishes the API and deploys
`web/` + the API on every push to `master` that touches `classroom/`. One-time Azure setup and the
settings above: [`infra/README.md`](../infra/README.md).
