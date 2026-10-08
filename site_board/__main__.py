"""Command line:

  python -m site_board https://example.com            build example.com-sitemap-board.html
  python -m site_board https://example.com -o b.html --max-pages 600 --no-shots --json report.json
  python -m site_board ask report.json "What are the biggest SEO problems?"
  python -m site_board ask report.json                 chat in the terminal
  python -m site_board serve                           local web app at http://127.0.0.1:8765
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _progress(msg, pct=None):
    bar = f"[{'#' * int((pct or 0) * 24):<24}] " if pct is not None else ""
    sys.stdout.write(f"\r{bar}{msg[:90]:<90}")
    sys.stdout.flush()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if argv and argv[0] == "serve":
        p = argparse.ArgumentParser(prog="python -m site_board serve")
        p.add_argument("--port", type=int, default=8765)
        p.add_argument("--host", default="127.0.0.1")
        p.add_argument("--no-browser", action="store_true")
        p.add_argument("--allow-private", action="store_true", help="also read local / private addresses (testing only)")
        a = p.parse_args(argv[1:])
        from .server import serve
        return serve(a.port, a.host, not a.no_browser, a.allow_private)
    if argv and argv[0] == "ask":
        p = argparse.ArgumentParser(prog="python -m site_board ask")
        p.add_argument("report", help="report JSON made with --json")
        p.add_argument("question", nargs="*")
        a = p.parse_args(argv[1:])
        from .bot import SiteBot
        bot = SiteBot(json.loads(Path(a.report).read_text(encoding="utf-8")))
        if a.question:
            print(bot.ask(" ".join(a.question))["answer"])
            return 0
        print(f"Ask about {bot.r['domain']} (empty line to quit)")
        while True:
            try:
                q = input("\nyou> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not q:
                break
            res = bot.ask(q)
            print("\nbot> " + res["answer"])
            if res.get("follow"):
                print("     try: " + " | ".join(res["follow"][:3]))
        return 0
    p = argparse.ArgumentParser(prog="python -m site_board", description="Build a Miro-style sitemap board of any website.")
    p.add_argument("url")
    p.add_argument("-o", "--out", help="output HTML file (default: <domain>-sitemap-board.html)")
    p.add_argument("--max-pages", type=int, default=400)
    p.add_argument("--no-shots", action="store_true", help="skip screenshots")
    p.add_argument("--json", help="also save the crawl report (use it with: ask)")
    p.add_argument("--workers", type=int, default=6)
    p.add_argument("--allow-private", action="store_true", help="also read local / private addresses (testing only)")
    a = p.parse_args(argv)
    from .crawl import build_report
    from .fetch import FetchError
    from .render import render
    try:
        rep = build_report(a.url, max_pages=a.max_pages, shots=not a.no_shots, progress=_progress, allow_private=a.allow_private, workers=a.workers)
    except FetchError as e:
        print(f"\n{e}", file=sys.stderr)
        return 2
    out = Path(a.out or f"{rep['domain']}-sitemap-board.html")
    out.write_text(render(rep), encoding="utf-8")
    if a.json:
        Path(a.json).write_text(json.dumps(rep, ensure_ascii=False), encoding="utf-8")
    shop = rep.get("shop") or {}
    print(f"\nDone in {rep['seconds']}s: {len(rep['pages'])} pages checked" + (f", {len(shop.get('products', []))} products" if shop else "") +
          f", {len(rep['tools'])} tools recognised.\nBoard: {out.resolve()}" + (f"\nReport: {Path(a.json).resolve()}" if a.json else "") +
          (f"\nNote: {rep['shotError']}" if rep.get("shotError") else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
