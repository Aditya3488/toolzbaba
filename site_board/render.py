"""Fill the board template with a crawl report and return one self-contained HTML page."""
from __future__ import annotations

import html
import json
from pathlib import Path

from . import model

TEMPLATE = Path(__file__).with_name("assets") / "board_template.html"


def _js(obj) -> str:
    """JSON that is safe inside a <script> block."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def render(report: dict, bot_endpoint: str = "", report_id: str = "", max_cards: int = 2200) -> str:
    m = model.build(report, max_cards=max_cards)
    for stg in m["STG"]:
        stg["items"] = [it[:2] if len(it) > 2 and it[2] is None else it for it in stg["items"]]
    X = dict(m["X"], botEndpoint=bot_endpoint, reportId=report_id)
    t = TEMPLATE.read_text(encoding="utf-8")
    brand = X["site"]["brand"]
    title = f"{brand} Sitemap Board"
    for token, value in (("__T_TITLE__", html.escape(title)), ("__T_MARK__", html.escape(X["site"]["mark"])),
                         ("__T_DOMAIN__", html.escape(X["site"]["domain"])), ("__T_BASE__", report["base"].replace('"', "%22"))):
        t = t.replace(token, value)
    fills = {
        "/*__DATA__*/": _js(m["DATA"]) + ";", "/*__SEO__*/null": _js(m["SEO"]), "/*__PROD__*/{}": _js(m["PROD"]),
        "/*__BROKEN__*/[]": _js(m["BROKEN"]), "/*__STG__*/[]": _js(m["STG"]), "/*__BR__*/{}": _js(m["BR"]),
        "/*__SHOTDATA__*/{}": _js(m["SHOTDATA"]), "/*__X__*/{}": _js(X),
    }
    for k, v in fills.items():
        if k not in t:
            raise RuntimeError(f"template placeholder {k} is missing")
        t = t.replace(k, v, 1)
    cut = t.index("</style>") + len("</style>")
    desc = html.escape(f"Interactive sitemap board of {X['site']['domain']}: every page, the sales funnel, tracking tools and SEO health.")
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            f"<meta name=\"description\" content=\"{desc}\">\n<meta name=\"color-scheme\" content=\"light\">\n<meta name=\"robots\" content=\"noindex\">\n"
            "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n"
            f"{t[:cut].strip()}\n</head>\n<body>\n{t[cut:].strip()}\n</body>\n</html>\n")


def stats(report: dict) -> dict:
    m = model.build(report)
    return {"cards": m["cards"], "sections": len(m["DATA"]), "products": len(m["PROD"]), "broken": len(m["BROKEN"])}
