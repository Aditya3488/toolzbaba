"""Builds static/assets/brand/star-sprite.webp (the animated Bookmark star) from brand-source/star-storyboard.jpg.

The storyboard is a 2000x2000 JPEG with 12 star frames in a 4x3 grid on a painted grey checkerboard (a JPEG has no
transparency). Each star is cut out by colour (the checkerboard is pure grey, the star is warm cream and orange), put on
the same 340x340 canvas (centred, bottoms on one line, so the squash and bounce frames keep their motion), scaled to
96x96 and laid out left to right: frame 01 at x=0 ... frame 12 at x=1056.  Run:  python brand-source/make-star-sprite.py
B lists each frame's pixel box in the storyboard (x0, x1, y0, y1); update it if the storyboard changes.
"""
import os
from PIL import Image, ImageFilter, features
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, 'star-storyboard.jpg')).convert('RGB'); A = np.asarray(src).astype(np.int16)
sat = A.max(2) - A.min(2)
B = [(181,387,196,398),(623,900,155,422),(1082,1397,114,421),(1565,1867,149,436),(132,444,857,1164),(604,918,862,1164),
     (1083,1395,864,1171),(1558,1869,859,1174),(134,439,1504,1806),(609,915,1548,1832),(1087,1391,1513,1808),(1562,1867,1522,1817)]
CELL, BASE, OUT = 340, 330, 96
frames = []
for (x0, x1, y0, y1) in B:
    p = 4; xs, xe, ys, ye = x0 - p, x1 + p + 1, y0 - p, y1 + p + 1
    rgb = A[ys:ye, xs:xe]; s = sat[ys:ye, xs:xe]
    a = np.clip((s - 8) / (22 - 8), 0, 1)
    am = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    tile = Image.fromarray(rgb.astype(np.uint8)).convert('RGBA'); tile.putalpha(am)
    canvas = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cx = (x0 + x1) // 2 - xs; by = y1 - ys
    canvas.paste(tile, (CELL // 2 - cx, BASE - by), tile)
    frames.append(canvas.convert('RGBa').resize((OUT, OUT), Image.LANCZOS).convert('RGBA'))
sprite = Image.new('RGBA', (OUT * 12, OUT), (0, 0, 0, 0))
for i, f in enumerate(frames): sprite.paste(f, (i * OUT, 0))
dest = os.path.join(HERE, "..", "static", "assets", "brand")
sprite.save(os.path.join(dest, "star-sprite.webp"), "WEBP", quality=88, method=6)
prev = Image.new('RGB', (OUT * 12, OUT * 2), (246, 247, 251)); prev.paste((11, 13, 23), (0, OUT, OUT * 12, OUT * 2))
prev.paste(sprite, (0, 0), sprite); prev.paste(sprite, (0, OUT), sprite); prev.save(os.path.join(HERE, 'star-preview.png'))
print("sprite bytes:", os.path.getsize(os.path.join(dest, "star-sprite.webp")), "size:", sprite.size)
