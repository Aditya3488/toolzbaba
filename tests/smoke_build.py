"""Consistency checks on the built site (run after `python build.py`):  python tests/smoke_build.py

One source of truth, static/assets/tools.json, feeds the home page, the menus, the sitemap and the tool pages. These checks
fail the moment they disagree: a tool missing from the home page, a slug the menu names that does not exist, a sitemap
entry with no page (or a page with no sitemap entry), a tool count in the page text that the tool list does not back.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST, STATIC = ROOT / "dist", ROOT / "static"
FAILS = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        FAILS.append(name)


def main():
    if not (DIST / "index.html").exists():
        print("dist/ is missing: run `python build.py` first")
        return 2
    data = json.loads((STATIC / "assets" / "tools.json").read_text("utf-8"))
    tools, variants, cats = data["tools"], data.get("variants", []), {c["id"] for c in data["categories"]}
    slugs = [t["slug"] for t in tools]
    check("tool slugs are unique", len(slugs) == len(set(slugs)), [s for s in slugs if slugs.count(s) > 1])
    check("every tool has a name, description, category and script", all(t.get("name") and t.get("desc") and t.get("cat") in cats and t.get("js") for t in tools),
          [t["slug"] for t in tools if not (t.get("name") and t.get("desc") and t.get("cat") in cats and t.get("js"))])
    check("every format page points at an existing tool", all(v["base"] in slugs for v in variants), [v["slug"] for v in variants if v["base"] not in slugs])
    aliases = [a for t in tools + variants for a in t.get("aliases", []) if a != t["slug"]]   # a page naming itself is not a redirect
    clash = [a for a in aliases if a in slugs or a in {v["slug"] for v in variants}]
    check("old addresses (aliases) never clash with live pages", not clash, clash)

    # the menus in common.js name slugs: each must be a tool or a format page
    js = (STATIC / "assets" / "common.js").read_text("utf-8")
    menus = js[js.index("const NAV_MENUS"):js.index("const buildNav")]
    named = set(re.findall(r"'([a-z0-9-]+)'", menus)) - {m[1] for m in re.findall(r"\['([^']+)', '([a-z]+)', '", menus)}
    known = set(slugs) | {v["slug"] for v in variants} | {"compress-image", "merge-pdf", "video-converter", "remove-background", "convert-image", "toolbox"}
    unknown = sorted(s for s in named if s not in known and not re.fullmatch(r"[a-z]+", s))
    check("every slug named in the header menus exists", not unknown, unknown)

    # home page: every tool is on it before any script runs, in every language
    langs = [p.name for p in DIST.iterdir() if p.is_dir() and re.fullmatch(r"[a-z]{2}", p.name) and (p / "index.html").exists()]
    for code in ["en"] + sorted(langs):
        home = (DIST / "index.html" if code == "en" else DIST / code / "index.html").read_text("utf-8")
        prefix = "" if code == "en" else f"/{code}"
        missing = [s for s in slugs if f'href="{prefix}/{s}"' not in home]
        if code == "en":
            check("home page lists every tool in its HTML", not missing, missing)
            check("home page has no loading placeholder left", "Loading tools" not in home and "skel" not in home)
            m = re.search(r"(\d+)\+ free online tools", home)
            check("tool count in the page text is backed by the tool list", m and int(m.group(1)) <= len(tools) and len(tools) - int(m.group(1)) < 5, m and m.group(0))
        elif missing:
            check(f"home page ({code}) lists every tool", False, missing[:5])
    check("home page in every language lists every tool", not [n for n in FAILS if "lists every tool" in n])

    # sitemap vs pages: same set, every address a real page, no page left out
    xml = (DIST / "sitemap.xml").read_text("utf-8")
    locs = re.findall(r"<loc>https?://[^/<]+(/[^<]*)</loc>", xml)
    check("sitemap addresses are unique", len(locs) == len(set(locs)), [l for l in locs if locs.count(l) > 1][:5])
    pages = {("/" if l == "/" else l.rstrip("/")) for l in locs}
    want = {f"/{s}" for s in slugs} | {f"/{v['slug']}" for v in variants if not v.get("canonical")}
    check("every tool and format page is in the sitemap", want <= pages, sorted(want - pages)[:8])
    twins = [v for v in variants if v.get("canonical")]
    check("twin pages (canonical to another page) stay out of the sitemap and point at a live page",
          all(f"/{v['slug']}" not in pages and f"/{v['canonical']}" in pages for v in twins) and all(f'<link rel="canonical" href="https://toolzbaba.com/{v["canonical"]}"' in (DIST / f"{v['slug']}.html").read_text("utf-8") for v in twins),
          [v["slug"] for v in twins][:5])
    nofile = [l for l in pages if not ((DIST / (l.strip("/") or "index")).with_suffix(".html").exists() or (DIST / l.strip("/") / "index.html").exists() or (DIST / l.strip("/")).with_suffix("").exists() or l == "/blog")]
    check("every sitemap address has a built page", not nofile, nofile[:8])
    # there is exactly one sitemap, /sitemap.xml: no per-kind files, robots.txt names only it, and the old per-kind addresses redirect to it
    extra = sorted(f.name for f in DIST.glob("sitemap*.xml") if f.name != "sitemap.xml")
    robots = (DIST / "robots.txt").read_text("utf-8"); redirects = (DIST / "_redirects").read_text("utf-8")
    check("there is exactly one sitemap file", not extra, extra)
    check("robots.txt lists only /sitemap.xml", re.findall(r"^Sitemap:\s*(\S+)", robots, re.M) == ["https://toolzbaba.com/sitemap.xml"], re.findall(r"^Sitemap:\s*(\S+)", robots, re.M))
    check("the old per-kind sitemap addresses redirect to /sitemap.xml", all(re.search(rf"^/sitemap-{g}\.xml\s+/sitemap\.xml\s+301", redirects, re.M) for g in ("core", "formats", "languages", "saas")))
    check("no alias (redirect) address is in the sitemap", not [a for a in aliases if f"/{a}" in pages], [a for a in aliases if f"/{a}" in pages][:5])
    check("redirects file maps every alias", all(re.search(rf"^/{re.escape(a)}\s", (DIST / "_redirects").read_text("utf-8"), re.M) for a in aliases))

    # the report-only Content-Security-Policy must name every inline script of every built page, or the reports would be noise
    import base64
    import hashlib
    headers = (DIST / "_headers").read_text("utf-8")
    csp = next((l for l in headers.splitlines() if "Content-Security-Policy-Report-Only:" in l), "")
    hashes = set()
    for f in DIST.rglob("*.html"):
        for m in re.finditer(r"<script(?![^>]*\bsrc=)((?:\s[^>]*)?)>(.*?)</script>", f.read_text("utf-8"), re.S | re.I):
            if "ld+json" not in m.group(1):
                hashes.add("'sha256-" + base64.b64encode(hashlib.sha256(m.group(2).encode("utf-8")).digest()).decode() + "'")
    check("CSP report-only header is set and lists every inline script", bool(csp) and "{" not in csp and all(h in csp for h in hashes) and len(hashes) > 0, (len(hashes), [h for h in hashes if h not in csp][:3]))
    check("CSP reports go to this site's own endpoint", "report-uri /api/csp-report" in csp and 'Reporting-Endpoints: csp="/api/csp-report"' in headers)
    check("the admin page keeps its enforced policy", "Content-Security-Policy: default-src 'self'" in headers)

    # robots: plain rules, the sitemap named, nothing public blocked
    robots = (DIST / "robots.txt").read_text("utf-8")
    check("robots.txt names the sitemap and blocks only private paths", "Sitemap: " in robots and "Disallow: /api/" in robots and not re.search(r"^Disallow: /\s*$", robots, re.M))
    print(f"\n{'All build checks passed' if not FAILS else str(len(FAILS)) + ' check(s) failed: ' + ', '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
