"""Rate limiting, request-size guard and security headers."""
import ipaddress
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

import config
import core

MAX_ACTIVE_PER_IP = int(os.environ.get("MAX_ACTIVE_PER_IP", "3"))

# (max requests, per seconds) for each visitor IP. Override: RATE_LIMITS="tool_heavy=5/3600,cdn_upload=10/60"
LIMITS = {
    "tool_light": (120, 3600),  # image / pdf / small jobs
    "tool_heavy": (30, 3600),   # video, AI, document conversion
    "cdn_upload": (40, 3600),
    "admin": (10, 3600),
}
for part in filter(None, os.environ.get("RATE_LIMITS", "").split(",")):
    try:
        name, spec = part.split("=")
        n, per = spec.split("/")
        LIMITS[name.strip()] = (int(n), int(per))
    except ValueError:
        pass

HEAVY_TOOLS = {"video-converter", "video-to-gif", "gif-to-video", "video-trimmer", "compress-video",
               "remove-background", "replace-background", "upscale-image", "anime-style", "face-blur",
               "pdf-to-word", "word-to-pdf", "compress-pdf", "image-to-svg",
               "passport-size-photo-maker", "video-merger", "change-video-speed", "audio-cutter"}


def client_ip(request: Request) -> str:
    if config.TRUSTED_PROXY:
        h = request.headers
        ip = h.get("cf-connecting-ip") or h.get("x-real-ip") or (h.get("x-forwarded-for", "").split(",")[0].strip())
        if ip:
            return ip
    return request.client.host if request.client else "unknown"


def is_local(request: Request) -> bool:
    """Direct loopback visitor (you, developing) - never rate limited. Not applied behind a proxy."""
    if config.TRUSTED_PROXY or not request.client:
        return False
    try:
        return ipaddress.ip_address(request.client.host).is_loopback
    except ValueError:
        return False


class RateLimiter:
    def __init__(self):
        self.hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self.lock = threading.Lock()
        self.last_gc = time.time()

    def hit(self, ip: str, bucket: str) -> int:
        """Record a request. Returns 0 if allowed, else seconds until the visitor may retry."""
        limit, per = LIMITS[bucket]
        now = time.time()
        with self.lock:
            q = self.hits[(ip, bucket)]
            while q and q[0] <= now - per:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(q[0] + per - now))
            q.append(now)
            if now - self.last_gc > 600:  # drop idle keys so memory stays flat
                self.last_gc = now
                for k in [k for k, v in self.hits.items() if not v or v[-1] <= now - LIMITS[k[1]][1]]:
                    self.hits.pop(k, None)
        return 0


limiter = RateLimiter()


def bucket_for(request: Request) -> str | None:
    p, m = request.url.path, request.method
    if m == "POST" and p.startswith("/api/tools/"):
        return "tool_heavy" if p.rsplit("/", 1)[-1] in HEAVY_TOOLS else "tool_light"
    if m == "POST" and p == "/api/cdn":
        return "cdn_upload"
    if m == "POST" and p == "/api/site-board/start":  # each board crawls hundreds of pages
        return "tool_heavy"
    if m == "DELETE" and p.startswith("/api/cdn/"):
        return "admin"
    return None


async def guard(request: Request, call_next):
    """Middleware: size cap, per-IP rate limits, security headers."""
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > config.MAX_UPLOAD_MB * 1024 * 1024:
        return JSONResponse({"detail": f"That upload is larger than {config.MAX_UPLOAD_MB} MB."}, status_code=413)
    bucket = bucket_for(request)
    if bucket and config.RATE_LIMIT and not is_local(request):
        wait = limiter.hit(client_ip(request), bucket)
        if wait:
            mins = max(1, round(wait / 60))
            return JSONResponse({"detail": f"You are going a bit fast. Please try again in about {mins} minute(s)."},
                                status_code=429, headers={"Retry-After": str(wait)})
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


def assert_capacity(request: Request):
    """Stop one visitor from monopolising the workers with many simultaneous jobs."""
    if not config.RATE_LIMIT or is_local(request):
        return
    ip = client_ip(request)
    busy = sum(1 for j in core.jobs.values() if j.get("ip") == ip and j.get("status") in ("downloading", "processing"))
    if busy >= MAX_ACTIVE_PER_IP:
        raise HTTPException(429, "You already have several jobs running. Wait for one to finish, then try again.")
