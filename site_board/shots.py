"""Optional screenshots with a locally installed Chrome / Edge (headless, throwaway profile). Skipped if none is found."""
from __future__ import annotations

import base64
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urljoin

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_browser() -> str | None:
    env = os.environ.get("SITE_BOARD_CHROME")
    if env and Path(env).exists():
        return env
    for c in CANDIDATES:
        if Path(c).exists():
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    return None


def _capture(browser: str, url: str, out: Path, w: int, h: int, profile: str) -> bool:
    cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--mute-audio",
           f"--user-data-dir={profile}", f"--window-size={w},{h}", "--force-device-scale-factor=1", "--virtual-time-budget=9000",
           f"--screenshot={out}", url]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return False
    return out.exists() and out.stat().st_size > 2000


def _encode(path: Path, trim: bool = False) -> tuple[str, int]:
    """data: URI (WebP when Pillow is installed) and the image height after trimming blank space at the bottom."""
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode(), 0
    im = Image.open(path).convert("RGB")
    if trim:
        bg = Image.new("RGB", im.size, im.getpixel((im.width // 2, im.height - 1)))
        box = ImageChops.difference(im, bg).getbbox()
        if box and box[3] < im.height - 40:
            im = im.crop((0, 0, im.width, min(im.height, box[3] + 40)))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=74, method=4)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(), im.height


def attach(report: dict, progress=None, gallery_max: int = 10) -> None:
    browser = find_browser()
    if not browser:
        report["shotError"] = "No Chrome or Edge found, so the board has no screenshots."
        return
    shots, gallery = {}, []
    with tempfile.TemporaryDirectory(prefix="siteboard-", ignore_cleanup_errors=True) as tmp:
        tmpd, profile = Path(tmp), str(Path(tmp) / "profile")
        home_png = tmpd / "home.png"
        if _capture(browser, report["final"], home_png, 1440, 9000, profile):
            shots["home"], report["homeH"] = _encode(home_png, trim=True)
        # gallery: the first pages of each menu section that answered 200
        picks, seen = [], {"/"}
        for item in report.get("menu", []):
            cands = [item.get("href")] + [g.get("href") for g in item["groups"]] + [l[1] for g in item["groups"] for l in g["links"][:1]]
            for c in cands:
                if c and c not in seen and report["pages"].get(c, {}).get("s") == 200:
                    picks.append((c, item["label"] if c == item.get("href") else (report["labels"].get(c) or c)))
                    seen.add(c)
                    break
        for c in ["/cart", "/contact", "/contact-us", "/about", "/about-us"]:
            if c not in seen and report["pages"].get(c, {}).get("s") == 200:
                picks.append((c, report["labels"].get(c) or c.strip("/").replace("-", " ").title()))
                seen.add(c)
        for i, (path, label) in enumerate(picks[:gallery_max]):
            if progress:
                progress(f"Screenshot {i + 1} of {min(len(picks), gallery_max)}: {label}")
            png = tmpd / f"g{i}.png"
            if _capture(browser, urljoin(report["base"], path), png, 1440, 2000, profile):
                key = f"g{i}"
                shots[key], _ = _encode(png)
                gallery.append([key, path.lstrip("/"), label])
    report["shots"], report["gallery"] = shots, gallery
