"""Rebuilds every icon, logo variant, hero art and the social share image from the two original files in this folder.

    python brand-source/make_brand_assets.py

Needs: pillow, numpy, scipy (scipy comes with rembg).
"""
import io
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "static" / "assets" / "brand"
OUT.mkdir(parents=True, exist_ok=True)
LANCZOS = Image.Resampling.LANCZOS

logo = Image.open(HERE / "logo-original.webp").convert("RGBA")
fav = Image.open(HERE / "favicon-original.webp").convert("RGB")

# ------------------------------------------------------------------ 1. favicon tile with real transparent corners (no white fringe)
arr = np.array(fav).astype(np.uint8)
near_white = (arr > 243).all(axis=2)
lab, n = ndimage.label(near_white)
border_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border_labels))
inside = ~outside
inside = ndimage.binary_opening(inside, iterations=2)  # drop stray specks
solid = ndimage.binary_erosion(inside, iterations=3)   # trusted interior colours
# fill the fringe with the nearest interior colour so no white halo remains
idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
filled = arr[idx[0], idx[1]]
alpha = ndimage.gaussian_filter(inside.astype(float), 1.1)
alpha = np.clip((alpha - 0.5) * 2.2 + 0.5, 0, 1)
tile = Image.fromarray(np.dstack([filled, (alpha * 255).astype(np.uint8)]), "RGBA")
bbox = tile.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
tile = tile.crop(bbox)
side = max(tile.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(tile, ((side - tile.width) // 2, (side - tile.height) // 2))
tile = sq
print("tile", tile.size)


def gradient(size, c1=(2, 162, 254), c2=(0, 15, 201)):
    g = np.zeros((size, size, 3), np.uint8)
    t = (np.add.outer(np.arange(size), np.arange(size)) / (2 * size - 2))[..., None]
    g[:] = (np.array(c1) * (1 - t) + np.array(c2) * t).astype(np.uint8)
    return Image.fromarray(g, "RGB").convert("RGBA")


def rounded(img, radius_frac=0.225):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=int(img.width * radius_frac), fill=255)
    out = img.copy()
    out.putalpha(m)
    return out


def tile_at(px):
    return tile.resize((px, px), LANCZOS)


# ------------------------------------------------------------------ 2. simplified small icon: zoom on face + glasses + beard
W = tile.width
fx0, fy0, fs = int(W * 0.235), int(W * 0.075), int(W * 0.53)  # window around the face
face = tile.crop((fx0, fy0, fx0 + fs, fy0 + fs))
bg = gradient(fs)
bg.alpha_composite(face)
face_tile = rounded(bg.resize((512, 512), LANCZOS))


def face_at(px):
    return face_tile.resize((px, px), LANCZOS)


# ------------------------------------------------------------------ 3. full-bleed icons (apple touch, maskable)
def full_bleed(px, scale):
    base = gradient(1024)
    t = tile.resize((int(1024 * scale), int(1024 * scale)), LANCZOS)
    base.alpha_composite(t, ((1024 - t.width) // 2, (1024 - t.height) // 2))
    return base.resize((px, px), LANCZOS).convert("RGB")


# ------------------------------------------------------------------ 4. write icon files
tile_at(64).save(OUT / "mark-64.png", optimize=True)
tile_at(128).save(OUT / "mark-128.png", optimize=True)
tile_at(512).save(OUT / "icon-512.png", optimize=True)
tile_at(192).save(OUT / "icon-192.png", optimize=True)
face_at(16).save(OUT / "favicon-16.png", optimize=True)
face_at(32).save(OUT / "favicon-32.png", optimize=True)
full_bleed(180, 1.10).save(OUT / "apple-touch-icon.png", optimize=True)
full_bleed(512, 0.95).save(OUT / "maskable-512.png", optimize=True)


def ico(entries):  # PNG-compressed ICO with a different image per size
    blobs = []
    for im in entries:
        b = io.BytesIO(); im.save(b, "PNG"); blobs.append((im.width, b.getvalue()))
    head = struct.pack("<HHH", 0, 1, len(blobs)); off = 6 + 16 * len(blobs); dirs = b""; data = b""
    for w, blob in blobs:
        dirs += struct.pack("<BBBBHHII", w if w < 256 else 0, w if w < 256 else 0, 0, 0, 1, 32, len(blob), off + len(data)); data += blob
    return head + dirs + data


(OUT / "favicon.ico").write_bytes(ico([face_at(16), face_at(32), face_at(48)]))
(OUT.parent / "favicon.ico").write_bytes((OUT / "favicon.ico").read_bytes())

# ------------------------------------------------------------------ 5. logo variants
logo_l = logo.copy()
la = np.array(logo_l).astype(np.int32)
lum = (la[..., 0] * 299 + la[..., 1] * 587 + la[..., 2] * 114) // 1000
region = np.zeros(lum.shape, bool)
region[690:, :] = True  # wordmark + tagline only; the mascot's black outlines must stay black
dark = region & (lum < 150) & (la[..., 3] > 0)
# map dark text to a soft white, keeping the anti-aliased alpha
la[dark, 0:3] = (241, 244, 252)
tagline = region & (np.arange(lum.shape[0])[:, None] > 880) & (lum >= 150) & (lum < 200) & (la[..., 3] > 0)
la[tagline, 0:3] = (190, 199, 224)
logo_d = Image.fromarray(la.astype(np.uint8), "RGBA")
logo.resize((900, int(900 * logo.height / logo.width)), LANCZOS).save(OUT / "logo.webp", quality=90, method=6)
logo_d.resize((900, int(900 * logo.height / logo.width)), LANCZOS).save(OUT / "logo-dark.webp", quality=90, method=6)

# mascot with the floating tool icons (hero illustration)
art = logo.crop((250, 100, 1236, 672))
art.resize((780, int(780 * art.height / art.width)), LANCZOS).save(OUT / "hero-art.webp", quality=90, method=6)

# ------------------------------------------------------------------ 6. Open Graph image 1200x630
og = Image.new("RGB", (1200, 630))
px = og.load()
for y in range(630):
    for x in range(1200):
        t = min(1, (x / 1200 * 0.55 + y / 630 * 0.45))
        px[x, y] = (int(255 - 6 * t), int(255 - 22 * t), int(255 - 48 * t))  # white -> soft warm cream
lg = logo.copy()
lg.thumbnail((1080, 560), LANCZOS)
og_rgba = og.convert("RGBA")
og_rgba.alpha_composite(lg, ((1200 - lg.width) // 2, (630 - lg.height) // 2 + 6))
og_rgba.convert("RGB").save(OUT.parent / "og.png", optimize=True)

print("files:", sorted(p.name for p in OUT.iterdir()))
for p in sorted(OUT.iterdir()):
    print(f"  {p.name:22s} {p.stat().st_size / 1024:6.0f} KB")
