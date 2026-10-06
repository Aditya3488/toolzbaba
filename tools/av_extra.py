"""More audio/video tools (ffmpeg): audio cutter, video merger, video speed changer."""
import re
import subprocess
from pathlib import Path

from toolkit import VIDEO_EXT, Ctx, ToolError, out_name, tool
from tools.video_tools import AUDIO_EXT, AUDIO_TARGETS, FFMPEG, _mb, parse_time, run_ffmpeg

VIDEO_ONLY = VIDEO_EXT - {".gif"}


def probe_media(path: Path) -> dict:
    """Duration, size and whether it has audio/video, read from `ffmpeg -i`."""
    err = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True, errors="replace").stderr
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else None
    size = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})[\s,\[]", err)
    return {"duration": dur, "has_audio": " Audio:" in err, "has_video": " Video:" in err and "attached pic" not in err,
            "w": int(size[1]) if size else None, "h": int(size[2]) if size else None}


# ---------------------------------------------------------------- audio cutter
@tool("audio-cutter", accepts=AUDIO_EXT | VIDEO_ONLY, max_mb=1024)
def audio_cutter(ctx: Ctx):
    src = ctx.inputs[0]
    info = probe_media(src)
    start = parse_time(ctx.opt("start"), 0.0)
    end = parse_time(ctx.opt("end"), info["duration"])
    if info["duration"] and (end is None or end > info["duration"]):
        end = info["duration"]
    if end is None or end <= start:
        raise ToolError("The end time must be after the start time.")
    length = end - start
    fmt = ctx.opt("format", "mp3")
    if fmt not in AUDIO_TARGETS:
        raise ToolError("Unsupported audio format.")
    fade_in = max(0.0, min(ctx.opt("fade_in", 0, float), length))
    fade_out = max(0.0, min(ctx.opt("fade_out", 0, float), length))
    filters = []
    if fade_in:
        filters.append(f"afade=t=in:st=0:d={fade_in}")
    if fade_out:
        filters.append(f"afade=t=out:st={max(0.0, length - fade_out)}:d={fade_out}")
    dest = ctx.out_dir / out_name(src, fmt, "_cut")
    args = ["-ss", str(start), "-t", str(length), "-i", str(src), "-vn"]
    if filters:
        args += ["-af", ",".join(filters)]
    run_ffmpeg(ctx, args + AUDIO_TARGETS[fmt] + [str(dest)], length)
    ctx.info = {"summary": f"Cut {start:.1f}s → {end:.1f}s ({length:.1f}s, {_mb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- video merger
def _even(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


@tool("video-merger", accepts=VIDEO_ONLY, max_mb=2048, max_files=20, min_files=2)
def video_merger(ctx: Ctx):
    crf = {"high": 20, "medium": 23, "low": 27}.get(ctx.opt("quality", "medium"))
    if crf is None:
        raise ToolError("Unknown quality.")
    infos = [probe_media(p) for p in ctx.inputs]
    for p, inf in zip(ctx.inputs, infos):
        if not inf["has_video"]:
            raise ToolError(f"'{ctx.display_name(p)}' has no video.")
    first = infos[0]
    res = ctx.opt("resolution", "first")
    if res == "first":
        W, H = _even(first["w"] or 1280), _even(first["h"] or 720)
    else:
        H = _even(int(res))
        W = _even(H * (first["w"] or 16) / (first["h"] or 9))
    total = sum(i["duration"] or 0 for i in infos) or 1
    segs, done = [], 0.0
    for idx, (src, inf) in enumerate(zip(ctx.inputs, infos)):
        seg = ctx.out_dir / f"_seg{idx:02d}.mp4"
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
              "setsar=1,fps=30,format=yuv420p")
        args = ["-i", str(src)]
        if inf["has_audio"]:
            amap, extra = "0:a:0", []
        else:  # silent clips get silent audio so every segment has the same streams
            args += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
            amap, extra = "1:a:0", ["-shortest"]
        args += ["-map", "0:v:0", "-map", amap, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf),
                 "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"] + extra + [str(seg)]
        span = (inf["duration"] or 0) / total
        run_ffmpeg(ctx, args, inf["duration"], done * 0.95, span * 0.95)
        done += span
        segs.append(seg)
    listing = ctx.out_dir / "_list.txt"
    listing.write_text("".join(f"file '{s.name}'\n" for s in segs), "utf-8")
    dest = ctx.out_dir / "merged.mp4"
    run_ffmpeg(ctx, ["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(dest)])
    for s in segs:
        s.unlink(missing_ok=True)
    listing.unlink(missing_ok=True)
    ctx.info = {"summary": f"Joined {len(segs)} videos into one {W}×{H} MP4 ({_mb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- video speed
def _atempo(speed: float) -> str:
    parts = []
    while speed > 2.0:
        parts.append(2.0)
        speed /= 2.0
    while speed < 0.5:
        parts.append(0.5)
        speed /= 0.5
    parts.append(speed)
    return ",".join(f"atempo={p:.4f}" for p in parts)


@tool("change-video-speed", accepts=VIDEO_ONLY, max_mb=2048, max_files=3)
def video_speed(ctx: Ctx):
    speed = ctx.opt("speed", 2.0, float)
    if not 0.25 <= speed <= 8:
        raise ToolError("Choose a speed between 0.25x and 8x.")
    keep_audio = ctx.opt("audio", "keep") == "keep"
    outs = []
    for i, src in enumerate(ctx.inputs):
        inf = probe_media(src)
        dest = ctx.out_dir / out_name(src, "mp4", f"_{speed:g}x")
        args = ["-i", str(src), "-vf", f"setpts=PTS/{speed}"]
        if inf["has_audio"] and keep_audio:
            args += ["-af", _atempo(speed), "-c:a", "aac", "-b:a", "160k"]
        else:
            args += ["-an"]
        args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dest)]
        dur = inf["duration"]
        run_ffmpeg(ctx, args, dur / speed if dur else None, i / len(ctx.inputs), 1 / len(ctx.inputs))
        outs.append(dest)
    ctx.info = {"summary": f"{speed:g}x speed applied to {len(outs)} video(s)"}
    return outs
