"""Format hubs ("convert FROM this type to anything") and the friendly-name aliases.

A hub is the same converter with nothing preselected, for someone who knows what they have but not yet what
they want. Only formats the engines really read get one.
"""
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

IMG = {"jpg": "JPG", "png": "PNG", "webp": "WebP", "gif": "GIF", "bmp": "BMP", "tiff": "TIFF",
       "avif": "AVIF", "heic": "HEIC", "heif": "HEIF", "jfif": "JFIF", "ico": "ICO"}
AUD = {"mp3": "MP3", "wav": "WAV", "aac": "AAC", "flac": "FLAC", "ogg": "OGG", "opus": "Opus",
       "m4a": "M4A", "m4r": "M4R", "wma": "WMA", "aiff": "AIFF", "amr": "AMR"}
VID = {"mp4": "MP4", "mov": "MOV", "mkv": "MKV", "avi": "AVI", "webm": "WebM", "wmv": "WMV", "flv": "FLV",
       "m4v": "M4V", "mpg": "MPG", "mpeg": "MPEG", "ts": "TS", "mts": "MTS", "vob": "VOB", "3gp": "3GP"}

OUT = {
    "convert-image": ("JPG, PNG, WebP, AVIF, GIF, BMP, TIFF or ICO", "picture"),
    "audio-converter": ("MP3, M4A, WAV, FLAC or OGG", "audio file"),
    "video-converter": ("MP4, WebM, MKV, MOV or AVI, or straight to MP3, M4A, WAV, FLAC or OGG", "video"),
}

# friendly names that should land on a page that already exists, as a redirect rather than a second page
ALIASES = {
    "image-to-pdf": ["picture-to-pdf", "photo-to-pdf"],
    "convert-image": ["image-converter"],
    "compress-image": ["image-compressor"],
    "video-to-audio": ["video-to-mp3"],
    "html-to-pdf": ["webpage-to-pdf"],
}


def hub(ext, label, base):
    outs, noun = OUT[base]
    return {
        "slug": f"{ext}-converter", "base": base,
        "name": f"{label} Converter",
        "title": f"{label} Converter Free: Convert {label} Online, No Sign-Up",
        "desc": f"Convert {label} files to {outs}. Many files at once, nothing uploaded.",
        "metaDesc": f"Free {label} converter. Change {label} files into {outs} online. Batch supported and nothing is uploaded, because it runs in your browser.",
        "about": (f"Convert {label} files into whatever you need: {outs}. Add as many as you like and convert them in one go. "
                  f"If you already know the format you want, the pages for each one are linked above and arrive with it chosen. "
                  f"Everything happens inside your browser, so your {noun}s never leave your device and there is no account, "
                  f"no watermark and no daily limit."),
        "steps": [f"Add your {label} files.", "Choose the format you want.", "Convert and download."],
        "faq": [
            {"q": f"What can I convert {label} to?", "a": f"{outs}. Pick it from the list after you add your files."},
            {"q": "Can I convert several files at once?", "a": "Yes. Add as many as you like and they are all converted in one go."},
            {"q": f"Are my {label} files uploaded?", "a": "No. The conversion runs inside your browser, so your files stay on your device."},
        ],
    }


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    by = {t["slug"]: t for t in data["tools"]}
    allow = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken = set(allow) | {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new, added_alias = [], 0

    for table, base in ((IMG, "convert-image"), (AUD, "audio-converter"), (VID, "video-converter")):
        for ext, label in table.items():
            slug = f"{ext}-converter"
            if slug in taken:
                continue
            b = by[base]
            new.append({**hub(ext, label, base), "cat": b["cat"], "kind": b.get("kind", "client")})
            taken.add(slug)

    for target, names in ALIASES.items():
        t = next((x for x in data["tools"] + data["variants"] if x["slug"] == target), None)
        if not t:
            continue
        for n in names:
            if n in taken:
                continue
            t.setdefault("aliases", []).append(n)
            taken.add(n)
            added_alias += 1

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"format hubs added: {len(new)} | friendly-name redirects added: {added_alias}")
    for v in new[:4]:
        print("  e.g.", v["slug"], "->", v["base"])


if __name__ == "__main__":
    main()
