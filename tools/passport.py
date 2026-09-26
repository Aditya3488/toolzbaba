"""Passport / ID photo maker: cut out the person (AI), put them on a plain colour, crop to the right size and head
position, and lay out a print sheet."""
import cv2
import numpy as np
from PIL import Image, ImageDraw

from toolkit import IMAGE_EXT, Ctx, ToolError, out_name, tool
from tools.ai_tools import cutout, detect_faces, limit_size
from tools.imgutil import flatten, hex_to_rgb, open_image

DPI = 300
MM = DPI / 25.4
PRESETS = {"35x45": (35, 45), "51x51": (51, 51), "33x48": (33, 48), "25x35": (25, 35)}
BACKGROUNDS = {"white": (255, 255, 255), "lightgray": (232, 232, 232), "blue": (70, 130, 210), "red": (200, 40, 45)}
PAPERS = {"4x6": (152.4, 101.6), "5x7": (177.8, 127.0), "a4": (297.0, 210.0)}  # long side first (mm)


def _px(mm: float) -> int:
    return round(mm * MM)


@tool("passport-photo-maker", accepts=IMAGE_EXT, max_mb=25)
def passport_photo(ctx: Ctx):
    size = ctx.opt("size", "35x45")
    if size == "custom":
        w_mm, h_mm = ctx.opt("width_mm", 35, float), ctx.opt("height_mm", 45, float)
    elif size in PRESETS:
        w_mm, h_mm = PRESETS[size]
    else:
        raise ToolError("Unknown photo size.")
    if not (15 <= w_mm <= 100 and 15 <= h_mm <= 130):
        raise ToolError("Width must be 15-100 mm and height 15-130 mm.")
    bg_key = ctx.opt("background", "white")
    bg = hex_to_rgb(ctx.opt("custom_color", "#ffffff")) if bg_key == "custom" else BACKGROUNDS.get(bg_key)
    if bg is None:
        raise ToolError("Unknown background colour.")
    ow, oh = _px(w_mm), _px(h_mm)

    src = ctx.inputs[0]
    img = limit_size(open_image(src), 3000)
    ctx.progress(0.05)
    faces = detect_faces(ctx, cv2.cvtColor(np.asarray(flatten(img)), cv2.COLOR_RGB2BGR), score=0.5)
    if not faces:
        raise ToolError("We couldn't find a face. Use a clear, front-facing photo with the whole head visible.")
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    person = cutout(ctx, img, ctx.opt("model", "general"))
    ctx.progress(0.7)
    box = person.getchannel("A").point(lambda v: 255 if v > 100 else 0).getbbox()
    crown = box[1] if box else max(0, y - 0.35 * h)  # top of the hair
    chin = y + h
    if chin - crown < h * 1.1:  # implausible: fall back to a typical crown position
        crown = y - 0.35 * h

    # how big the head should be in the final photo (crown to chin as a share of the photo height)
    head_ratio = 0.72 if ow / oh < 0.85 else 0.58
    head_ratio *= {"smaller": 0.92, "larger": 1.08}.get(ctx.opt("head", "auto"), 1.0)
    top_ratio = 0.08
    crop_h = (chin - crown) / head_ratio
    crop_w = crop_h * ow / oh
    left = (x + w / 2) - crop_w / 2
    top = crown - top_ratio * crop_h
    scale = oh / crop_h
    scaled = person.resize((max(1, round(person.width * scale)), max(1, round(person.height * scale))), Image.Resampling.LANCZOS)
    photo = Image.new("RGB", (ow, oh), bg)
    photo.paste(scaled, (round(-left * scale), round(-top * scale)), scaled)

    label = f"{w_mm:g}x{h_mm:g}mm"
    outs = [ctx.out_dir / out_name(src, "jpg", f"_passport_{label}")]
    photo.save(outs[0], "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0)

    sheet = ctx.opt("sheet", "4x6")
    copies_txt = ""
    if sheet != "none":
        if sheet not in PAPERS:
            raise ToolError("Unknown paper size.")
        gap, margin = 2.0, 4.0
        best = None
        for pw, ph in (PAPERS[sheet], PAPERS[sheet][::-1]):  # try landscape and portrait, keep the one that fits more
            cols = int((pw - 2 * margin + gap) // (w_mm + gap))
            rows = int((ph - 2 * margin + gap) // (h_mm + gap))
            if best is None or cols * rows > best[0]:
                best = (cols * rows, cols, rows, pw, ph)
        cap, cols, rows, pw, ph = best
        if cap < 1:
            raise ToolError("This photo doesn't fit on that paper. Choose a bigger sheet.")
        want = ctx.opt("copies", 0, int)
        n = cap if want <= 0 else min(want, cap)
        page = Image.new("RGB", (_px(pw), _px(ph)), (255, 255, 255))
        grid_w, grid_h = cols * w_mm + (cols - 1) * gap, rows * h_mm + (rows - 1) * gap
        x0, y0 = (pw - grid_w) / 2, (ph - grid_h) / 2
        draw = ImageDraw.Draw(page)
        for i in range(n):
            c, r = i % cols, i // cols
            px_, py_ = _px(x0 + c * (w_mm + gap)), _px(y0 + r * (h_mm + gap))
            page.paste(photo, (px_, py_))
            draw.rectangle([px_ - 1, py_ - 1, px_ + ow, py_ + oh], outline=(190, 190, 190), width=1)  # cutting guide
        sheet_path = ctx.out_dir / out_name(src, "jpg", f"_sheet_{sheet}")
        page.save(sheet_path, "JPEG", quality=95, dpi=(DPI, DPI))
        outs.append(sheet_path)
        copies_txt = f" + a {sheet.upper()} print sheet with {n} copies"
    ctx.info = {"summary": f"Passport photo {label} at {DPI} DPI{copies_txt}. Check your country's rules (head size, expression, background)."}
    return outs
