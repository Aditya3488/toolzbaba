# Toolz Baba

**All tools. One place. Free forever.** ([toolzbaba.com](https://toolzbaba.com))

A web app with 53 everyday tools: image tools (including photo-to-KB for exam
forms, passport photos and OCR), AI tools, PDF and document tools (organize, sign, protect...), video/audio tools
and text/developer utilities. Most tools run entirely in the visitor's browser; the heavy ones (video, AI, PDF
conversion) run on the Python server. The full list is in `static/assets/tools.json`.

- **Backend:** Python 3.11+ / FastAPI, Pillow, PyMuPDF, ffmpeg, ONNX models (rembg, Real-ESRGAN, AnimeGAN, YuNet)
- **Frontend:** plain HTML + CSS + vanilla JavaScript (no build step, no npm for the site itself)
- **Deploy:** Docker + Caddy (HTTPS) on a small VPS behind Cloudflare, see [DEPLOY.md](DEPLOY.md)

> **Free hosting without a server (the `cloudflare-pages` branch).** Every tool also runs in the visitor's browser:
> MuPDF (PDF), ffmpeg.wasm (video), ONNX Runtime (AI) and image codecs compiled to WebAssembly, in
> `static/assets/engine/`. `python build.py` turns the site into plain files in `dist/` that Cloudflare Pages hosts
> for free, always on, with nothing to keep running. See [Hosting on Cloudflare Pages](#hosting-on-cloudflare-pages-free)
> below. The old video downloader is archived, see [archive/video-downloader](archive/video-downloader/README.md).

---

## Quick start

> Prerequisites: **Git**, **Python 3.11, 3.12 or 3.13** and **Node.js** (for `wrangler`, Cloudflare's local server).

**Windows (PowerShell)**

```powershell
git clone <your-repo-url> toolzbaba
cd toolzbaba
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
.\start.bat
```

**macOS / Linux**

```bash
git clone <your-repo-url> toolzbaba
cd toolzbaba
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
sh start.sh
```

`start.bat` / `start.sh` build the site (`python build.py`) and serve it like Cloudflare does (`npx wrangler pages dev dist --kv CDN`), so the tab pages (`/compress-png`, `/blur-redact-pdf`), `/admin` and the Functions all work. Then open **http://127.0.0.1:8000**. Every tool except *Word to PDF* works now. (The old Python-only server is kept as `start-old-python-server.bat`; it does not know the tab pages, so do not test with it.) For the admin panel put `ADMIN_KEY` (and `ADMIN_USER`) in a `.dev.vars` file first.

---

## Full setup, step by step

### 1. Get the code
Clone the repository (see [Working as a team](#working-as-a-team) if you're setting up the repo for the first time).

### 2. Create a virtual environment (recommended)
It keeps this project's packages away from your other Python projects. `start.bat` / `start.sh` pick up `.venv`
automatically, so you don't need to activate it every time you *run* the app.

### 3. Install the Python packages
```bash
pip install -r requirements.txt
```
This is a big install (a few hundred MB: onnxruntime, OpenCV, PyMuPDF, ...). ffmpeg does **not** need to be
installed separately: it is bundled through the `imageio-ffmpeg` package.

### 4. Word to PDF (optional)
Install [LibreOffice](https://www.libreoffice.org) (`winget install TheDocumentFoundation.LibreOffice` on Windows,
`sudo apt install libreoffice-writer libreoffice-calc libreoffice-impress` on Ubuntu). Without it that one tool shows
a friendly "LibreOffice is not installed" message.

### 5. Run
| How | Command |
|---|---|
| Normal | `.\start.bat` (Windows: PowerShell, Command Prompt, or just double-click it) / `sh start.sh` (macOS/Linux) |
| Auto-reload while you edit Python code | `python -m uvicorn main:app --port 8000 --reload` |
| Docker (local test, no HTTPS) | `docker compose up -d --build` |
| Production | see [DEPLOY.md](DEPLOY.md) |

Changes to files in `static/` (HTML, CSS, JS) show up on a browser refresh; no restart needed
(`Ctrl+F5` if the browser cached them).

### First-run things to expect
- A `data/` folder appears (hosted images, downloaded AI models). It's git-ignored.
- The first use of each AI tool downloads its model once (0.2 MB up to ~170 MB for the best background remover) and does
  a one-time compile, so that first run can take about a minute. You need internet for it. The very first server start
  can also take 10-30 seconds while Python compiles the packages.
- On your own machine (`127.0.0.1`) nothing is rate limited.

---

## Configuration

All settings are environment variables; there are safe defaults for local work, so you usually set **none**.
The full annotated list for production is in [`.env.example`](.env.example).

Set a variable for one run:

```powershell
# Windows PowerShell
$env:MAX_CONCURRENT_JOBS = "2"; .\start.bat
```
```bash
# macOS / Linux
MAX_CONCURRENT_JOBS=2 sh start.sh
```

| Variable | Default | Meaning |
|---|---|---|
| `SITE_URL`, `SITE_NAME`, `CONTACT_EMAIL` | localhost / Toolz Baba / example | SEO tags, sitemap, legal pages, image-link base |
| `TRUSTED_PROXY` | `0` | `1` behind Caddy/Cloudflare so the real visitor IP is used |
| `RATE_LIMIT`, `RATE_LIMITS` | on | Per-visitor hourly limits (defaults in `security.py`) |
| `MAX_CONCURRENT_JOBS` | `3` | Heavy jobs at once; the rest wait in line |
| `MAX_UPLOAD_MB` | `2100` | Largest accepted request |
| `ADMIN_USER`, `ADMIN_KEY` | none | Admin panel ID and password (16+ characters); also delete any hosted image |
| `CDN_RETENTION_DAYS`, `CDN_MAX_TOTAL_MB`, `CDN_MAX_FILE_MB` | `0` / `5000` / `25` | Image hosting limits |
| `DATA_DIR` | `./data` | Hosted images and AI models |
| `LIBREOFFICE_PATH` | auto | Path to `soffice` if it isn't found |
| `HEAD_EXTRA` | none | Raw HTML added to every `<head>` (analytics, verification tags) |

---

## Project structure

```
toolzbaba/
├─ main.py               App wiring, middleware, static assets
├─ config.py             All settings, read from environment variables
├─ security.py           Rate limits, upload cap, security headers
├─ pages.py              HTML pages with per-page SEO tags, sitemap, robots, /api/config, favicon routes
├─ core.py               Job store, temp folders, cleanup, job status/file routes
├─ toolkit.py            Tool registry + the generic  upload -> job -> result  route (POST /api/tools/{slug})
├─ tools/                Server-side tools
│  ├─ image_tools.py     compress, convert, EXIF remover, image->PDF, image->SVG
│  ├─ pdf_tools.py       PDF <-> image, merge, split, compress, PDF <-> Word
│  ├─ pdf_extra.py       organize (reorder/delete/rotate), sign, page numbers, protect, unlock
│  ├─ video_tools.py     converter, video->GIF, GIF->video, trimmer, compressor (ffmpeg)
│  ├─ av_extra.py        audio cutter, video merger, video speed changer
│  ├─ passport.py        passport / ID photo maker (AI cut-out + face-based crop + print sheet)
│  ├─ ai_tools.py        background remove/replace, upscaler, face blur, anime style
│  ├─ cdn.py             image hosting with on-the-fly format conversion (/i/<id>.<fmt>)
│  └─ imgutil.py         shared Pillow helpers
├─ static/
│  ├─ index.html, tool.html, privacy/terms/contact/takedown/404.html   page templates
│  └─ assets/
│     ├─ app.css         design system (blue + orange tokens, light/dark themes)
│     ├─ common.js       shared UI kit: header, footer, forms, dropzone, tool icons, generic tool UIs
│     ├─ tools.json      THE tool list: name, description, category, SEO "about" text
│     ├─ tools/*.js      one file per tool group (browser tools and server-tool forms)
│     ├─ brand/          logo, favicons, hero art (generated, see brand-source/)
│     └─ vendor/         jszip, qrcode, pdf.js (PDF previews), tesseract.js + English/Hindi data (OCR): vendored, no CDN
├─ tests/                smoke_api.py (every server tool), smoke_web.py (SEO, limits ...), browser_tools.js (UI flows)
├─ brand-source/         original logo/favicon + script that regenerates everything in assets/brand
├─ deploy/, docker-compose*.yml, Dockerfile, .env.example, DEPLOY.md     production setup
└─ archive/              the retired video downloader (see archive/video-downloader/README.md)
```

### How a request flows
1. **Pages** (`/`, `/tool/<slug>`, ...) are rendered by `pages.py` from the templates in `static/`, filling in the SEO tags
   from `tools.json`. The tool page's `HT.mount()` (in `common.js`) then loads `assets/tools/<group>.js` and builds the UI.
2. **Browser tools** (resize, crop, QR, ...) do all the work in canvas / JS, nothing is uploaded.
3. **Server tools** send files to `POST /api/tools/<slug>`. `toolkit.py` saves them, runs your Python function in a
   worker thread and returns a job id; the page polls `/api/jobs/<id>` and downloads `/api/jobs/<id>/file`.
   Results are deleted automatically after 30 minutes.

---

## Adding a new tool

Checklist (a **server** tool touches 4 places, a **browser** tool 3):

**1. Server tool logic**: in the right file under `tools/` (or a new file, imported in `tools/__init__.py`):
```python
from toolkit import IMAGE_EXT, Ctx, ToolError, out_name, tool

@tool("my-tool", accepts=IMAGE_EXT, max_mb=50, max_files=10)
def my_tool(ctx: Ctx):
    strength = ctx.opt("strength", 50, int)            # option sent by the form
    outs = []
    for i, src in enumerate(ctx.inputs):               # uploaded files (Paths)
        dest = ctx.out_dir / out_name(src, "png", "_done")
        ...                                            # do the work, write to dest
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))        # 0..1 progress bar
    ctx.info = {"summary": f"Processed {len(outs)} file(s)"}
    return outs                                        # 1 file -> that file, many -> a ZIP
```
Raise `ToolError("friendly message")` for problems the user should see. If it is slow (video, AI), add its slug to
`HEAVY_TOOLS` in `security.py` so it gets the stricter rate limit.

**2. The form**: in `static/assets/tools/server-*.js` (declarative, no HTML):
```js
HT.register('my-tool', root => HT.serverTool(root, {
  slug: 'my-tool', accept: 'image/*', max: 10, action: 'Run it',
  fields: [{ name: 'strength', label: 'Strength', type: 'range', min: 1, max: 100, value: 50, unit: '%' }],
}));
```
*Browser-only tool instead?* Use `HT.canvasTool(root, { fields, process: async (bitmap, values) => canvas, suffix: '_done' })`
(see `image-basic.js`) and skip step 1.

**3. The catalogue**: add an entry to `static/assets/tools.json`: `slug`, `cat` (`image|ai|pdf|video|util`), `name`, `desc`,
`kind` (`server` or `client`), `js` (the file name from step 2), `icon` (emoji fallback) and an `about` paragraph
(2-3 honest sentences: it becomes the SEO text on the tool's page). The sitemap, home page card, search and
`/<slug>` page all appear automatically.

**4. The icon**: in `static/assets/common.js` add a glyph to `GLYPH` and a colour to `TOOL_COLOR` (colour names are the logo's palette).
Missing icons fall back to a blue grid symbol.

**5. A test**: add a `check(...)` line to `tests/smoke_api.py` for server tools. Then run both test files.

**Renaming a tool's URL (slug)?** The slug is used in `tools.json`, the `HT.register(...)` / `HT.engine(...)` calls, the
`GLYPH` / `TOOL_COLOR` maps in `common.js`, `deploy/pages/_headers` (the AI tools have per-URL rules) and the tests, so
change it everywhere. Then add the **old** slug to the tool's `"aliases": ["old-slug"]` list in `tools.json`: the build
turns every alias into a permanent 301 redirect (`dist/_redirects`; the Python server does the same), so old links and
Google's index follow the tool to its new address. Never reuse an old slug for a different tool.

**Format pages (one tool, several SEO addresses)?** `compress-image` has four of them: `/compress-png`, `/compress-jpeg`,
`/compress-jpg` and `/compress-gif`, at the site root. They are *not* separate tools: they live in the top-level
`"variants"` list of `tools.json` (so they are not on the home page, in search or in the tool count), each with its own
`title`, `desc` and `about` text. `build.py` writes `dist/<slug>.html` and adds them to the sitemap; `HT.mount()` merges a
variant onto its `"base"` tool, shows the format tabs (PNG | JPEG | JPG | GIF) above the drop zone, and calls `HT.tools[<variant slug>]` (or the
base tool's function if there is none) for the page's own settings. A variant whose work differs needs its own `"engine"`
(compress-gif uses ffmpeg). To add another family (say `add-watermark-to-pdf`), add entries to `variants`, register the UI in
the tool's JS file and give every page genuinely different text: near-identical pages hurt rather than help SEO.
A tab click switches the tool in place (no page reload, `history.pushState`): the address, heading, tags and
"About" text are taken from that address's own built page, and files already added are kept when they fit the new tab.
Back/forward work, and a Ctrl+click opens the tab as an ordinary link.
Tests: `tests/browser_variants.js`.

**Workbench layout.** Every tool page uses the full width: everything you can change (file, settings, run button) is in a left
sidebar (`.tside`), the preview / result is on the right (`.tmain`) with its download button on top, and the "how it works / more
tools" cards sit below. `HT.bench(sideElements, mainElement)` builds it (call `bench.set(true)` once a file is added) and
`HT.viewToggle()` adds the Result | Original | Side by side switch. `HT.serverTool`, `HT.canvasTool` and the size screens
(`compress-target.js`, which also powers the All formats page of Compress Image as `target-any`: live quality / target-size preview, output format Same / JPG / WebP / PNG, GIFs left untouched) use it already, as do image-kb, social resizer, thumbnail, collage, QR, palette, favicon and OCR. Still on the old
stacked layout: crop-image, organize-pdf, esign-pdf, base64, the text tools and image-cdn. Copy the pattern from `tools/utils.js` to convert one.

**Size pages ("compress to under X KB / MB")?** 10 pages each for JPG, JPEG and PNG (`/compress-jpg-under-10kb` ... `-under-2mb`,
`/compress-jpeg-under-...`, `/compress-png-under-...`) and 6 PDF pages (`/compress-pdf-under-100kb` ... `-under-2mb`) are variants with `"group": "size"`, `"target_kb"`, `"media"` (`jpg` | `jpeg` | `png` | `pdf`, the
family that shares a row of size chips), `"ui"` (`target-jpg` | `target-png` | `target-pdf`, looked up before the slug), `"js": "compress-target"`,
a `"chip"` label and a `"faq"` list (rendered on the page and as FAQPage JSON-LD). `"parent"` names the format page they hang under
(highlights its tab and the breadcrumb). The screen is `static/assets/tools/compress-target.js`: a size box (number + KB/MB + log slider
+ preset buttons) and a live before/after preview. JPG/JPEG run in the browser (quality search + shrinking the pixels only when the
quality alone cannot reach the size); PNG reduces colours (256 → 32) and then pixels, keeping transparency. PDF calls the `compress-pdf` engine with `target_kb`, which tries stronger and stronger image
settings until the file fits (and says so honestly when it cannot). Write distinct text for every page.
Tests: `tests/browser_sizes.js` (needs the `scan3.pdf` sample from `python smoke_api.py`).

---

### Tool families (tabs) from the SEO slug sheet

Every tool lives at the site root (`/<slug>`). Tools used to be at `/tool/<slug>`: `build.py` adds permanent (301) redirects from every old `/tool/...` address, so old links and search results keep working.

A row of the slug sheet is a **family**: the first line is the primary tool (`/<slug>`, renamed if the sheet gives it a slug), the lines under it are
its **tabs**, each on its own root address (`/<slug>`), exactly like Compress Image with PNG | JPEG | JPG | GIF. Tabs are `variants` in `tools.json` (`base` = the primary,
`tab` = the label, `js` / `engine` for the screen they use, `aliases` = old addresses that redirect to them); the primary has `tabAll` = the label of its own tab.
A tab click switches the screen in place (the address, title, text and tags follow, files you added stay when they fit). Tool scripts are loaded as modules, so two tabs
can be on one page without their top-level names clashing. Search (home and header) also finds tabs.

| Primary (`/...`) | Tabs |
|---|---|
| `add-watermark-to-image` | `add-watermark-to-pdf`, `add-watermark-to-video` |
| `pixelate-image` | `blur-redact-pdf` |
| `photo-collage-maker` | `linkedin-carousel-maker`, `instagram-image-carousel-splitter` |
| `passport-size-photo-maker` | `ai-headshot-generator` |
| `image-to-text` | `video-to-text`, `text-to-audio`, `video-to-audio`, `mp4-to-mp3` |
| `compress-video` | `split-video` |
| `split-audio` (was `audio-cutter`: cut one part or split into parts) | `merge-audio` |
| `image-color-palette-extractor` | `color-palette-generator`, `website-color-palette-extractor` |
| `image-cdn` | `temporary-file-upload-direct-link-share` |

How they are built: ffmpeg tools in `engine/video.js`; PDF watermark and redact in `engine/pdf.js` (MuPDF takes annotation rectangles in page space, top-left origin; the redact
screen is `tools/pdf-redact.js`); carousels in `tools/carousel.js`; palettes in `tools/palette-gen.js` and `tools/site-colors.js`; headshot in `engine/ai.js`; video to text and text to audio in
`engine/speech.js` + `tools/speech.js` (Whisper and MMS voices through Transformers.js, models in `static/assets/models`, get them with `python scripts/get_speech_models.py`, see THIRD_PARTY.md for the licences:
**the MMS voices are non-commercial**); and two that need the server side (Cloudflare Pages Functions): the temporary file share (`functions/api/files`, `functions/f`, `lib/file-store.js`, files live in the
same KV namespace as the image links, 20 MB each, they expire by themselves, programs and web pages are refused) and the website colour extractor (`functions/api/site-colors.js`: public web addresses only,
never IP numbers or local names). Add `ALLOW_PRIVATE_HOSTS=1` to a `.dev.vars` file (git-ignored) to try it against `http://127.0.0.1:8200/` locally.
Pages that load AI models or ffmpeg get cross-origin isolation in `deploy/pages/_headers` (the primary page of the family too, because its tabs switch in place).
Not built (they need a service this site does not have): `save-website-as-pdf`, `save-website-to-image` (a headless browser), `translate-pdf` (a translation model or API), `youtube-video-to-text` (fetching YouTube audio on a server).
`tools.json` entries may carry `badge`, `how` and `privacy` text for tools that are not "runs in your browser". Unit tests for the Functions: `node tests/functions_test.mjs`.

**On a phone** the preview (or result) comes first and the settings below it (`HT.bench(..., { keep: true })` keeps the settings first for tools where the settings start the work, such as Organize PDF), the tabs wrap
into pills, and the picture shows the result only (a toggle brings back Original and Side by side).

### PDF Editor and Font Library

* **Font Library** (`/font-library`, `static/assets/tools/font-library.js`): 51 free fonts (Latin, display, handwriting, monospace and Indian scripts) with a live preview, search, filters, ZIP download per font and "Copy CSS".
  The font files are in `static/assets/fonts/` with an index `fonts.json`; rebuild them with `python scripts/get_fonts.py` (downloads the TTFs from the `@expo-google-fonts/*` npm packages and writes `fonts.json`, including the scripts each font covers).
  `static/assets/tools/fonts-helpers.js` (`HT.fonts`) loads a font for the screen (`FontFace`, family "TB <Name>") and hands its bytes to the PDF engine, so the page and the saved PDF use the same font. `HT.fonts.picker()` is the font drop-down used inside the editor.
* **PDF Editor** (`/pdf-editor`, alias `/edit-pdf`; UI `static/assets/tools/pdf-editor.js`, export engine `static/assets/engine/pdf-edit.js`): pages are shown with pdf.js and what you add is an overlay of objects
  (text, pictures, rectangle, ellipse, line, arrow, highlight, drawing, white-out) in page points. The PDF's own text is editable straight away: hover any text in Select mode and click it (the "Edit text" tool shows all of it outlined). It turns a paragraph that is already in the PDF into a text box (the old text is removed from the file, the new one is written in a similar font and the colour taken from the page).
  **Scans** (a page that is only a picture) show an "OCR" bar: tesseract (in the browser, English / Hindi) reads the page and every line it finds becomes a text block you can change (`runOcr` in `pdf-editor.js`; the picture under the line is cleared with the paper colour and the new text is written in its place). **Pictures of the PDF** can be clicked in Select mode: they are removed from the file for good (the file gets smaller) and you can put your own picture in their place (`origpic` objects, found with the pdf.js operator list).
  Pages can be rotated, moved, deleted or added blank. **Download** builds the file with MuPDF (real embedded text when the font can be encoded, a picture of the text for Indian scripts and mixed lines), and offers PDF, Word (`pdf-to-word`), page pictures (`pdf-to-image`) and plain text.
  The whole font library is also **inside the editor**: the "Aa Font library" button in the toolbar (and "Browse the font library" in the text settings) opens a window with search, categories, script filter, a preview in your own text, "Use this font" and "Download" (`HT.fonts.library` in `fonts-helpers.js`; fonts that cannot draw your letters are marked). With text selected the choice changes that text, otherwise it becomes the font of the next text.
  `/pdf-editor?font=<id>` starts with that font (the Font Library links here). White-out removes what is under it from the file unless you switch that off.
  Sample documents for the tests: `python tests/make_pdf_samples.py` (needs reportlab). Tests: `node tests/browser_pdfeditor.js` (engine, font page, editing, white-out, page actions, all download formats, phone layout).

### Bookmark button

Header star, footer link "Bookmark this site", and one reminder after a visitor's first download (`HT.bookmark` in `static/assets/common.js`, remembered in `localStorage` key `tz_bm_nudge`).
Browsers do not let a page add a bookmark itself, so the panel shows the right keys for the device (Ctrl+D / Cmd+D, or the Share / menu steps on iPhone and Android) and an "Install app" button where the browser offers it. Tests: `node tests/browser_site.js`.

### EXIF Remover, Collage, tab pages on the home page

* **EXIF Remover** shows everything hidden in a photo before you remove it (`HT.exifPanel` in `tools/exif-view.js`, exifr): every tag and value (camera, settings, GPS with a map link, XMP, IPTC, ICC, PNG text notes), the risky ones (who / where / which device) marked and listed first, search and "Copy all".
* **Collage** layouts are small drawings of the shape they make (7 layouts: Grid, Rows, Columns, Featured left / right / top / bottom).
* **Tab pages** (for example Blur & Redact PDF, Video to Text, Add Watermark to PDF) are cards on the home page, in their own category (`cat` on the variant in `tools.json`, else the category of their tool). The count in the hero and in the "All" pill includes them.
* **Admin lab**: tools that cannot be driven the generic way are listed in `LAB_SKIP` / `LAB_STEPS` in `admin.js` (Sign PDF and Unlock PDF are skipped there, `tests/browser_tools.js` covers them; Blur & Redact PDF gets a marked area first).

### Admin panel (`/admin`)

One page to archive or re-enable tools, see how fast they are for real visitors, and test every tool. It is private: `noindex`, never cached, not in the sitemap.

**Setting it up:** add two **secrets** in Cloudflare Pages (Settings, Variables and Secrets): `ADMIN_USER` (your ID) and `ADMIN_KEY` (a password of **16 or more characters** used nowhere else), then redeploy. For local use put them in `.dev.vars`. Until both are set, and the password is long enough, the panel stays shut.

**How it is protected** (`lib/admin-store.js`):
* Signing in (`POST /api/admin/login`) swaps the ID and password for a session cookie (`__Host-tz_admin`: HttpOnly, Secure, SameSite=Strict, 8 hours, signed with both secrets). Page scripts can't read it and the password is never stored in the browser. Changing either secret ends every session.
* Every admin request must carry `X-Requested-With: toolzbaba-admin`, which other websites can't add, so a forged form or link can't act with your session.
* Wrong passwords: 5 per visitor per 15 minutes, and 50 per hour from everyone together (then the panel locks for up to an hour, you included). Each wrong try waits 1 second. The image and file delete endpoints count wrong admin passwords too.
* The admin page has no Tag Manager or `HEAD_EXTRA` and a strict Content-Security-Policy (only the site's own scripts), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
* Scripts can call the API with the headers `X-Requested-With: toolzbaba-admin`, `X-Admin-User` and `X-Admin-Key`.
* **Strongest extra lock (recommended): Cloudflare Access.** Zero Trust > Access > Applications > Add > Self-hosted: domain `toolzbaba.com`, paths `/admin` and `/api/admin/*`, policy "Allow" for your own email addresses only (login method: one-time PIN). Free for up to 50 people. Then nobody else even reaches the sign-in form.

* **Tools**: Archive / Make live per tool or in bulk (with a private note). Archived tools disappear from the home page, search and menus, their address shows "taking a break" (noindex), and the tabs of an archived tool go with it. The list is in KV (`admin:status`), served by `GET /api/tool-status`, cached 60 s at the edge and 10 min in the visitor's browser (`HT.status` in `common.js`; a first-time visitor gets it together with `tools.json`, waiting at most 1.2 s), so it costs no speed. In the admin's own browser everything stays visible (with a banner on archived tools) until you switch to "Viewing site as visitor". For a permanent archive set `"archived": true` on the tool in `tools.json` (also removes it from the sitemap).
* **Real visitors**: about 1 page view in 10 sends one beacon (`HT.rum`, no personal data, off for the admin and for Do Not Track) to `POST /api/rum`; `lib/rum-store.js` folds it into one JSON document of histograms per tool (server time, first paint, LCP, tool-ready, INP, CLS, errors, tool runs). Free KV allows 1,000 writes a day, so at most 700 beacons a day are saved (estimates). For exact numbers move this to D1 or Analytics Engine.
* **Lab tests**: opens each tool in a hidden frame of the admin tab, measures ready time, load time, our own download weight vs ads/analytics weight, collects JS errors, and (optional) feeds the tool a generated sample (PNG/JPEG, PDF, WAV, a short video for heavy tools) and waits for a result or a download. AI/video/speech tools only run with "Include heavy tools". Results are stored in KV (`admin:lab`) so every admin sees them. Quick health check only; `tests/` stays the real safety net.
* **Blog**: write, publish, edit, unpublish and delete posts (see below).
* Code: `static/admin.html`, `static/assets/admin.js`, `admin.css` (loaded only on `/admin`), `functions/api/admin/*`, `functions/api/tool-status.js`, `functions/api/rum.js`, `lib/admin-store.js`, `lib/rum-store.js`. Tests: `tests/functions_test.mjs` (API), `node tests/browser_admin.js` (needs `ADMIN_KEY` in `.dev.vars`).

### Blog (`/blog`)

A small CMS built into the admin panel (the Blog tab), free on Cloudflare: no WordPress, no database server. Posts are stored in the same KV namespace (`CDN`) and go live the moment you press Publish, without a rebuild or deploy.

* **Writing**: title, address (`/blog/<slug>`, made from the title), description (for Google; left empty, the start of the post is used), cover image, tags, publish date, and the text in Markdown with a toolbar (headings, bold, italic, links, images, lists, quotes, code, tables) and a live preview. Images are shrunk to WebP (1600 px) in the browser and kept for good at `/blog/images/<id>.<ext>` (5 MB at most; JPG, PNG, WebP, AVIF, GIF; never SVG).
* **Pages**: `/blog` (newest first, 12 per page, `?tag=` filter), `/blog/<slug>` (table of contents, related posts, BlogPosting and breadcrumb JSON-LD, cover as `og:image`), `/blog/feed.xml` (RSS) and `/blog/sitemap.xml` (listed in `robots.txt`). They use the site's head, Tag Manager, header and footer: `build.py` renders `static/blog.html` into `dist/blog-shell.html` with `%%TITLE%%`, `%%DESC%%` and `%%PATH%%` placeholders that `lib/blog-store.js` fills in.
* **Safety**: only the admin can save (same session, header and lockout rules as the rest of the panel). The Markdown renderer (`static/assets/blog/markdown.js`, shared by the pages and the preview) escapes everything, so HTML in a post is shown as text, and links and images accept only `http(s)`, site paths, `#anchors` and `mailto`. Drafts and scheduled posts are not public.
* **Renaming** a published post keeps the old address as a 301 redirect (`blog:moved:<old>`).
* KV keys: `blog:index` (summaries), `blog:post:<slug>`, `blog:moved:<slug>`, `blogimg:<id>.<ext>`. Code: `functions/blog/*`, `functions/api/admin/blog/*`, `functions/api/admin/blog-image.js`, `lib/blog-store.js`.

### Keeping the site fast

Rules that keep the numbers in the admin panel green: tool code and models load only when a tool is used; public pages never load admin code; the tool page reserves the room its script-built parts will need (`.thead`, `.shell`, the home page chips and list in `app.css`, "Layout stability"), and the side cards are added after the tool is in place, so nothing jumps (CLS was 0.5 to 1.4 before, now about 0.05); images are served in the size shown (`hero-art-330/540.webp`, `logo-315.webp`). The remaining weight on every page is ads/analytics from Google Tag Manager (about 200 KB): loading it after the page has settled would be the next big win.

## Testing

Start the app (`start.bat`), then in another terminal:

```bash
python tests/smoke_api.py        # calls every server tool with generated sample files (49 checks)
python tests/smoke_api.py pdf    # only checks whose name contains "pdf"
python tests/smoke_web.py        # SEO pages, rate limits, upload cap, brand assets

cd tests && npm install          # once: playwright-core (uses your installed Chrome/Edge, downloads no browser)
node browser_tools.js            # drives the newer tools in a real browser: OCR, PDF organize/sign, photo-to-KB, ... (17 flows)
node browser_tools.js pdf ocr    # only flows whose name contains "pdf" or "ocr"
```
- The browser tests for the static site (run `python build.py` and `npx wrangler pages dev dist --kv CDN --port 8200` first, set `BASE_URL=http://127.0.0.1:8200`):
  `browser_variants.js` (format pages and tabs), `browser_sizes.js` (the "under X KB" pages, 56 checks), `browser_newtools.js` (the tools from the slug sheet: video/audio, PDF watermark and redact, carousels, palette, speech with the real models, file share, colour extractor; takes several minutes the first time because the speech models load) and `node tests/functions_test.mjs` (the Pages Functions, no server needed).
- `browser_tools.js` needs the sample files that `smoke_api.py` creates in `tests/samples/` (run that once first). Set `BROWSER_PATH` if no Chrome/Edge is found, `BASE_URL` for another port. Failure screenshots go to `tests/out/`.
- `smoke_web.py` starts its own throw-away servers on ports 8801, 8803 and 8804, so it doesn't touch your running app.
- Put a portrait photo at `tests/samples/face.jpg` if you want the face-blur / AI checks to be meaningful (it is git-ignored).
- The tests need the packages from `requirements.txt` only. "docx -> pdf" is expected to report "LibreOffice is not installed" if it isn't.
- **UI changes:** also open the page in the browser at desktop *and* phone width, in light *and* dark theme, before opening a PR.

---

## Working as a team

### Creating the GitHub repository (first time, one person does this)
1. On GitHub: **New repository** -> name `toolzbaba` -> **Private** (recommended until you pick a licence, see below) ->
   *don't* tick "Add a README / .gitignore / licence" (they already exist here) -> **Create**.
2. In the project folder:
   ```bash
   git init
   git add .
   git status                      # sanity check: NO data/, dist/, .env or .venv should be listed
   git commit -m "Initial commit: Toolz Baba"
   git branch -M main
   git remote add origin https://github.com/<your-username-or-org>/toolzbaba.git
   git push -u origin main
   ```
   (With the GitHub CLI you can do the whole thing with `gh repo create toolzbaba --private --source=. --push`.)
3. **Settings -> Collaborators** (or an Organization team): add your teammates.
4. Recommended: **Settings -> Branches -> Add rule** for `main`: require a pull request before merging.

`.gitignore` already keeps out the 500 MB of AI models, hosted images, secrets and local helper builds,
and `.gitattributes` keeps line endings sane between Windows and Mac/Linux.

### Everyday workflow
```bash
git checkout main && git pull                 # start from the latest main
git checkout -b feat/short-name               # one branch per feature or fix (feat/..., fix/..., docs/...)
# ... code, run the app, run the tests ...
git add -A && git commit -m "Add <what and why>"
git push -u origin feat/short-name            # then open a Pull Request on GitHub
```
**Pull Request checklist:** app starts, `smoke_api.py` and `smoke_web.py` pass, new tools follow "Adding a new tool",
UI changes checked on phone width and dark theme, and no secrets/data files committed.

### Ground rules
- **Never commit** `.env`, `data/`, `dist/`, passwords or API keys. Only `.env.example` (with fake values) is tracked.
- Keep the site private-by-design: don't add third-party scripts, trackers or CDNs without discussing it first
  (the Privacy Policy in `static/privacy.html` promises no tracking; update it if that ever changes).
- The logo/favicon originals are in `brand-source/`. Re-run `python brand-source/make_brand_assets.py` instead of editing generated files in `static/assets/brand/`.

### Licence
No licence has been chosen yet. Heads-up when you decide: **PyMuPDF is AGPL** and **pdf2docx is GPL**. Running the site
publicly means their licences require offering your source code to its users, or replacing those two libraries
with permissively licensed ones. Decide this before making the repository public.

---

## Production

Full guide (server, Cloudflare, HTTPS, backups, Google Search Console): **[DEPLOY.md](DEPLOY.md)**.
Short version: `cp .env.example .env`, edit it, `docker compose -f docker-compose.prod.yml up -d --build`.
Before exposing it: put Cloudflare in front and have the legal pages reviewed by a lawyer.

---

## Hosting on Cloudflare Pages (free)

The static version needs no server: the visitor's browser does all the work, and Cloudflare Pages serves the files
(free, unlimited traffic, always on). Only "Image to CDN Link" stores data, in Cloudflare KV (free: 1 GB, about 250
uploads a day), through the small functions in `functions/`.

**Try it locally** (Python 3.10+; Node.js only for the local Cloudflare preview):

```bash
python build.py
npx wrangler pages dev dist --kv CDN
```

**Deploy from a PC** (what toolzbaba.com uses; `wrangler.toml` holds the project name and the KV storage id):

```bash
python build.py
npx wrangler login
npx wrangler pages deploy --branch cloudflare-pages
```

**Or let Cloudflare build from GitHub on every push** (set it up once):

1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**, pick this repository.
2. Build settings: framework **None**, build command `python3 build.py`, output directory `dist`. Production branch:
   the branch you deploy from.
3. Environment variables (optional): `SITE_URL` (default `https://toolzbaba.com`), `SITE_NAME`, `CONTACT_EMAIL`,
   `SITE_TAGLINE`, `HEAD_EXTRA` (e.g. Search Console or AdSense tags), `CDN_RETENTION_DAYS` (default 90),
   and the secrets `ADMIN_USER` + `ADMIN_KEY` for the admin panel (see "Admin panel"), which also delete any hosted image:
   `curl -X DELETE -H "X-Requested-With: toolzbaba-admin" -H "X-Admin-User: ..." -H "X-Admin-Key: ..." https://toolzbaba.com/api/cdn/<id>`.
4. **Workers & Pages** > **KV** > create a namespace (e.g. `toolzbaba-cdn`), then in the Pages project
   **Settings** > **Bindings** add a KV namespace binding named `CDN`. Without it the site works and only image
   hosting says it is switched off.
5. **Custom domains** > add `toolzbaba.com` (and `www.toolzbaba.com`). Cloudflare points the DNS at Pages.

Every push to the production branch then rebuilds and publishes the site in a minute or two.

**How it fits together**

- `build.py` renders what the Python server used to: every page with its SEO tags, sitemap, robots, manifest,
  plus `_headers` and `_redirects` from `deploy/pages/`.
- `HT.upload` / `HT.poll` in `common.js` run a tool's "engine" (`static/assets/engine/<name>.js`, named in
  `tools.json`) on the visitor's device, so the tool screens are the same as with the server.
- Big files (ffmpeg core, some AI models) are stored in parts because Pages allows 25 MiB per file; the engines join
  them after download.
- The AI tool pages are cross-origin isolated (see `deploy/pages/_headers`) so the AI can use several CPU cores.
- Licences of the bundled libraries and models: [THIRD_PARTY.md](THIRD_PARTY.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| A tool fails with `FileNotFoundError` / "No such file or directory" and a very long path | Windows' 260-character path limit. Keep the project in a short folder such as `C:\dev\toolzbaba` (not deep inside Downloads/OneDrive), or enable long paths |
| `pip install` fails building a package | Use Python 3.11-3.13 (very new Python versions may lack wheels), and upgrade pip: `python -m pip install -U pip` |
| `Address already in use` / port 8000 busy | Stop the other copy, or run `python -m uvicorn main:app --port 8001` |
| `ModuleNotFoundError` | The virtual environment isn't active/used: `start.bat` uses `.venv` automatically; otherwise activate it, or re-run `pip install -r requirements.txt` |
| "LibreOffice is not installed" | Optional; install LibreOffice (step 5) if you need Word to PDF |
| First AI run hangs or errors | It's downloading a model: needs internet and disk space (`data/models`). Delete the partial file and retry |
| Videos/PDFs "Processing failed" | Read the server terminal: the real error is printed there |
| Page looks unstyled/old after a change | Hard refresh with `Ctrl+F5` (assets are cached for an hour) |

---

## Credits

Built on excellent open-source projects: [FFmpeg](https://ffmpeg.org),
[FastAPI](https://fastapi.tiangolo.com), [Pillow](https://python-pillow.org), [PyMuPDF](https://pymupdf.readthedocs.io),
[rembg](https://github.com/danielgatis/rembg), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN),
[AnimeGANv3](https://github.com/TachibanaYoshino/AnimeGANv3), [YuNet / OpenCV](https://opencv.org),
[VTracer](https://github.com/visioncortex/vtracer),
[JSZip](https://stuk.github.io/jszip/), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator),
[pdf.js](https://mozilla.github.io/pdf.js/) and [tesseract.js](https://github.com/naptha/tesseract.js) with the
[tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) language files (all Apache-2.0).
