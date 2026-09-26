"""Rate limiting, request-size guard, downloader login gate and security headers."""
import hashlib
import hmac
import ipaddress
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

import config
import core

COOKIE = "tz_dl"
COOKIE_DAYS = 30
MAX_ACTIVE_PER_IP = int(os.environ.get("MAX_ACTIVE_PER_IP", "3"))

# (max requests, per seconds) for each visitor IP. Override: RATE_LIMITS="tool_heavy=5/3600,cdn_upload=10/60"
LIMITS = {
    "tool_light": (120, 3600),  # image / pdf / small jobs
    "tool_heavy": (30, 3600),   # video, AI, document conversion
    "cdn_upload": (40, 3600),
    "dl_info": (60, 3600),
    "dl_job": (20, 3600),
    "auth": (10, 3600),
    "admin": (10, 3600),
}
for part in filter(None, os.environ.get("RATE_LIMITS", "").split(",")):
    try:
        name, spec = part.split("=")
        n, per = spec.split("/")
        LIMITS[name.strip()] = (int(n), int(per))
    except ValueError:
        pass

HEAVY_TOOLS = {"video-converter", "video-to-gif", "gif-to-video", "video-trimmer", "video-compressor",
               "remove-background", "replace-background", "upscale-image", "anime-style", "face-blur",
               "pdf-to-docx", "docx-to-pdf", "pdf-compress", "image-to-svg"}


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
    if m == "GET" and p == "/api/info":
        return "dl_info"
    if m == "POST" and p == "/api/jobs":
        return "dl_job"
    if m == "POST" and p == "/api/auth":
        return "auth"
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


# ------------------------------------------------------------------ downloader login gate
def _sign(exp: int) -> str:
    return hmac.new(config.SECRET_KEY.encode(), f"dl:{exp}".encode(), hashlib.sha256).hexdigest()


def make_token() -> str:
    exp = int(time.time()) + COOKIE_DAYS * 86400
    return f"{exp}.{_sign(exp)}"


def valid_token(token: str | None) -> bool:
    try:
        exp_s, sig = (token or "").split(".", 1)
        return int(exp_s) > time.time() and hmac.compare_digest(sig, _sign(int(exp_s)))
    except ValueError:
        return False


def downloader_state(request: Request) -> str:
    """'off' | 'open' | 'login' (needs password) | 'ok' (logged in)"""
    if config.DOWNLOADER_MODE != "password":
        return config.DOWNLOADER_MODE
    return "ok" if valid_token(request.cookies.get(COOKIE)) else "login"


def require_downloader(request: Request):
    state = downloader_state(request)
    if state == "off":
        raise HTTPException(404, "The downloader is not available on this site.")
    if state == "login":
        raise HTTPException(401, "Please log in to use the downloader.")


def check_password(password: str) -> bool:
    return bool(config.DOWNLOADER_PASSWORD) and hmac.compare_digest(
        hashlib.sha256(password.encode()).digest(), hashlib.sha256(config.DOWNLOADER_PASSWORD.encode()).digest())


def is_https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
