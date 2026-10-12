"""Entity resolution: turn several lists of rows into one list of companies.

This is the unglamorous half of the job and the half that decides whether the
database is any good. The same company arrives from Y Combinator, Wikidata and
Wikipedia under three slightly different names, and the only identifier they
agree on is the domain. So: find each row a domain, key on it, and merge.

Rows that cannot be made into a company (encyclopaedia articles about lawsuits,
industry overviews, companies with no website) are dropped here, with a reason.
"""
import re
import urllib.parse

from . import net
from .sources.probe import domain_of

SPARQL = "https://query.wikidata.org/sparql"

# Wikipedia categories carry articles that are not companies at all
NOT_A_COMPANY = re.compile(
    r"\b(case|controversy|scandal|lawsuit|acquisition of|list of|history of|timeline|"
    r"industry in|economy of|category|protests?|strike|layoffs?|merger|ipo of)\b", re.I)
# a disambiguation-style or overly generic title is no use as a company page
GENERIC = {"big tech", "software industry", "information technology", "startup", "unicorn"}

# these are global companies that Wikidata records as Indian because of a subsidiary
NOT_INDIAN = {"surveymonkey.com", "ibm.com", "microsoft.com", "oracle.com", "sap.com",
              "accenture.com", "capgemini.com", "cognizant.com", "deloitte.com", "google.com",
              "amazon.com", "salesforce.com", "adobe.com", "dell.com", "hp.com", "cisco.com"}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)[:60] or "company"


def norm_name(name: str) -> str:
    """A name reduced far enough that the same company matches across sources."""
    s = (name or "").lower()
    s = re.sub(r"\(.*?\)", " ", s)                       # "Zoho (company)"
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(pvt|private|ltd|limited|inc|incorporated|llp|technologies|technology|"
               r"software|solutions|systems|labs|india|corp|company|co|the)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def websites_for(qids: list[str]) -> dict[str, str]:
    """Ask Wikidata for the official website of a batch of items (one request per 150)."""
    out: dict[str, str] = {}
    qids = [q for q in qids if re.fullmatch(r"Q\d+", q or "")]
    for i in range(0, len(qids), 150):
        values = " ".join("wd:" + q for q in qids[i:i + 150])
        q = f"SELECT ?c ?website WHERE {{ VALUES ?c {{ {values} }} ?c wdt:P856 ?website }}"
        d = net.get_json(SPARQL + "?query=" + urllib.parse.quote(q),
                         headers={"Accept": "application/sparql-results+json"}, timeout=90)
        for b in (d or {}).get("results", {}).get("bindings", []):
            qid = (b.get("c") or {}).get("value", "").rsplit("/", 1)[-1]
            site = (b.get("website") or {}).get("value", "")
            if qid and site:
                out[qid] = site
    return out


def _mergeable(dst: dict, src: dict):
    """Fill gaps in dst from src without ever overwriting something already known."""
    for k, v in src.items():
        if k in ("tags", "sources"):
            continue
        if v in (None, "", []) or dst.get(k) not in (None, "", []):
            continue
        dst[k] = v
    dst["tags"] = sorted({*dst.get("tags", []), *src.get("tags", [])})
    dst["sources"] = sorted({*dst.get("sources", []), *src.get("sources", [])})


def resolve(batches: list[list[dict]]) -> tuple[list[dict], dict[str, int]]:
    """Merge every source into one company list. Returns (companies, drop counts)."""
    rows: list[dict] = [dict(r) for batch in batches for r in batch]
    drops: dict[str, int] = {}

    def drop(reason: str):
        drops[reason] = drops.get(reason, 0) + 1

    # Wikipedia rows have no website; Wikidata knows most of them
    need = [r["wikidata_id"] for r in rows if not r.get("website") and r.get("wikidata_id")]
    sites = websites_for(need) if need else {}
    for r in rows:
        if not r.get("website") and r.get("wikidata_id"):
            r["website"] = sites.get(r["wikidata_id"], "")

    merged: dict[str, dict] = {}
    by_name: dict[str, str] = {}
    for r in rows:
        name = (r.get("name") or "").strip()
        if not name or NOT_A_COMPANY.search(name) or norm_name(name) in GENERIC:
            drop("not a company")
            continue
        domain = domain_of(r.get("website") or "")
        if not domain:
            drop("no website")
            continue
        if domain in NOT_INDIAN:
            drop("global company, not Indian-founded")
            continue

        r["domain"] = domain
        r["sources"] = [r.pop("source", "")] if r.get("source") else []
        key = domain
        nm = norm_name(name)
        if key in merged:
            _mergeable(merged[key], r)
        elif nm and nm in by_name:                 # same company, different domain spelling
            _mergeable(merged[by_name[nm]], r)
        else:
            merged[key] = r
            if nm:
                by_name[nm] = key

    for c in merged.values():
        c["slug"] = slugify(c["name"])
    # a slug collision would overwrite a page, so make the loser unique by domain
    seen: dict[str, dict] = {}
    for c in sorted(merged.values(), key=lambda x: x["name"].lower()):
        if c["slug"] in seen:
            c["slug"] = slugify(c["name"] + "-" + c["domain"].split(".")[0])
        seen[c["slug"]] = c
    return list(seen.values()), drops
