"""Video / audio tools (ffmpeg)."""
import re
import shutil
import subprocess
import threading
from pathlib import Path

import imageio_ffmpeg

from toolkit import VIDEO_EXT, Ctx, ToolError, out_name, tool

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma"}


def _mb(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f} MB"


def parse_time(v, default=None) -> float | None:
    """'90', '1:30', '01:02:03.5' -> seconds."""
    if v is None or str(v).strip() == "":
        return default
    parts = str(v).strip().split(":")
    try:
        secs = 0.0
        for p in parts:
            secs = secs * 60 + float(p)
        return secs
    except ValueError:
        raise ToolError(f"Can't read time '{v}'. Use seconds or mm:ss.")


def probe_duration(path: Path) -> float | None:
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def run_ffmpeg(ctx: Ctx, args: list[str], duration: float | None = None, base: float = 0.0, span: float = 1.0):
    """Run ffmpeg, mapping its progress onto ctx.progress(base .. base+span)."""
    cmd = [FFMPEG, "-y", "-hide_banner", "-nostdin", "-loglevel", "error", "-progress", "pipe:1"] + args
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    err: list[str] = []
    threading.Thread(target=lambda: err.extend(proc.stderr), daemon=True).start()
    for line in proc.stdout:
        if duration and line.startswith("out_time_us="):
            try:
                ctx.progress(base + span * min(1.0, int(line.split("=")[1]) / 1e6 / duration))
            except ValueError:
                pass
    proc.wait()
    if proc.returncode != 0:
        msg = "".join(err).strip().splitlines()
        raise ToolError("ffmpeg could not process this file: " + (msg[-1] if msg else "unknown error"))


def scale_filter(res: str) -> str | None:
    """Downscale to at most `res` px tall (never upscale); width stays even."""
    if res and res != "keep" and res.isdigit():
        return f"scale=-2:min({int(res)}\\,ih)"
    return None


# ---------------------------------------------------------------- converter
VIDEO_TARGETS = {"mp4", "webm", "mkv", "mov", "avi"}
AUDIO_TARGETS = {"mp3": ["-c:a", "libmp3lame", "-q:a", "2"], "m4a": ["-c:a", "aac", "-b:a", "192k"],
                 "wav": ["-c:a", "pcm_s16le"], "ogg": ["-c:a", "libopus", "-b:a", "160k"],
                 "flac": ["-c:a", "flac"]}
CRF = {"high": 20, "medium": 24, "low": 28}
VP9_CRF = {"high": 30, "medium": 34, "low": 40}


@tool("video-converter", accepts=VIDEO_EXT | AUDIO_EXT, max_mb=2048, max_files=10)
def video_converter(ctx: Ctx):
    fmt = ctx.opt("format", "mp4")
    quality = ctx.opt("quality", "medium")
    res = ctx.opt("resolution", "keep")
    if quality not in CRF:
        raise ToolError("Unknown quality.")
    outs, rows = [], []
    for i, src in enumerate(ctx.inputs):
        dur = probe_duration(src)
        dest = ctx.out_dir / out_name(src, "ogg" if fmt == "ogg" else fmt)
        base, span = i / len(ctx.inputs), 1 / len(ctx.inputs)
        if fmt in AUDIO_TARGETS:
            args = ["-i", str(src), "-vn"] + AUDIO_TARGETS[fmt] + [str(dest)]
        elif fmt in VIDEO_TARGETS:
            vf = scale_filter(res)
            args = ["-i", str(src)]
            if vf:
                args += ["-vf", vf]
            if fmt == "webm":
                args += ["-c:v", "libvpx-vp9", "-crf", str(VP9_CRF[quality]), "-b:v", "0", "-row-mt", "1",
                         "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "128k"]
            else:
                args += ["-c:v", "libx264", "-preset", "medium", "-crf", str(CRF[quality]), "-pix_fmt", "yuv420p"]
                args += ["-c:a", "libmp3lame", "-b:a", "192k"] if fmt == "avi" else ["-c:a", "aac", "-b:a", "160k"]
                if fmt in ("mp4", "mov"):
                    args += ["-movflags", "+faststart"]
            args.append(str(dest))
        else:
            raise ToolError("Unsupported output format.")
        run_ffmpeg(ctx, args, dur, base, span)
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "before": src.stat().st_size, "after": dest.stat().st_size})
    ctx.info = {"summary": f"Converted {len(outs)} file(s) to {fmt.upper()}", "files": rows}
    return outs


# ---------------------------------------------------------------- video -> gif
@tool("video-to-gif", accepts=VIDEO_EXT, max_mb=1024, max_files=1)
def video_to_gif(ctx: Ctx):
    src = ctx.inputs[0]
    start = parse_time(ctx.opt("start"), 0.0)
    length = min(60.0, parse_time(ctx.opt("duration"), 8.0))
    fps = max(1, min(30, ctx.opt("fps", 12, int)))
    width = max(64, min(1280, ctx.opt("width", 480, int)))
    loop = "0" if ctx.opt("loop", True, lambda v: v in (True, "true", "1", 1)) else "-1"
    dest = ctx.out_dir / out_name(src, "gif")
    vf = (f"fps={fps},scale='min({width},iw)':-1:flags=lanczos,split[s0][s1];"
          "[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5")
    run_ffmpeg(ctx, ["-ss", str(start), "-t", str(length), "-i", str(src), "-vf", vf, "-loop", loop, str(dest)], length)
    ctx.info = {"summary": f"GIF created ({_mb(dest.stat().st_size)}). Lower the width or FPS for a smaller file."}
    return [dest]


# ---------------------------------------------------------------- gif -> video
@tool("gif-to-video", accepts={".gif"}, max_mb=200, max_files=10)
def gif_to_video(ctx: Ctx):
    fmt = ctx.opt("format", "mp4")
    loops = max(1, min(20, ctx.opt("loops", 1, int)))
    outs = []
    for i, src in enumerate(ctx.inputs):
        dest = ctx.out_dir / out_name(src, fmt)
        args = ["-stream_loop", str(loops - 1), "-i", str(src), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-an"]
        if fmt == "webm":
            args += ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-pix_fmt", "yuv420p"]
        elif fmt == "mp4":
            args += ["-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        else:
            raise ToolError("Choose MP4 or WebM.")
        run_ffmpeg(ctx, args + [str(dest)], probe_duration(src) and probe_duration(src) * loops, i / len(ctx.inputs), 1 / len(ctx.inputs))
        outs.append(dest)
    ctx.info = {"summary": f"Converted {len(outs)} GIF(s) to {fmt.upper()}"}
    return outs


# ---------------------------------------------------------------- trimmer
@tool("video-trimmer", accepts=VIDEO_EXT | AUDIO_EXT, max_mb=2048)
def video_trimmer(ctx: Ctx):
    src = ctx.inputs[0]
    dur = probe_duration(src)
    start = parse_time(ctx.opt("start"), 0.0)
    end = parse_time(ctx.opt("end"), dur)
    if dur and (end is None or end > dur):
        end = dur
    if end is None or end <= start:
        raise ToolError("The end time must be after the start time.")
    length = end - start
    dest = ctx.out_dir / out_name(src, src.suffix, "_trimmed")
    if ctx.opt("mode", "accurate") == "fast":
        # stream copy: instant and lossless, but cuts land on the nearest keyframe
        args = ["-ss", str(start), "-i", str(src), "-t", str(length), "-c", "copy", "-avoid_negative_ts", "make_zero", str(dest)]
    else:
        args = ["-ss", str(start), "-i", str(src), "-t", str(length)]
        if src.suffix.lower() in AUDIO_EXT:
            args += [str(dest)]
        else:
            args += ["-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]
            if dest.suffix.lower() in (".mp4", ".mov", ".m4v"):
                args += ["-movflags", "+faststart"]
            args.append(str(dest))
    run_ffmpeg(ctx, args, length)
    ctx.info = {"summary": f"Trimmed {start:.1f}s → {end:.1f}s ({length:.1f}s, {_mb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- compressor
@tool("compress-video", accepts=VIDEO_EXT, max_mb=2048, max_files=5)
def video_compressor(ctx: Ctx):
    mode = ctx.opt("mode", "level")
    level = ctx.opt("level", "medium")
    res = ctx.opt("resolution", "keep")
    target_mb = ctx.opt("target_mb", 0, float)
    crf = {"light": 23, "medium": 27, "strong": 32}.get(level)
    if crf is None:
        raise ToolError("Unknown compression level.")
    outs, rows, kept = [], [], 0
    for i, src in enumerate(ctx.inputs):
        dur = probe_duration(src)
        dest = ctx.out_dir / out_name(src, "mp4", "_compressed")
        args = ["-i", str(src)]
        vf = scale_filter(res)
        if vf:
            args += ["-vf", vf]
        if mode == "size":
            if not dur or target_mb <= 0:
                raise ToolError("Enter a target size in MB.")
            total_kbit = target_mb * 8192 * 0.97
            vbit = int(total_kbit / dur - 96)
            if vbit < 50:
                raise ToolError("That target is too small for this video's length. Try a larger size.")
            args += ["-c:v", "libx264", "-preset", "medium", "-b:v", f"{vbit}k", "-maxrate", f"{int(vbit * 1.4)}k",
                     "-bufsize", f"{vbit * 2}k"]
            audio = "96k"
        else:
            args += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf)]
            audio = "128k"
        args += ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", audio, "-movflags", "+faststart", str(dest)]
        run_ffmpeg(ctx, args, dur, i / len(ctx.inputs), 1 / len(ctx.inputs))
        before, after = src.stat().st_size, dest.stat().st_size
        if after >= before:  # re-encoding made it bigger: hand back the original instead
            dest.unlink()
            dest = ctx.out_dir / out_name(src, src.suffix, "_original")
            shutil.copyfile(src, dest)
            after, kept = before, kept + 1
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "before": before, "after": after})
    tb, ta = sum(r["before"] for r in rows), sum(r["after"] for r in rows)
    pct = round((1 - ta / tb) * 100) if tb else 0
    note = f"  ({pct}% smaller)" if pct > 0 else ""
    if kept:
        note += f"  ({kept} file(s) were already small enough, so the original was kept. Try 'Strong' or a lower resolution.)"
    ctx.info = {"summary": f"{_mb(tb)} → {_mb(ta)}" + note, "files": rows}
    return outs
