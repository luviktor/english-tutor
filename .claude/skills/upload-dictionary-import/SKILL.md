---
name: upload-dictionary-import
description: Load an import file of English-Hungarian words and phrases (made by prepare-dictionary-import, or written by hand) into the EnglishTutor classroom dictionary through the teacher API. Target local (the Cosmos emulator and local API, started if they are not running), web (the deployed Azure app) or both. Never writes to the web app without an explicit yes, and never asks for or prints the web password.
argument-hint: "[import file] [local|web|both]"
disable-model-invocation: true
---

# Upload a dictionary import

Run on demand (`/upload-dictionary-import`), with the import file and target as arguments or asked for when missing.
Loads an import file into the dictionary by calling the teacher endpoints (`POST /api/teacher/topics` and
`/api/teacher/entries`) with `.claude/skills/upload-dictionary-import/upload-dictionary.mjs`. Going through the API
gives every entry the same validation, generated id, duplicate check and `updatedBy` as one typed into the Szótár
form; writing to Cosmos directly would skip all of that, and the pupils' progress is keyed by those ids.

The script only ever **adds**: an existing topic is reused by name, an entry already in the dictionary is skipped, and
nothing existing is changed or deleted (corrections are made in the Szótár form). That makes re-running safe.

## What you need

- **The import file.** A path, or by default the newest file in `classroom/imports/` (say which one you picked and
  let the user confirm). Format: `.claude/skills/prepare-dictionary-import/references/import-file-format.md`.
- **The target**: `local` (default), `web` or `both`. If the user names none, use `local` and say so. The web app is
  what teachers and pupils see, so it is never the default.

## Steps

1. **Check the file**, offline:
   `node .claude/skills/upload-dictionary-import/upload-dictionary.mjs <file> --check`
   Stop on errors and fix the file (or send the user back to `prepare-dictionary-import`).
2. **Local target**, if chosen:
   1. See whether the API answers: `curl -s -o /dev/null -w "%{http_code}" http://localhost:7071/api/dictionary`.
      `401` means it is up (an API started from another checkout is fine: they all share the same emulator).
   2. If it is down, start what is missing, without blocking on it:
      - the emulator: `docker ps` shows `englishtutor-cosmos`; if it is stopped, `docker start englishtutor-cosmos`
        (if the container does not exist, the `docker run` is in `classroom/README.md`);
      - `classroom/api/local.settings.json` (gitignored, test values only): copy it from
        `local.settings.example.json` if it is missing;
      - the API: `func start` from `classroom/api`, as a background process. Poll the URL above until it answers (a
        first start builds the project, so allow a minute or two). A health warning about `AzureWebJobsStorage` is harmless.
   3. Dry run, then apply, and show the user the summary line and anything flagged:
      `node .../upload-dictionary.mjs <file> --dry-run`, then `node .../upload-dictionary.mjs <file>`.
      Local writes need no extra confirmation: it is a test database, and the user asked for the upload.
   4. The run ends with a read-back that checks every entry is in the dictionary with its meaning. To look at it in
      the app, `swa start` from `classroom` serves it at `http://localhost:4280` (see `classroom/README.md`).
3. **Web target**, if chosen. The web app is always `https://www.erkel2023b.hu`. Writing there is visible to teachers
   and pupils, and deleting an entry later costs pupils their progress on it, so everything is confirmed first, and
   you never ask for or print the password.
   1. Check that the API answers:
      `curl -s -o /dev/null -w "%{http_code}" --max-time 30 https://www.erkel2023b.hu/api/dictionary`.
      `401` means it is up and wants a login. It can take a few seconds to wake up after being idle, so retry a few times,
      about 5 s apart, before calling it down (the script also waits up to about 30 s for the login). `404` means the API
      is not deployed: the setup is in `infra/README.md`, and `TEACHERS_JSON` must be set on the Static Web App.
   2. Run the script in a terminal the user can type into, with a literal command:
      `node .claude/skills/upload-dictionary-import/upload-dictionary.mjs classroom/imports/<file>.json --target web`.
      With the terminal tool (`run_in_terminal`) this types it into the user's own Terminal tab. The script asks for the
      teacher's password with hidden input, shows the plan, and writes only after the user types `yes`. Then read the
      result with `read_terminal`. The password never reaches the chat, a file or a command line.
   3. If the terminal tool is unavailable or does not start (its shell can be slow to load), give the user that command
      to run in their own terminal and ask them to paste the output back.
   4. If the user has set the Windows environment variable `ENGLISHTUTOR_TEACHER_PASSWORD`, the script uses it for the
      web target (and only there) instead of asking, and `--dry-run` from Bash works too: show the plan, ask for an
      explicit yes in the chat, then re-run with `--apply`. Programs only see a variable that existed when they were
      started, so the Claude app needs a restart after it is set. Never ask for the password in chat.
   5. Remember the entries will show the teacher whose password was used as their last editor. A separate developer
      account in `TEACHERS_JSON` keeps imports apart from the teachers' own work.
4. **Both**: do the local run first and go on to the web only if it finished without conflicts or failures, so
   mistakes show up in the test database first.
5. **Report in plain words**: topics and entries created, already there, conflicts, failures. For a conflict (the same
   English spelling already exists with a different Hungarian meaning) say which entry and what is stored; the fix is
   made in the Szótár form, or by changing the import file. The exit code is 1 on any conflict or failure even when
   the rest was written.

## Script options

| Option | Meaning |
|---|---|
| `<file> --check` | Validate the import file offline and exit. |
| `--list` | Show the topics already in the dictionary and exit (no file needed). |
| `--target local\|web` | Where to write; default `local` (`http://localhost:7071`). `web` is `https://www.erkel2023b.hu` (`--url` overrides it, https only). |
| `--dry-run` / `--apply` / `--confirm` | Only plan / write without asking / plan, then ask (terminal only). Web in a terminal confirms by itself; web without a terminal only plans unless `--apply`. |
| `--ask-password` | Prompt for the password even if one is available. |
| `--ignore-api-version` | Go on although the API's version isn't the one the script is written for (see below). Not for routine use. |

The API version: before it logs in, the script reads `GET /api/version` and stops unless the API's major version is
the script's `API_MAJOR` (1 now), because the endpoints change only in a new major version (`Versioning` in
`classroom/README.md`). It prints the version it found (`API 1.0.0`). An API with no `/api/version` is older than 1.0.0
(deploy it, or restart the local `func start`, which keeps running the build it started with). A newer major version
means the endpoints may have changed: adapt the script to the breaking changes in `classroom/CHANGELOG.md`, then raise
`API_MAJOR`. Don't reach for `--ignore-api-version` to get past this; tell the user what the script reported.

Passwords: the local target uses the first teacher in `local.settings.json`, else in the example settings (test values).
The web target uses `ENGLISHTUTOR_TEACHER_PASSWORD` if it is set, else asks in a terminal. The variable is never used for
the local target, so a production password in it cannot leak into a local run.

## Notes

- Run it with Node, not through Windows PowerShell 5.1, which can garble `ő` and `ű` in request bodies.
- Dictionaries in different environments have different entry ids, so pupils' progress is never shared between them.
