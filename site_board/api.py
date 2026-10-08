"""FastAPI routes for the toolzbaba Python server: /site-board (page) and /api/site-board/* (crawl jobs, board, bot)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from . import jobs, ui
from .fetch import FetchError
from .render import render

router = APIRouter()
_boards: dict[str, str] = {}
API = "/api/site-board"


@router.get("/site-board", response_class=HTMLResponse)
def page():
    return HTMLResponse(ui.page(API))


@router.post(API + "/start")
async def start(request: Request):
    body = await request.json()
    try:
        jid = jobs.start(str(body.get("url", ""))[:500], max_pages=max(20, min(int(body.get("maxPages") or 300), 3000)), shots=bool(body.get("shots", False)))
    except FetchError as e:
        raise HTTPException(400, str(e))
    return {"id": jid}


@router.get(API + "/status/{job_id}")
def status(job_id: str):
    try:
        return jobs.status(job_id)
    except KeyError:
        raise HTTPException(404, "No such board.")


@router.get(API + "/board/{job_id}", response_class=HTMLResponse)
def board(job_id: str, download: int = 0):
    try:
        rep = jobs.report(job_id)
    except KeyError:
        raise HTTPException(404, "No such board.")
    if download:
        return HTMLResponse(render(rep), headers={"Content-Disposition": f'attachment; filename="{rep["domain"]}-sitemap-board.html"'})
    if job_id not in _boards:
        _boards[job_id] = render(rep, bot_endpoint=API + "/ask", report_id=job_id)
        if len(_boards) > 10:
            _boards.pop(next(iter(_boards)))
    return HTMLResponse(_boards[job_id], headers={"Cache-Control": "no-store"})


@router.post(API + "/ask")
async def ask(request: Request):
    body = await request.json()
    try:
        return JSONResponse(jobs.bot(str(body.get("report", ""))).ask(str(body.get("q", ""))[:500]))
    except KeyError:
        raise HTTPException(404, "That board is no longer available. Build it again.")
