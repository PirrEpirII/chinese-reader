# Laptop pipeline: text -> study package

Written by Claude_Leonid on 2026-11-15 from the real-text test. It runs on the laptop, never on the phone.

## Files

| File | What it is |
|---|---|
| `make_package.py` | Turns a UTF-8 text (one paragraph per line) into a package JSON. Prints a review report |
| `glossary.sample.json` | Seed glossary: 14 terms, 1 added sense, 1 reading rule. The live glossary belongs in the private data repository |
| `requirements.txt` | Python packages: jieba, pypinyin, pycccedict |
| `sample/nbs-2026-10-19.txt` | Test text: opening sections of the National Bureau of Statistics release of 19 October 2026 |
| `sample/package-000001.json` | The package produced from that text with the sample glossary. Use it to build package loading in the app |

Run the command in the docstring at the top of `make_package.py`.

## Package format, schema_version 1

```text
schema_version   1
package_id       "package-000001"
created_at       ISO-8601 UTC
article          { id, title, source_name, source_url, date }
paragraphs       list of paragraphs; a paragraph is a list of tokens
  token          { "t": text }                       punctuation or number, not tappable
                 { "t": text, "w": 1 }               a word; its lexicon key is the text
                 { "t": text, "w": 1, "k": key }     a word whose lexicon key differs (context reading, e.g. "为#wei2")
lexicon          key -> { pinyin, origin, note?, entries }
  pinyin         reading to show for this text, tone marks, syllables separated by spaces
  origin         "dictionary" or "glossary" (glossary = hand-added or hand-corrected; show it marked)
  entries        list of { pinyin, defs[] }; the first entry is the one that fits this text
```

A sentence for saved context is not stored. The app should cut the **clause** around the word (split on ， 、 ； 。 ： and brackets), because official sentences run to 180 characters.

## Glossary format

- `terms`: word -> `{ pinyin, meaning, note? }`. Added to the word splitter and shown first.
- `senses`: word -> meaning. Inserted before the dictionary's meanings when the dictionary sense does not fit.
- `readings`: list of `{ word, pinyin, cedict, after, window, note }`. If `word` follows `after` within `window` tokens, the reading is `pinyin`.

## Known limits (measured on the sample, 2026-11-15)

- The bundled CC-CEDICT copy is from November 2023 and lacks recent policy and statistics terms. `--cedict` accepts a newer file.
- Single characters with several readings get pypinyin's default unless a `readings` rule exists. The report lists them under `many_readings`; check them.
- Without the glossary, 11 terms in the sample were split wrongly, 1 pinyin was wrong (为) and 1 meaning did not fit (动能). Every new text needs the report reviewed and the glossary extended.
- CC-CEDICT is licensed CC BY-SA 4.0; keep the attribution in the app.
