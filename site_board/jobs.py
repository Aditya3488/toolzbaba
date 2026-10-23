"""Background crawl jobs and saved reports, shared by the stdlib server (server.py) and the FastAPI routes (api.py)."""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from .bot import SiteBot
from .crawl import build_report
from .fetch import FetchError

STORE = Path(os.environ.get("SITE_BOARD_DIR") or (Path.home() / ".site_board"))
MAX_RUNNING = int(os.environ.get("SITE_BOARD_MAX_JOBS", "2"))
_jobs: dict[str, dict] = {}
_bots: dict[str, SiteBot] = {}
_lock = threading.Lock()


def _safe_id(job_id: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{12}", job_id or ""):
        raise KeyError(job_id)
    return job_id


def start(url: str, max_pages: int = 300, shots: bool = True, allow_private: bool = False) -> str:
    with _lock:
        if sum(1 for j in _jobs.values() if j["state"] == "running") >= MAX_RUNNING:
            raise FetchError("Other boards are being built right now. Try again in a minute.")
        jid = uuid.uuid4().hex[:12]
        _jobs[jid] = {"id": jid, "url": url, "state": "running", "msg": "Starting", "pct": 0.0, "started": time.time()}

    def run():
        def progress(msg, pct=None):
            _jobs[jid]["msg"] = msg
            if pct is not None:
                _jobs[jid]["pct"] = round(float(pct), 3)
        try:
            rep = build_report(url, max_pages=max_pages, shots=shots, progress=progress, allow_private=allow_private)
            STORE.mkdir(parents=True, exist_ok=True)
            (STORE / f"{jid}.json").write_text(json.dumps(rep, ensure_ascii=False), encoding="utf-8")
            _jobs[jid].update(state="done", msg="Board ready", pct=1.0, domain=rep["domain"], pages=len(rep["pages"]),
                              products=len((rep.get("shop") or {}).get("products", [])), seconds=rep.get("seconds"))
        except FetchError as e:
            _jobs[jid].update(state="error", msg=str(e))
        except Exception as e:  # report the problem instead of hanging the page
            _jobs[jid].update(state="error", msg=f"Something went wrong while reading the site ({type(e).__name__}: {str(e)[:160]})")

    threading.Thread(target=run, daemon=True, name=f"site-board-{jid}").start()
    return jid


def status(job_id: str) -> dict:
    jid = _safe_id(job_id)
    if jid in _jobs:
        return {k: v for k, v in _jobs[jid].items()}
    if (STORE / f"{jid}.json").exists():
        return {"id": jid, "state": "done", "msg": "Board ready", "pct": 1.0}
    raise KeyError(job_id)


def report(job_id: str) -> dict:
    jid = _safe_id(job_id)
    p = STORE / f"{jid}.json"
    if not p.exists():
        raise KeyError(job_id)
    return json.loads(p.read_text(encoding="utf-8"))


def bot(job_id: str) -> SiteBot:
    jid = _safe_id(job_id)
    if jid not in _bots:
        _bots[jid] = SiteBot(report(jid))
        if len(_bots) > 20:
            _bots.pop(next(iter(_bots)))
    return _bots[jid]
