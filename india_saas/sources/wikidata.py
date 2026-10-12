"""Wikidata, through its open SPARQL endpoint (no key, no charge).

We ask for companies whose country is India and whose industry is software,
internet, SaaS, computing or IT, and take the facts Wikidata holds well:
inception date, official website, headquarters and employee count.
"""
import re
import urllib.parse

from .. import net

ENDPOINT = "https://query.wikidata.org/sparql"

# India = Q668. Industries: software (Q880371), internet (Q1058754), software industry
# (Q11661), computing (Q3966), information technology (Q2143354), SaaS (Q1254596).
QUERY = """
SELECT ?c ?cLabel ?inception ?website ?hqLabel ?employees ?industryLabel WHERE {
  ?c wdt:P17 wd:Q668 ; wdt:P452 ?industry .
  VALUES ?industry { wd:Q880371 wd:Q1058754 wd:Q11661 wd:Q3966 wd:Q2143354 wd:Q1254596 }
  OPTIONAL { ?c wdt:P571 ?inception }
  OPTIONAL { ?c wdt:P856 ?website }
  OPTIONAL { ?c wdt:P159 ?hq }
  OPTIONAL { ?c wdt:P1128 ?employees }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
"""


def _v(b, k):
    return (b.get(k) or {}).get("value") or ""


def fetch() -> list[dict]:
    url = ENDPOINT + "?query=" + urllib.parse.quote(QUERY)
    d = net.get_json(url, headers={"Accept": "application/sparql-results+json"}, timeout=90)
    if not d:
        return []
    merged: dict[str, dict] = {}
    for b in d.get("results", {}).get("bindings", []):
        qid = _v(b, "c").rsplit("/", 1)[-1]
        name, hq = _v(b, "cLabel").strip(), _v(b, "hqLabel").strip()
        if not name or name == qid:   # an unlabelled item is no use to a reader
            continue
        rec = merged.setdefault(qid, {
            "name": name, "website": _v(b, "website").strip(), "desc": "", "city": hq,
            "founded": (re.match(r"(\d{4})", _v(b, "inception")) or [None, None])[1],
            "team_size": None, "tags": [], "source": "wikidata",
            "wikidata": f"https://www.wikidata.org/wiki/{qid}",
        })
        emp = _v(b, "employees")
        if emp.isdigit() and not rec["team_size"]:
            rec["team_size"] = int(emp)
        ind = _v(b, "industryLabel").strip()
        if ind and ind not in rec["tags"]:
            rec["tags"].append(ind)
        if not rec["city"] and hq:
            rec["city"] = hq
    return list(merged.values())
