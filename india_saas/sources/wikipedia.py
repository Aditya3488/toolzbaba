"""English Wikipedia's own category tree, through the open MediaWiki API.

Wikipedia's editors have already done the curation we want: these categories
list Indian software, internet and SaaS companies. We walk them one level deep
and pull each article's short description and official website from Wikidata.
"""
import re
import urllib.parse

from .. import net

API = "https://en.wikipedia.org/w/api.php"
CATEGORIES = [
    "Category:Software companies of India",
    "Category:Internet companies of India",
    "Category:Indian companies by industry",
    "Category:Information technology companies of India",
    "Category:Financial technology companies of India",
    "Category:E-commerce companies of India",
]
SKIP_PREFIX = ("List of", "Big Tech", "Category:", "Template:", "Electronics and")


def _members(title: str, kind: str) -> list[str]:
    q = {"action": "query", "list": "categorymembers", "cmtitle": title, "cmlimit": "500",
         "cmtype": kind, "format": "json"}
    d = net.get_json(API + "?" + urllib.parse.urlencode(q))
    if not d:
        return []
    return [m["title"] for m in d.get("query", {}).get("categorymembers", [])]


def fetch() -> list[dict]:
    titles: set[str] = set()
    for cat in CATEGORIES:
        titles.update(_members(cat, "page"))
        for sub in _members(cat, "subcat")[:12]:   # one level down is enough; deeper drifts off-topic
            titles.update(_members(sub, "page"))
    titles = {t for t in titles if not t.startswith(SKIP_PREFIX)}

    out: list[dict] = []
    batch = sorted(titles)
    for i in range(0, len(batch), 40):   # the API takes 50 titles a call; 40 keeps URLs short
        q = {"action": "query", "prop": "pageprops|description", "ppprop": "wikibase_item",
             "titles": "|".join(batch[i:i + 40]), "format": "json"}
        d = net.get_json(API + "?" + urllib.parse.urlencode(q))
        for page in (d or {}).get("query", {}).get("pages", {}).values():
            # Wikipedia disambiguates in the title ("Hiver (company)"); the company
            # is not called that, and the suffix would show in our page title too
            name = re.sub(r"\s*\((?:company|software|firm|Indian company|organisation|"
                          r"organization|brand|platform|app)\)\s*$", "",
                          (page.get("title") or "").strip(), flags=re.I).strip()
            if not name:
                continue
            out.append({
                "name": name,
                "website": "",   # filled in by the probe step from the name, or by wikidata
                "desc": (page.get("description") or "").strip(),
                "tags": [], "team_size": None, "source": "wikipedia",
                "wikipedia": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(name.replace(" ", "_")),
                "wikidata_id": (page.get("pageprops") or {}).get("wikibase_item", ""),
            })
    return out
