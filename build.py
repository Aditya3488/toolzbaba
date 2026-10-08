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
import zipfile
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
# IndexNow (Bing, Yandex, Seznam, Naver...; DuckDuckGo and Yahoo use Bing): the key is public by design, it only proves the
# site is ours. dist/<key>.txt holds it; deploy/indexnow.py sends the pages changed in a deploy (see deploy.yml).
INDEXNOW_KEY = "4e110bff3a94fab1afdfc96bce4ab6b2"
# "open from Google Drive / Dropbox" under every drop box: public browser keys, restricted to this site's address (see README).
# Leave them empty and the buttons don't show.
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_APP_ID = os.environ.get("GOOGLE_APP_ID", "").strip()   # the Google Cloud project number
DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "").strip()
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
    for f in site_board_files():  # the Python engine the Visual Sitemap Generator runs in the browser
        h.update(f.relative_to(ROOT).as_posix().encode() + b"/" + f.read_bytes())
    return h.hexdigest()[:10]


# Visual Sitemap Generator: the site_board package (pure Python) goes to /assets/site-board/site_board.zip, and the
# visitor's browser runs it with Pyodide (static/assets/tools/site-board-worker.js). Server-only modules stay out.
SITE_BOARD_SKIP = {"api.py", "server.py", "jobs.py", "ui.py", "shots.py", "__main__.py"}


def site_board_files():
    pkg = ROOT / "site_board"
    return [f for f in sorted(pkg.rglob("*")) if f.is_file() and "__pycache__" not in f.parts and f.name not in SITE_BOARD_SKIP
            and (f.suffix == ".py" or f.parent.name == "assets")]


def write_site_board_zip():
    out = DIST / "assets" / "site-board" / "site_board.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in site_board_files():
            info = zipfile.ZipInfo(f.relative_to(ROOT).as_posix(), date_time=(2020, 1, 1, 0, 0, 0))  # same bytes on every build
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes())


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

# ---------------------------------------------------------------- languages
# English lives at the site root; every other language at /<code>/... with the same page addresses (/hi/compress-pdf).
# A language is built only when its translation files are complete (i18n/<code>/strings.json and tools.json, see i18n/README.md).
LANGS = [("en", "English"), ("hi", "हिन्दी"), ("bn", "বাংলা"), ("es", "Español"), ("pt", "Português"), ("id", "Bahasa Indonesia"),
         ("fr", "Français"), ("de", "Deutsch"), ("ru", "Русский"), ("ja", "日本語"), ("tr", "Türkçe"), ("vi", "Tiếng Việt"),
         ("it", "Italiano"), ("ar", "العربية"), ("pl", "Polski")]
RTL = {"ar"}
I18N = ROOT / "i18n"
TOOL_TEXT = ("name", "desc", "about", "title", "metaDesc", "tab", "tabAll", "chip", "dropLabel", "privacy", "privacyTitle", "badge", "steps", "how", "faq")


class Tr:
    """tr("About {0}", name): the phrase in this page's language (English when it has no translation yet)."""
    def __init__(self, ui: dict):
        self.ui = ui

    def __call__(self, s: str, *args) -> str:
        t = self.ui.get(s) or s
        for i, a in enumerate(args):
            t = t.replace("{%d}" % i, str(a))
        return t


def load_lang(code: str):
    """(ui phrases, tool texts) of a language, or None when its files are missing."""
    if code == "en":
        return {}, {}
    try:
        return (json.loads((I18N / code / "strings.json").read_text("utf-8")), json.loads((I18N / code / "tools.json").read_text("utf-8")))
    except FileNotFoundError:
        return None


def translate_tools(data: dict, tl: dict) -> dict:
    """tools.json with the names, descriptions and page texts of one language (English where a text is missing)."""
    out = json.loads(json.dumps(data))
    for t in out["tools"] + out.get("variants", []):
        for f, v in (tl.get(t["slug"]) or {}).items():
            if f in TOOL_TEXT and type(v) is type(t.get(f, v)):
                t[f] = v
    cats = tl.get("_categories") or {}
    for c in out["categories"]:
        c["name"] = cats.get(c["id"], c["name"])
    return out


def tr_html(text: str, tr) -> str:
    """Translates the visible words of a page template (text between tags, and placeholder / aria-label / title / alt),
    leaving scripts, styles and {{PLACEHOLDERS}} alone."""
    parts = re.split(r"(<script[\s\S]*?</script>|<style[\s\S]*?</style>)", text)
    def words(m):
        inner = m.group(1); core = inner.strip()
        if not core or "{{" in core:
            return m.group(0)
        key = core.replace("&middot;", "·").replace("&amp;", "&")
        t = tr(key)
        return m.group(0) if t == key else ">" + inner.replace(core, esc(t).replace("&#x27;", "'")) + "<"
    def attr(m):
        t = tr(m.group(2))
        return m.group(0) if t == m.group(2) else f'{m.group(1)}="{esc(t)}"'
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r">([^<>]*[A-Za-z][^<>]*)<", words, parts[i])
        parts[i] = re.sub(r'\b(placeholder|aria-label|title|alt)="([^"]*[A-Za-z][^"]*)"', attr, parts[i])
    return "".join(parts)


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


def fit_title(title: str) -> str:
    """Google shows about 60-70 characters of a title. A translation often runs longer than its English original, and then
    the end gets cut. When the title is too long and ends with " | Toolz Baba", that ending goes (Google shows the site
    name next to the result anyway), so the tool name and keywords stay visible. Wide letters (Japanese) count double."""
    import unicodedata
    width = sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in title)
    tail = " | " + SITE_NAME
    return title[: -len(tail)] if width > 70 and title.endswith(tail) else title


def head(title: str, desc: str, path: str, jsonld: list | None = None, noindex: bool = False, trackers: bool = True,
         alts: list | None = None, lang: str = "en") -> str:
    url = SITE_URL + path
    title = fit_title(title)
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
        '<link rel="preload" href="/assets/fonts/ui/inter-latin.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="preload" href="/assets/fonts/ui/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>',
        f'<link rel="stylesheet" href="/assets/app.css?v={VERSION}">',
    ]
    # the same page in the other languages (Google shows each person their own), English as the default
    for code, href in alts or []:
        tags.append(f'<link rel="alternate" hreflang="{code}" href="{esc(href)}">')
    if lang != "en":   # this language's interface phrases, fetched early (common.js reads them)
        tags.append(f'<link rel="preload" href="/assets/i18n/{lang}.json?v={VERSION}" as="fetch" crossorigin>')
    for block in jsonld or []:
        tags.append('<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False).replace("</", "<\\/") + "</script>")
    if HEAD_EXTRA and trackers:
        tags.append(HEAD_EXTRA)
    return "\n".join(tags)


# trackers=False leaves out Tag Manager and HEAD_EXTRA: the admin page runs only the site's own scripts (see _headers)
def render(file: str, *, title: str, desc: str, path: str, jsonld=None, noindex=False, extra: dict | None = None,
           trackers: bool = True, lang: str = "en", tr=None, alts: list | None = None, prefix: str = "") -> str:
    text = (STATIC / file).read_text("utf-8")
    if lang != "en":
        dir_attr = ' dir="rtl"' if lang in RTL else ""
        text = text.replace('<html lang="en">', f'<html lang="{lang}"{dir_attr}>', 1)
        text = tr_html(text, tr).replace('href="/"', f'href="{prefix}/"')
    subs = {"SITE_NAME": SITE_NAME, "SITE_URL": SITE_URL, "CONTACT_EMAIL": CONTACT_EMAIL,
            "UPDATED": time.strftime("%d %B %Y", time.gmtime((STATIC / file).stat().st_mtime)), **(extra or {})}
    text = text.replace("<!--HEAD-->", head(title, desc, path, jsonld, noindex, trackers, alts, lang))
    for js in ("common", "admin"):
        text = text.replace(f'<script src="/assets/{js}.js"></script>', f'<script src="/assets/{js}.js?v={VERSION}"></script>')
    if GTM_ID and trackers:
        text = text.replace("<body>", "<body>\n" + GTM_BODY.replace("{id}", GTM_ID), 1)
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", str(v) if k in RAW_SUBS else esc(v))
    return text


RAW_SUBS = ("SEO", "THEAD")   # these hold HTML made here; every other value is escaped
LOCK_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>')


# the tool's name, short line and badges, in the page itself: they show at once and need no reserved room (common.js adds the icon)
def thead_html(t: dict, tr=Tr({})) -> str:
    client = t.get("kind") == "client"
    badges = [f'<span class="badge ok">{LOCK_SVG}{esc(tr("Runs in your browser"))}</span>' if client else f'<span class="badge ok">{esc(t.get("badge") or tr("Links last 90 days"))}</span>']
    if t.get("cat") == "ai":
        badges.append(f'<span class="badge">{esc(tr("AI powered"))}</span>')
    badges.append(f'<span class="badge">{esc(tr("Free · no sign-up"))}</span>')
    return (f'<div class="ic"></div><div><h1>{esc(t["name"])}</h1><p class="sub">{esc(t["desc"])}</p>'
            f'<div class="badges">{"".join(badges)}</div></div>')


def seo_block(tool: dict, tools: list, variants: list | None = None, tr=Tr({}), P: str = "") -> str:
    base = tool.get("base", tool["slug"])  # a format page (variant) belongs to a base tool
    variants = variants or []
    by_slug = {v["slug"]: v for v in variants}
    base_tool = next(t for t in tools if t["slug"] == base)
    # format pages (PNG / JPEG / JPG / GIF) are siblings; a size page links up to its parent page instead
    sibs = [v for v in variants if v["base"] == base and v.get("group") != "size" and v["slug"] != tool["slug"]]
    fmt = [(P + "/" + v["slug"], v) for v in sibs]
    if tool.get("group") == "size" and tool.get("parent") in by_slug and not any(v["slug"] == tool["parent"] for v in sibs):
        fmt.append((P + "/" + tool["parent"], by_slug[tool["parent"]]))
    if tool.get("base"):
        fmt.append((P + "/" + base, base_tool))
    sizes = [v for v in variants if v.get("group") == "size" and v.get("media") and v.get("media") == tool.get("media") and v["slug"] != tool["slug"]]
    related = [t for t in tools if t["cat"] == tool["cat"] and t["slug"] != base and not t.get("href")][:8]
    links = "".join(f'<li><a href="{esc(u)}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for u, t in fmt)
    links += "".join(f'<li><a href="{P}/{esc(t["slug"])}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for t in related)
    privacy = tool.get("privacy") or (tr("This tool runs in your browser, so your files never leave your device.") if tool["kind"] == "client"
                                       else tr("Images you upload are stored so their links keep working. Don't upload anything private."))
    out = f'<h2>{esc(tr("About {0}", tool["name"]))}</h2><p>{esc(tool.get("about", tool["desc"]))}</p><p>{esc(privacy)}</p>'
    if tool.get("steps"):   # "How to ..." in plain words: what people type into Google
        out += f'<h2>{esc(tr("How to use {0}", tool["name"]))}</h2><ol>' + "".join(f"<li>{esc(s)}</li>" for s in tool["steps"]) + "</ol>"
    if tool.get("faq"):
        out += f"<h2>{esc(tr('Questions'))}</h2>" + "".join(f'<h3>{esc(f["q"])}</h3><p>{esc(f["a"])}</p>' for f in tool["faq"])
    if sizes:
        out += f"<h2>{esc(tr('Other sizes'))}</h2><ul>" + "".join(f'<li><a href="{P}/{esc(v["slug"])}">{esc(v["name"])}</a></li>' for v in sizes) + "</ul>"
    return out + (f'<h2>{esc(tr("Related tools"))}</h2><ul>{links}</ul>' if links else "")


def faq_ld(faq: list) -> dict:
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in faq]}


PAGE_HASH = {}   # "/merge-pdf" -> hash of what the page says (for the sitemap's lastmod)


def write(rel: str, text: str):
    dest = DIST / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, "utf-8")
    if rel.endswith(".html"):  # the build stamp in the file addresses changes with every deploy: it is not "the page changed"
        key = "/" + rel[:-5]
        key = key[:-5] if key.endswith("/index") else key   # /index -> /, /hi/index -> /hi/
        PAGE_HASH[key] = hashlib.sha1(re.sub(r"\?v=[0-9a-f]+", "", text).encode("utf-8")).hexdigest()[:16]


def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC / "assets", DIST / "assets")
    write_site_board_zip()

    data = json.loads((STATIC / "assets" / "tools.json").read_text("utf-8"))
    (DIST / "assets" / "tools.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    (DIST / "assets" / "site.json").write_text(json.dumps(
        {"siteName": SITE_NAME, "tagline": TAGLINE, "contactEmail": CONTACT_EMAIL, "googleApiKey": GOOGLE_API_KEY, "googleClientId": GOOGLE_CLIENT_ID,
         "googleAppId": GOOGLE_APP_ID, "dropboxAppKey": DROPBOX_APP_KEY}), "utf-8")
    tools = data["tools"]

    reserved = set(LEGAL) | {"tool", "assets", "api", "i", "f", "report", "downloader", "index", "404", "robots", "sitemap", "favicon",
                             "functions", "admin", "apple-touch-icon", "site", "blog", "blog-shell"} | {c for c, _ in LANGS}
    variant_slugs = {v["slug"] for v in data.get("variants", [])}
    by_slug = {t["slug"]: t for t in tools}
    for tool in tools:
        if not tool.get("href") and (tool["slug"] in reserved or tool["slug"] in variant_slugs or not re.fullmatch(r"[a-z0-9-]+", tool["slug"])):
            raise SystemExit(f"Tool slug {tool['slug']!r} can't be used as a root address: it clashes with a page or isn't a plain slug")
    for v in data.get("variants", []):
        if v["base"] not in by_slug or v["slug"] in by_slug or v["slug"] in reserved or not re.fullmatch(r"[a-z0-9-]+", v["slug"]):
            raise SystemExit(f"Bad format page {v['slug']!r}: it needs an existing base tool and a free root address")

    built = [(code, name) for code, name in LANGS if load_lang(code) is not None]
    (DIST / "assets" / "langs.json").write_text(json.dumps([{"code": c, "name": n, "rtl": c in RTL} for c, n in built], ensure_ascii=False), "utf-8")
    def alts(path):   # the same page in every built language, and English as the default
        out = [(c, SITE_URL + ("" if c == "en" else "/" + c) + path) for c, _ in built]
        return out + [("x-default", SITE_URL + path)] if len(built) > 1 else []
    for code, _ in built:
        ui, tl = load_lang(code)
        tr, P = Tr(ui), ("" if code == "en" else "/" + code)
        d = data if code == "en" else translate_tools(data, tl)
        ltools, lvariants, lby = d["tools"], d.get("variants", []), {t["slug"]: t for t in d["tools"]}
        if code != "en":   # what the pages of this language load: the tool list in this language, and the interface phrases
            (DIST / "assets" / f"tools.{code}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), "utf-8")
            (DIST / "assets" / "i18n").mkdir(exist_ok=True)
            (DIST / "assets" / "i18n" / f"{code}.json").write_text(json.dumps(ui, ensure_ascii=False, separators=(",", ":")), "utf-8")
        page = lambda file, path, **kw: render(file, path=P + path, lang=code, tr=tr, alts=alts(path), prefix=P, **kw)
        out = lambda rel: (code + "/" + rel) if code != "en" else rel

        # home
        # who runs the site (Google uses it for the brand name and logo in results)
        org = {"@context": "https://schema.org", "@type": "Organization", "@id": SITE_URL + "/#org", "name": SITE_NAME, "alternateName": SITE_NAME.replace(" ", ""),
               "url": SITE_URL + "/", "logo": {"@type": "ImageObject", "url": SITE_URL + "/assets/brand/icon-512.png", "width": 512, "height": 512}}
        site = {"@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "alternateName": SITE_NAME.replace(" ", ""), "url": SITE_URL + P + "/", "inLanguage": code,
                "publisher": {"@id": SITE_URL + "/#org"}}
        write(out("index.html"), page("index.html", "/", title=f"{SITE_NAME} – {tr(TAGLINE)}", jsonld=[org, site],
                                      desc=tr("Compress and resize images, edit PDFs, convert video, remove backgrounds with AI and more. {0} free online tools, no sign-up. They run right in your browser, so your files stay private.", len(tools))))

        # one page per tool, at the site root: /<slug> (old /tool/<slug> links get a permanent redirect, see the end)
        for tool in ltools:
            if tool.get("href"):
                continue
            slug = tool["slug"]
            cat = next(c for c in d["categories"] if c["id"] == tool["cat"])
            url = f"{SITE_URL}{P}/{slug}"
            ld = [
                {"@context": "https://schema.org", "@type": "WebApplication", "name": tool["name"], "url": url, "description": tool["desc"], "inLanguage": code,
                 "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
                 "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
                {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": SITE_NAME, "item": SITE_URL + P + "/"},
                    {"@type": "ListItem", "position": 2, "name": cat["name"], "item": SITE_URL + P + "/#" + cat["id"]},   # the category's section on the home page
                    {"@type": "ListItem", "position": 3, "name": tool["name"], "item": url}]},
            ]
            if tool.get("faq"):
                ld.append(faq_ld(tool["faq"]))
            # "title" and "metaDesc" in tools.json are written for Google; "desc" is the short line under the tool's name on the page
            write(out(f"{slug}.html"), page("tool.html", f"/{slug}", title=tool.get("title") or tr("{0} – Free Online Tool | {1}", tool["name"], SITE_NAME),
                                            desc=tool.get("metaDesc") or tr("{0} Free, no sign-up.", tool["desc"]), jsonld=ld, noindex=bool(tool.get("archived")),
                                            extra={"SEO": seo_block(tool, ltools, lvariants, tr, P), "TOOL_NAME": tool["name"], "THEAD": thead_html(tool, tr)}))

        # format pages (e.g. /compress-png): the same tool as its base, on its own address at the site root
        for v in lvariants:
            slug = v["slug"]
            merged = {**lby[v["base"]], **v}
            merged["steps"] = v.get("steps")   # the base tool's steps can describe a different screen (a size page has no quality slider)
            cat = next(c for c in d["categories"] if c["id"] == merged["cat"])
            url = f"{SITE_URL}{P}/{slug}"
            parent = next((x for x in lvariants if x["slug"] == v.get("parent")), None)
            ld = [
                {"@context": "https://schema.org", "@type": "WebApplication", "name": v["name"], "url": url, "description": v["desc"], "inLanguage": code,
                 "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
                 "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
                {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": SITE_NAME, "item": SITE_URL + P + "/"},
                    {"@type": "ListItem", "position": 2, "name": cat["name"], "item": SITE_URL + P + "/#" + cat["id"]},   # the category's section on the home page
                    {"@type": "ListItem", "position": 3, "name": lby[v["base"]]["name"], "item": f"{SITE_URL}{P}/{v['base']}"},
                    *([{"@type": "ListItem", "position": 4, "name": parent["name"], "item": f"{SITE_URL}{P}/{parent['slug']}"}] if parent else []),
                    {"@type": "ListItem", "position": 5 if parent else 4, "name": v["name"], "item": url}]},
            ]
            if v.get("faq"):
                ld.append(faq_ld(v["faq"]))
            write(out(f"{slug}.html"), page("tool.html", f"/{slug}", title=v.get("title") or tr("{0} – Free Online Tool | {1}", v["name"], SITE_NAME),
                                            desc=v.get("metaDesc") or tr("{0} Free, no sign-up.", v["desc"]), jsonld=ld,
                                            extra={"SEO": seo_block(merged, ltools, lvariants, tr, P), "TOOL_NAME": v["name"], "THEAD": thead_html(merged, tr)}))

    for key, (file, title, desc) in LEGAL.items():
        write(f"{key}.html", render(file, title=f"{title} – {SITE_NAME}", desc=desc.format(site=SITE_NAME), path=f"/{key}"))
    write("admin.html", render("admin.html", title=f"Admin – {SITE_NAME}", desc="Tool admin panel.", path="/admin", noindex=True,
                              trackers=False))
    # the blog's page frame: functions/blog/* fill in each post (title, description, address, content), see lib/blog-store.js
    write("blog-shell.html", render("blog.html", title="%%TITLE%%", desc="%%DESC%%", path="%%PATH%%"))
    write("404.html", render("404.html", title=f"Page not found – {SITE_NAME}", desc="This page does not exist.", path="/404", noindex=True))

    # robots, sitemap, icons, manifest
    write(f"{INDEXNOW_KEY}.txt", INDEXNOW_KEY)
    write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /i/\nDisallow: /admin\nDisallow: /blog-shell\n\nSitemap: {SITE_URL}/sitemap.xml\n")  # blog posts are added to it by functions/sitemap.xml.js
    # archived in tools.json: not offered to search engines (the admin panel's switch works at run time, it cannot change this file)
    dead = {t["slug"] for t in tools if t.get("archived")}
    variants = [v for v in data.get("variants", []) if v["base"] not in dead and not v.get("archived")]
    urls = []
    for code, _ in built:
        P = "" if code == "en" else "/" + code
        urls += [(P + "/", "1.0")] + [(f"{P}/{t['slug']}", "0.8") for t in tools if not t.get("href") and t["slug"] not in dead]
        urls += [(f"{P}/{v['slug']}", "0.5" if v.get("group") == "size" else "0.7") for v in variants]
    urls += [("/blog", "0.6")] + [(f"/{k}", "0.3") for k in ("privacy", "terms", "contact")]   # blog posts are added by functions/sitemap.xml.js
    # lastmod: the day a page's own content last changed (kept in sitemap-dates.json, committed, so every machine agrees). A date that moves on every
    # deploy teaches Google to ignore it; one that only moves when the page changes tells it what to crawl again.
    state_file = ROOT / "sitemap-dates.json"
    try:
        state = json.loads(state_file.read_text("utf-8"))
    except Exception:
        state = {}
    today, fresh = time.strftime("%Y-%m-%d", time.gmtime()), {}
    for path, _ in urls:
        h = PAGE_HASH.get(path, "")
        old = state.get(path) or {}
        fresh[path] = {"hash": h, "date": old["date"] if old.get("hash") == h and old.get("date") else today}
    state_file.write_text(json.dumps(fresh, indent=1, sort_keys=True) + "\n", "utf-8")
    body = "\n".join(f"<url><loc>{esc(SITE_URL + p)}</loc><lastmod>{fresh[p]['date']}</lastmod><priority>{pr}</priority></url>" for p, pr in urls)
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "\n</urlset>\n")
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
        # the blog and the legal pages are in English only: their addresses under a language folder lead there
        f.write("\n# English-only pages\n" + "".join(f"/{c}/blog  /blog  302\n/{c}/blog/*  /blog/:splat  302\n" + "".join(f"/{c}/{k}  /{k}  302\n" for k in LEGAL)
                                                   for c, _ in built if c != "en"))

    files = [p for p in DIST.rglob("*") if p.is_file()]
    big = [p for p in files if p.stat().st_size > 25 * 1024 * 1024]
    if big:  # Cloudflare Pages refuses files over 25 MiB
        raise SystemExit("Files too large for Cloudflare Pages (max 25 MiB): " + ", ".join(str(p.relative_to(DIST)) for p in big))
    print(f"Built {len(files)} files ({sum(p.stat().st_size for p in files) / 1024 / 1024:.1f} MB) into {DIST}")


if __name__ == "__main__":
    build()
