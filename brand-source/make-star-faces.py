"""Builds static/assets/brand/star-faces.webp: the Bookmark star's three faces on ONE body, for a smooth animation.

The storyboard (star-storyboard.jpg, see make-star-sprite.py) draws the movement as 12 separate frames, and swapping
whole frames makes the star jump: the frames differ a little in size, position and tilt. Here the body is always the
resting star (frame 12); only the face changes:
    frame 1  resting face  (storyboard frame 12)
    frame 2  the smile     (frame 5, turned upright and lined up with the resting star)
    frame 3  the blink     (frame 6, lined up the same way)
The face is taken from inside a soft oval, so its edge blends into the body. The movement itself (pop, tilt, hop,
squash) is done smoothly by CSS (.tzstar in app.css).    Run:  python brand-source/make-star-faces.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, 'star-storyboard.jpg')).convert('RGB'); A = np.asarray(src).astype(np.int16)
sat = A.max(2) - A.min(2)
B = [(181,387,196,398),(623,900,155,422),(1082,1397,114,421),(1565,1867,149,436),(132,444,857,1164),(604,918,862,1164),
     (1083,1395,864,1171),(1558,1869,859,1174),(134,439,1504,1806),(609,915,1548,1832),(1087,1391,1513,1808),(1562,1867,1522,1817)]
CELL, BASE, OUT = 340, 330, 96


def cut(i):   # the same cut-out as make-star-sprite.py, on a 340x340 canvas
    x0, x1, y0, y1 = B[i]; p = 4; xs, xe, ys, ye = x0 - p, x1 + p + 1, y0 - p, y1 + p + 1
    rgb = A[ys:ye, xs:xe]; s = sat[ys:ye, xs:xe]
    a = np.clip((s - 8) / (22 - 8), 0, 1)
    am = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    tile = Image.fromarray(rgb.astype(np.uint8)).convert('RGBA'); tile.putalpha(am)
    canvas = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    canvas.paste(tile, (CELL // 2 - ((x0 + x1) // 2 - xs), BASE - (y1 - ys)), tile)
    return canvas


def stats(im):
    a = np.asarray(im)[:, :, 3] > 100; ys, xs = np.nonzero(a)
    return xs.mean(), ys.mean(), a.sum()


def align(im, ref):
    """Turn `im` upright and move/scale it so its outline lies on `ref` (best overlap)."""
    ra = np.asarray(ref)[:, :, 3] > 100; rx, ry, rarea = stats(ref)
    best = None
    for ang in np.arange(-12, 12.01, 0.25):
        r = im.rotate(ang, resample=Image.BICUBIC)
        x, y, area = stats(r); k = (rarea / area) ** 0.5
        r = r.resize((round(CELL * k), round(CELL * k)), Image.LANCZOS)
        c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); c.paste(r, (round(rx - x * k), round(ry - y * k)), r)
        ca = np.asarray(c)[:, :, 3] > 100; iou = (ca & ra).sum() / (ca | ra).sum()
        if not best or iou > best[0]: best = (iou, ang, c)
    print(f'  turned {best[1]:+.2f} deg, outline overlap {best[0]:.3f}')
    return best[2]


rest = cut(11)
rx, ry, _ = stats(rest)
# the face area: a soft oval around the eyes and mouth (well inside the outline)
mask = Image.new('L', (CELL, CELL), 0)
ImageDraw.Draw(mask).ellipse((rx - 84, ry - 92, rx + 84, ry + 66), fill=255)   # reaches above the eyes' glow
mask = mask.filter(ImageFilter.GaussianBlur(10))
def blur(arr, r):   # a gaussian blur of a float array (rows, then columns)
    x = np.arange(-3 * r, 3 * r + 1); k = np.exp(-x * x / (2 * r * r)); k /= k.sum()
    arr = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 1, arr)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 0, arr)


# the resting body without its eyes: inside the face oval the dark eyes are replaced by the surrounding cream (a blur of
# the cream only, so the soft shading stays)
R = np.asarray(rest).astype(float); m = np.asarray(mask) / 255.0
lum = R[:, :, :3] @ [0.299, 0.587, 0.114]
inside = (np.asarray(rest)[:, :, 3] > 200) & (m > 0.5); mid = np.median(lum[inside])   # the plain cream of the face
cream = ((np.abs(lum - mid) < 9) & (np.asarray(rest)[:, :, 3] > 200)).astype(float)   # neither the eyes nor their light glow
w = blur(cream, 9) + 1e-6
fill = np.stack([blur(R[:, :, c] * cream, 9) / w for c in range(3)], -1)
plain = R.copy(); plain[:, :, :3] = fill * m[:, :, None] + R[:, :, :3] * (1 - m[:, :, None])
fill_lum = plain[:, :, :3] @ [0.299, 0.587, 0.114]
faces = [rest]
for i, name in ((4, 'smile'), (5, 'blink')):
    print(name); F = np.asarray(align(cut(i), rest)).astype(float)
    # only the drawn lines of the new face: pixels much darker than the cream (the drawing's faint traces of the open eyes are left out)
    ink = np.clip((fill_lum - F[:, :, :3] @ [0.299, 0.587, 0.114] - 40) / 40, 0, 1) * m * (F[:, :, 3] / 255)
    out = plain.copy(); out[:, :, :3] = F[:, :, :3] * ink[:, :, None] + plain[:, :, :3] * (1 - ink[:, :, None])
    faces.append(Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA'))
sprite = Image.new('RGBA', (OUT * len(faces), OUT), (0, 0, 0, 0))
for i, f in enumerate(faces): sprite.paste(f.convert('RGBa').resize((OUT, OUT), Image.LANCZOS).convert('RGBA'), (i * OUT, 0))
dest = os.path.join(HERE, '..', 'static', 'assets', 'brand', 'star-faces.webp')
sprite.save(dest, 'WEBP', quality=90, method=6)
big = Image.new('RGB', (340 * len(faces), 340), (246, 247, 251))
for i, f in enumerate(faces): big.paste(f, (i * 340, 0), f)
big.save(os.path.join(HERE, 'star-faces-preview.png'))
print('star-faces.webp', os.path.getsize(dest), 'bytes', sprite.size)
