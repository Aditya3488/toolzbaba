"""A tiny local web app (standard library only): python -m site_board serve"""
from __future__ import annotations

import json
import re
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import jobs, ui
from .fetch import FetchError
from .render import render

_boards: dict[str, str] = {}


class Handler(BaseHTTPRequestHandler):
    server_version = "SiteBoard/1.0"
    allow_private = False

    def log_message(self, fmt, *args):  # quiet console
        pass

    def _send(self, code: int, body, ctype="application/json; charset=utf-8", extra=None):
        data = body.encode("utf-8") if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _json_body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 20_000:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        u = urlsplit(self.path)
        if u.path in ("/", "/index.html"):
            return self._send(200, ui.page("/api"), "text/html; charset=utf-8")
        m = re.fullmatch(r"/api/status/([a-f0-9]{12})", u.path)
        if m:
            try:
                return self._send(200, jobs.status(m.group(1)))
            except KeyError:
                return self._send(404, {"error": "No such board."})
        m = re.fullmatch(r"/api/board/([a-f0-9]{12})", u.path)
        if m:
            jid = m.group(1)
            download = "download" in parse_qs(u.query)
            try:
                if download:
                    html = render(jobs.report(jid))
                    rep = jobs.report(jid)
                    return self._send(200, html, "text/html; charset=utf-8", {"Content-Disposition": f'attachment; filename="{rep["domain"]}-sitemap-board.html"'})
                if jid not in _boards:
                    _boards[jid] = render(jobs.report(jid), bot_endpoint="/api/ask", report_id=jid)
                return self._send(200, _boards[jid], "text/html; charset=utf-8")
            except KeyError:
                return self._send(404, {"error": "No such board."})
        return self._send(404, {"error": "Not found"})

    def do_POST(self):
        u = urlsplit(self.path)
        body = self._json_body()
        if u.path == "/api/start":
            try:
                jid = jobs.start(str(body.get("url", "")), max_pages=max(20, min(int(body.get("maxPages") or 300), 3000)),
                                 shots=bool(body.get("shots", True)), allow_private=self.allow_private)
                return self._send(200, {"id": jid})
            except FetchError as e:
                return self._send(400, {"error": str(e)})
        if u.path == "/api/ask":
            q = str(body.get("q", ""))[:500]
            try:
                return self._send(200, jobs.bot(str(body.get("report", ""))).ask(q))
            except KeyError:
                return self._send(404, {"error": "That board is no longer available. Build it again."})
        return self._send(404, {"error": "Not found"})


def serve(port: int = 8765, host: str = "127.0.0.1", open_browser: bool = True, allow_private: bool = False):
    Handler.allow_private = allow_private
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}/"
    print(f"Site Map Board running at {url}  (Ctrl+C to stop)")
    if open_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
