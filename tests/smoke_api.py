"""Smoke-test every server-side tool against a running app (default http://127.0.0.1:8000).

    python tests/smoke_api.py            # all tools (set BASE_URL to test another port)
    python tests/smoke_api.py video pdf  # only names containing these words
"""
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import imageio_ffmpeg
import pymupdf
from PIL import Image, ImageDraw

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8000")  # e.g. BASE_URL=http://127.0.0.1:8001
HERE = Path(__file__).parent
S = HERE / "samples"
S.mkdir(exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


# ------------------------------------------------------------------ sample files
def make_samples():
    face = S / "face.jpg"
    if face.exists():
        photo = Image.open(face).convert("RGB")
    else:
        photo = Image.new("RGB", (512, 512), (120, 160, 200))
    exif = Image.Exif()
    exif[271], exif[272], exif[305] = "TestCam", "Model X", "SmokeTest"
    exif.get_ifd(0x8825).update({1: "N", 2: (28.0, 36.0, 0.0), 3: "E", 4: (77.0, 12.0, 0.0)})
    photo.save(S / "photo_exif.jpg", quality=92, exif=exif)
    icon = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)
    d.ellipse((30, 30, 226, 226), fill=(220, 40, 60, 255))
    d.rectangle((90, 90, 166, 166), fill=(255, 255, 255, 255))
    icon.save(S / "icon.png")
    doc = pymupdf.open()
    for n in range(1, 6):
        pg = doc.new_page()
        pg.insert_text((72, 100), f"Page {n} of the test document", fontsize=24)
        pg.insert_image(pymupdf.Rect(72, 150, 472, 550), filename=str(S / "photo_exif.jpg"))
    doc.save(S / "five.pdf")
    doc2 = pymupdf.open()
    doc2.new_page().insert_text((72, 100), "Second document", fontsize=24)
    doc2.save(S / "other.pdf")
    if not (S / "clip.mp4").exists():
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=4",
                        "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-shortest", str(S / "clip.mp4")], check=True)
    if not (S / "anim.gif").exists():
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2",
                        str(S / "anim.gif")], check=True)


# ------------------------------------------------------------------ http helpers
def multipart(files, options):
    boundary = "----smoke" + str(time.time_ns())
    body = io.BytesIO()
    body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="options"\r\n\r\n{json.dumps(options)}\r\n'.encode())
    for p in files:
        body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{p.name}"\r\n'
                   f"Content-Type: application/octet-stream\r\n\r\n".encode())
        body.write(p.read_bytes())
        body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    return body.getvalue(), f"multipart/form-data; boundary={boundary}"


def call(slug, files, options=None, timeout=600):
    data, ctype = multipart(files, options or {})
    req = urllib.request.Request(f"{BASE}/api/tools/{slug}", data=data, headers={"Content-Type": ctype})
    try:
        job = json.load(urllib.request.urlopen(req))["id"]
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:200]}", None
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = json.load(urllib.request.urlopen(f"{BASE}/api/jobs/{job}"))
        if st["status"] == "done":
            blob = urllib.request.urlopen(f"{BASE}/api/jobs/{job}/file").read()
            return (st["filename"], blob), st.get("info"), time.time() - t0
        if st["status"] == "error":
            return None, st["error"], time.time() - t0
        time.sleep(0.4)
    return None, "timeout", None


RESULTS = []


def check(name, slug, files, options=None, verify=None, expect_error=None):
    if FILTER and not any(f in name.lower() or f in slug for f in FILTER):
        return
    out, info, secs = call(slug, files, options)
    ok, note = out is not None, ""
    if ok:
        fname, blob = out
        note = f"{fname} ({len(blob) / 1024:.0f} KB, {secs:.1f}s)"
        if verify:
            try:
                verify(fname, blob)
            except Exception as e:  # noqa: BLE001
                ok, note = False, f"{note} VERIFY FAILED: {e}"
        if ok and isinstance(info, dict) and info.get("summary"):
            note += " | " + info["summary"]
    else:
        note = str(info)
        if expect_error and expect_error in note:
            ok, note = True, "expected error: " + note[:90]
    RESULTS.append(ok)
    print(("PASS " if ok else "FAIL ") + name.ljust(28) + note)


def zip_names(blob):
    return sorted(zipfile.ZipFile(io.BytesIO(blob)).namelist())


def is_image(fname, blob, fmt=None, size=None):
    im = Image.open(io.BytesIO(blob))
    assert fmt is None or im.format == fmt, f"format {im.format} != {fmt}"
    assert size is None or im.size == size, f"size {im.size} != {size}"


def pdf_pages(n):
    def v(fname, blob):
        got = pymupdf.open(stream=blob, filetype="pdf").page_count
        assert got == n, f"{got} pages, expected {n}"
    return v


def main():
    make_samples()
    P = S / "photo_exif.jpg"
    F = S / "face.jpg" if (S / "face.jpg").exists() else P  # a real portrait makes the AI checks meaningful
    check("compress jpeg", "compress-image", [P], {"quality": 40}, lambda f, b: is_image(f, b, "JPEG"))
    check("compress png->webp", "compress-image", [S / "icon.png"], {"format": "webp", "quality": 70}, lambda f, b: is_image(f, b, "WEBP"))
    check("convert -> avif", "convert-image", [P], {"format": "avif"}, lambda f, b: is_image(f, b, "AVIF"))
    check("convert png -> jpg", "convert-image", [S / "icon.png"], {"format": "jpg", "background": "#ff0000"}, lambda f, b: is_image(f, b, "JPEG"))
    check("convert -> ico", "convert-image", [S / "icon.png"], {"format": "ico"}, lambda f, b: is_image(f, b, "ICO"))

    def exif_gone(f, b):
        im = Image.open(io.BytesIO(b))
        assert not im.getexif().get(271) and not im.getexif().get_ifd(0x8825), "EXIF still present"
    check("exif remover", "exif-remover", [P], {}, exif_gone)
    check("image -> pdf (a4)", "image-to-pdf", [P, S / "icon.png"], {"page": "a4"}, pdf_pages(2))
    check("image -> svg", "image-to-svg", [S / "icon.png"], {"preset": "logo"}, lambda f, b: b.lstrip().startswith(b"<?xml") or b"<svg" in b)

    check("pdf -> images", "pdf-to-image", [S / "five.pdf"], {"dpi": 72, "pages": "1-3"}, lambda f, b: len(zip_names(b)) == 3)
    check("pdf merge", "pdf-merge", [S / "five.pdf", S / "other.pdf"], {}, pdf_pages(6))
    check("pdf split each", "pdf-split", [S / "five.pdf"], {"mode": "each"}, lambda f, b: len(zip_names(b)) == 5)
    check("pdf split extract", "pdf-split", [S / "five.pdf"], {"mode": "extract", "pages": "2,4-5"}, pdf_pages(3))
    check("pdf compress", "pdf-compress", [S / "five.pdf"], {"level": "high"}, pdf_pages(5))
    check("pdf -> docx", "pdf-to-docx", [S / "other.pdf"], {}, lambda f, b: zipfile.is_zipfile(io.BytesIO(b)))
    fake_docx = S / "note.docx"
    with zipfile.ZipFile(fake_docx, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
    from tools.pdf_tools import find_soffice
    check("docx -> pdf", "docx-to-pdf", [fake_docx], {}, expect_error=None if find_soffice() else "LibreOffice is not installed")

    C = S / "clip.mp4"
    check("video -> webm", "video-converter", [C], {"format": "webm", "quality": "low", "resolution": "240"})
    check("video -> mp3", "video-converter", [C], {"format": "mp3"})
    check("video -> gif", "video-to-gif", [C], {"start": 0, "duration": 2, "fps": 10, "width": 240}, lambda f, b: b[:3] == b"GIF")
    check("gif -> mp4", "gif-to-video", [S / "anim.gif"], {"format": "mp4"})
    check("trim accurate", "video-trimmer", [C], {"start": "1", "end": "3", "mode": "accurate"})
    check("trim fast", "video-trimmer", [C], {"start": "0.5", "end": "2.5", "mode": "fast"})
    check("compress video", "video-compressor", [C], {"level": "strong", "resolution": "240"})
    check("compress to size", "video-compressor", [C], {"mode": "size", "target_mb": 0.3})

    check("remove background", "remove-background", [F], {"model": "fast"}, lambda f, b: is_image(f, b, "PNG"))
    check("replace bg colour", "replace-background", [F], {"mode": "color", "color": "#00aa55", "model": "fast"})
    check("upscale fast 2x", "upscale-image", [S / "icon.png"], {"scale": 2, "engine": "fast"}, lambda f, b: is_image(f, b, "PNG", (512, 512)))
    check("upscale AI 2x", "upscale-image", [Image_small()], {"scale": 2, "engine": "ai"}, lambda f, b: is_image(f, b, "PNG", (512, 512)))
    check("upscale AI 4x (odd size)", "upscale-image", [Image_odd()], {"scale": 4, "engine": "ai"}, lambda f, b: is_image(f, b, "PNG", (4 * 301, 4 * 199)))
    check("face blur", "face-blur", [F], {"style": "blur"}, lambda f, b: is_image(f, b, "JPEG"))
    check("anime style", "anime-style", [F], {"style": "hayao"}, lambda f, b: is_image(f, b, "JPEG"))

    print(f"\n{sum(RESULTS)}/{len(RESULTS)} passed")
    sys.exit(0 if all(RESULTS) else 1)


def Image_small():
    p = S / "small256.png"
    Image.open(S / "photo_exif.jpg").resize((256, 256)).save(p)
    return p


def Image_odd():
    p = S / "odd301x199.png"
    Image.open(S / "photo_exif.jpg").resize((301, 199)).save(p)
    return p


FILTER = [a.lower() for a in sys.argv[1:]]
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
