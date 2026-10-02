"""Shared plumbing: job store, temp dirs, cleanup, job status/file routes."""
import os
import shutil
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

WORK_DIR = os.path.join(tempfile.gettempdir(), "vd_jobs")
os.makedirs(WORK_DIR, exist_ok=True)
for _old in os.listdir(WORK_DIR):  # leftovers from a previous run (the job list is in memory only)
    shutil.rmtree(os.path.join(WORK_DIR, _old), ignore_errors=True)
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
os.makedirs(DATA_DIR, exist_ok=True)
JOB_TTL = 30 * 60  # seconds a finished file is kept before cleanup

jobs: dict[str, dict] = {}
router = APIRouter()

INLINE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".gif": "image/gif", ".avif": "image/avif", ".bmp": "image/bmp", ".ico": "image/x-icon",
    ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
}


def new_job(**extra) -> tuple[str, dict, str]:
    job_id = uuid.uuid4().hex
    job_dir = os.path.join(WORK_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    jobs[job_id] = {"status": "downloading", "progress": 0, "speed": "", "eta": "",
                    "index": 1, "total": 1, "failed": 0, "info": None, **extra}
    return job_id, jobs[job_id], job_dir


@router.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    return {k: job.get(k) for k in
            ("status", "progress", "speed", "eta", "error", "filename", "index", "total", "failed", "info")}


@router.get("/api/jobs/{job_id}/file")
def job_file(job_id: str, inline: bool = False):
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "File not ready.")
    path, name = job["file"], job["filename"]
    ext = os.path.splitext(name)[1].lower()
    if inline and ext in INLINE_TYPES:
        # preview in the page; sandbox stops an SVG from running scripts on our origin
        # (skipped for PDF: Chrome's PDF viewer doesn't work in a sandboxed document)
        headers = {"X-Content-Type-Options": "nosniff"}
        if ext != ".pdf":
            headers["Content-Security-Policy"] = "sandbox"
        return FileResponse(path, media_type=INLINE_TYPES[ext], content_disposition_type="inline", headers=headers)
    return FileResponse(path, filename=name)


def cleanup_loop():
    while True:
        time.sleep(60)
        now = time.time()
        for jid, job in list(jobs.items()):
            done = job.get("finished_at")
            if done and now - done > JOB_TTL:
                shutil.rmtree(os.path.join(WORK_DIR, jid), ignore_errors=True)
                jobs.pop(jid, None)


def start_cleanup():
    threading.Thread(target=cleanup_loop, daemon=True).start()
