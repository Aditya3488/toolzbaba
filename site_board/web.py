"""The Visual Sitemap Generator on toolzbaba.com: Pyodide runs this package in a Web Worker
(static/assets/tools/site-board-worker.js). The crawl is the same generator as on a PC (crawl.report_steps); here its
requests become parallel fetch() calls through the /api/site-fetch Cloudflare Function, made by the worker's sbFetch().
build() returns the board, ask() answers chat questions about the last board.
"""
from __future__ import annotations

import asyncio
import json
import re

from .bot import SiteBot
from .crawl import report_steps
from .driver import Batch, Get, Sleep, Stats, parse_json
from .fetch import FetchError, Response
from .render import render

_last = {"report": None, "bot": None}


def _accept_key(accept: str) -> str:
    a = accept.lower()
    return "json" if "json" in a else "xml" if "xml" in a else "text" if a.startswith("text/plain") else "any" if a.strip() == "*/*" else "html"


async def _get(req: Get, stats: Stats):
    from js import sbFetch  # the worker's fetch helper (rate limits, retries, stop after </h1>, character sets)
    res = await sbFetch(req.url, req.max_bytes, bool(req.stop_h1), _accept_key(req.accept), 4 if req.retries is None else req.retries)
    stats.requests += int(getattr(res, "tries", 1) or 1)
    stats.rate_limited += int(getattr(res, "limited", 0) or 0)
    err = getattr(res, "error", None)
    if err:
        return None if req.json else FetchError(str(err))
    r = Response(int(res.status), str(res.url), str(res.text), {}, bool(res.redirected), bool(res.truncated))
    return parse_json(r) if req.json else r


async def run_async(gen, stats: Stats, concurrency: int = 6):
    """Drive a crawl generator in the browser and return what it returns."""
    value, error = None, None
    while True:
        try:
            step = gen.throw(error) if error is not None else gen.send(value)
        except StopIteration as stop:
            return stop.value
        value = error = None
        if isinstance(step, Sleep):
            await asyncio.sleep(step.seconds)
        elif isinstance(step, Batch):
            answers = [None] * len(step.reqs)
            gate = asyncio.Semaphore(concurrency)

            async def one(i, req, step=step, answers=answers, gate=gate):
                async with gate:
                    answers[i] = await _get(req, stats)
                if step.each:
                    step.each(i, answers[i])

            await asyncio.gather(*(one(i, r) for i, r in enumerate(step.reqs)))
            value = answers
        else:
            res = await _get(step, stats)
            if isinstance(res, FetchError):
                error = res
            else:
                value = res


def _clean_url(url: str) -> str:
    url = (url or "").strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


async def build(url: str, max_pages: int = 200) -> str:
    """Crawl a site and return JSON: {"html": board, "summary": {...}} or {"error": message}."""
    from js import sbProgress
    stats = Stats()
    say = lambda msg, frac=None: sbProgress(str(msg), -1 if frac is None else float(frac))
    try:
        rep = await run_async(report_steps(_clean_url(url), max(20, min(int(max_pages), 500)), progress=say, stats=stats), stats)
    except FetchError as e:
        return json.dumps({"error": str(e)})
    say("Drawing the board", 0.96)
    _last.update(report=rep, bot=SiteBot(rep))
    html = render(rep)
    pages = rep["pages"]
    summary = {"brand": rep["brand"], "domain": rep["domain"], "type": rep["type"], "platform": rep["platform"], "pages": len(pages),
               "sitemap": rep["sitemapCount"], "products": len((rep.get("shop") or {}).get("products") or []), "tools": len(rep["tools"]),
               "broken": sum(1 for f in pages.values() if (f.get("s") or 0) >= 400 or f.get("s") == 0), "seconds": rep["seconds"],
               "notChecked": rep.get("notChecked", 0)}
    say("Board ready", 1.0)
    return json.dumps({"html": html, "summary": summary})


def ask(q: str) -> str:
    """Answer a question about the last board as JSON {"answer", "pages", "highlight", "follow"}."""
    if not _last["bot"]:
        return json.dumps({"answer": "Build a board first, then ask me about the site.", "pages": [], "highlight": [], "follow": []})
    return json.dumps(_last["bot"].ask(str(q)[:500]))


def report_json() -> str:
    """The last report, for `python -m site_board ask report.json "question"` on a PC."""
    return json.dumps(_last["report"] or {}, ensure_ascii=False)
