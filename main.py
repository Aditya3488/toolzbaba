import mimetypes
import os

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
import core
import pages
import security
import toolkit
import tools  # noqa: F401 - importing registers every tool
from site_board import api as site_board_api
from tools import cdn

mimetypes.add_type("text/javascript", ".mjs")  # pdf.js ships as ES modules; Windows can map these wrongly
mimetypes.add_type("application/wasm", ".wasm")

BASE = os.path.dirname(__file__)
STATIC = os.path.join(BASE, "static")


class Assets(StaticFiles):
    """Static files with a 1-hour cache so browsers and Cloudflare don't refetch on every visit."""

    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            resp.headers["Cache-Control"] = "public, max-age=3600"
        return resp


app = FastAPI(title=config.SITE_NAME, docs_url=None, redoc_url=None, openapi_url=None)  # no public API docs
app.middleware("http")(security.guard)
app.include_router(pages.router)
app.include_router(core.router)
app.include_router(toolkit.router)
app.include_router(cdn.router)
app.include_router(site_board_api.router)  # Site Map Board: /site-board and /api/site-board/* (site_board/)


@app.exception_handler(StarletteHTTPException)
async def not_found(request: Request, exc: StarletteHTTPException):
    path = request.url.path
    if exc.status_code == 404 and "text/html" in request.headers.get("accept", "") and not path.startswith(("/api/", "/i/")):
        return pages.not_found_page()
    return await http_exception_handler(request, exc)


core.start_cleanup()
app.mount("/assets", Assets(directory=os.path.join(STATIC, "assets")), name="assets")
