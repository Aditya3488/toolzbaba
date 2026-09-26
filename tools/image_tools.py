"""Server-side image tools: compress, convert, EXIF remover, image->PDF, image->SVG."""
import io
import shutil
from pathlib import Path

import pymupdf
from PIL import Image

from toolkit import IMAGE_EXT, Ctx, ToolError, out_name, tool
from tools.imgutil import EXT_FOR_FORMAT, flatten, has_alpha, hex_to_rgb, open_image, save_image

IMG = IMAGE_EXT


def _kb(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f} MB"


# ---------------------------------------------------------------- compress
@tool("compress-image", accepts=IMG, max_mb=50, max_files=40)
def compress_image(ctx: Ctx):
    quality = ctx.opt("quality", 75, int)
    target = ctx.opt("format", "same")
    max_w = ctx.opt("max_width", 0, int)
    lossy_png = ctx.opt("lossy_png", True, lambda v: v in (True, "true", "1", 1))
    outs, rows = [], []
    for i, src in enumerate(ctx.inputs):
        img = open_image(src)
        src_fmt = EXT_FOR_FORMAT.get((img.format or src.suffix.lstrip(".")).lower().replace("mpo", "jpeg"), "jpg")
        fmt = src_fmt if target == "same" else EXT_FOR_FORMAT.get(target, target)
        if fmt in ("bmp", "tiff", "ico"):
            fmt = "png" if has_alpha(img) else "jpg"
        if max_w and img.width > max_w:
            img = img.resize((max_w, round(img.height * max_w / img.width)), Image.Resampling.LANCZOS)
        dest = ctx.out_dir / out_name(src, fmt, "_compressed")
        save_image(img, dest, fmt, quality=quality, png_colors=256 if (fmt == "png" and lossy_png) else 0)
        before, after = src.stat().st_size, dest.stat().st_size
        if after >= before and fmt == src_fmt and not max_w:
            shutil.copyfile(src, dest.with_suffix(src.suffix.lower()))  # already optimal: keep the original
            dest.unlink()
            dest = dest.with_suffix(src.suffix.lower())
            after = before
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "before": before, "after": after})
        ctx.progress((i + 1) / len(ctx.inputs))
    tb, ta = sum(r["before"] for r in rows), sum(r["after"] for r in rows)
    ctx.info = {"summary": f"{_kb(tb)} → {_kb(ta)}  ({max(0, round((1 - ta / tb) * 100)) if tb else 0}% smaller)", "files": rows}
    return outs


# ---------------------------------------------------------------- convert
@tool("convert-image", accepts=IMG, max_mb=50, max_files=40)
def convert_image(ctx: Ctx):
    fmt = EXT_FOR_FORMAT.get(ctx.opt("format", "png"), "png")
    quality = ctx.opt("quality", 90, int)
    bg = hex_to_rgb(ctx.opt("background", "#ffffff"))
    outs = []
    for i, src in enumerate(ctx.inputs):
        img = open_image(src)
        dest = ctx.out_dir / out_name(src, fmt)
        save_image(img, dest, fmt, quality=quality, bg=bg)
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))
    ctx.info = {"summary": f"Converted {len(outs)} file(s) to {fmt.upper()}"}
    return outs


# ---------------------------------------------------------------- exif
def _read_metadata(src: Path) -> list[str]:
    found = []
    try:
        with Image.open(src) as im:
            ex = im.getexif()
            gps = ex.get_ifd(0x8825)
            sub = ex.get_ifd(0x8769)
            if gps:
                found.append("GPS location")
            make, model = ex.get(271), ex.get(272)
            if make or model:
                found.append(f"Camera: {' '.join(str(x).strip() for x in (make, model) if x)}")
            taken = sub.get(36867) or ex.get(306)
            if taken:
                found.append(f"Date: {taken}")
            if ex.get(305):
                found.append(f"Software: {ex.get(305)}")
            if sub.get(42036):
                found.append(f"Lens: {sub.get(42036)}")
            if not (gps or make or model) and len(ex):
                found.append(f"{len(ex)} other EXIF tag(s)")
            for k in ("xmp", "XML:com.adobe.xmp", "photoshop", "icc_profile"):
                if k in im.info and k != "icc_profile":
                    found.append("XMP/Photoshop data")
                    break
            if any(k.lower() in ("comment", "description", "author", "title", "software") for k in im.info):
                found.append("Text metadata")
    except Exception:  # noqa: BLE001
        pass
    return found


def _strip_jpeg(data: bytes) -> bytes:
    """Drop APP1 (EXIF/XMP), APP13 (IPTC), comments and other metadata segments without re-encoding."""
    out = bytearray(data[:2])
    i = 2
    drop = {0xE1, 0xED, 0xFE} | set(range(0xE3, 0xEE)) | {0xEF}
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the rest is image data
            out += data[i:]
            return bytes(out)
        seg_len = int.from_bytes(data[i + 2:i + 4], "big")
        if marker not in drop:
            out += data[i:i + 2 + seg_len]
        i += 2 + seg_len
    return bytes(out)


@tool("exif-remover", accepts=IMG, max_mb=50, max_files=40)
def exif_remover(ctx: Ctx):
    outs, rows = [], []
    for i, src in enumerate(ctx.inputs):
        found = _read_metadata(src)
        with Image.open(src) as probe:
            fmt = (probe.format or "").upper()
            orientation = probe.getexif().get(0x0112, 1)
        dest = ctx.out_dir / out_name(src, src.suffix, "_clean")
        if fmt == "JPEG" and orientation in (1, None):
            dest.write_bytes(_strip_jpeg(src.read_bytes()))  # lossless: pixels untouched
        else:
            # re-save pixels only (orientation is baked in first so the photo stays upright)
            img = open_image(src)
            if img.mode == "P":
                img = img.convert("RGBA" if has_alpha(img) else "RGB")
            clean = img.copy()
            clean.info = {}
            ext = EXT_FOR_FORMAT.get(fmt.lower(), src.suffix.lstrip(".").lower())
            dest = dest.with_suffix("." + ext)
            save_image(clean, dest, ext, quality=95)
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "removed": found or ["No metadata found"]})
        ctx.progress((i + 1) / len(ctx.inputs))
    n_gps = sum(1 for r in rows if "GPS location" in r["removed"])
    ctx.info = {"summary": "Metadata removed" + (f" (GPS location found in {n_gps} file(s))" if n_gps else ""), "files": rows}
    return outs


# ---------------------------------------------------------------- image -> pdf
PAGES = {"a4": (595, 842), "letter": (612, 792), "a5": (420, 595)}


@tool("image-to-pdf", accepts=IMG, max_mb=50, max_files=100)
def image_to_pdf(ctx: Ctx):
    page = ctx.opt("page", "a4")
    orient = ctx.opt("orientation", "auto")
    margin = ctx.opt("margin", 10, float) * 72 / 25.4  # mm -> pt
    doc = pymupdf.open()
    for i, src in enumerate(ctx.inputs):
        img = open_image(src)
        buf = io.BytesIO()
        if has_alpha(img):
            img.convert("RGBA").save(buf, "PNG")
        else:
            img.convert("RGB").save(buf, "JPEG", quality=92)
        w, h = img.size
        if page == "fit":
            pw, ph, m = w * 0.75, h * 0.75, 0
        else:
            pw, ph = PAGES.get(page, PAGES["a4"])
            landscape = orient == "landscape" or (orient == "auto" and w > h)
            if landscape:
                pw, ph = ph, pw
            m = margin
        pg = doc.new_page(width=pw, height=ph)
        pg.insert_image(pymupdf.Rect(m, m, pw - m, ph - m), stream=buf.getvalue(), keep_proportion=True)
        ctx.progress((i + 1) / len(ctx.inputs))
    dest = ctx.out_dir / (out_name(ctx.inputs[0], "pdf") if len(ctx.inputs) == 1 else "images.pdf")
    doc.save(dest, deflate=True, garbage=3)
    ctx.info = {"summary": f"{len(ctx.inputs)} image(s) → PDF ({_kb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- image -> svg
@tool("image-to-svg", accepts=IMG, max_mb=25, max_files=20)
def image_to_svg(ctx: Ctx):
    import vtracer

    preset = ctx.opt("preset", "logo")
    max_side = 2000
    params = {
        "logo": dict(colormode="color", hierarchical="stacked", mode="spline", filter_speckle=8, color_precision=5,
                     layer_difference=24, corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=6),
        "photo": dict(colormode="color", hierarchical="stacked", mode="spline", filter_speckle=4, color_precision=7,
                      layer_difference=12, corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=6),
        "bw": dict(colormode="binary", hierarchical="stacked", mode="spline", filter_speckle=4, color_precision=6,
                   layer_difference=16, corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=6),
    }.get(preset)
    if not params:
        raise ToolError("Unknown preset.")
    outs = []
    for i, src in enumerate(ctx.inputs):
        img = open_image(src)
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        tmp = ctx.out_dir / f"_tmp{i}.png"
        (img.convert("RGBA") if has_alpha(img) else flatten(img)).save(tmp, "PNG")
        dest = ctx.out_dir / out_name(src, "svg")
        vtracer.convert_image_to_svg_py(str(tmp), str(dest), **params)
        tmp.unlink()
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))
    ctx.info = {"summary": f"Traced {len(outs)} image(s) to SVG ({_kb(sum(p.stat().st_size for p in outs))})"}
    return outs
