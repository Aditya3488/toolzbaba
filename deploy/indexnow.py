"""Tells IndexNow search engines (Bing, Yandex, Seznam, Naver...; DuckDuckGo and Yahoo use Bing's index) which pages
changed, right after a deploy, instead of waiting for them to crawl. Run by .github/workflows/deploy.yml.

The pages sent are the ones whose <lastmod> in dist/sitemap.xml is today or yesterday (build.py moves a page's date
only when the page itself changes). `python deploy/indexnow.py --all` sends every page.
"""
import datetime, json, re, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEY = re.search(r'INDEXNOW_KEY = "([0-9a-f]+)"', (ROOT / "build.py").read_text("utf-8")).group(1)

xml = (ROOT / "dist" / "sitemap.xml").read_text("utf-8")
pages = re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", xml)
today = datetime.date.today()
recent = {str(today), str(today - datetime.timedelta(days=1))}
urls = [u for u, d in pages if "--all" in sys.argv or d in recent]
if not urls:
    print("IndexNow: no changed pages"); sys.exit(0)
host = re.match(r"https?://([^/]+)", urls[0]).group(1)

# the new deploy must be answering (with the key file) before the search engines come to check it
key_url = f"https://{host}/{KEY}.txt"
for _ in range(12):
    try:
        if urllib.request.urlopen(key_url, timeout=10).read().decode().strip() == KEY: break
    except Exception: pass
    time.sleep(5)

for i in range(0, len(urls), 10000):   # at most 10,000 addresses per request
    body = json.dumps({"host": host, "key": KEY, "keyLocation": key_url, "urlList": urls[i:i + 10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: print(f"IndexNow: {len(urls[i:i + 10000])} pages sent, answer {r.status}")
    except urllib.error.HTTPError as e:
        print(f"IndexNow: answer {e.code} {e.read()[:200]!r}")   # 202 = accepted, key check pending; 403 = key file not found yet
