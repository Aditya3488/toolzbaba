"""Image hosting with on-the-fly format conversion: /i/<id>.<png|jpg|webp|avif|gif|...>?w=800&q=80"""
import hashlib
import hmac
import json
import os
import secrets
import shutil
import threading
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, ImageSequence

import config
from core import DATA_DIR
from tools.imgutil import save_image

router = APIRouter()
UPLOADS = Path(DATA_DIR) / "uploads"
CACHE = Path(DATA_DIR) / "cache"
UPLOADS.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

MAX_FILE_MB = int(os.environ.get("CDN_MAX_FILE_MB", "25"))
MAX_TOTAL_MB = int(os.environ.get("CDN_MAX_TOTAL_MB", "5000"))
RETENTION_DAYS = int(os.environ.get("CDN_RETENTION_DAYS", "0"))  # 0 = keep forever
OUT_FORMATS = ["jpg", "png", "webp", "avif", "gif", "bmp", "tiff", "ico"]
ALIASES = {"jpeg": "jpg", "tif": "tiff"}
MAX_SIDE = 4096


def _dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def _meta(item: Path) -> dict:
    return json.loads((item / "meta.json").read_text("utf-8"))


def _base_url(request: Request) -> str:
    """Links handed out to users: PUBLIC_BASE_URL, else SITE_URL (when configured), else the address they visited."""
    return (os.environ.get("PUBLIC_BASE_URL") or (config.SITE_URL if config.SITE_URL_SET else str(request.base_url))).rstrip("/")


def _links(base: str, item_id: str) -> dict:
    return {f: f"{base}/i/{item_id}.{f}" for f in OUT_FORMATS}


@router.post("/api/cdn")
def upload(request: Request, files: list[UploadFile] = File(...)):
    if len(files) > 10:
        raise HTTPException(400, "Upload at most 10 images at once.")
    if _dir_size(UPLOADS) > MAX_TOTAL_MB * 1024 * 1024:
        raise HTTPException(507, "Storage is full.")
    results = []
    for f in files:
        item_id = secrets.token_urlsafe(7).replace("_", "a").replace("-", "b")
        item = UPLOADS / item_id
        item.mkdir()
        try:
            dest = item / "original"
            with open(dest, "wb") as out:
                shutil.copyfileobj(f.file, out, 1024 * 1024)
            size = dest.stat().st_size
            if size > MAX_FILE_MB * 1024 * 1024:
                raise HTTPException(413, f"'{f.filename}' is larger than {MAX_FILE_MB} MB.")
            try:
                with Image.open(dest) as im:
                    fmt, w, h, animated = (im.format or "").lower(), im.width, im.height, getattr(im, "is_animated", False)
            except Exception:  # noqa: BLE001
                raise HTTPException(400, f"'{f.filename}' is not a supported image.")
            token = secrets.token_urlsafe(16)
            (item / "meta.json").write_text(json.dumps({
                "name": os.path.basename(f.filename or "image"), "format": ALIASES.get(fmt, fmt), "width": w,
                "height": h, "size": size, "animated": animated, "created": time.time(),
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
            }), "utf-8")
        except HTTPException:
            shutil.rmtree(item, ignore_errors=True)
            raise
        results.append({"id": item_id, "name": f.filename, "width": w, "height": h, "size": size,
                        "delete_token": token, "links": _links(_base_url(request), item_id)})
    return {"items": results}


@router.delete("/api/cdn/{item_id}")
def delete(item_id: str, request: Request, token: str = ""):
    """Owner deletes with the token from upload time; the site admin can delete anything with X-Admin-Key."""
    item = UPLOADS / item_id
    if not item_id.isalnum() or not (item / "meta.json").exists():
        raise HTTPException(404, "Not found.")
    admin = request.headers.get("x-admin-key", "")
    is_admin = bool(config.ADMIN_KEY) and hmac.compare_digest(admin.encode(), config.ADMIN_KEY.encode())
    if not is_admin and not hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), _meta(item)["token_hash"]):
        raise HTTPException(403, "Wrong delete token.")
    shutil.rmtree(item, ignore_errors=True)
    for c in CACHE.glob(f"{item_id}_*"):
        c.unlink(missing_ok=True)
    return {"deleted": True}


def _render(item: Path, dest: Path, fmt: str, w: int, h: int, fit: str, q: int):
    src = item / "original"
    img = Image.open(src)
    animated = getattr(img, "is_animated", False) and fmt in ("gif", "webp")
    if animated and (w or h):
        frames, durs = [], []
        for fr in ImageSequence.Iterator(img):
            f = fr.convert("RGBA")
            f = _resize(f, w, h, fit)
            frames.append(f)
            durs.append(fr.info.get("duration", 100))
        pil = "GIF" if fmt == "gif" else "WEBP"
        frames[0].save(dest, pil, save_all=True, append_images=frames[1:], duration=durs, loop=0)
        return
    if not animated:
        img.seek(0)
        img = ImageOps.exif_transpose(img)
    if w or h:
        img = _resize(img.convert("RGBA") if img.mode not in ("RGB", "RGBA", "L") else img, w, h, fit)
    save_image(img, dest, fmt, quality=q)


def _resize(img: Image.Image, w: int, h: int, fit: str) -> Image.Image:
    if fit == "cover" and w and h:
        return ImageOps.fit(img, (w, h), Image.Resampling.LANCZOS)
    box_w, box_h = w or 10**6, h or 10**6
    if fit == "fill" and w and h:
        return img.resize((w, h), Image.Resampling.LANCZOS)
    out = img.copy()
    out.thumbnail((box_w, box_h), Image.Resampling.LANCZOS)  # keeps aspect, never upscales
    return out


@router.get("/i/{name}")
def serve(name: str, w: int = 0, h: int = 0, q: int = 85, fit: str = "inside"):
    item_id, _, ext = name.rpartition(".")
    ext = ALIASES.get(ext.lower(), ext.lower())
    if not item_id or not item_id.isalnum() or ext not in OUT_FORMATS:
        raise HTTPException(404, "Unknown image or format.")
    item = UPLOADS / item_id
    if not (item / "meta.json").exists():
        raise HTTPException(404, "Image not found.")
    w, h, q = max(0, min(MAX_SIDE, w)), max(0, min(MAX_SIDE, h)), max(1, min(100, q))
    if fit not in ("inside", "cover", "fill"):
        fit = "inside"
    meta = _meta(item)
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    key = hashlib.md5(f"{w}|{h}|{q}|{fit}".encode()).hexdigest()[:10]
    cached = CACHE / f"{item_id}_{key}.{ext}"
    if not cached.exists():
        tmp = cached.with_suffix(cached.suffix + ".tmp")
        try:
            _render(item, tmp, ext, w, h, fit, q)
            os.replace(tmp, cached)
        except Exception:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            raise HTTPException(500, "Could not render this image.")
    media = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "avif": "image/avif", "gif": "image/gif",
             "bmp": "image/bmp", "tiff": "image/tiff", "ico": "image/x-icon"}[ext]
    return FileResponse(cached, media_type=media, headers=headers)


def _purge_loop():
    while True:
        time.sleep(3600)
        cutoff = time.time() - RETENTION_DAYS * 86400
        for item in UPLOADS.iterdir():
            try:
                if _meta(item)["created"] < cutoff:
                    shutil.rmtree(item, ignore_errors=True)
                    for c in CACHE.glob(f"{item.name}_*"):
                        c.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass


if RETENTION_DAYS > 0:
    threading.Thread(target=_purge_loop, daemon=True).start()
