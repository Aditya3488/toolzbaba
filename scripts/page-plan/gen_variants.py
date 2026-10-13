"""Add the format pages that the engines already on the site can really do.

Only pairs the live tools actually support are written: the image converter's own output list, the audio and
video converters' own lists. Nothing is invented, so no page promises a conversion that would fail.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

IMG_IN = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "avif", "heic", "heif", "jfif", "ico"]
IMG_OUT = ["png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "tiff", "ico"]
AUD_IN = ["mp3", "wav", "aac", "flac", "ogg", "opus", "m4a", "m4r", "wma", "aiff", "amr"]
AUD_OUT = ["mp3", "m4a", "wav", "flac", "ogg"]
VID_IN = ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv", "m4v", "mpg", "mpeg", "ts", "mts", "vob", "3gp"]
VID_OUT = ["mp4", "webm", "mkv", "mov", "avi"]

# What each format is, in one clause, so every page says something true about the two formats it names.
F = {
    "jpg": ("JPG", "the usual photo format, small but lossy"),
    "jpeg": ("JPEG", "the same format as JPG, under its longer name"),
    "png": ("PNG", "lossless and able to be transparent, so it suits graphics and screenshots"),
    "webp": ("WebP", "a modern format that is usually much smaller than JPG or PNG at the same quality"),
    "avif": ("AVIF", "the smallest of the modern formats, though slower to make"),
    "gif": ("GIF", "limited to 256 colours but able to animate"),
    "bmp": ("BMP", "uncompressed and very large, used by older Windows software"),
    "tiff": ("TIFF", "a high quality format used in printing and scanning"),
    "ico": ("ICO", "the Windows icon format, used for favicons"),
    "heic": ("HEIC", "what an iPhone saves photos as, which many programs cannot open"),
    "heif": ("HEIF", "the format behind HEIC, which many programs cannot open"),
    "jfif": ("JFIF", "a JPG saved with a different extension, which some programs refuse to open"),
    "mp3": ("MP3", "the audio format that plays on everything"),
    "m4a": ("M4A", "AAC audio, small and native to Apple devices"),
    "wav": ("WAV", "uncompressed audio, perfect quality and very large"),
    "flac": ("FLAC", "lossless audio that is still smaller than WAV"),
    "ogg": ("OGG", "an open format using Opus, small at low bitrates"),
    "aac": ("AAC", "the audio inside most video files"),
    "opus": ("Opus", "an open codec built for speech and streaming"),
    "m4r": ("M4R", "the iPhone ringtone format"),
    "wma": ("WMA", "an older Windows audio format"),
    "aiff": ("AIFF", "uncompressed Apple audio, like WAV"),
    "amr": ("AMR", "low bitrate voice recordings from older phones"),
    "mp4": ("MP4", "the video format that plays everywhere"),
    "mov": ("MOV", "Apple's video format, from iPhones and QuickTime"),
    "mkv": ("MKV", "a container that holds almost any video, audio and subtitle track"),
    "avi": ("AVI", "an older Windows video format"),
    "webm": ("WebM", "an open video format made for the web"),
    "wmv": ("WMV", "an older Windows Media video format"),
    "flv": ("FLV", "the old Flash video format"),
    "m4v": ("M4V", "Apple's variant of MP4"),
    "mpg": ("MPG", "an older MPEG video format"),
    "mpeg": ("MPEG", "an older MPEG video format"),
    "ts": ("TS", "the transport stream format used by broadcast and cameras"),
    "mts": ("MTS", "AVCHD video straight from a camcorder"),
    "vob": ("VOB", "the video format found on DVDs"),
    "3gp": ("3GP", "a small video format from older mobile phones"),
}
PRESET = {"jpeg": "jpg"}        # the image converter's option value for JPEG is "jpg"
BIG = {"bmp", "tiff", "wav", "aiff"}


def label(e):
    return F[e][0]


def entry(src, dst, base, cat, kind, media=None):
    s, d = label(src), label(dst)
    slug = f"{src}-to-{dst}"
    fmt = PRESET.get(dst, dst)
    why_src, why_dst = F[src][1], F[dst][1]
    name = f"{s} to {d}"
    smaller = dst in ("webp", "avif", "mp3", "m4a", "ogg") and src in BIG | {"png", "jpg", "jpeg", "tiff", "bmp"}
    gain = ("The result is usually a good deal smaller." if smaller
            else "Nothing is uploaded: the conversion happens on your own device.")
    about = (f"Turn {s} files into {d}. {s} is {why_src}, and {d} is {why_dst}. "
             f"Add as many files as you like and convert them in one go. {gain} "
             f"Your files never leave your browser, so there is nothing to upload and nothing to wait for.")
    return {
        "slug": slug, "base": base, "cat": cat, "kind": kind,
        "name": name,
        "title": f"{s} to {d} Converter Free: Convert {s} to {d} Online",
        "desc": f"Convert {s} files to {d} in your browser. Batch supported, no sign-up, nothing uploaded.",
        "about": about,
        "metaDesc": f"Free {s} to {d} converter. Change {s} files to {d} online, many at once. Runs in your browser, so your files stay on your device.",
        "preset": {"format": fmt},
        "steps": [f"Add your {s} files.", f"Choose any settings you want; {d} is already selected.", f"Convert and download the {d} files."],
        "faq": [
            {"q": f"How do I convert {s} to {d}?", "a": f"Add your {s} files above and press convert. {d} is already chosen, so there is nothing else to set. You can add many files at once."},
            {"q": "Are my files uploaded?", "a": "No. The conversion runs inside your browser, so your files stay on your device and nothing is sent to a server."},
            {"q": "Is there a limit?", "a": "There is no account and no daily limit. Very large files are limited only by your device's memory."},
        ],
    }


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    by = {t["slug"]: t for t in data["tools"]}
    have = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    aliases = {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(src, dst, base):
        slug = f"{src}-to-{dst}"
        if slug in have or slug in aliases or src == dst:
            return
        b = by[base]
        new.append(entry(src, dst, base, b["cat"], b.get("kind", "client")))
        have.add(slug)

    for s in IMG_IN:
        for d in IMG_OUT:
            if {s, d} != {"jpg", "jpeg"}:
                add(s, d, "convert-image")
    for s in AUD_IN:
        for d in AUD_OUT:
            add(s, d, "audio-converter")
    for s in VID_IN:
        for d in VID_OUT:
            add(s, d, "video-converter")
        for d in AUD_OUT:
            add(s, d, "video-converter")

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"added {len(new)} format pages; variants now {len(data['variants'])}")
    for v in new[:3]:
        print("  e.g.", v["slug"], "|", v["title"])


if __name__ == "__main__":
    main()
