"""HTML pages (rendered with per-page SEO tags), sitemap/robots, site config API and downloader login."""
import html
import json
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel

import config
import security

STATIC = Path(__file__).parent / "static"
router = APIRouter()
LEGAL = {  # path -> (file, title, description)
    "privacy": ("privacy.html", "Privacy Policy", "How {site} handles your files, data and cookies."),
    "terms": ("terms.html", "Terms of Use", "The rules for using {site}."),
    "contact": ("contact.html", "Contact", "Contact {site} for help, feedback or to report a problem."),
    "takedown": ("takedown.html", "Report Content / Takedown", "Report a hosted image or copyright problem to {site}."),
}
_cache: dict = {"mtime": 0, "data": None}


def tools_data() -> dict:
    f = STATIC / "assets" / "tools.json"
    m = f.stat().st_mtime
    if _cache["mtime"] != m:
        _cache.update(mtime=m, data=json.loads(f.read_text("utf-8")))
    return _cache["data"]


def find_tool(slug: str) -> dict | None:
    return next((t for t in tools_data()["tools"] if t["slug"] == slug and not t.get("href")), None)


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def clip(s: str, n: int = 158) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def head(title: str, desc: str, path: str, jsonld: list | None = None, noindex: bool = False) -> str:
    url = config.SITE_URL + path
    img = config.SITE_URL + "/assets/og.png"
    tags = [
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
        f'<meta property="og:site_name" content="{esc(config.SITE_NAME)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(clip(desc))}">',
        f'<meta property="og:url" content="{esc(url)}">',
        f'<meta property="og:image" content="{esc(img)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{esc(title)}">',
        f'<meta name="twitter:description" content="{esc(clip(desc))}">',
        f'<meta name="twitter:image" content="{esc(img)}">',
        '<link rel="stylesheet" href="/assets/app.css">',
    ]
    for block in jsonld or []:
        tags.append('<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False).replace("</", "<\\/") + "</script>")
    if config.HEAD_EXTRA:
        tags.append(config.HEAD_EXTRA)
    return "\n".join(tags)


def render(file: str, *, title: str, desc: str, path: str, jsonld=None, noindex=False, extra: dict | None = None,
           status: int = 200) -> HTMLResponse:
    text = (STATIC / file).read_text("utf-8")
    subs = {"SITE_NAME": config.SITE_NAME, "SITE_URL": config.SITE_URL, "CONTACT_EMAIL": config.CONTACT_EMAIL,
            "UPDATED": time.strftime("%d %B %Y", time.gmtime((STATIC / file).stat().st_mtime)), **(extra or {})}
    text = text.replace("<!--HEAD-->", head(title, desc, path, jsonld, noindex))
    for k, v in subs.items():
        text = text.replace("{{" + k + "}}", str(v) if k == "SEO" else esc(v))
    return HTMLResponse(text, status_code=status, headers={"Cache-Control": "public, max-age=300"})


def not_found_page() -> HTMLResponse:
    return render("404.html", title=f"Page not found – {config.SITE_NAME}", desc="This page does not exist.", path="/404", noindex=True, status=404)


# ------------------------------------------------------------------ pages
@router.get("/", response_class=HTMLResponse)
def home():
    site = {"@context": "https://schema.org", "@type": "WebSite", "name": config.SITE_NAME, "url": config.SITE_URL + "/"}
    return render("index.html", title=f"{config.SITE_NAME} – {config.TAGLINE}",
                  desc=f"Compress and resize images, edit PDFs, convert video, remove backgrounds with AI and more. {len(tools_data()['tools'])} free online tools, no sign-up. Many run right in your browser.",
                  path="/", jsonld=[site])


@router.get("/downloader", response_class=HTMLResponse)
def downloader_page():
    if config.DOWNLOADER_MODE == "off":
        return not_found_page()
    return render("downloader.html", title=f"Video Downloader – {config.SITE_NAME}",
                  desc="Save video and audio from links you have permission to download. Choose quality, get MP3, or download playlists as a ZIP.",
                  path="/downloader", noindex=config.DOWNLOADER_MODE != "open")


def seo_block(tool: dict, data: dict) -> str:
    related = [t for t in data["tools"] if t["cat"] == tool["cat"] and t["slug"] != tool["slug"] and not t.get("href")][:8]
    links = "".join(f'<li><a href="/tool/{esc(t["slug"])}">{esc(t["name"])}</a> – {esc(t["desc"])}</li>' for t in related)
    privacy = ("This tool runs in your browser, so your files never leave your device." if tool["kind"] == "client"
               else "Files are processed on our server and deleted automatically shortly after.")
    return (f'<h2>About {esc(tool["name"])}</h2><p>{esc(tool.get("about", tool["desc"]))}</p><p>{esc(privacy)}</p>'
            + (f'<h2>Related tools</h2><ul>{links}</ul>' if links else ""))


@router.get("/tool/{slug}", response_class=HTMLResponse)
def tool_page(slug: str):
    tool = find_tool(slug)
    if not tool:
        return not_found_page()
    data = tools_data()
    cat = next(c for c in data["categories"] if c["id"] == tool["cat"])
    url = f"{config.SITE_URL}/tool/{slug}"
    ld = [
        {"@context": "https://schema.org", "@type": "WebApplication", "name": tool["name"], "url": url, "description": tool["desc"],
         "applicationCategory": "MultimediaApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": config.SITE_NAME, "item": config.SITE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": cat["name"], "item": config.SITE_URL + "/"},
            {"@type": "ListItem", "position": 3, "name": tool["name"], "item": url}]},
    ]
    return render("tool.html", title=f'{tool["name"]} – Free Online Tool | {config.SITE_NAME}',
                  desc=f'{tool["desc"]} Free, no sign-up.', path=f"/tool/{slug}", jsonld=ld,
                  extra={"SEO": seo_block(tool, data), "TOOL_NAME": tool["name"]})


def _legal(key):
    file, title, desc = LEGAL[key]

    def view():
        return render(file, title=f"{title} – {config.SITE_NAME}", desc=desc.format(site=config.SITE_NAME), path=f"/{key}")
    return view


for _k in LEGAL:
    router.add_api_route(f"/{_k}", _legal(_k), methods=["GET"], response_class=HTMLResponse)
router.add_api_route("/report", lambda: render("takedown.html", title=f"Report Content – {config.SITE_NAME}", desc="Report a hosted image or copyright problem.", path="/takedown"), methods=["GET"], response_class=HTMLResponse)


# ------------------------------------------------------------------ robots / sitemap / icons
@router.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    return f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /i/\n\nSitemap: {config.SITE_URL}/sitemap.xml\n"


@router.get("/sitemap.xml")
def sitemap():
    data = tools_data()
    day = time.strftime("%Y-%m-%d", time.gmtime((STATIC / "assets" / "tools.json").stat().st_mtime))
    urls = [("/", "1.0")] + [(f"/tool/{t['slug']}", "0.8") for t in data["tools"] if not t.get("href")]
    if config.DOWNLOADER_MODE == "open":
        urls.append(("/downloader", "0.6"))
    urls += [(f"/{k}", "0.3") for k in ("privacy", "terms", "contact")]
    body = "".join(f"<url><loc>{esc(config.SITE_URL + p)}</loc><lastmod>{day}</lastmod><priority>{pr}</priority></url>" for p, pr in urls)
    return Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + body + "</urlset>", media_type="application/xml")


@router.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(STATIC / "assets" / "favicon.ico", media_type="image/x-icon", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/apple-touch-icon.png", include_in_schema=False)
def apple_touch_icon():  # iPhones ask for this exact path
    return FileResponse(STATIC / "assets" / "brand" / "apple-touch-icon.png", media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/site.webmanifest", include_in_schema=False)
def webmanifest():
    icons = [{"src": "/assets/brand/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
             {"src": "/assets/brand/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
             {"src": "/assets/brand/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]
    return JSONResponse({"name": config.SITE_NAME, "short_name": config.SITE_NAME, "description": config.TAGLINE, "start_url": "/",
                         "display": "standalone", "background_color": "#ffffff", "theme_color": "#0a4ff5", "icons": icons},
                        media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=86400"})


# ------------------------------------------------------------------ site config + downloader login
@router.get("/api/config")
def site_config(request: Request):
    return JSONResponse({"siteName": config.SITE_NAME, "tagline": config.TAGLINE, "contactEmail": config.CONTACT_EMAIL,
                         "downloader": security.downloader_state(request)}, headers={"Cache-Control": "no-store"})


class Login(BaseModel):
    password: str = ""


@router.post("/api/auth")
def login(body: Login, request: Request):
    if config.DOWNLOADER_MODE != "password":
        raise HTTPException(404, "No login is needed.")
    if not security.check_password(body.password):
        raise HTTPException(401, "That password is not correct.")
    resp = JSONResponse({"ok": True})
    resp.set_cookie(security.COOKIE, security.make_token(), max_age=security.COOKIE_DAYS * 86400, httponly=True,
                    samesite="lax", secure=security.is_https(request))
    return resp


@router.post("/api/logout")
def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(security.COOKIE)
    return resp
