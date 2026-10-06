"""Link downloader (yt-dlp): /api/info and POST /api/jobs."""
import os
import re
import threading
import time
import zipfile

import imageio_ffmpeg
import yt_dlp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import security
from core import check_url, jobs, new_job

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MAX_PLAYLIST = 100  # most videos read from / downloaded in one playlist
# YouTube needs a JS runtime to solve its player challenge; use Node if Deno isn't installed.
YT_EXTRA = {"js_runtimes": {"node": {}}, "remote_components": ["ejs:github"]}
# Optional, for servers whose IP addresses YouTube/Instagram block:
#   YTDLP_COOKIES = path to a Netscape-format cookies.txt exported from a logged-in browser
#   YTDLP_PROXY   = e.g. http://user:pass@host:port (a residential proxy)
if os.environ.get("YTDLP_COOKIES") and os.path.exists(os.environ["YTDLP_COOKIES"]):
    YT_EXTRA["cookiefile"] = os.environ["YTDLP_COOKIES"]
if os.environ.get("YTDLP_PROXY"):
    YT_EXTRA["proxy"] = os.environ["YTDLP_PROXY"]

router = APIRouter()


class JobRequest(BaseModel):
    url: str = ""
    urls: list[str] = []  # playlist mode: the selected videos
    title: str = "playlist"  # playlist mode: used as the ZIP name
    quality: str = "best"  # best | 1080 | 720 | 480 | 360 | audio


def friendly_error(e: Exception) -> str:
    msg = str(e).replace("ERROR: ", "")
    if "DRM" in msg:
        return "This video is DRM-protected and can't be downloaded."
    if "Unsupported URL" in msg:
        return "This link isn't supported or doesn't contain a downloadable video."
    if "Sign in" in msg or "login" in msg.lower() or "private" in msg.lower():
        return "This video is private or needs a login."
    return msg.splitlines()[-1][:300]


@router.get("/api/info", dependencies=[Depends(security.require_downloader)])
def info(url: str):
    url = check_url(url)
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": MAX_PLAYLIST,
        **YT_EXTRA,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            d = ydl.extract_info(url, download=False)
    except Exception as e:
        raise HTTPException(400, friendly_error(e))

    if d.get("_type") == "playlist":
        entries = []
        for e in d.get("entries") or []:
            link = e and (e.get("url") or e.get("webpage_url"))
            if not link or not link.startswith("http"):
                continue  # deleted / private entries have no usable link
            thumbs = e.get("thumbnails") or []
            entries.append({
                "title": e.get("title") or "Untitled",
                "url": link,
                "duration": e.get("duration"),
                "thumbnail": thumbs[-1]["url"] if thumbs else e.get("thumbnail"),
            })
        if not entries:
            raise HTTPException(400, "No downloadable videos found in this playlist.")
        return {
            "playlist": True,
            "title": d.get("title") or "playlist",
            "uploader": d.get("uploader") or d.get("channel"),
            "site": (d.get("extractor_key") or "").removesuffix("Tab"),  # "YoutubeTab" -> "Youtube"
            "entries": entries,
            "truncated": (d.get("playlist_count") or 0) > len(entries),
        }

    heights = sorted({f["height"] for f in d.get("formats", []) if f.get("height")}, reverse=True)
    return {
        "playlist": False,
        "title": d.get("title"),
        "thumbnail": d.get("thumbnail"),
        "duration": d.get("duration"),
        "uploader": d.get("uploader"),
        "site": d.get("extractor_key"),
        "heights": heights,
    }


def format_for(quality: str) -> str:
    if quality == "audio":
        return "bestaudio/best"
    if quality == "best":
        return "bv*+ba/b"
    h = int(quality)
    return f"bv*[height<={h}]+ba/b[height<={h}]/b"


def download_one(url: str, quality: str, out_dir: str, prefix: str, on_progress) -> str:
    """Download one video/audio into out_dir and return the file path."""

    def hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            frac = d["downloaded_bytes"] / total if total else 0
            on_progress(frac, d.get("_speed_str", "").strip(), d.get("_eta_str", "").strip())
        elif d["status"] == "finished":
            on_progress(1, "", "")

    opts = {
        "outtmpl": os.path.join(out_dir, prefix + "%(title).120B.%(ext)s"),
        "format": format_for(quality),
        "ffmpeg_location": FFMPEG,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "windowsfilenames": True,
        "progress_hooks": [hook],
        "merge_output_format": "mp4",
        **YT_EXTRA,
    }
    if quality == "audio":
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}
        ]

    def attempt():
        before = set(os.listdir(out_dir))
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
        new = [f for f in os.listdir(out_dir)
               if f not in before and not f.endswith((".part", ".ytdl"))]
        if not new:
            raise RuntimeError("Download produced no file.")
        return os.path.join(out_dir, new[0])

    try:
        return attempt()
    except yt_dlp.utils.DownloadError as e:
        # YouTube can still 403 its HD streams; fall back to the Safari client (single 360p stream).
        if "403" not in str(e) or quality == "audio":
            raise
        for f in os.listdir(out_dir):
            if f.endswith((".part", ".ytdl")) or (prefix and f.startswith(prefix)):
                try:
                    os.remove(os.path.join(out_dir, f))
                except OSError:
                    pass
        opts["format"] = "b"
        opts["extractor_args"] = {"youtube": {"player_client": ["web_safari"]}}
        return attempt()


def run_job(job_id: str, job_dir: str, urls: list[str], quality: str, title: str):
    job = jobs[job_id]
    total = len(urls)
    playlist = total > 1 or job.get("playlist")
    files, failed, last_error = [], 0, ""

    for i, url in enumerate(urls):
        job["index"] = i + 1

        def on_progress(frac, speed, eta, i=i):
            job["progress"] = round((i + frac) / total * 95, 1)
            job["speed"], job["eta"] = speed, eta
            job["status"] = "processing" if frac >= 1 else "downloading"

        prefix = f"{i + 1:02d} - " if playlist else ""
        try:
            files.append(download_one(url, quality, job_dir, prefix, on_progress))
        except Exception as e:
            failed += 1
            last_error = friendly_error(e)
            job["failed"] = failed

    if not files:
        job["status"] = "error"
        job["error"] = last_error or "Download failed."
    elif not playlist:
        job["file"], job["filename"] = files[0], os.path.basename(files[0])
        job["progress"], job["status"] = 100, "done"
    else:
        job["status"] = "processing"
        safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title).strip()[:80] or "playlist"
        zip_path = os.path.join(job_dir, safe + ".zip")
        # media is already compressed, so store instead of deflating
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
            for f in files:
                z.write(f, os.path.basename(f))
        for f in files:
            os.remove(f)
        job["file"], job["filename"] = zip_path, os.path.basename(zip_path)
        job["progress"], job["status"] = 100, "done"
    job["finished_at"] = time.time()


@router.post("/api/jobs", dependencies=[Depends(security.require_downloader)])
def create_job(req: JobRequest, request: Request):
    security.assert_capacity(request)
    if req.quality not in ("best", "audio") and not req.quality.isdigit():
        raise HTTPException(400, "Invalid quality.")
    if req.urls:
        if len(req.urls) > MAX_PLAYLIST:
            raise HTTPException(400, f"Select at most {MAX_PLAYLIST} videos.")
        urls = [check_url(u) for u in req.urls]
    else:
        urls = [check_url(req.url)]
    job_id, _, job_dir = new_job(total=len(urls), playlist=bool(req.urls), ip=security.client_ip(request))
    threading.Thread(target=run_job, args=(job_id, job_dir, urls, req.quality, req.title), daemon=True).start()
    return {"id": job_id}
