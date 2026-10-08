"""Offline test for the Site Map Board engine (site_board/). No internet needed.

Serves a small fake website on 127.0.0.1, crawls it, renders the board, asks the bot questions and checks the
security rules for addresses. Run:  python tests/smoke_site_board.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from site_board.bot import SiteBot  # noqa: E402
from site_board.crawl import build_report, extract_footer, script_menus  # noqa: E402
from site_board.dom import parse  # noqa: E402
from site_board.fetch import FetchError, Fetcher, check_url  # noqa: E402
from site_board.render import render  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        FAILS.append(name)


HEAD = '<meta name="description" content="{d}"><title>{t}</title>'
PAGES = {
    "index.html": """<!doctype html><html><head><title>Acme Studio | Web design agency</title><meta name="description" content="Acme builds websites.">
<meta property="og:site_name" content="Acme Studio">
<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC1234');</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script><script>gtag('config','AW-123456789');fbq('init','123456789012345');</script>
</head><body><header><nav><ul>
<li><a href="/services">Services</a><div><h3>Build</h3><ul><li><a href="/services/web-design">Web design</a></li><li><a href="/services/shopify">Shopify stores</a></li></ul>
<h3>Grow</h3><ul><li><a href="/services/seo">SEO</a></li><li><a href="/services/ppc">PPC ads</a></li><li><a href="/broken-page">Old page</a></li></ul></div></li>
<li><a href="/about">About</a></li><li><a href="/blog">Blog</a></li><li><a href="/contact">Contact</a></li></ul></nav></header>
<main><h1>We build websites that sell</h1><h2>Our services</h2><h2>What clients say</h2><h2>Get in touch</h2>
<form><input type="email" name="e"></form><a href="tel:+911234567890">Call</a><a href="https://wa.me/911234567890">WhatsApp</a></main>
<footer><h4>Company</h4><ul><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms</a></li></ul>
<a href="https://www.instagram.com/acme">Instagram</a><a href="https://clutch.co/profile/acme">Clutch</a></footer></body></html>""",
    "services/index.html": "<html><head>" + HEAD.format(t="Services | Acme Studio", d="All our services.") + "</head><body><h1>Services</h1></body></html>",
    "services/web-design/index.html": "<html><head>" + HEAD.format(t="Web Design Services in Delhi for Small Businesses and Startups That Want Growth", d="Design.") + "</head><body><h1>Web design</h1></body></html>",
    "services/shopify/index.html": "<html><head><title>Shopify stores | Acme Studio</title></head><body><h1>Shopify</h1></body></html>",
    "services/seo/index.html": "<html><head>" + HEAD.format(t="SEO | Acme Studio", d="Rank higher.") + "</head><body><h1>SEO</h1><h1>Second H1</h1></body></html>",
    "services/ppc/index.html": "<html><head>" + HEAD.format(t="SEO | Acme Studio", d="Ads.") + "</head><body><h1>PPC</h1></body></html>",
    "about/index.html": "<html><head>" + HEAD.format(t="Acme Studio", d="About us.") + "</head><body><h1>About</h1></body></html>",
    "blog/index.html": "<html><head>" + HEAD.format(t="Blog | Acme Studio", d="Posts.") + "</head><body></body></html>",
    "blog/first-post/index.html": "<html><head>" + HEAD.format(t="How to pick a web designer | Acme", d="Tips.") + "</head><body><h1>Post</h1></body></html>",
    "contact/index.html": "<html><head>" + HEAD.format(t="Contact | Acme Studio", d="Say hi.") + "</head><body><h1>Contact</h1></body></html>",
    "privacy/index.html": "<html><head>" + HEAD.format(t="Privacy | Acme Studio", d="Privacy.") + "</head><body><h1>Privacy</h1></body></html>",
    "terms/index.html": "<html><head>" + HEAD.format(t="Terms | Acme Studio", d="Terms.") + "</head><body><h1>Terms</h1></body></html>",
}


def main():
    # 1. address rules
    for bad in ("http://127.0.0.1/", "http://localhost:8000/", "http://10.0.0.5/", "http://example.com:8080/", "ftp://example.com/", "http://user:pw@example.com/", "http://intranet.corp/"):
        try:
            check_url(bad)
            check(f"refuses {bad}", False, "was allowed")
        except FetchError:
            check(f"refuses {bad}", True)

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for rel, html in PAGES.items():
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            (root / rel).write_text(html, encoding="utf-8")
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(type("Q", (SimpleHTTPRequestHandler,), {"log_message": lambda *a: None}), directory=str(root)))
        port = httpd.server_address[1]
        base = f"http://127.0.0.1:{port}"
        (root / "sitemap.xml").write_text("<?xml version='1.0'?><urlset>" + "".join(f"<url><loc>{base}/{p}</loc></url>" for p in ("about", "blog/first-post", "privacy")) + "</urlset>", encoding="utf-8")
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            rep = build_report(base + "/", max_pages=50, shots=False, allow_private=True, workers=4)
        finally:
            httpd.shutdown()

    # 2. crawl
    check("brand from og:site_name", rep["brand"] == "Acme Studio", rep["brand"])
    labels = [m["label"] for m in rep["menu"]]
    check("menu sections", labels[:4] == ["Services", "About", "Blog", "Contact"], labels)
    groups = [g["name"] for g in rep["menu"][0]["groups"]]
    check("mega-menu headings become groups", "Build" in groups and "Grow" in groups, groups)
    check("footer group", rep["footer"] and rep["footer"][0]["name"] == "Company", rep["footer"])
    check("sitemap read", rep["sitemapCount"] == 3, rep["sitemapCount"])
    check("broken link found", rep["pages"].get("/broken-page", {}).get("s") == 404, rep["pages"].get("/broken-page"))
    for name in ("Google Tag Manager", "Google Analytics 4", "Google Ads", "Meta Pixel", "WhatsApp chat"):
        check(f"detects {name}", name in rep["tools"], list(rep["tools"]))
    check("phone found", rep["contacts"]["phones"] == ["+911234567890"], rep["contacts"]["phones"])
    check("lead-gen site type", rep["type"] == "leadgen", rep["type"])
    check("homepage sections", [s[0] for s in rep["homeSections"]][:3] == ["We build websites that sell", "Our services", "What clients say"], rep["homeSections"])

    # a site that refuses everything (429): after 8 refusals in a row the fetcher stops asking
    class Busy(SimpleHTTPRequestHandler):
        def do_GET(self):
            self.send_response(429); self.end_headers()
        log_message = lambda *a: None
    busy = ThreadingHTTPServer(("127.0.0.1", 0), Busy)
    threading.Thread(target=busy.serve_forever, daemon=True).start()
    try:
        F = Fetcher(allow_private=True)
        codes = [F.get(f"http://127.0.0.1:{busy.server_address[1]}/p{i}", retries=0).status for i in range(20)]
    finally:
        busy.shutdown()
    check("blocked site: stops asking after 8 refusals", codes == [429] * 20 and F.requests == 8, (codes, F.requests))

    # menus some themes keep in a script, and repeated sub-headings ("Shop by Price" under each category)
    links = "".join(f'<li><a href="/collections/c{i}">Category {i}</a></li>' for i in range(8))
    nav = script_menus(f"<script>if(w>1199){{$('nav').html(`<ul>{links}</ul>`)}}</script>")
    check("menu inside a script is read", nav is not None and len(nav.find_all("a")) == 8, nav)
    foot = parse("<footer>" + "".join(f'<p class="col-title">{c}</p><h4>Shop by Price</h4><ul><li><a href="/{c}-1000">Under 1000</a></li></ul>'
                                     for c in ("Earbuds", "Speakers")) + "</footer>")
    names = [g["name"] for g in extract_footer(foot, base + "/", "127.0.0.1")]
    check("repeated sub-headings get their parent", names == ["Earbuds · Shop by Price", "Speakers · Shop by Price"], names)

    # 3. board
    html = render(rep, bot_endpoint="/api/ask", report_id="abc123abc123")
    check("board has no leftover placeholders", "/*__" not in html and "__T_" not in html, [x for x in ("/*__", "__T_") if x in html])
    check("board title", "<title>Acme Studio Sitemap Board</title>" in html)
    check("board carries bot endpoint", '"botEndpoint":"/api/ask"' in html)

    # 4. bot
    bot = SiteBot(json.loads(json.dumps(rep)))
    a = bot.ask("which links are broken?")
    check("bot: broken links", "/broken-page" in a["answer"], a["answer"])
    a = bot.ask("do they use the meta pixel?")
    check("bot: meta pixel yes", a["answer"].startswith("**Yes**"), a["answer"])
    a = bot.ask("do they use tiktok?")
    check("bot: tiktok no", a["answer"].startswith("**No**"), a["answer"])
    a = bot.ask("kitne pages hai")
    check("bot: Hinglish page count", "URLs" in a["answer"], a["answer"])
    a = bot.ask("show duplicate titles")
    check("bot: duplicate titles", "SEO | Acme Studio" in a["answer"], a["answer"])
    a = bot.ask("how can visitors contact them")
    check("bot: contacts", "+911234567890" in a["answer"] and "WhatsApp" in a["answer"], a["answer"])
    a = bot.ask("tell me about web design")
    check("bot: page info", "Web design" in a["answer"] and "over 60" in a["answer"], a["answer"])
    a = bot.ask("what should they improve")
    check("bot: recommendations", "broken" in a["answer"].lower(), a["answer"])
    a = bot.ask("flibbertigibbet zork")
    check("bot: unknown question handled", isinstance(a.get("answer"), str) and a["answer"], a)

    print(f"\n{'All site board checks passed' if not FAILS else str(len(FAILS)) + ' check(s) failed: ' + ', '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
