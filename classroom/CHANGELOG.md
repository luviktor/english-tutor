# Changelog

What changed in the classroom app (**Angol kaland**: `web/` and `api/`), newest version first. The demo is not versioned.
Versions follow [semantic versioning](https://semver.org); [Versioning in the README](README.md#versioning) says what
raises which number. A change that breaks the API is listed under **Breaking changes** and raises the major version.

The entry of a version is written in the last commit of its branch, together with the version bump.

## 1.0.0 – 2026-10-07

The first numbered release: what the app does, and the API that the later versions are measured against.

### Pupils

- **Login** with a personal password from the teacher, on a splash screen that draws the Erkel school as a wireframe.
  There are no accounts and no real names: pupils appear under made-up aliases, and nothing in Azure identifies a child.
- **Four games** on the class's words and phrases, all with the English text spoken aloud: *Tanulj!* (flashcards),
  *Hallgasd és válassz!* (hear a word and pick the picture, or see a picture and pick the English word),
  *Párkereső* (memory pairs) and *Írd be!* (type the English word, with letter hints).
- **Word learning:** every word has a level from 0 to 5. A right answer raises it by at most 2 a day, so a word needs
  several days to become gold; a wrong one lowers it. Rounds pick the words that need practice most and introduce only a
  few new ones at a time. Words without a picture are practised with text only, and a note (when a phrase is used) is
  shown under the Hungarian meaning.
- **Rewards:** XP and 12 levels (🥚 → 🚀), stars, combos, a daily goal with a chest, a day streak, 22 trophies, a sticker
  album (grey → green → blue → gold) and a wardrobe where stars buy buddies, hats and glasses for the fox.
- **Saving:** progress is stored per pupil on the server, so it follows the pupil from device to device. The browser
  saves every few seconds, after each round and when the page is hidden, keeps a local copy and retries failed saves; if
  the pupil played elsewhere in between, the newer copy wins. Progress can also be saved to and loaded from a file
  (⚙️ Beállítások).

### Teachers

- **Own login** with a long password, and a calmer look than the pupils' game.
- **Osztály:** the whole class in one sortable table: level and XP, words per level, accuracy, streak, answers in the last
  14 days and when each pupil last played; problems in the pupil and teacher lists are shown below it.
- **Szótár:** the class's own dictionary, empty at the start and managed entirely by the teachers. Topics (name, emoji,
  colour, order) and words or phrases (English text, other accepted spellings, Hungarian meaning, note, picture as an
  emoji or colour, or none) are entered in a form with a live preview of the pupil's card and a 🔊 button. Both teachers
  can work at the same time without overwriting each other, spellings that clash are refused, and warnings point out
  entries without a picture and topics too small for the games. Correcting a spelling keeps the pupils' progress.
- **Version label** next to the title (this version added it, and the login screen shows it too).

### Hosting and tools

- Azure Static Web Apps (Free) with C# .NET 10 Functions and Cosmos DB (free tier), in East US 2, at
  `https://erkel2023b.hu`. A push to `master` that touches `classroom/` runs the tests and deploys.
- Developer skills for filling the dictionary from a photo or a list: `prepare-dictionary-import` and
  `upload-dictionary-import`, whose script checks the API's major version before it writes anything.

### The API of 1.0.0

All endpoints except `GET /api/version` and `POST /api/login` need the password in the `X-EnglishTutor-Password` header;
details are in [README.md](README.md#api) and [`docs/teacher-dictionary.md`](../docs/teacher-dictionary.md#teacher-api).

| Endpoint | Who |
|---|---|
| `GET /api/version` | anyone |
| `POST /api/login` | anyone |
| `GET /api/dictionary` | pupil or teacher |
| `GET /api/progress`, `PUT /api/progress` | pupil |
| `GET /api/teacher/class` | teacher |
| `POST /api/teacher/entries`, `PUT`/`DELETE /api/teacher/entries/{id}` | teacher |
| `POST /api/teacher/topics`, `PUT`/`DELETE /api/teacher/topics/{id}`, `PUT /api/teacher/topic-order` | teacher |
