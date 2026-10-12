"""One polite, cached HTTP layer for every source.

Responses are cached on disk under data/cache so a re-run costs no requests: the
pipeline can be stopped and restarted, and a failing source never loses the rest.
Only the standard library is used, so the pipeline needs nothing installed.
"""
import gzip
import hashlib
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(__file__).parent / "data" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

UA = "toolzbaba-india-saas/1.0 (+https://toolzbaba.com; open data research)"
TTL = int(os.environ.get("SAAS_CACHE_TTL", 60 * 60 * 24 * 14))  # a fortnight: these sources move slowly

# One request at a time per host, with a gap, so a free source is never hammered.
# Companies are enriched in parallel, so this has to hold across threads: the lock
# makes the "check the clock, then claim the slot" step atomic per host.
_last: dict[str, float] = {}
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
GAP = float(os.environ.get("SAAS_GAP", "0.7"))


def _host_lock(host: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(host, threading.Lock())


def _wait(host: str):
    with _host_lock(host):
        delay = GAP - (time.time() - _last.get(host, 0.0))
        if delay > 0:
            time.sleep(delay)
        _last[host] = time.time()


def _key(url: str, body: str | None) -> Path:
    h = hashlib.sha256((url + "\n" + (body or "")).encode()).hexdigest()[:40]
    return CACHE / f"{h}.json.gz"


def fetch(url: str, *, body: str | None = None, headers: dict | None = None, timeout: int = 45,
          ttl: int | None = None, retries: int = 2) -> str | None:
    """Return the body of `url` as text, from cache when fresh. None when it cannot be had.

    A failure is cached too (briefly), so one dead domain does not stall every re-run.
    """
    path = _key(url, body)
    ttl = TTL if ttl is None else ttl
    if path.exists():
        try:
            rec = json.loads(gzip.decompress(path.read_bytes()).decode())
            age = time.time() - rec["at"]
            if age < (ttl if rec.get("ok") else min(ttl, 60 * 60 * 24)):
                return rec["text"] if rec.get("ok") else None
        except Exception:
            pass

    host = urllib.parse.urlparse(url).hostname or ""
    text, ok, throttled = None, False, False
    for attempt in range(retries + 1):
        _wait(host)
        req = urllib.request.Request(url, data=body.encode() if body else None,
                                     headers={"User-Agent": UA, "Accept-Encoding": "gzip", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                text, ok = raw.decode("utf-8", "replace"), True
                break
        except urllib.error.HTTPError as e:
            # GitHub allows 60 unauthenticated requests an hour. Being throttled is
            # not an answer, so it is never cached: a later run asks again instead of
            # reporting "this company has no public code" forever.
            throttled = e.code in (403, 429)
            if e.code in (429, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** attempt * 2)
                continue
            break
        except (urllib.error.URLError, socket.timeout, ConnectionError, OSError):
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            break

    if ok or not throttled:
        path.write_bytes(gzip.compress(json.dumps({"at": time.time(), "ok": ok, "text": text}).encode()))
    return text if ok else None


def get_json(url: str, **kw):
    text = fetch(url, **kw)
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None
