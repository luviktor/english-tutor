# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Nóra angol kalandja": an English-learning game for a 9-year-old Hungarian child. The UI text, mascot phrases and parent corner are in Hungarian; keep user-facing strings Hungarian (see `demo/web/js/strings.js`). `demo/README.md` documents the features and the dictionary CSV format.

## Repository layout

The repository root only holds repo-level files; all application code lives in `demo/`, so a more complex solution can be added next to it later.

- `demo/` – the current app: the localhost server, the vanilla JS frontend, the dictionary data and the Pages build script (details below). Every path in the sections below is relative to the repository root.
- `.github/workflows/pages.yml` – deploys the demo to GitHub Pages.
- `.claude/launch.json` – preview configs (`english-tutor`, `pages-preview`).
- `README.md` – short repository overview pointing to `demo/README.md`; `.gitignore`; this file.

## Running

- `py demo/server.py` (or `demo/start.bat`) serves on `http://127.0.0.1:8765/` and opens the browser; add `--no-browser` to suppress that. The preview config in `.claude/launch.json` (`english-tutor`) uses this. `server.py` resolves `web/` and `data/` relative to its own location, so it works from any working directory.
- There is no package manager, linter, or test suite. Backend is Python standard library only; frontend is vanilla ES modules (no bundler, no framework). The only build step is the static GitHub Pages build (below).

## Architecture

**`demo/server.py`** – a single-file `ThreadingHTTPServer` that serves `demo/web/` statically plus three JSON endpoints: `GET /api/dictionary` (parses `demo/data/dictionary.csv` + `demo/data/topics.csv` on every request, so edits show up on reload; tolerant of `;`/`,` separators, Hungarian or English headers, UTF-8 or Windows-1250, and reports row errors as warnings instead of failing), `GET /api/progress`, and `POST /api/progress` (atomic write, one backup per day in `demo/data/backups/`, last 30 kept, falls back to the newest backup if `progress.json` is corrupt). Requests are restricted to localhost `Host` headers.

**Frontend (`demo/web/js/`)** – `main.js` boots: loads state + dictionary + speech voices, then routes to `home`.
- `auth.js` + `splash.js` (art in `splash-art.js`): access gate. `boot()` shows the splash (animation, then a code box) unless the `erkel_tutor_auth` cookie says the browser is unlocked; state/dictionary load in parallel behind it. The cookie holds only the fact, not the code; valid codes are the `CODES` list in `auth.js` (client-side, so a soft gate, not security). The splash is an overlay, not a router screen.
- `router.js`: tiny screen router over the History API. Screens in `demo/web/js/screens/*.js` are registered in `main.js` and export `render(container, params)`, optionally returning a cleanup function.
- `api.js`: picks its back end automatically – `server.py` (progress in `progress.json`) or, when `api/dictionary` is unreachable, static hosting (pre-built `dictionary.json`, progress in the browser's localStorage). URLs are relative so the app also works below a sub-path.
- `state.js`: the single state object, mirrored to `demo/data/progress.json` through `api.js` (debounced `commit()`; subscribe with `onChange`). Holds XP, stars, per-word levels, daily stats, streak, badges, shop. Words are keyed by lower-case English text, so changing a word's English spelling in the CSV loses its progress.
- `session.js`: one game round — word selection (`pickWords`: weakest/oldest first, capped number of never-seen words), XP/stars/combo, and end-of-round summary feeding `results`. The four games (`learn`, `listen`, `memory`, `typing`) all go through it.
- Reward/gamification rules are data-like modules: `badges.js` (trophies), `levels.js` (XP curve), `shop-items.js`, `rewards.js`, `hud.js`.
- `speech.js` wraps the browser Web Speech API (Windows English voice); `sound.js`/`fx.js` handle effects.

**Data (`demo/data/`)** – `dictionary.csv` and `topics.csv` are tracked; `progress.json` and `backups/` are gitignored runtime data (don't commit them).

## GitHub Pages deployment

`.github/workflows/pages.yml` runs on every push to `master`/`main` (and manually): it executes `python demo/tools/build_pages.py`, which copies `demo/web/` to `demo/_site/` and pre-renders the dictionary (reusing `server.build_dictionary()`) to `dictionary.json`, then uploads `demo/_site` to Pages. `demo/_site/` is gitignored build output. Preview it locally with `py demo/tools/build_pages.py`, then the `pages-preview` config in `.claude/launch.json` (serves `demo/_site` on port 8766). When moving or renaming files under `demo/`, keep the workflow's paths and the `.gitignore` entries (`demo/data/...` runtime files) in sync.

## Word-learning rules (spread across `state.js`/`session.js`)

Each word has level 0–5; a correct answer raises it by at most +2 per day (so gold needs several days), a wrong one lowers it.

## Git workflow

When writing and organizing source code:

- Work on a `feature/<topic>` branch.
- Create small but still meaningful and compilable commits.
- Write the commit subject in imperative mood, so that it completes "When applied, this change will ...". Example: `Add SharedKernel building blocks`.
- Optionally add a commit description if the why is not obvious from the diff.
- Never push, and never amend or rewrite history, unless I ask.
