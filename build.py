"""Build the static site for Cloudflare Pages:  python build.py  ->  dist/

Every page that the Python server used to render (home, one page per tool, legal pages, sitemap, robots...) is
written out as a plain file with the same SEO tags. All tools run in the visitor's browser, so nothing else is needed
apart from the small image-hosting function in functions/ (deployed by Cloudflare Pages automatically).

Settings come from environment variables (set them in Cloudflare Pages > Settings > Environment variables):
SITE_NAME, SITE_URL, CONTACT_EMAIL, SITE_TAGLINE, HEAD_EXTRA (raw HTML added to every <head>, e.g. AdSense tags),
GTM_ID (Google Tag Manager container; set it empty to leave Tag Manager out).
Standard library only, so it runs on Cloudflare's build machines without installing anything.
"""
from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import re
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
DIST = Path(os.environ.get("DIST_DIR", ROOT / "dist"))

SITE_NAME = os.environ.get("SITE_NAME", "Toolz Baba")
SITE_URL = os.environ.get("SITE_URL", "https://toolzbaba.com").rstrip("/")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "hello@toolzbaba.com")
TAGLINE = os.environ.get("SITE_TAGLINE", "Free online image, PDF, video and file tools")
HEAD_EXTRA = os.environ.get("HEAD_EXTRA", "")
GTM_ID = os.environ.get("GTM_ID", "GTM-T3R5TWTD").strip()
if GTM_ID and not re.fullmatch(r"GTM-[A-Z0-9]+", GTM_ID):
    raise SystemExit(f"GTM_ID must look like GTM-XXXXXXX, got {GTM_ID!r}")


# Version stamp for the site's own CSS/JS/data (?v=...), so a new deploy never mixes with files still cached from the
# previous one. Libraries and AI models live in versioned folders/names and are left alone.
def _assets_version() -> str:
    h = hashlib.sha256()
    for f in sorted((STATIC / "assets").rglob("*")):
        rel = f.relative_to(STATIC / "assets").as_posix()
        if f.is_file() and not rel.startswith(("vendor/", "models/")):
            h.update(rel.encode() + b"/" + f.read_bytes())
    return h.hexdigest()[:10]


VERSION = _assets_version()

# applies the saved light/dark choice before first paint (no flash); the admin page's security policy allows it by fingerprint
THEME_SCRIPT = "try{var t=localStorage.getItem('tz_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}"

# Google Tag Manager snippets: the script as high in <head> as possible, the noscript part right after <body>
GTM_HEAD = """<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','{id}');</script>
<!-- End Google Tag Manager -->"""
GTM_BODY = """<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->"""

LEGAL = {  # path -> (file, title, description)
    "privacy": ("privacy.html", "Privacy Policy", "How {site} handles your files, data and cookies."),
    "terms": ("terms.html", "Terms of Use", "The rules for using {site}."),
    "contact": ("contact.html", "Contact", "Contact {site} for help, feedback or to report a problem."),
    "takedown": ("takedown.html", "Report Content / Takedown", "Report a hosted image or copyright problem to {site}."),
}


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def clip(s: str, n: int = 158) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def head(title: str, desc: str, path: str, jsonld: list | None = None, noindex: bool = False, trackers: bool = True) -> str:
    url = SITE_URL + path
    img = SITE_URL + "/assets/og.png"
    tags = [GTM_HEAD.replace("{id}", GTM_ID)] if GTM_ID and trackers else []
    tags += [
        f"<title>{esc(title)}</title>",
        # apply the saved light/dark choice before first paint (no flash)
        f"<script>{THEME_SCRIPT}</script>",
        f'<meta name="description" content="{esc(clip(desc))}">',
        f'<link rel="canonical" href="{esc(url)}">',
        '<meta name="robots" content="noindex,nofollow">' if noindex else '<meta name="robots" content="index,follow,max-image-preview:large">',
        '<link rel="icon" href="/assets/brand/favicon-32.png" type="image/png" sizes="32x32">',
        '<link rel="icon" href="/assets/brand/favicon-16.png" type="image/png" sizes="16x16">',
        '<link rel="shortcut icon" href="/favicon.ico">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<link rel="manifest" href="/site.webmanifest">',
        '<meta name="theme-color" content="#0a4ff5">',
        f'<meta property="og:site_name" content="{esc(SITE_NAME)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(clip(desc))}">',
        f'<meta property="og:url" content="{esc(url)}">',
        f'<meta property="og:image" content="{esc(img)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{esc(title)}">',
        f'<meta name="twitter:description" content="{esc(clip(desc))}">',
        f'<meta name="twitter:image" content="{esc(img)}">',
        f'<link rel="stylesheet" href="/assets/app.css?v={VERSION}">',
    ]
    for block in jsonld or []:
        tags.append('<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False).replace("</", "<\\/") + "</script>")
    if HEAD_EXTRA and trackers:
        tags.append(HEAD_EXTRA)
    return "\n".join(tags)


# trackers=False leaves out Tag Manager and HEAD_EXTRA: the admin page runs only the site's own scripts (see _headers)
def render(file: str, *, title: str, desc: str, path: str, jsonld=None, noindex=False, extra: dict | None = None,
           trackers: bool = True) -> str:
    text = (STATIC / file).read_text("utf-8")
    subs = {"SITE_NAME": SITE_NAME, "SITE_URL": SITE_URL, "CONTACT_EMAIL": CONTACT_EMAIL,
            "UPDATED": time.strftime("%d %B %Y", time.gmtime((STATIC / file).stat().st_mtime)), **(extra or {})}
    text = text.replace("<!--HEAD-->", head(title, desc, path, jsonld, noindex, trackers))
    for js in ("common", "admin"):
        text = text.replace(f'<script src="/assets/{js}.js"></script>', f'<script src="/assets/{js}.js?v={VERSION}"></script>')
    if GTM_ID and trackers:
        text = text.replace("<body>", "<body>\n" + GTM_BODY.replace("{id}", GTM_ID), 1)
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", str(v) if k == "SEO" else esc(v))
    return text


def seo_block(tool: dict, tools: list, variants: list | None = None) -> str:
    base = tool.get("base", tool["slug"])  # a format page (variant) belongs to a base tool
    variants = variants or []
    by_slug = {v["slug"]: v for v in variants}
    base_tool = next(t for t in tools if t["slug"] == base)
    # format pages (PNG / JPEG / JPG / GIF) are siblings; a size page links up to its parent page instead
    sibs = [v for v in variants if v["base"] == base and v.get("group") != "size" and v["slug"] != tool["slug"]]
    fmt = [("/" + v["slug"], v) for v in sibs]
    if tool.get("group") == "size" and tool.get("parent") in by_slug and not any(v["slug"] == tool["parent"] for v in sibs):
        fmt.append(("/" + tool["parent"], by_slug[tool["parent"]]))
    if tool.get("base"):
        fmt.append(("/" + base, base_tool))
    sizes = [v for v in variants if v.get("group") == "size" and v.get("media") and v.get("media") == tool.get("media") and v["slug"] != tool["slug"]]
    related = [t for t in tools if t["cat"] == tool["cat"] and t["slug"] != base and not t.get("href")][:8]
    links = "".join(f'<li><a href="{esc(u)}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for u, t in fmt)
    links += "".join(f'<li><a href="/{esc(t["slug"])}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for t in related)
    privacy = tool.get("privacy") or ("This tool runs in your browser, so your files never leave your device." if tool["kind"] == "client"
                                       else "Images you upload are stored so their links keep working. Don't upload anything private.")
    out = f'<h2>About {esc(tool["name"])}</h2><p>{esc(tool.get("about", tool["desc"]))}</p><p>{esc(privacy)}</p>'
    if tool.get("faq"):
        out += "<h2>Questions</h2>" + "".join(f'<h3>{esc(f["q"])}</h3><p>{esc(f["a"])}</p>' for f in tool["faq"])
    if sizes:
        out += "<h2>Other sizes</h2><ul>" + "".join(f'<li><a href="/{esc(v["slug"])}">{esc(v["name"])}</a></li>' for v in sizes) + "</ul>"
    return out + (f'<h2>Related tools</h2><ul>{links}</ul>' if links else "")


def write(rel: str, text: str):
    dest = DIST / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, "utf-8")


def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC / "assets", DIST / "assets")

    data = json.loads((STATIC / "assets" / "tools.json").read_text("utf-8"))
    (DIST / "assets" / "tools.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    (DIST / "assets" / "site.json").write_text(json.dumps(
        {"siteName": SITE_NAME, "tagline": TAGLINE, "contactEmail": CONTACT_EMAIL}), "utf-8")
    tools = data["tools"]

    # home
    site = {"@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "url": SITE_URL + "/"}
    write("index.html", render("index.html", title=f"{SITE_NAME} – {TAGLINE}",
                               desc=f"Compress and resize images, edit PDFs, convert video, remove backgrounds with AI and more. "
                                    f"{len(tools)} free online tools, no sign-up. They run right in your browser, so your files stay private.",
                               path="/", jsonld=[site]))

    # one page per tool, at the site root: /<slug> (old /tool/<slug> links get a permanent redirect, see the end)
    reserved = set(LEGAL) | {"tool", "assets", "api", "i", "f", "report", "downloader", "index", "404", "robots", "sitemap", "favicon",
                             "functions", "admin", "apple-touch-icon", "site"}
    variant_slugs = {v["slug"] for v in data.get("variants", [])}
    for tool in tools:
        if tool.get("href"):
            continue
        slug = tool["slug"]
        if slug in reserved or slug in variant_slugs or not re.fullmatch(r"[a-z0-9-]+", slug):
            raise SystemExit(f"Tool slug {slug!r} can't be used as a root address: it clashes with a page or isn't a plain slug")
        cat = next(c for c in data["categories"] if c["id"] == tool["cat"])
        url = f"{SITE_URL}/{slug}"
        ld = [
            {"@context": "https://schema.org", "@type": "WebApplication", "name": tool["name"], "url": url, "description": tool["desc"],
             "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": SITE_NAME, "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 2, "name": cat["name"], "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 3, "name": tool["name"], "item": url}]},
        ]
        write(f"{slug}.html", render("tool.html", title=f'{tool["name"]} – Free Online Tool | {SITE_NAME}',
                                    desc=f'{tool["desc"]} Free, no sign-up.', path=f"/{slug}", jsonld=ld, noindex=bool(tool.get("archived")),
                                    extra={"SEO": seo_block(tool, tools, data.get("variants", [])), "TOOL_NAME": tool["name"]}))

    # format pages (e.g. /compress-png): the same tool as its base, on its own address at the site root
    by_slug = {t["slug"]: t for t in tools}
    for v in data.get("variants", []):
        slug = v["slug"]
        if v["base"] not in by_slug or slug in by_slug or slug in reserved or not re.fullmatch(r"[a-z0-9-]+", slug):
            raise SystemExit(f"Bad format page {slug!r}: it needs an existing base tool and a free root address")
        merged = {**by_slug[v["base"]], **v}
        cat = next(c for c in data["categories"] if c["id"] == merged["cat"])
        url = f"{SITE_URL}/{slug}"
        parent = next((x for x in data["variants"] if x["slug"] == v.get("parent")), None)
        ld = [
            {"@context": "https://schema.org", "@type": "WebApplication", "name": v["name"], "url": url, "description": v["desc"],
             "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": SITE_NAME, "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 2, "name": cat["name"], "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 3, "name": by_slug[v["base"]]["name"], "item": f"{SITE_URL}/{v['base']}"},
                *([{"@type": "ListItem", "position": 4, "name": parent["name"], "item": f"{SITE_URL}/{parent['slug']}"}] if parent else []),
                {"@type": "ListItem", "position": 5 if parent else 4, "name": v["name"], "item": url}]},
        ]
        if v.get("faq"):
            ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in v["faq"]]})
        write(f"{slug}.html", render("tool.html", title=v.get("title") or f'{v["name"]} – Free Online Tool | {SITE_NAME}',
                                    desc=f'{v["desc"]} Free, no sign-up.', path=f"/{slug}", jsonld=ld,
                                    extra={"SEO": seo_block(merged, tools, data["variants"]), "TOOL_NAME": v["name"]}))

    for key, (file, title, desc) in LEGAL.items():
        write(f"{key}.html", render(file, title=f"{title} – {SITE_NAME}", desc=desc.format(site=SITE_NAME), path=f"/{key}"))
    write("admin.html", render("admin.html", title=f"Admin – {SITE_NAME}", desc="Tool admin panel.", path="/admin", noindex=True,
                              trackers=False))
    write("404.html", render("404.html", title=f"Page not found – {SITE_NAME}", desc="This page does not exist.", path="/404", noindex=True))

    # robots, sitemap, icons, manifest
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /i/\nDisallow: /admin\n\nSitemap: {SITE_URL}/sitemap.xml\n")
    day = time.strftime("%Y-%m-%d", time.gmtime((STATIC / "assets" / "tools.json").stat().st_mtime))
    # archived in tools.json: not offered to search engines (the admin panel's switch works at run time, it cannot change this file)
    dead = {t["slug"] for t in tools if t.get("archived")}
    urls = [("/", "1.0")] + [(f"/{t['slug']}", "0.8") for t in tools if not t.get("href") and t["slug"] not in dead]
    urls += [(f"/{v['slug']}", "0.7") for v in data.get("variants", []) if v["base"] not in dead and not v.get("archived")]
    urls += [(f"/{k}", "0.3") for k in ("privacy", "terms", "contact")]
    body = "".join(f"<url><loc>{esc(SITE_URL + p)}</loc><lastmod>{day}</lastmod><priority>{pr}</priority></url>" for p, pr in urls)
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + body + "</urlset>")
    shutil.copyfile(STATIC / "assets" / "favicon.ico", DIST / "favicon.ico")
    shutil.copyfile(STATIC / "assets" / "brand" / "apple-touch-icon.png", DIST / "apple-touch-icon.png")
    icons = [{"src": "/assets/brand/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
             {"src": "/assets/brand/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
             {"src": "/assets/brand/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]
    write("site.webmanifest", json.dumps({"name": SITE_NAME, "short_name": SITE_NAME, "description": TAGLINE, "start_url": "/",
                                          "display": "standalone", "background_color": "#ffffff", "theme_color": "#0a4ff5", "icons": icons}))

    # Cloudflare Pages: response headers and redirects
    # the admin page's Content-Security-Policy allows exactly one inline script, by its fingerprint
    theme_hash = "sha256-" + base64.b64encode(hashlib.sha256(THEME_SCRIPT.encode()).digest()).decode()
    (DIST / "_headers").write_text((ROOT / "deploy" / "pages" / "_headers").read_text("utf-8").replace("{THEME_SCRIPT_HASH}", theme_hash), "utf-8")
    shutil.copyfile(ROOT / "deploy" / "pages" / "_redirects", DIST / "_redirects")
    # a renamed tool keeps its old URL(s): "aliases" in tools.json become permanent (301) redirects, so old links and
    # Google's index follow the tool to its new address (old names work both under /tool/ and at the root)
    live = {t["slug"] for t in tools} | {v["slug"] for v in data.get("variants", [])}
    renamed = [(t["slug"], t.get("aliases", [])) for t in tools] + [(v["slug"], v.get("aliases", [])) for v in data.get("variants", [])]
    alias_lines = []
    for target, olds in renamed:
        for old in olds:
            alias_lines.append(f"/tool/{old}  /{target}  301")
            if old not in live:
                alias_lines.append(f"/{old}  /{target}  301")
    with open(DIST / "_redirects", "a", encoding="utf-8") as f:
        f.write("\n# renamed tools (aliases in tools.json)\n" + "\n".join(alias_lines) + "\n")
        # tools used to live at /tool/<slug>: every old link (bookmarks, Google, shared links) moves to /<slug> for good.
        # Rules are read top to bottom, so the renamed tools above win over this catch-all.
        f.write("\n# tools moved from /tool/<slug> to /<slug>\n/tool  /  301\n/tool/  /  301\n/tool/:slug  /:slug  301\n")

    files = [p for p in DIST.rglob("*") if p.is_file()]
    big = [p for p in files if p.stat().st_size > 25 * 1024 * 1024]
    if big:  # Cloudflare Pages refuses files over 25 MiB
        raise SystemExit("Files too large for Cloudflare Pages (max 25 MiB): " + ", ".join(str(p.relative_to(DIST)) for p in big))
    print(f"Built {len(files)} files ({sum(p.stat().st_size for p in files) / 1024 / 1024:.1f} MB) into {DIST}")


if __name__ == "__main__":
    build()
