# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An English-learning game for 9-year-old Hungarian children. The UI text, coach phrases and settings are in Hungarian; keep user-facing strings Hungarian (see `*/web/js/strings.js`). There are two versions:

- `demo/` – **"Nóra angol kalandja"**, the original for one child: a localhost Python server (also deployable to GitHub Pages). `demo/README.md` documents the features and the dictionary CSV format. Leave it untouched unless asked.
- `classroom/` – **"Angol kaland"**, the same game for a whole class on Azure (Static Web Apps Free + C# Functions + Cosmos DB free tier), with pupil passwords and a teacher view. `docs/azure-plan.md` is the plan and its decisions; `classroom/README.md` documents login, saving, the API and local development; `infra/README.md` the Azure setup.

Naming: the application is **EnglishTutor** in every project, resource and identifier; never use "Nora" in names.

## Repository layout

- `demo/` – the demo app (details below).
- `classroom/` – `web/` (frontend copied from `demo/web`; pupils keep the demo's look, teachers get a calmer one), `api/` (`EnglishTutor.Api`), `tests/` (xUnit), `EnglishTutor.slnx`, `swa-cli.config.json`, `CHANGELOG.md` (see Versioning).
- `infra/main.bicep` – Static Web App `swa-englishtutor` with its custom domains `erkel2023b.hu` and `www.erkel2023b.hu` (the DNS records are at the registrar, see `infra/README.md`), Cosmos account `cosmos-englishtutor-<suffix>`, database `englishtutor`, containers `progress` and `dictionary`. The API's key can't create containers in Azure, so deploy the template before code that uses a new one.
- `.github/workflows/pages.yml` – deploys the demo to GitHub Pages; `.github/workflows/azure-static-web-apps.yml` – tests and deploys `classroom/` to Azure on pushes to `master`.
- `.claude/launch.json` – preview configs (`english-tutor`, `pages-preview`, `classroom`).
- `.claude/skills/` – developer skills for filling the classroom dictionary, not part of the app; both run only when invoked by name (`disable-model-invocation`): `/prepare-dictionary-import` (a photo or list → a reviewed import file in the gitignored `classroom/imports/`) and `/upload-dictionary-import` (an import file → the teacher API, target `local`, `web` or `both`; script `upload-dictionary.mjs`, which only adds and never changes or deletes entries).
- `docs/azure-plan.md`, `README.md`, `.gitignore`, this file.

## Running

- Demo: `py demo/server.py` (or `demo/start.bat`) serves on `http://127.0.0.1:8765/`; add `--no-browser` to suppress the browser. Preview config `english-tutor`.
- Classroom: start the Cosmos DB emulator (`docker start englishtutor-cosmos`, or the `docker run` in `classroom/README.md`), copy `classroom/api/local.settings.example.json` to `local.settings.json` once, then `swa start englishtutor` from `classroom/` (or the `classroom` preview config) → `http://localhost:4280`. The SWA CLI runs `func start` (port 7071) via `--run` because it refuses to start Core Tools under Node 24, and it ignores `staticwebapp.config.json` locally because its schema doesn't know `dotnet-isolated:10.0` yet.
- Tests: `dotnet test classroom/EnglishTutor.slnx`. The demo has no tests, linter or package manager; both frontends are vanilla ES modules without a bundler.

## Demo architecture

**`demo/server.py`** – a single-file `ThreadingHTTPServer` that serves `demo/web/` statically plus `GET /api/dictionary` (parses `demo/data/dictionary.csv` + `topics.csv` on every request; tolerant of `;`/`,` separators, Hungarian or English headers, UTF-8 or Windows-1250, row errors become warnings), `GET /api/progress` and `POST /api/progress` (atomic write, daily backups in `demo/data/backups/`). Localhost `Host` headers only.

**Frontend (`demo/web/js/`)** – `main.js` boots: loads state + dictionary + speech voices, then routes to `home`.
- `auth.js` + `splash.js` (art in `school-wireframe.js`): access gate. `boot()` shows the splash (animation, then a code box) unless the `erkel_tutor_auth` cookie says the browser is unlocked; state/dictionary load in parallel behind it. The cookie holds only the fact, not the code; valid codes are the `CODES` list in `auth.js` (client-side, so a soft gate, not security). The splash is an overlay, not a router screen. `school-wireframe.js` draws the Erkel building as an SVG wireframe (traced from a photo; no style attributes, because the classroom CSP forbids them) and exists as an identical copy in `classroom/web/js`, where the login splash shows it; change both. The classroom has its own `splash.js` (same animation and CSS, but it logs in with the pupil's or teacher's password instead of checking an access code).
- `router.js`: tiny screen router over the History API. Screens in `screens/*.js` are registered in `main.js` and export `render(container, params)`, optionally returning a cleanup function.
- `api.js`: picks its back end automatically – `server.py`, or static hosting (pre-built `dictionary.json`, progress in localStorage).
- `state.js`: the single state object (XP, stars, per-word levels, daily stats, streak, badges, shop), saved through `api.js` (debounced `commit()`; subscribe with `onChange`). Words are keyed by lower-case English text, so changing a word's English spelling in the CSV loses its progress.
- `session.js`: one game round — word selection (`pickWords`), XP/stars/combo, end-of-round summary feeding `results`. The four games (`learn`, `listen`, `memory`, `typing`) all go through it.
- Data-like modules: `badges.js`, `levels.js`, `shop-items.js`, `rewards.js`, `hud.js`; `speech.js` wraps the Web Speech API; `sound.js`/`fx.js` handle effects.

`demo/data/progress.json` and `backups/` are gitignored runtime data. GitHub Pages: `demo/tools/build_pages.py` copies `demo/web/` to `demo/_site/` (gitignored) and pre-renders `dictionary.json`; preview with the `pages-preview` config.

## Classroom architecture

**`classroom/api/`** – Azure Functions, .NET 10 isolated worker, `HttpRequestData` model (no ASP.NET Core integration), served by Static Web Apps under `/api`.
- `Dictionary/`: the class's words, phrases and topics, entered by the teachers (no built-in words; the demo's CSV is not used here). Entries and topics are documents of the Cosmos container `dictionary` (`DictionaryDocument`, partition key `/classId` = `"class"`, told apart by `type`), behind `IDictionaryStore`/`CosmosDictionaryStore`. `DictionaryResponse.Build` turns them into the `GET /api/dictionary` JSON with the teachers' warnings, and `DictionaryProvider` caches that for 30 s per instance. `DictionaryService` holds the teachers' changes: `DictionaryRules` validates (Hungarian messages), a change names the `revision` it is based on (a stale one gets the current version back, using the ETags), spellings are compared with `Spelling.LettersOnly` like the typing game does, and every success calls `Invalidate()` so it shows at once. Entry ids are generated and never change; they are the keys the pupils' progress is saved under. A word may have no picture: its `visual` is then empty (frontend: `hasPicture()` in `web/js/dict.js`) and the games must not rely on a picture for it. Plan and rules: `docs/teacher-dictionary.md`.
- `Auth/Roster.cs`: pupils from the `PUPILS_JSON` setting and teachers from `TEACHERS_JSON`. A password alone identifies its owner; passwords are compared by letters and digits only (no case, accents, spaces or hyphens). Every request after login carries it in `X-EnglishTutor-Password`; `RequestIdentity.AuthorizeAsync` returns 401/403.
- `Progress/`: one Cosmos document per pupil, keyed by pupil id (`id`, `revision`, `updatedAt`, `summary`, `data`). `ProgressService.SaveAsync` rejects a save based on an old revision (409 with the newer copy) using ETags. `ProgressSummary` is computed on every save (counting only words still in the dictionary, via `ICurrentWords`) and feeds the teacher's class table. `CosmosProgressStore` uses Gateway mode and System.Text.Json; against the local emulator (Development only) it accepts the self-signed certificate and creates the database and container.
- `Functions/`: `GET /api/version` (anonymous; `AppVersion` reads it from the assembly), `GET /api/dictionary` (login required), `POST /api/login`, `GET`/`PUT /api/progress`, `GET /api/teacher/class`, and the teacher endpoints under `/api/teacher/` for entries, topics and the topic order (`TeacherDictionaryFunctions`).
- Secrets live in SWA environment variables (Azure) or the gitignored `classroom/api/local.settings.json` (local). **The repository is public: never commit real passwords or connection strings.**

**`classroom/web/`** – same structure as the demo frontend, plus:
- `api.js`: password header, `login`, `getVersion` (the label on the login screen and in the teacher's header; never throws), progress with revisions, `getClass`, the dictionary request (not through `request()`, so the browser can revalidate with the ETag) and the teacher's dictionary calls; a 401 sends the user back to the login screen.
- `dict.js`: the shared `dict` (`words`, `topics` incl. empty ones, `warnings`); pupil screens list `practiceTopics()` (topics with words) and show `NO_WORDS` when there are none; `noteLine()` shows a word's note.
- `state.js`: loads the pupil's progress, keeps a local copy in localStorage, saves at most every 5 s, at the end of each round (`saveNow`) and when the page is hidden, retries failures, and adopts the server's copy on a 409 or when a long-hidden tab finds a newer revision.
- `splash.js` (the login, see below) and `screens/teacher.js` are not router screens: `main.js` drives them directly; `account.js` handles logout (important on shared school computers). `teacher.js` has two tabs: the class table and `teacher-dictionary.js` (topics, entries, the entry form with its live preview). The dictionary tab applies the server's answers to the shared `dict` instead of reloading it, and everything a teacher typed goes into the page as text (`el()` children), never as HTML.
- Look, two themes: `css/style.css` is the demo's colourful stylesheet (floating emoji, big tiles, Comic-style font) for the login splash and every pupil screen; `css/teacher.css` is the calmer one (system font, flat cards, buttons with a solid bottom edge) for the teacher's view only. `index.html` loads both and `theme.js` `setTheme()` switches one off with `media="not all"`, so only one styles the page; `main.js` calls it after a teacher's login. Class names are shared, so a new class a teacher screen needs goes into `teacher.css`, one for pupils into `style.css`. The pupil wording is the demo's playful one too (level names, "matrica", the wardrobe), except what is classroom-specific.
- `splash.js`: `main.js` shows it when no password is stored (or the stored one stopped working, then the fox says so). It resolves with `{ identity, leave, gone }` right after a successful login and keeps covering the page while `main.js` loads the data behind it; `leave()` fades it out once the fox has cheered, `gone` resolves when it is removed. The teacher's theme is applied only after `gone`, because it would restyle the fading splash. `staticwebapp.config.json` sets the runtime, a CSP and cache headers.

## Word-learning rules (spread across `state.js`/`session.js`)

Each word has level 0–5; a correct answer raises it by at most +2 per day (so gold needs several days), a wrong one lowers it. In the classroom version the word's key is the dictionary entry's generated id, so correcting a spelling keeps the progress (in the demo it is the lower-case English text).

## Versioning

`classroom/` has one `x.y.z` version (API and frontend deploy together), starting at 1.0.0: `<Version>` in `classroom/api/EnglishTutor.Api.csproj`, shown on the login screen and in the teacher's header through `GET /api/version`; `classroom/CHANGELOG.md` says what each version changed. The demo has none. Rules, with what counts as a breaking API change, are in `classroom/README.md#versioning`:

- A feature raises `y` (and resets `z`); a fix or tweak raises `z`; an API change that breaks a client (above all the dictionary and teacher endpoints the upload skill uses) raises `x` (and resets `y` and `z`). Docs, tests, CI and refactoring don't bump.
- Bump it once, in the last commit of the branch (`Bump the version to 1.1.0`), together with that version's entry in `classroom/CHANGELOG.md` (a **Breaking changes** group first when `x` is raised), and say in the PR description which part you raised and why. If unsure whether a change breaks the API, ask.
- A breaking change also means adapting `.claude/skills/upload-dictionary-import/upload-dictionary.mjs` and raising its `API_MAJOR`: the script reads `GET /api/version` and refuses to write to an API of another major version.
- After the branch is merged, the merge commit gets an annotated tag `v<version>` (tags are pushed only when the user asks).

## Git workflow

When writing and organizing source code:

- Work on a `feature/<topic>` branch.
- Create small but still meaningful and compilable commits.
- Write the commit subject in imperative mood, so that it completes "When applied, this change will ...". Example: `Add SharedKernel building blocks`.
- Optionally add a commit description if the why is not obvious from the diff.
- Never push, and never amend or rewrite history, unless I ask.
