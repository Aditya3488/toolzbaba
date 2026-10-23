# Toolz Baba: handoff for the next session

Written 13 October 2026 so the work can continue on another PC, with another Claude account, without losing anything.
Paste this whole file to the new Claude session first, then say what you want done next.

---

## 1. What this project is

- **Site:** https://toolzbaba.com: free file tools (image, PDF, video/audio, AI, converters) that run **in the visitor's browser**. Nothing is uploaded.
- **Repo:** https://github.com/Aditya3488/toolzbaba (collaborator account: MAHENDER-Dev). Branch: `master`.
- **Hosting:** Cloudflare Pages, project `toolzbaba`. Every push to `master` runs the GitHub Action **"Deploy to Cloudflare Pages"** (`.github/workflows/deploy.yml`). It runs `python build.py` and uploads `dist/`. The secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` already live in the repo settings, so nothing is needed on the new PC.
- **Languages:** English plus 14: hi bn es pt id fr de ru ja tr vi it ar pl.

## 2. How the owner wants work done (follow this every time)

1. **Always work through GitHub and make it live.** Commit, push to `master`, wait for the deploy, then **check the change on https://toolzbaba.com** (pages return 200, the tool really converts a file). Local runs are only the quick inner loop. A task is not done until it is live and verified.
2. **Pages must really work.** Never publish a page whose conversion the engine cannot do. If a format cannot be done, leave the page out and say so.
3. **Use the keyword from the plan CSV** (`Keyword` column) in each page's title.
4. Before pushing: `git fetch`. Another session sometimes pushes to `master` too, so fast-forward or rebase first.
5. The first deploy sometimes fails with "Failed to publish your Function… Unknown internal error". Re-run the workflow and it passes.
6. Commit messages explain *why*, in plain words, and end with a `Co-Authored-By:` line for the AI used.

## 3. Set up on the new PC

```bash
git clone https://github.com/Aditya3488/toolzbaba.git
```

- Python 3.12+ (3.14 used here) and Node 20+ (26 used here). The build needs only the standard library plus what `requirements.txt` lists for the old server (not needed to build).
- Build: `python build.py` writes `dist/` (about 4,000 files, ~470 MB; normal).
- Local preview: `npx wrangler pages dev dist --kv CDN --port 8000 --ip 127.0.0.1`, then open http://localhost:8000.
  For the Claude desktop app, `.claude/launch.json` is git-ignored on this PC. Recreate it with:

```json
{ "version": "0.0.1", "configurations": [
  { "name": "site", "runtimeExecutable": "npx",
    "runtimeArgs": ["wrangler","pages","dev","dist","--kv","CDN","--port","8000","--ip","127.0.0.1"], "port": 8000 } ] }
```

- Tests (run all before every push):

```bash
python tests/smoke_build.py
node tests/functions_test.mjs
python tests/smoke_site_board.py
python tests/smoke_india_saas.py
```

Expected: build checks pass, 28/28, site board passes, 63/63. `tests/browser_*.js` are Playwright tests (`npm i` inside `tests/`). Two of them have old, known failures that are not real bugs: `browser_variants.js` expects compress-jpeg in the sitemap, and the compression tests use flat-colour fixtures.

## 4. How the site is built (what you need to know to add tools and pages)

| Piece | Where | What it does |
|---|---|---|
| Tool list | `static/assets/tools.json` | `tools`: 74 base tools (slug, cat, name, title, desc, metaDesc, about, steps, faq, `engine`, `js`). `variants`: 797 format pages, each with `slug`, `base` (the tool it reuses), optional `preset` (form values, e.g. `{"format":"woff2"}`), `dropLabel`, own copy, optional `aliases` (become 301 redirects in `dist/_redirects`) and `canonical`. |
| Translations | `i18n/<lang>/tools.json` (by slug), `i18n/<lang>/strings.json` (by English phrase) | A **base tool must be translated in all 14 languages**. A **variant without a translation is built English-only** (`build.py` `translate_tools`, `variant_langs`): no duplicate English pages under `/hi/…` etc., and it stays out of that language's hreflang and sitemap. |
| Build | `build.py` | Renders every tool and variant page, sitemaps, hreflang, `_redirects`, `_headers`. Sibling tabs are capped (`SIB_MAX = 14`). Also writes `sitemap-dates.json`: **commit it** with content changes. |
| Shared UI | `static/assets/common.js` | `HT.serverTool(root, cfg)` is the standard screen (drop zone, fields with `showIf`, run button, result). `HT.upload` / `HT.poll` run an engine in the browser. `HT.register(slug, fn)` registers a screen. The header menus are the hand-written `NAV_MENUS` list: **add new tools there**, or they won't appear in the menus. The menus are text-only, with 5–6 groups shown as 2 rows of 3. |
| Screens | `static/assets/tools/*.js` | The tool's `js` field picks the file (e.g. `server-pdf.js`, `server-image.js`, `archive.js`, `font-converter.js`). |
| Engines | `static/assets/engine/*.js` | The tool's `engine` field picks the file; it calls `HT.engine(slug, async ctx => [{name, blob}])`. |
| Libraries | `static/assets/vendor/` | All self-hosted (the CSP allows only `self`): ffmpeg.wasm 0.12.15, MuPDF 1.28.1, SheetJS 0.20.3 (+ `xlsx.zahl.js` for Numbers), JSZip, mammoth, marked, turndown, pdf.js, Pyodide 314.0.7 (+ `fonttools` and `brotli` wheels, SHA-256 checked against its lock file), tesseract, onnxruntime, transformers, img-codecs. |

### Engines and what they can do today

- **video.js** (ffmpeg.wasm): video out mp4 webm mkv mov avi wmv flv ts mts 3gp m4v mpg mpeg vob; audio out mp3 wav m4a aac flac ogg opus wma aiff m4r. **No AMR encoder** in this ffmpeg build. VP9 crashes; VP8 only.
- **pdf.js** (MuPDF): PDF tools; `word-to-pdf` reads DOCX, TXT, XLSX/XLS/CSV/TSV/ODS/Numbers, **EPUB, MOBI, FB2**; `document-to-image` draws any of those (plus MD, HTML) as PNG/JPG/WebP/TIFF/GIF/BMP; `ai-converter` (AI saved with PDF compatibility, and PDF) → PNG/JPG/WebP/TIFF/ICO/PDF/SVG. This MuPDF build has **no XPS reader** and **no SVG reader** (it does have an SVG writer).
- **image.js**: convert/compress images (jpg png webp avif gif bmp tiff ico; reads HEIC); `image-to-svg` tracing; `svg-converter` (the browser draws the SVG at any width).
- **sheet.js** (SheetJS): `spreadsheet-converter` between XLSX XLS ODS CSV TSV Numbers. CSV/TSV are read as UTF-8 and only plain numbers become numbers, so leading zeros survive. Numbers output writes dates as text because the SheetJS Numbers writer shifts them four years.
- **archive.js**: ZIP (JSZip), TAR (own reader/writer, GNU long names), GZ/TAR.GZ (browser gzip streams). RAR/7z/XZ/BZ2/ISO/CAB are detected and refused.
- **font.js + font-worker.js + fontconv.py** (fontTools in Pyodide, in a worker): reads TTF OTF WOFF WOFF2 TTC EOT DFONT SVG-font PFB/PFA; writes TTF OTF WOFF WOFF2 TTC EOT SVG-font DFONT. **No Type 1 (PFB) writer.**
- **convert.js**: Markdown/HTML/Word/PDF ↔ Markdown, Markdown → PDF/HTML/Word.

## 5. How pages were generated (reuse this for new groups)

`scripts/page-plan/` holds the generators and the plan:

- `new-tool-urls.csv`: the owner's plan (1,340 rows: URL, Keyword, Type, From, To, In Your List, Note).
- `gen_variants.py`, `gen_rest.py`, `gen_hubs.py`, `gen_ffmpeg.py`: image, PDF, video and audio pages and the format hubs.
- `gen_docsheet.py` (+ `i18n_docsheet.py`): Spreadsheet Converter, Document to Image and their pages. It also holds `save_like()`, which writes i18n JSON in the file's own indent and CRLF line endings.
- `gen_archive.py`, `gen_vector.py`, `gen_font.py` (+ their `i18n_*.py`): archives, AI/SVG/e-books, fonts.

Run them from the repo root: `python scripts/page-plan/gen_font.py .`. They are **idempotent**: they only add plan addresses that are not taken yet (slugs and aliases), and they print any page whose title lacks its keyword. Pattern for a new group:

1. Build and test the engine.
2. Register the screen.
3. Add the base tool to `tools.json` with translations in all 14 languages.
4. Generate the variants from the CSV.
5. Add the new tools to `NAV_MENUS`.
6. Build, then test locally with real files.
7. Run the tests, commit, push, wait for the deploy, verify live.

Tips learned the hard way:

- Files use **CRLF**. For multi-line Python replacements, read with `newline=""` and convert `\n` to the file's line ending first.
- In the browser pane, a JavaScript `.click()` does **not** start a conversion. Use a real click on the button, calling `scroll_to` first and retrying on render timeouts. To feed a file, set `input[type=file].files` with a `DataTransfer` and dispatch `change`.
- `HT.upload(slug, files, opts)` + `HT.poll(id, cb)` runs any engine from the console, which makes it quick for testing many formats.
- Check fonts by loading the output with `new FontFace(name, buffer).load()`: Chrome's sanitiser rejects bad fonts.

## 6. What is done

The "Tier 1" request ("start tier 1 and make it live") is complete, live and verified. All 616 Tier 1 pages return 200, and all 14 Tier 1 redirects work.

| Commit | What |
|---|---|
| `b0fcfdd` | Video/audio: 14 more output formats, 183 pages |
| `95db5c8` | Spreadsheet Converter, Document to Image, 88 pages |
| `289be9c` | Archive Converter, Archive Extractor, Create ZIP, 20 pages + 7 redirects |
| `9412e72` | AI Converter, SVG Converter, EPUB/MOBI/FB2 → PDF and images, 26 pages + 1 redirect |
| `dfde447` | Font Converter, 72 pages |
| `6b77ff5`, `54799a9` | Header menus: text-only; new tools added; even 3×2 grid; header always above the home page's ask box (z-index 95) |

Earlier work in the same project (all live): Visual Sitemap Generator (site_board, Pyodide), India SaaS database pages, catalogue scan, the first 264 format pages, hubs, friendly-name redirects.

**Plan coverage now:** 1,338 unique addresses in the CSV. 728 have their own page, 31 redirect to an equivalent page, **579 remain** (section 7).

## 7. What remains (579 addresses) and what each group needs

| Group | Count | What it needs |
|---|---|---|
| Archives: RAR, 7z, XZ, BZ2, ISO, CAB, and conversions *to* them | 106 | A WASM archive engine, e.g. libarchive.js (reads RAR/7z/XZ/BZ2/ISO/CAB). Writing 7z/XZ/BZ2 needs its write support. Nothing can legally write RAR, so leave `*-to-rar` out. |
| Office documents: DOC, RTF, ODT, Pages, WPS | 94 | A LibreOffice-class engine (e.g. ZetaJS / LibreOffice WASM, large) or a server. Pages files are zips with a preview PDF/JPG that can be extracted. |
| Design/vector: PSD, EPS, CDR, and SVG/AI → EPS/PSD/CDR | 71 | PSD: `ag-psd` (read and write). EPS read: Ghostscript WASM. CDR: no good open reader; probably skip. |
| Camera RAW: CR2, CR3, NEF, ARW, DNG | 65 | LibRaw WASM (e.g. `libraw-wasm`) to decode, then the existing image encoders. |
| Presentations: PPT, PPTX, ODP, Keynote | 59 | PPTX → images/PDF needs a renderer (LibreOffice WASM or server). Keynote has an embedded preview. |
| CAD: DWG, DXF, DGN, DWF, STL, STEP, OBJ, IGES | 55 | DXF: `dxf-parser` → SVG/PDF (doable). DWG: LibreDWG WASM. STL/OBJ: three.js render to PNG. STEP/IGES: occt-import-js. |
| E-books: outputs to EPUB/MOBI/AZW3/FB2, AZW3 input, DjVu | 19 | EPUB writer (JSZip + XHTML: doable); FB2 writer (XML: doable); MOBI/AZW3 writing is hard; DjVu: djvu.js. AZW3 input is untested with MuPDF. |
| XPS / OXPS | 17 | This MuPDF build has no XPS. Use a MuPDF build with XPS, or write an XPS→SVG renderer. |
| Fonts → PFB | 7 | A Type 1 writer (charstring encoder + eexec). Low value. |
| **Other (quick wins first!)** | 86 | See below. |

**Quick wins inside "Other"** (existing engines, mostly copy and config):

- `compress-webp`, `compress-tiff`, `compress-avif`: variants of `compress-image` with a format preset.
- `jpg-to-jpeg`, `jpeg-to-jpg`, `*-to-jfif`, `jpeg-converter`, `jpeg-to-pdf`: JFIF/JPEG are JPG, so these are variants of `convert-image` with an output-name extension, or aliases.
- `excel-to-png/jpg/...`, `excel-to-image`: aliases of the `xlsx-to-*` pages. `webpage-to-*`: aliases of `html-to-*`.
- `txt-to-md`, `md-to-txt`, `txt-to-docx`, `docx-to-txt`, `md-converter`, `docx-converter`, `txt-converter`: the convert/markdown engines can do these.
- `text-to-pdf`: alias of `txt-to-pdf`. `delete-pages-from-pdf`: alias of `delete-pdf-pages`.
- Hubs `pdf-converter`, `convert-to-pdf`, `document-converter`, `vector-converter`: hub pages.
- `eml-to-pdf`, `email-to-pdf`: parse the MIME text → HTML → existing HTML-to-PDF.
- `msg-to-pdf`: needs an Outlook MSG (OLE) parser.

Not doable with what is shipped:
- `*-to-heic` / `*-to-heif`: needs a HEIC encoder.
- `*-to-amr`: needs an AMR encoder.
- `translate-pdf`, `pdf-summarizer`: need an AI model or API.
- `pdf-form-filler`: MuPDF can fill forms, so this is a new tool.

## 8. Known caveats (told to the owner)

- First use of the Font Converter downloads about 15 MB (Pyodide plus fontTools) once.
- AI files only open if saved with "Create PDF Compatible File" (Illustrator 9+ default). Old PostScript AI files get a clear message.
- Not tested in the real apps: DFONT in macOS, Numbers in Apple Numbers, EOT in old Internet Explorer. They were verified by round-tripping, and fonts also by loading them in Chrome.
- The home page category bar counts tools in the browser (it showed 73 on the live site and 74 locally); the tools themselves are all listed.
- After a deploy, a browser may show the old header until a hard refresh (Ctrl+F5).

## 9. Handy commands

Count what is still missing from the plan:

```bash
python - <<'EOF'
import csv, json
rows = list(csv.DictReader(open("scripts/page-plan/new-tool-urls.csv", encoding="utf-8")))
d = json.load(open("static/assets/tools.json", encoding="utf-8"))
have = {t["slug"] for t in d["tools"]} | {v["slug"] for v in d["variants"]}
have |= {a for t in d["tools"] + d["variants"] for a in (t.get("aliases") or [])}
miss = sorted({r["URL"].strip("/").split("/")[-1] for r in rows} - have)
print(len(miss)); print(miss)
EOF
```

Watch the deploy after a push:

```bash
gh run list --branch master --limit 1
```

```bash
gh run watch <run-id> --exit-status
```

Check pages live:

```bash
for u in /font-converter /extract-zip /xlsx-to-csv; do echo "$u $(curl -s -o /dev/null -w '%{http_code}' https://toolzbaba.com$u)"; done
```

---

## Appendix: every address still missing, by group

Regenerate this list any time with the snippet in section 9.

### Office documents: DOC, RTF, ODT, Pages, WPS (need LibreOffice-class engine) (94)

`wps-to-webp`, `wps-to-tiff`, `wps-to-png`, `wps-to-jpg`, `wps-to-jpeg`, `wps-to-image`, `wps-to-gif`, `wps-to-bmp`, `word-to-webp`, `word-to-tiff`, `word-to-png`, `word-to-jpg`, `word-to-jpeg`, `word-to-image`, `word-to-gif`, `word-to-bmp`, `rtf-to-webp`, `rtf-to-tiff`, `rtf-to-png`, `rtf-to-jpg`, `rtf-to-jpeg`, `rtf-to-image`, `rtf-to-gif`, `rtf-to-bmp`, `pages-to-webp`, `pages-to-tiff`, `pages-to-png`, `pages-to-jpg`, `pages-to-jpeg`, `pages-to-image`, `pages-to-gif`, `pages-to-bmp`, `odt-to-webp`, `odt-to-tiff`, `odt-to-png`, `odt-to-jpg`, `odt-to-jpeg`, `odt-to-image`, `odt-to-gif`, `odt-to-bmp`, `xps-to-pdf`, `wps-to-pdf`, `txt-to-rtf`, `txt-to-pages`, `txt-to-odt`, `txt-to-doc`, `rtf-to-txt`, `rtf-to-pdf`, `rtf-to-pages`, `rtf-to-odt`, `rtf-to-md`, `rtf-to-docx`, `rtf-to-doc`, `rtf-converter`, `pages-to-txt`, `pages-to-rtf`, `pages-to-pdf`, `pages-to-odt`, `pages-to-md`, `pages-to-docx`, `pages-to-doc`, `pages-converter`, `odt-to-txt`, `odt-to-rtf`, `odt-to-pdf`, `odt-to-pages`, `odt-to-md`, `odt-to-docx`, `odt-to-doc`, `odt-converter`, `md-to-rtf`, `md-to-pages`, `md-to-odt`, `md-to-doc`, `docx-to-rtf`, `docx-to-pages`, `docx-to-odt`, `docx-to-doc`, `doc-to-txt`, `doc-to-rtf`, `doc-to-pdf`, `doc-to-pages`, `doc-to-odt`, `doc-to-md`, `doc-to-docx`, `doc-converter`, `doc-to-webp`, `doc-to-tiff`, `doc-to-png`, `doc-to-jpg`, `doc-to-jpeg`, `doc-to-image`, `doc-to-gif`, `doc-to-bmp`

### Presentations: PPT, PPTX, ODP, Keynote (59)

`presentation-converter`, `pptx-to-ppt`, `pptx-to-odp`, `pptx-to-key`, `pptx-converter`, `ppt-to-pptx`, `ppt-to-odp`, `ppt-to-key`, `ppt-converter`, `odp-to-pptx`, `odp-to-ppt`, `odp-to-pdf`, `odp-to-key`, `odp-converter`, `key-to-pptx`, `key-to-ppt`, `key-to-pdf`, `key-to-odp`, `key-converter`, `pptx-to-webp`, `pptx-to-tiff`, `pptx-to-png`, `pptx-to-jpg`, `pptx-to-jpeg`, `pptx-to-image`, `pptx-to-gif`, `pptx-to-bmp`, `ppt-to-webp`, `ppt-to-tiff`, `ppt-to-png`, `ppt-to-jpg`, `ppt-to-jpeg`, `ppt-to-image`, `ppt-to-gif`, `ppt-to-bmp`, `powerpoint-to-webp`, `powerpoint-to-tiff`, `powerpoint-to-png`, `powerpoint-to-jpg`, `powerpoint-to-jpeg`, `powerpoint-to-image`, `powerpoint-to-gif`, `powerpoint-to-bmp`, `odp-to-webp`, `odp-to-tiff`, `odp-to-png`, `odp-to-jpg`, `odp-to-jpeg`, `odp-to-image`, `odp-to-gif`, `odp-to-bmp`, `key-to-webp`, `key-to-tiff`, `key-to-png`, `key-to-jpg`, `key-to-jpeg`, `key-to-image`, `key-to-gif`, `key-to-bmp`

### Camera RAW: CR2, CR3, NEF, ARW, DNG (65)

`nef-to-webp`, `nef-to-tiff`, `nef-to-png`, `nef-to-jpg`, `nef-to-jpeg`, `nef-to-jfif`, `nef-to-ico`, `nef-to-heif`, `nef-to-heic`, `nef-to-gif`, `nef-to-bmp`, `nef-to-avif`, `nef-converter`, `dng-to-webp`, `dng-to-tiff`, `dng-to-png`, `dng-to-jpg`, `dng-to-jpeg`, `dng-to-jfif`, `dng-to-ico`, `dng-to-heif`, `dng-to-heic`, `dng-to-gif`, `dng-to-bmp`, `dng-to-avif`, `dng-converter`, `cr3-to-webp`, `cr3-to-tiff`, `cr3-to-png`, `cr3-to-jpg`, `cr3-to-jpeg`, `cr3-to-jfif`, `cr3-to-ico`, `cr3-to-heif`, `cr3-to-heic`, `cr3-to-gif`, `cr3-to-bmp`, `cr3-to-avif`, `cr3-converter`, `cr2-to-webp`, `cr2-to-tiff`, `cr2-to-png`, `cr2-to-jpg`, `cr2-to-jpeg`, `cr2-to-jfif`, `cr2-to-ico`, `cr2-to-heif`, `cr2-to-heic`, `cr2-to-gif`, `cr2-to-bmp`, `cr2-to-avif`, `cr2-converter`, `arw-to-webp`, `arw-to-tiff`, `arw-to-png`, `arw-to-jpg`, `arw-to-jpeg`, `arw-to-jfif`, `arw-to-ico`, `arw-to-heif`, `arw-to-heic`, `arw-to-gif`, `arw-to-bmp`, `arw-to-avif`, `arw-converter`

### Archives: RAR, 7z, XZ, BZ2, ISO, CAB (and outputs to them) (106)

`zip-to-xz`, `zip-to-rar`, `zip-to-iso`, `zip-to-cab`, `zip-to-bz2`, `zip-to-7z`, `xz-to-zip`, `xz-to-tgz`, `xz-to-tar-gz`, `xz-to-tar`, `xz-to-rar`, `xz-to-iso`, `xz-to-gz`, `xz-to-cab`, `xz-to-bz2`, `xz-to-7z`, `xz-converter`, `extract-xz`, `tgz-to-xz`, `tgz-to-rar`, `tgz-to-iso`, `tgz-to-gz`, `tgz-to-cab`, `tgz-to-bz2`, `tgz-to-7z`, `tar-gz-to-xz`, `tar-gz-to-rar`, `tar-gz-to-iso`, `tar-gz-to-gz`, `tar-gz-to-cab`, `tar-gz-to-bz2`, `tar-gz-to-7z`, `tar-to-xz`, `tar-to-rar`, `tar-to-iso`, `tar-to-cab`, `tar-to-bz2`, `tar-to-7z`, `unrar`, `rar-to-zip`, `rar-to-xz`, `rar-to-tgz`, `rar-to-tar-gz`, `rar-to-tar`, `rar-to-iso`, `rar-to-gz`, `rar-to-cab`, `rar-to-bz2`, `rar-to-7z`, `rar-converter`, `extract-rar`, `iso-to-zip`, `iso-to-xz`, `iso-to-tgz`, `iso-to-tar-gz`, `iso-to-tar`, `iso-to-rar`, `iso-to-gz`, `iso-to-cab`, `iso-to-bz2`, `iso-to-7z`, `iso-converter`, `extract-iso`, `gz-to-xz`, `gz-to-rar`, `gz-to-iso`, `gz-to-cab`, `gz-to-bz2`, `gz-to-7z`, `extract-cab`, `cab-to-zip`, `cab-to-xz`, `cab-to-tgz`, `cab-to-tar-gz`, `cab-to-tar`, `cab-to-rar`, `cab-to-iso`, `cab-to-gz`, `cab-to-bz2`, `cab-to-7z`, `cab-converter`, `extract-bz2`, `bz2-to-zip`, `bz2-to-xz`, `bz2-to-tgz`, `bz2-to-tar-gz`, `bz2-to-tar`, `bz2-to-rar`, `bz2-to-iso`, `bz2-to-gz`, `bz2-to-cab`, `bz2-to-7z`, `bz2-converter`, `extract-7z`, `7z-to-zip`, `7z-to-xz`, `7z-to-tgz`, `7z-to-tar-gz`, `7z-to-tar`, `7z-to-rar`, `7z-to-iso`, `7z-to-gz`, `7z-to-cab`, `7z-to-bz2`, `7z-converter`, `create-7z`

### XPS / OXPS (17)

`xps-to-webp`, `xps-to-tiff`, `xps-to-png`, `xps-to-jpg`, `xps-to-jpeg`, `xps-to-image`, `xps-to-gif`, `xps-to-bmp`, `oxps-to-webp`, `oxps-to-tiff`, `oxps-to-png`, `oxps-to-jpg`, `oxps-to-jpeg`, `oxps-to-image`, `oxps-to-gif`, `oxps-to-bmp`, `oxps-to-pdf`

### Design / vector: PSD, EPS, CDR, AI/SVG to EPS/PSD/CDR (71)

`webp-to-psd`, `webp-to-eps`, `webp-to-cdr`, `webp-to-ai`, `svg-to-psd`, `svg-to-pfb`, `svg-to-pdf`, `svg-to-eps`, `svg-to-cdr`, `svg-to-ai`, `psd-to-webp`, `psd-to-svg`, `psd-to-png`, `psd-to-pdf`, `psd-to-jpg`, `psd-to-ico`, `psd-to-eps`, `psd-to-cdr`, `psd-to-ai`, `psd-converter`, `png-to-psd`, `png-to-eps`, `png-to-cdr`, `png-to-ai`, `pdf-to-psd`, `pdf-to-eps`, `pdf-to-cdr`, `pdf-to-ai`, `jpg-to-psd`, `jpg-to-eps`, `jpg-to-cdr`, `jpg-to-ai`, `ico-to-psd`, `ico-to-eps`, `ico-to-cdr`, `ico-to-ai`, `eps-to-webp`, `eps-to-svg`, `eps-to-psd`, `eps-to-png`, `eps-to-pdf`, `eps-to-jpg`, `eps-to-ico`, `eps-to-cdr`, `eps-to-ai`, `eps-converter`, `cdr-to-webp`, `cdr-to-svg`, `cdr-to-psd`, `cdr-to-png`, `cdr-to-pdf`, `cdr-to-jpg`, `cdr-to-ico`, `cdr-to-eps`, `cdr-to-ai`, `cdr-converter`, `ai-to-psd`, `ai-to-eps`, `ai-to-cdr`, `svg-to-dxf`, `svg-to-dwg`, `eps-to-dxf`, `eps-to-dwg`, `dxf-to-svg`, `dwg-to-svg`, `dwf-to-svg`, `dgn-to-svg`, `cdr-to-dxf`, `cdr-to-dwg`, `ai-to-dxf`, `ai-to-dwg`

### CAD: DWG, DXF, DGN, DWF, STL, STEP, OBJ, IGES (55)

`dxf-to-pdf`, `dwg-to-pdf`, `stl-viewer`, `stl-to-step`, `stl-to-obj`, `stl-to-iges`, `stl-converter`, `step-viewer`, `step-to-stl`, `step-to-obj`, `step-to-iges`, `step-converter`, `obj-to-stl`, `obj-to-step`, `obj-to-iges`, `obj-converter`, `iges-to-stl`, `iges-to-step`, `iges-to-obj`, `iges-converter`, `png-to-dxf`, `png-to-dwg`, `pdf-to-dxf`, `pdf-to-dwg`, `jpg-to-dxf`, `jpg-to-dwg`, `dxf-viewer`, `dxf-to-png`, `dxf-to-jpg`, `dxf-to-dwg`, `dxf-to-dwf`, `dxf-to-dgn`, `dxf-converter`, `dwg-viewer`, `dwg-to-png`, `dwg-to-jpg`, `dwg-to-dxf`, `dwg-to-dwf`, `dwg-to-dgn`, `dwg-converter`, `dwf-viewer`, `dwf-to-png`, `dwf-to-pdf`, `dwf-to-jpg`, `dwf-to-dxf`, `dwf-to-dwg`, `dwf-to-dgn`, `dwf-converter`, `dgn-to-png`, `dgn-to-pdf`, `dgn-to-jpg`, `dgn-to-dxf`, `dgn-to-dwg`, `dgn-to-dwf`, `dgn-converter`

### E-books: outputs to EPUB/MOBI/AZW3/FB2, AZW3 input, DjVu (19)

`mobi-to-fb2`, `mobi-to-epub`, `mobi-to-azw3`, `mobi-converter`, `fb2-to-mobi`, `fb2-to-epub`, `fb2-to-azw3`, `fb2-converter`, `epub-to-mobi`, `epub-to-fb2`, `epub-to-azw3`, `epub-converter`, `ebook-converter`, `djvu-to-pdf`, `azw3-to-pdf`, `azw3-to-mobi`, `azw3-to-fb2`, `azw3-to-epub`, `azw3-converter`

### Fonts: anything to PFB (Type 1 writer) (7)

`woff2-to-pfb`, `woff-to-pfb`, `ttf-to-pfb`, `ttc-to-pfb`, `otf-to-pfb`, `eot-to-pfb`, `dfont-to-pfb`

### Other (86)

`wma-to-amr`, `webpage-to-webp`, `webpage-to-tiff`, `webpage-to-png`, `webpage-to-jpg`, `webpage-to-jpeg`, `webpage-to-image`, `webpage-to-gif`, `webpage-to-bmp`, `webp-to-jfif`, `webp-to-heif`, `webp-to-heic`, `compress-webp`, `wav-to-amr`, `tiff-to-jfif`, `tiff-to-heif`, `tiff-to-heic`, `compress-tiff`, `png-to-jfif`, `png-to-heif`, `png-to-heic`, `opus-to-amr`, `ogg-to-amr`, `mp3-to-amr`, `m4r-to-amr`, `m4a-to-amr`, `jpg-to-jpeg`, `jpg-to-jfif`, `jpg-to-heif`, `jpg-to-heic`, `jpeg-to-jpg`, `jpeg-to-jfif`, `jpeg-to-heif`, `jpeg-to-heic`, `jpeg-converter`, `jfif-to-heif`, `jfif-to-heic`, `jpeg-to-pdf`, `ico-to-jfif`, `ico-to-heif`, `ico-to-heic`, `heif-to-jfif`, `heif-to-heic`, `heic-to-jfif`, `heic-to-heif`, `gif-to-jfif`, `gif-to-heif`, `gif-to-heic`, `flac-to-amr`, `excel-to-webp`, `excel-to-tiff`, `excel-to-png`, `excel-to-jpg`, `excel-to-jpeg`, `excel-to-image`, `excel-to-gif`, `excel-to-bmp`, `msg-to-pdf`, `eml-to-pdf`, `email-to-pdf`, `txt-to-md`, `txt-to-docx`, `txt-converter`, `text-to-pdf`, `md-to-txt`, `md-converter`, `docx-to-txt`, `docx-converter`, `document-converter`, `bmp-to-jfif`, `bmp-to-heif`, `bmp-to-heic`, `compress-avif`, `avif-to-jfif`, `avif-to-heif`, `avif-to-heic`, `aiff-to-amr`, `aac-to-amr`, `translate-pdf`, `pdf-summarizer`, `pdf-form-filler`, `delete-pages-from-pdf`, `vector-converter`, `pdf-converter`, `convert-to-pdf`, `cad-converter`
