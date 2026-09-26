"""Test the public-site features (SEO pages, downloader login, rate limits, upload cap, admin delete).

Starts its own throw-away servers on other ports with different settings, so your running app is untouched:
    python tests/smoke_web.py
"""
import html as htmllib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = []


def check(name, ok, note=""):
    RESULTS.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name.ljust(58) + str(note)[:90])


def start(port, **env):
    e = {**os.environ, "DATA_DIR": os.path.join(ROOT, "data", f"_test{port}"), **{k: str(v) for k, v in env.items()}}
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--port", str(port), "--log-level", "warning"],
                         cwd=ROOT, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/robots.txt", timeout=1)
            return p
        except Exception:  # noqa: BLE001
            time.sleep(0.5)
    p.kill()
    raise RuntimeError(f"server on {port} did not start")


def req(port, method, path, headers=None, data=None):
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=headers or {})
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
    except (ConnectionError, urllib.error.URLError):
        return 0, {}, b""  # server rejected and hung up while we were still uploading (Windows shows this as a reset)


def multipart(fields, files):
    b = "----t" + str(time.time_ns())
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for name, content in files:
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="files"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
        out.write(content + b"\r\n")
    out.write(f"--{b}--\r\n".encode())
    return out.getvalue(), {"Content-Type": f"multipart/form-data; boundary={b}"}


def tiny_png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


procs = []
try:
    # ------------------------------------------------------------------ 1. SEO + pages (downloader in password mode)
    P = 8801
    procs.append(start(P, SITE_URL="https://toolzbaba.com", SITE_NAME="Toolz Baba", CONTACT_EMAIL="hello@toolzbaba.com",
                       DOWNLOADER_MODE="password", DOWNLOADER_PASSWORD="s3cret-pass", ADMIN_KEY="adminkey123", TRUSTED_PROXY=0))
    tools = json.load(open(os.path.join(ROOT, "static", "assets", "tools.json"), encoding="utf-8"))["tools"]
    slugs = [t["slug"] for t in tools if not t.get("href")]
    titles, bad = set(), []
    for t in tools:
        if t.get("href"):
            continue
        s, h, body = req(P, "GET", "/tool/" + t["slug"])
        html = htmllib.unescape(body.decode())
        m = re.search(r"<title>(.*?)</title>", html)
        if s != 200 or not m or t["name"] not in m.group(1) or "{{" in html or 'rel="canonical" href="https://toolzbaba.com/tool/' + t["slug"] + '"' not in html \
                or "application/ld+json" not in html or "About " + t["name"] not in html:
            bad.append(t["slug"])
        titles.add(m.group(1) if m else "")
    check(f"{len(slugs)} tool pages: title, canonical, JSON-LD, about text", not bad, bad)
    check("every tool page has a unique <title>", len(titles) == len(slugs))
    for path in ("/", "/privacy", "/terms", "/contact", "/takedown", "/report", "/downloader"):
        s, h, body = req(P, "GET", path)
        html = body.decode()
        check(f"page {path} renders (no leftover placeholders)", s == 200 and "{{" not in html and "<!--HEAD-->" not in html)
    s, h, body = req(P, "GET", "/contact")
    check("contact page shows the configured email", b"hello@toolzbaba.com" in body)
    s, h, body = req(P, "GET", "/sitemap.xml")
    check("sitemap lists all tools + legal pages, no downloader (gated)", s == 200 and all(f"/tool/{x}<" in body.decode() for x in slugs)
          and "/privacy<" in body.decode() and "/downloader" not in body.decode(), f"{body.count(b'<url>')} urls")
    s, h, body = req(P, "GET", "/robots.txt")
    check("robots.txt blocks /api/ and /i/, links sitemap", b"Disallow: /api/" in body and b"Disallow: /i/" in body and b"https://toolzbaba.com/sitemap.xml" in body)
    # brand assets: favicon, touch icon, manifest, head links
    s, h, body = req(P, "GET", "/favicon.ico")
    check("favicon.ico has 16/32/48 images", s == 200 and body[:4] == bytes([0, 0, 1, 0]) and int.from_bytes(body[4:6], "little") == 3)
    s, h, body = req(P, "GET", "/apple-touch-icon.png")
    from PIL import Image as _Img
    check("apple-touch-icon.png is a 180x180 PNG", s == 200 and _Img.open(io.BytesIO(body)).size == (180, 180))
    s, h, body = req(P, "GET", "/site.webmanifest")
    man = json.loads(body) if s == 200 else {}
    check("web manifest lists 192/512 + maskable icons", s == 200 and len(man.get("icons", [])) == 3 and man["theme_color"].startswith("#"))
    s, h, body = req(P, "GET", "/")
    html_home = body.decode()
    check("pages link favicon, touch icon, manifest", all(x in html_home for x in ("favicon-32.png", "apple-touch-icon.png", "site.webmanifest")))
    bad_assets = [a for a in ("brand/logo.webp", "brand/logo-dark.webp", "brand/hero-art.webp", "brand/mark-64.png", "og.png") if req(P, "GET", "/assets/" + a)[0] != 200]
    check("logo, dark logo, hero art, mark and OG image are served", not bad_assets, bad_assets)
    s, h, body = req(P, "GET", "/downloader")
    check("gated downloader page is noindex", b"noindex" in body)
    s, h, body = req(P, "GET", "/tool/does-not-exist", {"Accept": "text/html"})
    check("unknown tool -> 404 page", s == 404 and b"Page not found" in body)
    s, h, body = req(P, "GET", "/docs")
    check("API docs are not public", s == 404)
    s, h, body = req(P, "GET", "/")
    check("security headers present", h.get("X-Content-Type-Options") == "nosniff" and h.get("Referrer-Policy") and h.get("X-Frame-Options"))

    # ------------------------------------------------------------------ 2. downloader login gate
    s, h, body = req(P, "GET", "/api/config")
    check("config says downloader needs login", json.loads(body)["downloader"] == "login")
    s, *_ = req(P, "GET", "/api/info?url=https%3A%2F%2Fexample.com")
    check("downloader API locked without login (401)", s == 401)
    s, *_ = req(P, "POST", "/api/jobs", {"Content-Type": "application/json"}, json.dumps({"url": "https://example.com"}).encode())
    check("downloader job API locked without login (401)", s == 401)
    s, *_ = req(P, "POST", "/api/auth", {"Content-Type": "application/json"}, json.dumps({"password": "wrong"}).encode())
    check("wrong password rejected (401)", s == 401)
    s, h, body = req(P, "POST", "/api/auth", {"Content-Type": "application/json"}, json.dumps({"password": "s3cret-pass"}).encode())
    cookie = (h.get("Set-Cookie") or "")
    check("correct password logs in with HttpOnly cookie", s == 200 and "tz_dl=" in cookie and "HttpOnly" in cookie)
    ck = cookie.split(";")[0]
    s, h, body = req(P, "GET", "/api/config", {"Cookie": ck})
    check("config shows logged-in state", json.loads(body)["downloader"] == "ok")
    s, h, body = req(P, "GET", "/api/info?url=http%3A%2F%2Flocalhost%2Fx", {"Cookie": ck})
    check("with cookie the gate opens (private addresses still refused)", s == 400 and b"not allowed" in body, s)
    s, *_ = req(P, "GET", "/api/info?url=https%3A%2F%2Fexample.com", {"Cookie": "tz_dl=9999999999.deadbeef"})
    check("forged cookie rejected", s == 401)

    # ------------------------------------------------------------------ 3. CDN admin delete
    data, hd = multipart({}, [("t.png", tiny_png())])
    s, h, body = req(P, "POST", "/api/cdn", hd, data)
    item = json.loads(body)["items"][0]
    check("CDN upload gives links in every format", s == 200 and set(item["links"]) >= {"jpg", "png", "webp", "avif"})
    s, *_ = req(P, "GET", f"/i/{item['id']}.webp")
    check("CDN link serves the image", s == 200)
    s, *_ = req(P, "DELETE", f"/api/cdn/{item['id']}?token=nope")
    check("delete with wrong token refused (403)", s == 403)
    s, *_ = req(P, "DELETE", f"/api/cdn/{item['id']}", {"X-Admin-Key": "wrong"})
    check("delete with wrong admin key refused (403)", s == 403)
    s, *_ = req(P, "DELETE", f"/api/cdn/{item['id']}", {"X-Admin-Key": "adminkey123"})
    check("admin key can delete any image", s == 200)
    s, *_ = req(P, "GET", f"/i/{item['id']}.webp")
    check("deleted image is gone (404)", s == 404)
    procs.pop().terminate()

    # ------------------------------------------------------------------ 4. downloader off
    P = 8802
    procs.append(start(P, DOWNLOADER_MODE="off"))
    s, h, body = req(P, "GET", "/api/config")
    check("downloader off: config says off", json.loads(body)["downloader"] == "off")
    s, *_ = req(P, "GET", "/downloader", {"Accept": "text/html"})
    check("downloader off: page is 404", s == 404)
    s, *_ = req(P, "GET", "/api/info?url=https%3A%2F%2Fexample.com")
    check("downloader off: API is 404", s == 404)
    s, h, body = req(P, "GET", "/sitemap.xml")
    check("downloader off: not in sitemap", b"/downloader" not in body)
    procs.pop().terminate()

    # ------------------------------------------------------------------ 5. rate limits behind a proxy
    P = 8803
    procs.append(start(P, TRUSTED_PROXY=1, RATE_LIMITS="tool_light=3/3600,cdn_upload=2/3600,auth=3/3600", MAX_UPLOAD_MB=1,
                       DOWNLOADER_MODE="password", DOWNLOADER_PASSWORD="pw"))
    data, hd = multipart({"options": "{}"}, [("a.png", tiny_png())])
    codes = [req(P, "POST", "/api/tools/exif-remover", {**hd, "X-Forwarded-For": "9.9.9.9"}, data)[0] for _ in range(5)]
    check("5 requests from one IP with limit 3/hour -> last two get 429", codes[:3] == [200] * 3 and codes[3:] == [429, 429], codes)
    s, h, body = req(P, "POST", "/api/tools/exif-remover", {**hd, "X-Forwarded-For": "8.8.4.4"}, data)
    check("a different IP is not affected", s == 200)
    s, h, body = req(P, "POST", "/api/tools/exif-remover", {**hd, "CF-Connecting-IP": "7.7.7.7", "X-Forwarded-For": "9.9.9.9"}, data)
    check("Cloudflare header takes priority for the visitor IP", s == 200)
    s, h, body = req(P, "POST", "/api/tools/exif-remover", {**hd, "X-Forwarded-For": "9.9.9.9"}, data)
    check("429 has Retry-After and a friendly message", s == 429 and h.get("Retry-After") and b"try again" in body)
    cdata, chd = multipart({}, [("t.png", tiny_png())])
    codes = [req(P, "POST", "/api/cdn", {**chd, "X-Forwarded-For": "5.5.5.5"}, cdata)[0] for _ in range(3)]
    check("CDN uploads are limited separately (2/hour)", codes[:2] == [200, 200] and codes[2] == 429, codes)
    codes = [req(P, "POST", "/api/auth", {"Content-Type": "application/json", "X-Forwarded-For": "6.6.6.6"}, json.dumps({"password": "x"}).encode())[0] for _ in range(5)]
    check("password guessing is limited (3/hour)", codes[:3] == [401] * 3 and codes[3:] == [429, 429], codes)
    big = b"x" * (2 * 1024 * 1024)
    data2, hd2 = multipart({"options": "{}"}, [("big.png", big)])
    s, h, body = req(P, "POST", "/api/tools/exif-remover", {**hd2, "X-Forwarded-For": "4.4.4.4"}, data2)
    check("oversized request rejected early (413, or connection closed)", s in (413, 0), s)
    procs.pop().terminate()

    # ------------------------------------------------------------------ 6. local visitors are never limited
    P = 8804
    procs.append(start(P, TRUSTED_PROXY=0, RATE_LIMITS="tool_light=2/3600"))
    data, hd = multipart({"options": "{}"}, [("a.png", tiny_png())])
    codes = [req(P, "POST", "/api/tools/exif-remover", hd, data)[0] for _ in range(5)]
    check("loopback (you, testing at home) is exempt from limits", codes == [200] * 5, codes)
    procs.pop().terminate()
finally:
    for p in procs:
        p.terminate()
    import shutil
    for port in (8801, 8802, 8803, 8804):
        shutil.rmtree(os.path.join(ROOT, "data", f"_test{port}"), ignore_errors=True)

print(f"\n{sum(RESULTS)}/{len(RESULTS)} passed")
sys.exit(0 if all(RESULTS) else 1)
