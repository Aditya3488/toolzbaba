"""Draws the small image samples the browser tests need (run once):  python tests/make_image_samples.py

- samples/odd301x199.png : a 301 x 199 picture with an odd size (the collage test checks nothing is cropped)
Real photos are not kept in the repository; this one is drawn, so it carries nothing personal. The passport and headshot
tests need a real portrait (samples/face.jpg): put one there yourself, it is not committed, and those tests skip without it.
"""
from pathlib import Path

from PIL import Image, ImageDraw

S = Path(__file__).resolve().parent / "samples"
S.mkdir(exist_ok=True)

img = Image.new("RGB", (301, 199), (240, 244, 252))
d = ImageDraw.Draw(img)
for i in range(0, 301, 20):
    d.line([(i, 0), (i, 199)], fill=(200, 210, 235))
d.rectangle([20, 20, 280, 178], outline=(43, 108, 255), width=4)
d.text((110, 90), "301 x 199", fill=(30, 40, 60))
img.save(S / "odd301x199.png")

print("wrote", S / "odd301x199.png")
