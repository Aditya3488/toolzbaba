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
    # by industry
    "Category:Software companies of India",
    "Category:Internet companies of India",
    "Category:Information technology companies of India",
    "Category:Financial technology companies of India",
    "Category:E-commerce companies of India",
    "Category:Online companies of India",
    "Category:Technology companies of India",
    "Category:Mobile phone companies of India",
    "Category:Educational technology companies of India",
    "Category:Health care companies of India",
    "Category:Logistics companies of India",
    "Category:Indian companies by industry",
    # by city: where the companies themselves are, which catches anything the
    # industry categories missed
    "Category:Companies based in Bangalore",
    "Category:Companies based in Mumbai",
    "Category:Companies based in Delhi",
    "Category:Companies based in Pune",
    "Category:Companies based in Hyderabad",
    "Category:Companies based in Chennai",
    "Category:Companies based in Gurugram",
    "Category:Companies based in Noida",
    "Category:Companies based in Ahmedabad",
    "Category:Companies based in Kolkata",
    "Category:Companies based in Jaipur",
    "Category:Companies based in Kochi",
    # by era: the startup wave this directory is mostly about
    "Category:Indian companies established in 2010",
    "Category:Indian companies established in 2011",
    "Category:Indian companies established in 2012",
    "Category:Indian companies established in 2013",
    "Category:Indian companies established in 2014",
    "Category:Indian companies established in 2015",
    "Category:Indian companies established in 2016",
    "Category:Indian companies established in 2017",
    "Category:Indian companies established in 2018",
    "Category:Indian companies established in 2019",
    "Category:Indian companies established in 2020",
    "Category:Indian companies established in 2021",
    "Category:Indian companies established in 2022",
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
