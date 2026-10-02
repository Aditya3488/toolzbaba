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

> Prerequisites: **Git** and **Python 3.11, 3.12 or 3.13**.

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

Then open **http://127.0.0.1:8000**. That's it: every tool except *Word to PDF* works now.

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
| `ADMIN_KEY` | none | Lets you delete any hosted image |
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
`/tool/<slug>` page all appear automatically.

**4. The icon**: in `static/assets/common.js` add a glyph to `GLYPH` and a colour to `TOOL_COLOR` (colour names are the logo's palette).
Missing icons fall back to a blue grid symbol.

**5. A test**: add a `check(...)` line to `tests/smoke_api.py` for server tools. Then run both test files.

---

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
   and the secret `ADMIN_KEY` to delete any hosted image: `curl -X DELETE -H "X-Admin-Key: ..." https://toolzbaba.com/api/cdn/<id>`.
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
