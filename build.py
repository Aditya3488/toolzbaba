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


def head(title: str, desc: str, path: str, jsonld: list | None = None, noindex: bool = False) -> str:
    url = SITE_URL + path
    img = SITE_URL + "/assets/og.png"
    tags = [GTM_HEAD.replace("{id}", GTM_ID)] if GTM_ID else []
    tags += [
        f"<title>{esc(title)}</title>",
        # apply the saved light/dark choice before first paint (no flash)
        "<script>try{var t=localStorage.getItem('tz_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>",
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
    if HEAD_EXTRA:
        tags.append(HEAD_EXTRA)
    return "\n".join(tags)


def render(file: str, *, title: str, desc: str, path: str, jsonld=None, noindex=False, extra: dict | None = None) -> str:
    text = (STATIC / file).read_text("utf-8")
    subs = {"SITE_NAME": SITE_NAME, "SITE_URL": SITE_URL, "CONTACT_EMAIL": CONTACT_EMAIL,
            "UPDATED": time.strftime("%d %B %Y", time.gmtime((STATIC / file).stat().st_mtime)), **(extra or {})}
    text = text.replace("<!--HEAD-->", head(title, desc, path, jsonld, noindex))
    text = text.replace('<script src="/assets/common.js"></script>', f'<script src="/assets/common.js?v={VERSION}"></script>')
    if GTM_ID:
        text = text.replace("<body>", "<body>\n" + GTM_BODY.replace("{id}", GTM_ID), 1)
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", str(v) if k == "SEO" else esc(v))
    return text


def seo_block(tool: dict, tools: list) -> str:
    related = [t for t in tools if t["cat"] == tool["cat"] and t["slug"] != tool["slug"] and not t.get("href")][:8]
    links = "".join(f'<li><a href="/tool/{esc(t["slug"])}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for t in related)
    privacy = ("This tool runs in your browser, so your files never leave your device." if tool["kind"] == "client"
               else "Images you upload are stored so their links keep working. Don't upload anything private.")
    return (f'<h2>About {esc(tool["name"])}</h2><p>{esc(tool.get("about", tool["desc"]))}</p><p>{esc(privacy)}</p>'
            + (f'<h2>Related tools</h2><ul>{links}</ul>' if links else ""))


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

    # one page per tool, served at /tool/<slug>
    for tool in tools:
        if tool.get("href"):
            continue
        slug = tool["slug"]
        cat = next(c for c in data["categories"] if c["id"] == tool["cat"])
        url = f"{SITE_URL}/tool/{slug}"
        ld = [
            {"@context": "https://schema.org", "@type": "WebApplication", "name": tool["name"], "url": url, "description": tool["desc"],
             "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": SITE_NAME, "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 2, "name": cat["name"], "item": SITE_URL + "/"},
                {"@type": "ListItem", "position": 3, "name": tool["name"], "item": url}]},
        ]
        write(f"tool/{slug}.html", render("tool.html", title=f'{tool["name"]} – Free Online Tool | {SITE_NAME}',
                                          desc=f'{tool["desc"]} Free, no sign-up.', path=f"/tool/{slug}", jsonld=ld,
                                          extra={"SEO": seo_block(tool, tools), "TOOL_NAME": tool["name"]}))

    for key, (file, title, desc) in LEGAL.items():
        write(f"{key}.html", render(file, title=f"{title} – {SITE_NAME}", desc=desc.format(site=SITE_NAME), path=f"/{key}"))
    write("404.html", render("404.html", title=f"Page not found – {SITE_NAME}", desc="This page does not exist.", path="/404", noindex=True))

    # robots, sitemap, icons, manifest
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /i/\n\nSitemap: {SITE_URL}/sitemap.xml\n")
    day = time.strftime("%Y-%m-%d", time.gmtime((STATIC / "assets" / "tools.json").stat().st_mtime))
    urls = [("/", "1.0")] + [(f"/tool/{t['slug']}", "0.8") for t in tools if not t.get("href")]
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
    shutil.copyfile(ROOT / "deploy" / "pages" / "_headers", DIST / "_headers")
    shutil.copyfile(ROOT / "deploy" / "pages" / "_redirects", DIST / "_redirects")

    files = [p for p in DIST.rglob("*") if p.is_file()]
    big = [p for p in files if p.stat().st_size > 25 * 1024 * 1024]
    if big:  # Cloudflare Pages refuses files over 25 MiB
        raise SystemExit("Files too large for Cloudflare Pages (max 25 MiB): " + ", ".join(str(p.relative_to(DIST)) for p in big))
    print(f"Built {len(files)} files ({sum(p.stat().st_size for p in files) / 1024 / 1024:.1f} MB) into {DIST}")


if __name__ == "__main__":
    build()
