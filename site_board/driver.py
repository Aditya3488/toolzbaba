"""Network steps for the crawl. The crawler is a generator that yields what it needs to fetch and gets the answer back;
a driver does the fetching. On a PC, run() below uses threads and fetch.Fetcher. In the browser (toolzbaba.com), web.py
runs the same generator with parallel fetch() calls through the /api/site-fetch Cloudflare Function.

Steps: Get (one request; a FetchError is raised inside the crawler), Batch (many requests at once; each answer is a
Response, parsed JSON, or a FetchError value) and Sleep.
"""
from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from .fetch import FetchError, Fetcher, Response

HTML = "text/html,application/xhtml+xml,*/*;q=0.8"
JSON = "application/json,*/*;q=0.5"
STOP_H1 = re.compile(r"</h1>", re.I)


@dataclass
class Get:
    url: str
    max_bytes: int = 2_000_000
    stop_h1: bool = False      # stop reading after the first </h1> (saves bandwidth on huge pages)
    accept: str = HTML
    retries: int | None = None
    json: bool = False         # answer with the parsed JSON (None if it failed) instead of a Response


@dataclass
class Batch:
    reqs: list
    each: object = None        # each(index, answer) is called as every request finishes, in any order


@dataclass
class Sleep:
    seconds: float


@dataclass
class Stats:
    requests: int = 0
    rate_limited: int = 0
    extra: dict = field(default_factory=dict)


def parse_json(r: Response):
    if r.status != 200:
        return None
    try:
        return json.loads(r.text)
    except ValueError:
        return None


def _do(F: Fetcher, req: Get):
    try:
        r = F.get(req.url, max_bytes=req.max_bytes, stop_at=STOP_H1 if req.stop_h1 else None, accept=req.accept, retries=req.retries)
    except FetchError as e:
        return None if req.json else e
    return parse_json(r) if req.json else r


def run(gen, F: Fetcher, workers: int = 6):
    """Drive a crawl generator on this computer and return what it returns."""
    value, error = None, None
    while True:
        try:
            step = gen.throw(error) if error is not None else gen.send(value)
        except StopIteration as stop:
            return stop.value
        value = error = None
        if isinstance(step, Sleep):
            time.sleep(step.seconds)
        elif isinstance(step, Batch):
            value = [None] * len(step.reqs)
            if step.reqs:
                with ThreadPoolExecutor(max_workers=max(1, min(workers, 10))) as ex:
                    futs = {ex.submit(_do, F, r): i for i, r in enumerate(step.reqs)}
                    for fut in as_completed(futs):
                        i = futs[fut]
                        value[i] = fut.result()
                        if step.each:
                            step.each(i, value[i])
        else:
            res = _do(F, step)
            if isinstance(res, FetchError):
                error = res
            else:
                value = res
