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
import sys
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


# A circuit breaker per host. When a whole source goes down mid-run — the Wayback
# Machine does this regularly — every worker otherwise sits through its full timeout
# and retries, turning a six-minute phase into twenty minutes of waiting for nothing.
# After this many connection failures in a row with no success, the host is treated as
# down for the rest of the run and its requests return immediately.
DOWN_AFTER = int(os.environ.get("SAAS_DOWN_AFTER", "8"))
_fails: dict[str, int] = {}
_down: set[str] = set()


def _note_failure(host: str):
    with _locks_guard:
        _fails[host] = _fails.get(host, 0) + 1
        if _fails[host] >= DOWN_AFTER and host not in _down:
            _down.add(host)
            print(f"  ! {host} looks down; skipping it for the rest of this run", file=sys.stderr)


def _note_success(host: str):
    if _fails.get(host):
        with _locks_guard:
            _fails[host] = 0
            _down.discard(host)


def host_is_down(host: str) -> bool:
    return host in _down


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
    if host_is_down(host):          # the source is out; do not wait on it again
        return None
    text, ok, throttled, answered = None, False, False, False
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
                _note_success(host)
                break
        except urllib.error.HTTPError as e:
            # GitHub allows 60 unauthenticated requests an hour. Being throttled is
            # not an answer, so it is never cached: a later run asks again instead of
            # reporting "this company has no public code" forever.
            throttled = e.code in (403, 429)
            answered = True              # a 404 is the source answering, and worth keeping
            if e.code in (429, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** attempt * 2)
                continue
            break
        except (urllib.error.URLError, socket.timeout, ConnectionError, OSError):
            # a refused connection or a timeout is the source being unreachable,
            # not an answer about this company
            if attempt >= retries:
                _note_failure(host)
                break
            if host_is_down(host):
                break
            time.sleep(1.5 * (attempt + 1))

    # Only a real answer is worth remembering. A refused connection or a timeout says
    # the source was unreachable just then — caching that would bake a half-hour
    # outage into the data for a day, which is how a run during an archive.org outage
    # would permanently report that no company has any history.
    if ok or (answered and not throttled):
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
