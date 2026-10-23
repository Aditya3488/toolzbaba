"""Wikidata, through its open SPARQL endpoint (no key, no charge).

Asking for "Indian companies whose industry is software" returns only a couple of
hundred items, because most Wikidata company entries never get an industry set.
Asking instead for "businesses headquartered in a place in India that have an
official website" returns about ten times as many, and the homepage probe later
decides which of them actually sell software. Recall first, filtering second.

Two queries, because they catch different gaps: one by headquarters (the big one)
and one by industry (which picks up companies whose HQ is recorded only as the
country). Results are merged on the Wikidata item id.
"""
import re
import urllib.parse

from .. import net

ENDPOINT = "https://query.wikidata.org/sparql"

# business-shaped things: business, company, enterprise, public company, startup
BUSINESS_TYPES = "wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q167037 wd:Q786820 wd:Q3002509"
# software, internet, software industry, computing, IT, SaaS, telecoms, electronics
INDUSTRIES = ("wd:Q880371 wd:Q1058754 wd:Q11661 wd:Q3966 wd:Q2143354 wd:Q1254596 "
              "wd:Q638608 wd:Q131093 wd:Q484847 wd:Q43015 wd:Q2142286 wd:Q192283")

FIELDS = """
  OPTIONAL { ?c wdt:P571 ?inception }
  OPTIONAL { ?c wdt:P159 ?hq }
  OPTIONAL { ?c wdt:P1128 ?employees }
  OPTIONAL { ?c wdt:P452 ?industry }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
"""

# the broad one: anything business-shaped with an Indian headquarters and a website
BY_HQ = f"""
SELECT ?c ?cLabel ?inception ?website ?hqLabel ?employees ?industryLabel WHERE {{
  ?c wdt:P159 ?place ; wdt:P856 ?website ; wdt:P31 ?type .
  ?place wdt:P17 wd:Q668 .
  VALUES ?type {{ {BUSINESS_TYPES} }}
  {FIELDS}
}}
"""

# the narrow one: country India plus a technology industry, for entries with no HQ city
BY_INDUSTRY = f"""
SELECT ?c ?cLabel ?inception ?website ?hqLabel ?employees ?industryLabel WHERE {{
  ?c wdt:P17 wd:Q668 ; wdt:P856 ?website ; wdt:P452 ?ind .
  VALUES ?ind {{ {INDUSTRIES} }}
  {FIELDS}
}}
"""


def _v(b, k):
    return (b.get(k) or {}).get("value") or ""


def _collect(query: str, into: dict):
    url = ENDPOINT + "?query=" + urllib.parse.quote(query)
    d = net.get_json(url, headers={"Accept": "application/sparql-results+json"}, timeout=120)
    if not d:
        return
    for b in d.get("results", {}).get("bindings", []):
        qid = _v(b, "c").rsplit("/", 1)[-1]
        name, hq = _v(b, "cLabel").strip(), _v(b, "hqLabel").strip()
        if not name or name == qid:          # an unlabelled item is no use to a reader
            continue
        rec = into.setdefault(qid, {
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


def fetch() -> list[dict]:
    merged: dict[str, dict] = {}
    for q in (BY_HQ, BY_INDUSTRY):
        _collect(q, merged)
    return list(merged.values())
