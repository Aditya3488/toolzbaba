"""Shared image helpers (Pillow)."""
from pathlib import Path

import pillow_heif
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()
Image.MAX_IMAGE_PIXELS = 120_000_000  # guard against decompression bombs

EXT_FOR_FORMAT = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "avif": "avif",
                  "gif": "gif", "bmp": "bmp", "tiff": "tiff", "ico": "ico"}
PIL_FORMAT = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP", "avif": "AVIF", "gif": "GIF",
              "bmp": "BMP", "tiff": "TIFF", "ico": "ICO"}


def hex_to_rgb(value: str, default=(255, 255, 255)):
    v = (value or "").lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    try:
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return default


def open_image(path: Path, transpose: bool = True) -> Image.Image:
    img = Image.open(path)
    img.load()
    return ImageOps.exif_transpose(img) if transpose else img


def has_alpha(img: Image.Image) -> bool:
    return img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)


def flatten(img: Image.Image, bg=(255, 255, 255)) -> Image.Image:
    """RGB copy with transparency composited onto bg."""
    if has_alpha(img):
        rgba = img.convert("RGBA")
        base = Image.new("RGB", rgba.size, bg)
        base.paste(rgba, mask=rgba.split()[3])
        return base
    return img.convert("RGB")


def save_image(img: Image.Image, dest: Path, fmt: str, quality: int = 85, bg=(255, 255, 255),
               png_colors: int = 0, ico_sizes: list[int] | None = None) -> Path:
    """Save img to dest as fmt ('jpg','png','webp','avif','gif','bmp','tiff','ico')."""
    fmt = EXT_FOR_FORMAT.get(fmt.lower(), fmt.lower())
    animated = getattr(img, "is_animated", False) and fmt in ("gif", "webp", "png")
    if animated:
        kw = {"save_all": True, "loop": img.info.get("loop", 0)}
        if fmt == "webp":
            kw["quality"] = quality
        if fmt == "gif":
            kw["optimize"] = True
        frames, durations = [], []
        from PIL import ImageSequence
        for fr in ImageSequence.Iterator(img):
            frames.append(fr.convert("RGBA"))
            durations.append(fr.info.get("duration", 100))
        frames[0].save(dest, PIL_FORMAT[fmt], append_images=frames[1:], duration=durations, **kw)
        return dest

    if fmt in ("jpg", "bmp"):
        img = flatten(img, bg)
    elif img.mode not in ("RGB", "RGBA", "L", "LA"):
        img = img.convert("RGBA" if has_alpha(img) else "RGB")

    if fmt == "jpg":
        img.save(dest, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=0 if quality >= 90 else 2)
    elif fmt == "png":
        if png_colors:
            img = img.quantize(colors=png_colors, method=Image.Quantize.FASTOCTREE if has_alpha(img) else Image.Quantize.MEDIANCUT)
        img.save(dest, "PNG", optimize=True)
    elif fmt == "webp":
        img.save(dest, "WEBP", quality=quality, method=4)
    elif fmt == "avif":
        img.save(dest, "AVIF", quality=quality)
    elif fmt == "gif":
        img.save(dest, "GIF", optimize=True)
    elif fmt == "bmp":
        img.save(dest, "BMP")
    elif fmt == "tiff":
        img.save(dest, "TIFF", compression="tiff_lzw")
    elif fmt == "ico":
        sizes = [s for s in (ico_sizes or [16, 32, 48, 64, 128, 256]) if s <= max(img.size) or s <= 256]
        big = img.convert("RGBA")
        side = max(big.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(big, ((side - big.width) // 2, (side - big.height) // 2))
        square.save(dest, "ICO", sizes=[(s, s) for s in sizes])
    else:
        raise ValueError(f"Unsupported format: {fmt}")
    return dest
