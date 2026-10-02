# Nóra angol kalandja 🦊

A small English-learning game for a 9-year-old Hungarian child. Runs on your own machine at
`http://127.0.0.1:8765/` – no internet, no installs beyond Python.

## Start it

Double-click **`start.bat`** (or run `py server.py`). A black window opens and the browser opens
the app. Closing the window stops the program. Use Edge or Chrome; the voice is the Windows one.

## What is in it

| | |
|---|---|
| 📖 **Tanulj!** | Flashcards: picture, English word, Hungarian word, spoken aloud (🐢 = slow). |
| 🎧 **Hallgasd és válassz!** | Hear a word (or read it) and pick the right picture – or see a picture and pick the English word. |
| 🃏 **Párkereső** | Memory game: match each picture with its English word. |
| ⌨️ **Írd be!** | See the picture + Hungarian word, hear the English one and **type it** on the keyboard. New words start with the first letter filled in, 💡 reveals letters, right letters stay green after a wrong try, after 3 misses the answer is shown and has to be typed once. |

**Gamification:** XP and 12 levels (🥚 → 🚀), ⭐ stars, combo streaks, a daily goal with a 🎁 chest,
day streak 🔥, 22 trophies, a sticker album (every word turns grey → green → blue → **gold** as it is
learned) and a wardrobe where stars buy new buddies, hats and glasses for the fox.

**Learning logic:** every word has a level 0–5. A right answer raises it (max +2 per day, so a word
needs a few different days to turn gold), a wrong one lowers it. Rounds pick the words that need
practice most and introduce at most a few new words at a time (shown on an "Új szavak!" sheet first).

**⚙️ Szülőknek** (button on the home screen, asks a multiplication): progress overview, last 14 days,
hardest words, voice / speed / sound / daily goal / name, dictionary status and warnings, reset.

## The dictionary – `data/dictionary.csv`

Open it in Excel (or Notepad), add or change rows, save as **CSV** (keep it UTF-8 if Excel offers the
choice – Windows-1250 also works), then press **F5** in the browser or **Szülőknek → Szótár újratöltése**.

```
topic;english;hungarian;emoji
Állatok;dog;kutya;🐶
Család;mother|mum|mom;anya;👩
Színek;red;piros;color:#e53935
```

* `;` or `,` as separator – both work. Column names may also be Hungarian (`téma;angol;magyar;kép`).
* `english`: the first word is shown, `|` adds other spellings that are accepted when typing.
* `emoji`: an emoji, a colour (`color:#ff8800`) or an image file in `web/img/` (`img:cat.png`).
* A new `topic` name creates a new topic automatically. Lines starting with `#` are ignored.
* Words are remembered by their English text (lower-case) – keep it unchanged and the progress stays.
* Mistakes (missing fields, duplicates) are listed in the parents' corner instead of breaking anything.

Optional **`data/topics.csv`** (`topic;emoji;color`) sets the icon and colour of a topic.

## Saved results

`data/progress.json` – everything (XP, levels, words, days, trophies, purchases). It is saved a moment
after every answer. A copy is made once per day in `data/backups/` (last 30 kept); if the file is ever
damaged, the newest backup is used and the damaged file is kept as `progress.corrupt-*.json`.
To start from zero: use the reset button in the parents' corner, or delete `data/progress.json`.

## Where to change things

| What | Where |
|---|---|
| Words, topics | `data/dictionary.csv`, `data/topics.csv` |
| Trophies and their rules | `web/js/badges.js` |
| Shop items and prices | `web/js/shop-items.js` |
| Level names and XP curve | `web/js/levels.js` |
| Mascot phrases | `web/js/strings.js` |
| Colours, look | `web/css/style.css` |

## Troubleshooting

* **No sound / "Nem találtam angol hangot"** – install an English (US) language pack in Windows
  (Settings → Time & language → Language & region), restart the browser, then check the voice in
  the parents' corner (🔊 Kipróbálom).
* **Page says it cannot reach the server** – start `start.bat` first.
* **Port 8765 busy** – the program is probably already running; just open `http://127.0.0.1:8765/`.
  (The port can be changed at the top of `server.py`.)

## GitHub Pages (online version)

The game also runs as a static site, without `server.py`. `tools/build_pages.py` copies `web/` to `_site/`
and pre-renders the dictionary to `dictionary.json`; a GitHub Actions workflow
(`.github/workflows/pages.yml`) does this and deploys on every push to `master`/`main`.

* In this mode progress is stored in the **browser's localStorage** (per browser and device, not shared;
  clearing site data erases it). The local `server.py` version keeps using `data/progress.json`.
* Edit `data/dictionary.csv`, push, and the site is rebuilt.
* Try it locally: `py tools/build_pages.py`, then `py -m http.server 8766 --directory _site`.

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
