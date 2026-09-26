"""Tool registry + the generic upload -> job -> result route (POST /api/tools/{slug})."""
import json
import os
import re
import shutil
import threading
import time
import zipfile
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

import security
from core import jobs, new_job

router = APIRouter()
REGISTRY: dict[str, "ToolSpec"] = {}

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif", ".ico"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".flv", ".wmv", ".mpg", ".mpeg", ".3gp", ".ts", ".gif"}


class ToolError(Exception):
    """A problem to show the user as-is (bad input, missing dependency...)."""


class ToolSpec:
    def __init__(self, slug, fn, accepts, max_mb, max_files, min_files):
        self.slug, self.fn, self.accepts = slug, fn, accepts
        self.max_mb, self.max_files, self.min_files = max_mb, max_files, min_files


class Ctx:
    """What a tool function receives."""

    def __init__(self, job: dict, inputs: list[Path], opts: dict, out_dir: Path):
        self.job, self.inputs, self.opts, self.out_dir = job, inputs, opts, out_dir
        self.info: dict = {}

    def progress(self, frac: float):
        self.job["progress"] = round(max(0.0, min(1.0, frac)) * 95, 1)

    def opt(self, name, default=None, cast=None):
        v = self.opts.get(name, default)
        if v is None or v == "":
            return default
        try:
            return cast(v) if cast else v
        except (TypeError, ValueError):
            raise ToolError(f"Invalid value for '{name}'.")

    def display_name(self, path: Path) -> str:
        """Original filename without the numeric prefix used on disk."""
        return re.sub(r"^\d{2}_", "", path.name)


def tool(slug: str, accepts: set[str] | None = None, max_mb: int = 100, max_files: int = 1, min_files: int = 1):
    def deco(fn: Callable[[Ctx], list[Path]]):
        REGISTRY[slug] = ToolSpec(slug, fn, accepts, max_mb, max_files, min_files)
        return fn
    return deco


def safe_name(name: str) -> str:
    name = os.path.basename(name.replace("\\", "/"))
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .") or "file"
    return name[:120]


def out_name(src: Path, ext: str, suffix: str = "") -> str:
    """'03_photo.jpg' -> 'photo<suffix>.<ext>'"""
    stem = re.sub(r"^\d{2}_", "", src.stem)
    return f"{stem}{suffix}.{ext.lstrip('.')}"


_slots = threading.BoundedSemaphore(int(os.environ.get("MAX_CONCURRENT_JOBS", "3")))


def _run(slug: str, job_id: str, job: dict, job_dir: Path, inputs: list[Path], opts: dict):
    spec = REGISTRY[slug]
    out_dir = job_dir / "out"
    out_dir.mkdir(exist_ok=True)
    ctx = Ctx(job, inputs, opts, out_dir)
    if not _slots.acquire(blocking=False):  # all workers busy: wait in line
        job["speed"] = "Waiting in queue..."
        _slots.acquire()
        job["speed"] = ""
    try:
        outputs = [Path(p) for p in spec.fn(ctx)]
        if not outputs:
            raise ToolError("Nothing was produced.")
        if len(outputs) == 1:
            final = outputs[0]
        else:
            job["status"] = "processing"
            final = job_dir / f"{slug}.zip"
            with zipfile.ZipFile(final, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
                used = set()
                for p in outputs:
                    arc, n = p.name, 1
                    while arc in used:
                        arc = f"{p.stem}_{n}{p.suffix}"
                        n += 1
                    used.add(arc)
                    z.write(p, arc)
        job["file"], job["filename"] = str(final), final.name
        job["info"] = ctx.info or None
        job["progress"], job["status"] = 100, "done"
    except ToolError as e:
        job["status"], job["error"] = "error", str(e)
    except Exception as e:  # noqa: BLE001 - surface anything else as a readable failure
        job["status"], job["error"] = "error", f"Processing failed: {str(e)[:250]}"
    finally:
        _slots.release()
        shutil.rmtree(job_dir / "in", ignore_errors=True)
        job["finished_at"] = time.time()


@router.post("/api/tools/{slug}")
def run_tool(slug: str, request: Request, files: list[UploadFile] = File(default=[]), options: str = Form("{}")):
    spec = REGISTRY.get(slug)
    if not spec:
        raise HTTPException(404, "Unknown tool.")
    security.assert_capacity(request)
    try:
        opts = json.loads(options or "{}")
        if not isinstance(opts, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(400, "Bad options.")
    if len(files) < spec.min_files:
        raise HTTPException(400, "Please add a file." if spec.min_files == 1 else f"Please add at least {spec.min_files} files.")
    if len(files) > spec.max_files:
        raise HTTPException(400, f"At most {spec.max_files} files at once for this tool.")

    job_id, job, job_dir_s = new_job(total=len(files), ip=security.client_ip(request))
    job_dir = Path(job_dir_s)
    in_dir = job_dir / "in"
    in_dir.mkdir()
    inputs: list[Path] = []
    try:
        for i, f in enumerate(files):
            name = safe_name(f.filename or "file")
            ext = Path(name).suffix.lower()
            if spec.accepts and ext not in spec.accepts:
                raise HTTPException(400, f"'{name}' is not a supported file type for this tool.")
            dest = in_dir / f"{i:02d}_{name}"
            with open(dest, "wb") as out:
                shutil.copyfileobj(f.file, out, 1024 * 1024)
            if dest.stat().st_size > spec.max_mb * 1024 * 1024:
                raise HTTPException(413, f"'{name}' is larger than {spec.max_mb} MB.")
            inputs.append(dest)
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        jobs.pop(job_id, None)
        raise
    threading.Thread(target=_run, args=(slug, job_id, job, job_dir, inputs, opts), daemon=True).start()
    return {"id": job_id}
