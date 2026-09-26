"""AI / vision tools: background removal, background replace, upscaler, face blur, anime style.

Models are downloaded on first use into DATA_DIR/models (small ones are a few MB; the best background
model and the upscalers are 50-170 MB).
"""
import os
import threading
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from core import DATA_DIR
from toolkit import IMAGE_EXT, Ctx, ToolError, out_name, tool
from tools.imgutil import flatten, has_alpha, hex_to_rgb, open_image

MODELS = Path(DATA_DIR) / "models"
MODELS.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("U2NET_HOME", str(MODELS / "rembg"))  # rembg stores its models here
# numba (used by rembg's pymatting) caches compiled code next to the package by default. Deep folders on Windows
# hit the 260-character path limit there, and read-only installs can't write at all, so keep the cache in DATA_DIR.
os.environ.setdefault("NUMBA_CACHE_DIR", str(Path(DATA_DIR) / "numba"))

GH = "https://github.com"
MODEL_URLS = {
    "yunet.onnx": f"{GH}/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "animegan_hayao.onnx": f"{GH}/TachibanaYoshino/AnimeGANv3/releases/download/v1.1.0/AnimeGANv3_Hayao_36.onnx",
    "animegan_shinkai.onnx": f"{GH}/TachibanaYoshino/AnimeGANv3/releases/download/v1.1.0/AnimeGANv3_Shinkai_37.onnx",
    # Real-ESRGAN general x4v3 (compact, fixed 128x128 input tiles)
    "realesr_general_x4v3.onnx": "https://huggingface.co/tamnvcc/Real-ESRGAN-General-x4v3_float/resolve/main/onnx/model.onnx",
}
_model_lock = threading.Lock()
_sessions: dict = {}


def ensure_model(ctx: Ctx, name: str) -> Path:
    path = MODELS / name
    if path.exists():
        return path
    with _model_lock:
        if path.exists():
            return path
        ctx.job["speed"] = "Downloading AI model (first use only)..."
        tmp = path.with_suffix(".part")
        try:
            urllib.request.urlretrieve(MODEL_URLS[name], tmp)
            os.replace(tmp, path)
        except Exception:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            raise ToolError("Could not download the AI model. Check the server's internet connection and try again.")
        finally:
            ctx.job["speed"] = ""
    return path


def onnx_session(ctx: Ctx, name: str):
    import onnxruntime as ort

    if name not in _sessions:
        _sessions[name] = ort.InferenceSession(str(ensure_model(ctx, name)), providers=["CPUExecutionProvider"])
    return _sessions[name]


def limit_size(img: Image.Image, max_side: int) -> Image.Image:
    if max(img.size) > max_side:
        img = img.copy()
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return img


# ---------------------------------------------------------------- background removal
REMBG_MODELS = {"fast": "u2netp", "general": "isnet-general-use", "person": "u2net_human_seg", "anime": "isnet-anime"}


def cutout(ctx: Ctx, img: Image.Image, model: str) -> Image.Image:
    """Return an RGBA image with the background made transparent."""
    from rembg import new_session, remove

    name = REMBG_MODELS.get(model)
    if not name:
        raise ToolError("Unknown model.")
    key = "rembg:" + name
    if key not in _sessions:
        ctx.job["speed"] = "Loading AI model (first use downloads it)..."
        try:
            _sessions[key] = new_session(name)
        except Exception:  # noqa: BLE001
            raise ToolError("Could not load the background-removal model. Check the server's internet connection.")
        finally:
            ctx.job["speed"] = ""
    return remove(img.convert("RGBA") if img.mode != "RGBA" else img, session=_sessions[key])


@tool("remove-background", accepts=IMAGE_EXT, max_mb=25, max_files=10)
def remove_background(ctx: Ctx):
    model = ctx.opt("model", "general")
    fmt = ctx.opt("format", "png")
    outs = []
    for i, src in enumerate(ctx.inputs):
        img = limit_size(open_image(src), 3000)
        result = cutout(ctx, img, model)
        dest = ctx.out_dir / out_name(src, fmt, "_nobg")
        result.save(dest, "PNG" if fmt == "png" else "WEBP", **({"lossless": True} if fmt == "webp" else {}))
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))
    ctx.info = {"summary": f"Background removed from {len(outs)} image(s)"}
    return outs


@tool("replace-background", accepts=IMAGE_EXT, max_mb=25, max_files=2)
def replace_background(ctx: Ctx):
    mode = ctx.opt("mode", "color")
    model = ctx.opt("model", "general")
    src = ctx.inputs[0]
    subject = limit_size(open_image(src), 3000)
    fg = cutout(ctx, subject, model)
    ctx.progress(0.7)
    w, h = subject.size
    if mode == "color":
        bg = Image.new("RGB", (w, h), hex_to_rgb(ctx.opt("color", "#ffffff")))
    elif mode == "gradient":
        c1, c2 = hex_to_rgb(ctx.opt("color", "#4f46e5")), hex_to_rgb(ctx.opt("color2", "#ec4899"))
        t = np.linspace(0, 1, h)[:, None, None]
        arr = (np.array(c1)[None, None, :] * (1 - t) + np.array(c2)[None, None, :] * t).astype(np.uint8)
        bg = Image.fromarray(np.repeat(arr, w, axis=1), "RGB")
    elif mode == "blur":
        radius = max(2, ctx.opt("blur", 20, int))
        bg = flatten(subject).filter(ImageFilter.GaussianBlur(radius))
    elif mode == "image":
        if len(ctx.inputs) < 2:
            raise ToolError("Add a background image as the second file.")
        bg = ImageOps.fit(flatten(open_image(ctx.inputs[1])), (w, h), Image.Resampling.LANCZOS)
    elif mode == "transparent":
        bg = None
    else:
        raise ToolError("Unknown background type.")
    if bg is None:
        result, ext = fg, "png"
    else:
        result, ext = bg.convert("RGBA"), "png"
        result.alpha_composite(fg)
    dest = ctx.out_dir / out_name(src, ext, "_newbg")
    (result if ext == "png" else result.convert("RGB")).save(dest, "PNG" if ext == "png" else "JPEG", quality=95)
    ctx.info = {"summary": "Background replaced"}
    return [dest]


# ---------------------------------------------------------------- upscaler
TILE, TPAD = 112, 8  # the model takes exactly 128x128 tiles: 112 of new pixels + 8 of context on each side


def _tile_upscale(sess, rgb: np.ndarray, progress=None) -> np.ndarray:
    """rgb: HxWx3 uint8 -> (4H)x(4W)x3 uint8 using Real-ESRGAN x4 tile by tile (keeps RAM low)."""
    h, w, _ = rgb.shape
    ph, pw = -(-h // TILE) * TILE, -(-w // TILE) * TILE
    padded = np.pad(rgb, ((TPAD, TPAD + ph - h), (TPAD, TPAD + pw - w), (0, 0)), mode="reflect")
    out = np.zeros((ph * 4, pw * 4, 3), dtype=np.uint8)
    name = sess.get_inputs()[0].name
    total, done = (ph // TILE) * (pw // TILE), 0
    for y in range(0, ph, TILE):
        for x in range(0, pw, TILE):
            tile = padded[y:y + TILE + 2 * TPAD, x:x + TILE + 2 * TPAD].astype(np.float32) / 255.0
            res = sess.run(None, {name: tile.transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
            core = res[TPAD * 4:(TPAD + TILE) * 4, TPAD * 4:(TPAD + TILE) * 4]
            out[y * 4:(y + TILE) * 4, x * 4:(x + TILE) * 4] = (np.clip(core, 0, 1) * 255 + 0.5).astype(np.uint8)
            done += 1
            if progress:
                progress(done / total)
    return out[:h * 4, :w * 4]


@tool("upscale-image", accepts=IMAGE_EXT, max_mb=25, max_files=5)
def upscale_image(ctx: Ctx):
    scale = ctx.opt("scale", 2, int)
    engine = ctx.opt("engine", "ai")
    if scale not in (2, 3, 4):
        raise ToolError("Choose 2x, 3x or 4x.")
    outs = []
    for i, src in enumerate(ctx.inputs):
        img = open_image(src)
        alpha = img.getchannel("A") if has_alpha(img) else None
        rgb = flatten(img)
        w, h = rgb.size
        if engine == "ai":
            if w * h > 2_500_000:
                raise ToolError("For AI upscaling please use an image up to about 2.5 megapixels (e.g. 1800x1400). "
                                "Use 'Fast' mode for bigger images.")
            sess = onnx_session(ctx, "realesr_general_x4v3.onnx")
            base, span = i / len(ctx.inputs), 1 / len(ctx.inputs)
            big = _tile_upscale(sess, np.asarray(rgb), lambda f: ctx.progress(base + span * f))
            result = Image.fromarray(big, "RGB")
            if scale != 4:  # the model is 4x; scale down to the size asked for
                result = result.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
        else:
            result = rgb.resize((w * scale, h * scale), Image.Resampling.LANCZOS)
            result = result.filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))
            ctx.progress((i + 1) / len(ctx.inputs))
        if alpha is not None:
            result = result.convert("RGBA")
            result.putalpha(alpha.resize(result.size, Image.Resampling.LANCZOS))
        dest = ctx.out_dir / out_name(src, "png", f"_{scale}x")
        result.save(dest, "PNG")
        outs.append(dest)
    ctx.info = {"summary": f"Upscaled {scale}x ({'AI' if engine == 'ai' else 'fast'} mode)"}
    return outs


# ---------------------------------------------------------------- face blur
def detect_faces(ctx: Ctx, bgr: np.ndarray, score: float = 0.6) -> list[tuple[int, int, int, int]]:
    import cv2

    h, w = bgr.shape[:2]
    scale = min(1.0, 1280 / max(h, w))
    small = cv2.resize(bgr, (int(w * scale), int(h * scale))) if scale < 1 else bgr
    det = cv2.FaceDetectorYN.create(str(ensure_model(ctx, "yunet.onnx")), "", (small.shape[1], small.shape[0]),
                                    score_threshold=score, nms_threshold=0.3, top_k=500)
    _, faces = det.detect(small)
    boxes = []
    for f in (faces if faces is not None else []):
        x, y, bw, bh = (f[:4] / scale)
        boxes.append((int(x), int(y), int(bw), int(bh)))
    return boxes


@tool("face-blur", accepts=IMAGE_EXT, max_mb=25, max_files=20)
def face_blur(ctx: Ctx):
    import cv2

    style = ctx.opt("style", "blur")
    strength = max(1, min(100, ctx.opt("strength", 60, int)))
    grow = ctx.opt("padding", 20, int) / 100
    outs, rows = [], []
    for i, src in enumerate(ctx.inputs):
        img = flatten(open_image(src))
        bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
        faces = detect_faces(ctx, bgr, score=ctx.opt("sensitivity", 0.6, float))
        H, W = bgr.shape[:2]
        result = bgr.copy()
        for (x, y, bw, bh) in faces:
            px, py = int(bw * grow), int(bh * grow)
            x0, y0, x1, y1 = max(0, x - px), max(0, y - py), min(W, x + bw + px), min(H, y + bh + py)
            if x1 <= x0 or y1 <= y0:
                continue
            roi = bgr[y0:y1, x0:x1]
            if style == "pixelate":
                across = 4 + int((100 - strength) / 100 * 16)  # blocks across the face: fewer = stronger
                small = cv2.resize(roi, (across, max(1, round(across * roi.shape[0] / roi.shape[1]))), interpolation=cv2.INTER_AREA)
                fx = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
            elif style == "black":
                fx = np.zeros_like(roi)
            else:
                k = max(3, int(max(x1 - x0, y1 - y0) * (0.15 + strength / 100 * 0.6))) | 1
                fx = cv2.GaussianBlur(roi, (k, k), 0)
            mask = np.zeros(roi.shape[:2], np.uint8)
            cv2.ellipse(mask, ((x1 - x0) // 2, (y1 - y0) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 255, -1)
            if style != "black":
                mask = cv2.GaussianBlur(mask, (0, 0), max(1, (x1 - x0) * 0.03))
            m = (mask.astype(np.float32) / 255)[..., None]
            result[y0:y1, x0:x1] = (fx * m + roi * (1 - m)).astype(np.uint8)
        ext = "png" if src.suffix.lower() == ".png" else "jpg"
        dest = ctx.out_dir / out_name(src, ext, "_blurred")
        out_img = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
        out_img.save(dest, "PNG" if ext == "png" else "JPEG", quality=95)
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "removed": [f"{len(faces)} face(s) found"]})
        ctx.progress((i + 1) / len(ctx.inputs))
    total = sum(int(r["removed"][0].split()[0]) for r in rows)
    ctx.info = {"summary": f"{total} face(s) blurred" + ("" if total else ". None found - try raising 'Sensitivity' (lower number)."), "files": rows}
    return outs


# ---------------------------------------------------------------- anime style
@tool("anime-style", accepts=IMAGE_EXT, max_mb=25, max_files=10)
def anime_style(ctx: Ctx):
    style = ctx.opt("style", "hayao")
    if style not in ("hayao", "shinkai"):
        raise ToolError("Unknown style.")
    sess = onnx_session(ctx, f"animegan_{style}.onnx")
    in_name = sess.get_inputs()[0].name
    outs = []
    for i, src in enumerate(ctx.inputs):
        img = limit_size(flatten(open_image(src)), 1280)
        w, h = img.size
        nw, nh = max(8, w - w % 8), max(8, h - h % 8)  # model needs sizes divisible by 8
        if (nw, nh) != (w, h):
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)
        x = np.asarray(img, dtype=np.float32)[None] / 127.5 - 1.0
        y = np.squeeze(sess.run(None, {in_name: x})[0])
        out = Image.fromarray(((np.clip(y, -1, 1) + 1) * 127.5).astype(np.uint8), "RGB")
        dest = ctx.out_dir / out_name(src, "jpg", f"_{style}")
        out.save(dest, "JPEG", quality=95)
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))
    ctx.info = {"summary": f"Anime style applied ({style.title()})"}
    return outs
