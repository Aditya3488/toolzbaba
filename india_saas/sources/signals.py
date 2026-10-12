"""Three more free signals, one request each, all keyless.

- Wayback Machine: when the domain first appeared on the web. A far better age
  than a "founded" year, because it is the date the product went public.
- Hacker News (Algolia's open search index): how often the company is discussed,
  which is the cheapest honest proxy for developer mindshare there is.
- GitHub: whether the company publishes code, and how much attention it gets.
"""
import re
import urllib.parse

from .. import net

CDX = "http://web.archive.org/cdx/search/cdx"
HN = "https://hn.algolia.com/api/v1/search"
GH = "https://api.github.com"


def first_seen(domain: str) -> str:
    """The earliest year the Wayback Machine holds a capture of this domain."""
    if not domain:
        return ""
    q = urllib.parse.urlencode({"url": domain, "output": "json", "limit": "1",
                                "fl": "timestamp", "filter": "statuscode:200", "collapse": "timestamp:4"})
    d = net.get_json(f"{CDX}?{q}", timeout=20)
    if not d or len(d) < 2:
        return ""
    stamp = str(d[1][0])
    return stamp[:4] if re.fullmatch(r"\d{14}", stamp) else ""


def hn_mentions(name: str, domain: str) -> dict:
    """Story count and best score for the company on Hacker News."""
    out = {"stories": 0, "top_points": 0, "top_title": "", "top_url": ""}
    term = domain or name
    if not term:
        return out
    q = urllib.parse.urlencode({"query": term, "tags": "story", "hitsPerPage": "50"})
    d = net.get_json(f"{HN}?{q}", timeout=20)
    if not d:
        return out
    low_name = name.lower()
    hits = [h for h in d.get("hits", [])
            if (domain and domain in ((h.get("url") or "") + " " + (h.get("title") or "").lower()))
            or (low_name and low_name in (h.get("title") or "").lower())]
    out["stories"] = len(hits)
    best = max(hits, key=lambda h: h.get("points") or 0, default=None)
    if best:
        out["top_points"] = best.get("points") or 0
        out["top_title"] = (best.get("title") or "")[:160]
        out["top_url"] = f"https://news.ycombinator.com/item?id={best.get('objectID')}"
    return out


def github_org(handle: str) -> dict:
    """Public repo count and total stars for a GitHub org or user handle.

    Unauthenticated GitHub allows 60 requests an hour, which the disk cache makes
    ample: set GITHUB_TOKEN (a free personal token) only if you re-run often.
    """
    out = {"handle": "", "repos": 0, "stars": 0, "url": ""}
    if not handle:
        return out
    import os
    hdr = {"Accept": "application/vnd.github+json"}
    tok = os.environ.get("GITHUB_TOKEN", "").strip()
    if tok:
        hdr["Authorization"] = "Bearer " + tok
    repos = net.get_json(f"{GH}/users/{urllib.parse.quote(handle)}/repos?per_page=100&sort=stars",
                         headers=hdr, timeout=20)
    if not isinstance(repos, list):
        return out
    out["handle"] = handle
    out["repos"] = len(repos)
    out["stars"] = sum(r.get("stargazers_count") or 0 for r in repos)
    out["url"] = f"https://github.com/{handle}"
    return out
