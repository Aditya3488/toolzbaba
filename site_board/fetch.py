"""Polite, SSRF-safe page fetching for the site board (standard library only).

Same rules as functions/api/site-colors.js: public http(s) addresses only, every redirect hop re-checked,
timeouts and size caps. On top of that the host name is resolved and private / loopback / link-local
addresses are refused, and "429 Too Many Requests" pauses every worker for the time the site asks.
"""
from __future__ import annotations

import functools
import ipaddress
import re
import socket
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit, urlunsplit

UA = "Mozilla/5.0 (compatible; ToolzBabaSiteBoard/1.0; +https://toolzbaba.com)"
BLOCKED_SUFFIXES = ("localhost", "local", "internal", "lan", "home", "corp", "test", "invalid", "intranet")
MAX_HOPS = 5


class FetchError(Exception):
    """A friendly message the user can see."""


@functools.lru_cache(maxsize=256)
def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise FetchError(f"Could not find the site {host}. Check the address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    return True


def check_url(url: str, allow_private: bool = False) -> str:
    """Return a normalised public URL or raise FetchError."""
    url = (url or "").strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https"):
        raise FetchError("Only http and https addresses can be read.")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise FetchError("Enter a full web address, like https://example.com")
    if parts.username or parts.password:
        raise FetchError("Addresses with a user name or password are not allowed.")
    if allow_private:
        return urlunsplit((parts.scheme.lower(), parts.netloc, parts.path or "/", parts.query, ""))
    if "." not in host or host.endswith(BLOCKED_SUFFIXES) or any(host.endswith("." + s) for s in BLOCKED_SUFFIXES):
        raise FetchError("Only public websites can be read.")
    try:
        ipaddress.ip_address(host.strip("[]"))
        raise FetchError("Use the site's name, not an IP address.")
    except ValueError:
        pass
    if parts.port not in (None, 80, 443):
        raise FetchError("Only the standard web ports (80 and 443) are allowed.")
    if not _host_is_public(host):
        raise FetchError("That address points to a private network, so it cannot be read.")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path or "/", parts.query, ""))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # we follow redirects ourselves so every hop is checked
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


@dataclass
class Response:
    status: int
    url: str
    text: str = ""
    headers: dict = field(default_factory=dict)
    redirected: bool = False
    truncated: bool = False


def _charset(content_type: str, head: bytes) -> str:
    m = re.search(r"charset=([\w-]+)", content_type or "", re.I) or re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', head[:4096], re.I)
    if not m:
        return "utf-8"
    cs = m.group(1)
    return cs.decode("ascii", "ignore") if isinstance(cs, bytes) else cs


class Fetcher:
    """Thread-safe fetcher shared by all crawl workers."""

    def __init__(self, allow_private: bool = False, timeout: float = 12.0, max_retries: int = 4, deadline: float = 40.0):
        self.allow_private = allow_private
        self.deadline = deadline  # hard limit for one page, even when a server trickles data slowly
        self.timeout = timeout
        self.max_retries = max_retries
        self._lock = threading.Lock()
        self._pause_until = 0.0
        self._last = 0.0
        self.gap = 0.0  # seconds between requests; grows when the site says "slow down", shrinks again when it is happy
        self.requests = 0
        self.rate_limited = 0
        self.streak = 0  # pages in a row still refused (429) after waiting
        self._probe = 0.0

    BLOCKED_AFTER, PROBE_EVERY = 8, 15.0

    def _blocked(self) -> bool:
        """The site has blocked us for now: stop asking, apart from one test request every 15 s."""
        return self.streak >= self.BLOCKED_AFTER and time.time() - self._probe < self.PROBE_EVERY

    def _note(self, status: int):
        with self._lock:
            if status == 429:
                self.streak += 1
                if self.streak >= self.BLOCKED_AFTER:
                    self._probe = time.time()
            else:
                self.streak = 0

    def _wait_if_paused(self):
        while True:
            with self._lock:
                now = time.time()
                wait = max(self._pause_until - now, self._last + self.gap - now)
                if wait <= 0:
                    self._last = now
                    return
            time.sleep(min(wait, 2.0))

    def _pause(self, seconds: float):
        with self._lock:
            self._pause_until = max(self._pause_until, time.time() + seconds)
            self.gap = min(2.5, self.gap + 0.4 if self.gap else 0.6)
            self.rate_limited += 1

    def get(self, url: str, max_bytes: int = 2_000_000, stop_at: re.Pattern | None = None,
            accept: str = "text/html,application/xhtml+xml,*/*;q=0.8", retries: int | None = None) -> Response:
        """GET a public URL. stop_at: stop reading once this pattern appears (saves bandwidth on huge pages)."""
        cur = check_url(url, self.allow_private)
        if self._blocked():
            return Response(429, cur)
        redirected = False
        t_end = time.time() + self.deadline
        for _hop in range(MAX_HOPS):
            tries = self.max_retries if retries is None else retries
            for attempt in range(tries + 1):
                self._wait_if_paused()
                req = urllib.request.Request(cur, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en;q=0.9,*;q=0.5"})
                self.requests += 1
                try:
                    resp = _OPENER.open(req, timeout=self.timeout)
                except urllib.error.HTTPError as e:
                    if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                        cur = check_url(urljoin(cur, e.headers["Location"]), self.allow_private)
                        redirected = True
                        break  # next hop
                    if e.code == 429 and attempt < tries and not self._blocked():
                        ra = e.headers.get("Retry-After") or ""
                        self._pause(min(60.0, float(ra) if ra.isdigit() else 4.0 * (attempt + 1)))
                        continue
                    if e.code in (502, 503, 504) and attempt < 1:
                        time.sleep(1.5)
                        continue
                    self._note(e.code)
                    return Response(e.code, cur, "", dict(e.headers or {}), redirected)
                except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
                    if attempt < 1:
                        time.sleep(1.0)
                        continue
                    reason = getattr(e, "reason", e)
                    raise FetchError(f"Could not reach {urlsplit(cur).hostname}: {reason}")
                self._note(resp.status)
                with self._lock:
                    if self.gap:
                        self.gap = max(0.0, self.gap - 0.02)
                with resp:
                    status = resp.status
                    headers = dict(resp.headers)
                    chunks, n, truncated, tail = [], 0, False, b""
                    while True:
                        block = resp.read(65536)
                        if not block:
                            break
                        chunks.append(block)
                        n += len(block)
                        if time.time() > t_end:
                            truncated = True
                            break
                        if stop_at is not None:
                            window = tail + block
                            if stop_at.search(window.decode("utf-8", "ignore")):
                                truncated = True
                                break
                            tail = block[-200:]
                        if n >= max_bytes:
                            truncated = True
                            break
                    raw = b"".join(chunks)
                cs = _charset(headers.get("Content-Type", ""), raw)
                try:
                    text = raw.decode(cs, "replace")
                except LookupError:
                    text = raw.decode("utf-8", "replace")
                return Response(status, resp.geturl() if hasattr(resp, "geturl") else cur, text, headers, redirected, truncated)
            else:
                raise FetchError("The site kept asking us to slow down. Try again in a few minutes.")
        raise FetchError("The page redirects too many times.")

    def get_json(self, url: str, max_bytes: int = 8_000_000):
        import json
        r = self.get(url, max_bytes=max_bytes, accept="application/json,*/*;q=0.5")
        if r.status != 200:
            return None
        try:
            return json.loads(r.text)
        except ValueError:
            return None
