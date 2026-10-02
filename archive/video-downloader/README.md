# Video Downloader (archived)

The link downloader ("paste a YouTube / Instagram / X / TikTok link, get the video or MP3") was retired when
Toolz Baba moved to free hosting on Cloudflare Pages. It can't work there: it needs a server that fetches videos
with [yt-dlp](https://github.com/yt-dlp/yt-dlp), and every other tool now runs in the visitor's browser. It was also
the riskiest feature legally (site terms, copyright) and the one ad networks won't accept.

Old links to `/downloader` redirect to the home page (`deploy/pages/_redirects`).

## What is kept here

| File | Was | What it did |
|---|---|---|
| `downloader.py` | `downloader.py` | FastAPI routes `GET /api/info` (formats of a link) and `POST /api/jobs` (download with yt-dlp, MP3 extraction, playlists as ZIP) |
| `static/downloader.html` | `static/downloader.html` | The downloader page with its password login |
| `scripts/setup-pot-provider.ps1`, `.sh` | `scripts/` | Built the [bgutil PO-token helper](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) (Node.js) that YouTube needs for HD |

The parts that were woven into other files (password gate and cookie in `security.py`, `DOWNLOADER_MODE` /
`DOWNLOADER_PASSWORD` / `SECRET_KEY` in `config.py`, the `/downloader` page and `/api/auth` login in `pages.py`, the
Node helper in the `Dockerfile`, `yt-dlp` in `requirements.txt`, the menu link in `common.js`, its tests) were
removed rather than copied here.

## Getting the complete working version back

The last version of the whole app with the downloader working is tagged:

```bash
git checkout archive/video-downloader
```

(It is also commit `2d7e33c`, and it is the `master` branch of the original repository,
[Aditya3488/toolzbaba](https://github.com/Aditya3488/toolzbaba).) Run it with the Python server as described in that
version's README, with `DOWNLOADER_MODE=password` and a `DOWNLOADER_PASSWORD` for anything public.
