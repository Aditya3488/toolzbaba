# Translations

The site is in English at the root (`/compress-pdf`) and in 14 more languages under their own folder (`/hi/compress-pdf`,
`/es/compress-pdf` ...). `build.py` builds a language only when both of its files are here:

| File | What it holds |
|---|---|
| `<code>/strings.json` | Every phrase the pages and scripts show, keyed by the exact English text: `{"Choose files": "फ़ाइलें चुनें", "Converting {0} of {1}...": "..."}` |
| `<code>/tools.json` | The texts of each tool and tab page, keyed by slug: `name`, `desc`, `about`, `title`, `metaDesc`, `steps`, `faq` ...; `_categories` holds the category names |

Languages (`LANGS` in `build.py`): hi Hindi, bn Bengali, es Spanish, pt Portuguese (Brazil), id Indonesian, fr French, de German,
ru Russian, ja Japanese, tr Turkish, vi Vietnamese, it Italian, ar Arabic (right to left), pl Polish.

## How it works
* **Pages** (`build.py`): the tool texts come from `tools.json`; the words in the page templates and the headings it writes
  ("About ...", "Questions") from `strings.json`. Each page names all its language versions (`hreflang`), English being the default.
* **Everything the scripts draw** (buttons, menus, messages): `common.js` loads `/assets/i18n/<code>.json` (a copy of
  `strings.json`) and translates text as it appears on the page: exact English phrases, and patterns with `{0}`, `{1}` for
  the numbers and names inside them. Text inside `#seo`, text boxes and elements marked `data-notr` is left alone.
* A phrase or tool text that has no translation shows in English. Nothing breaks.
* English pages suggest the visitor's language once (if their browser asks for one we have); the choice is remembered.

## Adding or changing text
1. Write the English in the code as usual (a whole phrase in one string; for numbers use `HT.t('Saved {0} files', n)` or a
   template literal like `` `Saved ${n} files` ``, which becomes the pattern `Saved {0} files`).
2. Add the phrase with its translation to each `<code>/strings.json` (same key, the exact English). For a new tool add its
   entry to each `<code>/tools.json`.
3. Keep placeholders (`{0}`), HTML tags (`<b>`), file formats (PDF, JPG), units (KB, MB) and brand names as they are.
