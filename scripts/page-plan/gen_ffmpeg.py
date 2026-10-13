"""Format pages for the video and audio outputs that were encoded and re-probed in the browser build of ffmpeg.

AMR is left out: the build has the AMR container but no AMR encoder.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_variants import entry  # noqa: E402  (the same copy as the first batch)

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

VID_IN = ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv", "m4v", "mpg", "mpeg", "ts", "mts", "vob", "3gp", "gif"]
AUD_IN = ["mp3", "wav", "aac", "flac", "ogg", "opus", "m4a", "m4r", "wma", "aiff", "amr"]
NEW_VIDEO_OUT = ["wmv", "flv", "ts", "mts", "3gp", "m4v", "mpg", "mpeg", "vob"]
NEW_AUDIO_OUT = ["aac", "aiff", "wma", "m4r", "opus"]
OLD_VIDEO_OUT = ["mp4", "webm", "mkv", "mov", "avi"]   # already offered; pages for the new inputs were missing


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    by = {t["slug"]: t for t in data["tools"]}
    taken = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(src, dst, base):
        slug = f"{src}-to-{dst}"
        if src == dst or slug in taken:
            return
        b = by[base]
        new.append(entry(src, dst, base, b["cat"], b.get("kind", "client")))
        taken.add(slug)

    for s in VID_IN:
        for d in NEW_VIDEO_OUT + OLD_VIDEO_OUT:
            add(s, d, "video-converter")
        for d in NEW_AUDIO_OUT:
            if s != "gif":                      # a GIF has no sound to take out
                add(s, d, "video-converter")
    for s in AUD_IN:
        for d in NEW_AUDIO_OUT:
            add(s, d, "audio-converter")

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"added {len(new)} pages; variants now {len(data['variants'])}")
    by_out = {}
    for v in new:
        by_out.setdefault(v["slug"].split("-to-")[1], 0)
        by_out[v["slug"].split("-to-")[1]] += 1
    print("  by output:", dict(sorted(by_out.items())))


if __name__ == "__main__":
    main()
