# Import file format

The hand-off between `prepare-dictionary-import` (writes it) and `upload-dictionary-import` (loads it). Plain UTF-8
JSON, small enough to read and edit by hand. A complete example is [example-import.json](example-import.json).

```json
{
  "source": "notebook page, photo of 2026-10-05",
  "topics": [
    { "name": "Évszakok", "emoji": "🍂", "color": "#ffa94d" }
  ],
  "entries": [
    { "topic": "Évszakok", "english": "winter", "hu": "tél", "visual": "❄️" },
    { "topic": "Kert és játékok", "english": "she has got ...", "hu": "van neki ...",
      "alsoAccepted": ["she's got"], "note": "lányról, nőről" }
  ]
}
```

## Topics

| Field | Rule |
|---|---|
| `name` | 1–30 characters, unique ignoring case. An existing topic with the same name is reused (its emoji and colour stay as they are), so write the name exactly as it is in the dictionary. Accents count: `Allatok` is not `Állatok`. |
| `emoji` | Exactly one emoji. |
| `color` | `#rrggbb`. |

Topics are created in the order listed, each at the end of the existing order, so list them the way they should appear.

## Entries

| Field | Rule |
|---|---|
| `topic` | The `name` of a topic listed above. |
| `english` | Required, 1–60 characters, at least one letter a–z, no line breaks. The spelling that is shown and spoken. A trailing ` ...` marks a pattern; the typing game ignores it and the browser voice does not read it. |
| `hu` | Required, 1–60 characters. |
| `kind` | Optional, `word` or `phrase`. Default: `phrase` when the English text has a space, otherwise `word`. Whole example sentences and patterns (`she has got ...`) are phrases too. |
| `alsoAccepted` | Optional list of up to 5 other correct spellings (`she's got`, `thanks`), each with the same rules as `english`. |
| `note` | Optional short Hungarian hint, up to 80 characters. Shown under the Hungarian meaning on the cards and in the typing game's prompt, so it must not contain the English answer. |
| `visual` | Optional: one emoji, `color:#rrggbb` (for colour words), or empty for no picture. Words without a picture are practised with text only. |

## How duplicates are judged

Spellings are compared by letters only: lower-case a–z, no accents, no spaces or punctuation, the way the typing
game compares answers. `Thank you!` and `thank-you` are the same spelling. Two entries must not share any spelling
(including `alsoAccepted`); the check reports that inside the file, and the upload skips an entry that clashes with
one already in the dictionary. Nothing existing is ever changed or deleted by an upload: an entry that is already
there with the same Hungarian meaning is reported as "already there", one with a different meaning as a conflict.

## Limits

At most 50 topics and 1000 entries in the whole dictionary. A topic with fewer than 4 entries only gets a hint
(the multiple-choice and pair games need at least 4 words), it is not an error.

`source` is free text for people (where the list came from); nothing reads it.
