"""The three groups the first pass missed: pictures into PDF, video into GIF, and GIF into video."""
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

F = {
    "jpg": "JPG", "jpeg": "JPEG", "png": "PNG", "webp": "WebP", "avif": "AVIF", "gif": "GIF", "bmp": "BMP",
    "tiff": "TIFF", "ico": "ICO", "heic": "HEIC", "heif": "HEIF", "jfif": "JFIF",
    "mp4": "MP4", "mov": "MOV", "mkv": "MKV", "avi": "AVI", "webm": "WebM", "wmv": "WMV", "flv": "FLV",
    "m4v": "M4V", "mpg": "MPG", "mpeg": "MPEG", "ts": "TS", "mts": "MTS", "vob": "VOB", "3gp": "3GP",
}
IMG_IN = ["jpg", "png", "webp", "gif", "bmp", "tiff", "avif", "heic", "heif", "jfif", "ico"]
VID_IN = ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv", "m4v", "mpg", "mpeg", "ts", "mts", "vob", "3gp"]
VID_OUT = ["mp4", "webm", "mkv", "mov", "avi"]


def to_pdf(src):
    s = F[src]
    return {
        "name": f"{s} to PDF", "title": f"{s} to PDF Converter Free: Convert {s} to PDF Online",
        "desc": f"Turn {s} pictures into one PDF. Choose the page size and the order. Runs in your browser.",
        "metaDesc": f"Free {s} to PDF converter. Combine {s} images into a single PDF online, choose page size and order. Nothing is uploaded.",
        "about": (f"Put {s} pictures into a PDF, one page each or several to a page. Drag them into the order you want, "
                  f"pick the page size, and download a single document. Useful for sending scans, receipts or photos as one "
                  f"file instead of many. The PDF is made inside your browser, so the pictures never leave your device."),
        "steps": [f"Add your {s} files.", "Drag them into the order you want and choose a page size.", "Make the PDF and download it."],
        "faq": [
            {"q": f"How do I turn {s} into a PDF?", "a": f"Add your {s} files above, drag them into the order you want, then press the button. You get one PDF with every picture in it."},
            {"q": "Can I put several pictures on one page?", "a": "Yes. Choose the layout before you make the PDF; one picture per page is the default."},
            {"q": "Are my pictures uploaded?", "a": "No. The PDF is built inside your browser, so nothing is sent to a server."},
        ],
    }


def to_gif(src):
    s = F[src]
    return {
        "name": f"{s} to GIF", "title": f"{s} to GIF Converter Free: Convert {s} to GIF Online",
        "desc": f"Turn a {s} video into an animated GIF. Pick the part, the size and the frame rate. Runs in your browser.",
        "metaDesc": f"Free {s} to GIF converter. Make an animated GIF from a {s} video online: choose the clip, size and frame rate. Nothing is uploaded.",
        "about": (f"Make an animated GIF out of a {s} video. Choose where the clip starts and ends, how wide the GIF should be "
                  f"and how many frames a second it keeps: all three decide the file size, and the preview shows the result before "
                  f"you download. GIFs play anywhere and need no player, which is why they suit short loops. The video is read "
                  f"inside your browser and never uploaded."),
        "steps": [f"Add your {s} video.", "Choose the start, the end, the width and the frame rate.", "Make the GIF and download it."],
        "faq": [
            {"q": f"How do I turn a {s} video into a GIF?", "a": f"Add the {s} file, pick the part you want and the size, then press the button. The preview shows the GIF before you download it."},
            {"q": "Why is my GIF so large?", "a": "A GIF stores every frame as a picture. Shorten the clip, reduce the width or lower the frame rate and the file gets much smaller."},
            {"q": "Is my video uploaded?", "a": "No. It is read inside your browser and nothing is sent to a server."},
        ],
    }


def gif_to_video(dst):
    d = F[dst]
    return {
        "name": f"GIF to {d}", "title": f"GIF to {d} Converter Free: Convert GIF to {d} Online",
        "desc": f"Turn an animated GIF into a {d} video. Much smaller than the GIF, and it plays anywhere.",
        "metaDesc": f"Free GIF to {d} converter. Turn an animated GIF into a {d} video online, usually far smaller than the GIF. Nothing is uploaded.",
        "about": (f"Turn an animated GIF into a {d} video. A GIF stores every frame as a full picture, so the same animation as "
                  f"{d} is very often a fraction of the size while looking the same or better. That matters where a GIF is too big "
                  f"to send or too heavy for a web page. The conversion runs inside your browser, so the file never leaves your device."),
        "steps": ["Add your GIF.", f"{d} is already selected; adjust the quality if you want.", f"Convert and download the {d} file."],
        "faq": [
            {"q": f"Why convert a GIF to {d}?", "a": f"A {d} video of the same animation is usually much smaller than the GIF, often by ten times or more, and it plays on every phone and browser."},
            {"q": "Does it still loop?", "a": "A video does not loop on its own the way a GIF does. Most players and social sites loop short clips automatically; on a web page you set loop on the video tag."},
            {"q": "Is my file uploaded?", "a": "No. The conversion happens inside your browser."},
        ],
    }


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    by = {t["slug"]: t for t in data["tools"]}
    have = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    have |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(slug, base, body, preset=None):
        if slug in have or base not in by:
            return
        b = by[base]
        v = {"slug": slug, "base": base, "cat": b["cat"], "kind": b.get("kind", "client"), **body}
        if preset:
            v["preset"] = preset
        new.append(v)
        have.add(slug)

    for s in IMG_IN:
        add(f"{s}-to-pdf", "image-to-pdf", to_pdf(s))
    for s in VID_IN:
        add(f"{s}-to-gif", "video-to-gif", to_gif(s))
    for d in VID_OUT:
        add(f"gif-to-{d}", "video-converter", gif_to_video(d), {"format": d})

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"added {len(new)} more; variants now {len(data['variants'])}")
    for v in new[:3]:
        print("  e.g.", v["slug"], "->", v["base"])


if __name__ == "__main__":
    main()
