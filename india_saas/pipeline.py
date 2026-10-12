"""Run the whole thing: free sources in, companies.json out.

    python -m india_saas.pipeline            # full run (uses the disk cache)
    python -m india_saas.pipeline --limit 40 # a quick slice while developing
    python -m india_saas.pipeline --fresh    # ignore the cache and refetch

Every request is cached under data/cache, so a second run costs almost nothing
and a run interrupted halfway picks up where it stopped. The first full run takes
roughly twenty minutes, nearly all of it waiting politely between requests.
"""
import argparse
import concurrent.futures
import json
import os
import sys
import time
from pathlib import Path

from . import resolve, score as scoring, taxonomy, verify
from .sources import probe as probe_mod, signals, wikidata, wikipedia, yc

DATA = Path(__file__).parent / "data"
OUT = DATA / "companies.json"

# how many companies to enrich at once (override with SAAS_WORKERS)
WORKERS = int(os.environ.get("SAAS_WORKERS", "12"))


def _text_of(c: dict) -> str:
    """Everything the company says about itself, for the classifier to read."""
    p = c.get("probe") or {}
    return " ".join(str(x) for x in [
        c.get("name", ""), c.get("desc", ""), c.get("long_desc", ""),
        " ".join(c.get("tags") or []), p.get("title", ""), p.get("meta_desc", ""),
    ])


def collect() -> list[dict]:
    batches = []
    for name, mod in (("ycombinator", yc), ("wikidata", wikidata), ("wikipedia", wikipedia)):
        t = time.time()
        try:
            rows = mod.fetch()
        except Exception as e:                     # one dead source must not lose the others
            print(f"  ! {name} failed: {e}", file=sys.stderr)
            rows = []
        print(f"  {name:12s} {len(rows):4d} rows  ({time.time() - t:.1f}s)")
        batches.append(rows)
    return batches


def enrich(c: dict):
    """Attach the live signals for one company: homepage, archive, HN, GitHub."""
    domain = c["domain"]
    c["probe"] = probe_mod.probe(domain)
    c["first_seen"] = signals.first_seen(domain)
    c["hn"] = signals.hn_mentions(c["name"], domain)
    # GitHub only when the homepage links to one, and only when the handle looks like
    # it belongs to this company (see verify.github_handle for why that check exists)
    handle = verify.github_handle((c["probe"].get("social") or {}).get("github", ""), c["name"], domain)
    c["github"] = signals.github_org(handle) if handle else {"handle": "", "repos": 0, "stars": 0, "url": ""}
    c["city"] = verify.clean_city(c.get("city") or "")
    year, why = verify.founded_year(c)
    c["age_year"], c["age_source"] = year, why


def publishable(c: dict) -> tuple[bool, str]:
    """Whether this company earns a page, and why not when it does not."""
    return verify.is_software_business(c)


def run(limit: int | None = None, fresh: bool = False) -> dict:
    if fresh:
        os.environ["SAAS_CACHE_TTL"] = "0"

    print("1. collecting from free sources")
    batches = collect()

    print("2. resolving to one company per domain")
    companies, drops = resolve.resolve(batches)
    for reason, n in sorted(drops.items(), key=lambda kv: -kv[1]):
        print(f"  dropped {n:4d}  {reason}")
    print(f"  {len(companies)} companies with a website")

    if limit:
        companies = companies[:limit]
    # Enriched in parallel: each company talks to a different homepage, and net.py
    # still holds one-request-at-a-time per host for the shared sources (the archive,
    # Hacker News, GitHub). Done one at a time this takes hours, because a few hundred
    # of these domains are dead and every one of them is a timeout.
    print(f"3. reading live signals for {len(companies)} companies ({WORKERS} at a time, cached)")
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(enrich, c): c for c in companies}
        for f in concurrent.futures.as_completed(futures):
            done += 1
            try:
                f.result()
            except Exception as e:                 # one bad site must not end the run
                c = futures[f]
                print(f"  ! {c['domain']}: {e}", file=sys.stderr)
                c.setdefault("probe", {"live": False})
            if done % 50 == 0 or done == len(companies):
                print(f"  {done}/{len(companies)}")

    print("4. classifying and scoring")
    kept: list[dict] = []
    held: dict[str, int] = {}
    for c in companies:
        best, ranked, sector_scores = taxonomy.classify(_text_of(c))
        c["sector"] = best
        c["sectors"] = ranked[:3]
        c["sector_scores"] = sector_scores
        ok, why = publishable(c)        # needs the sector, so it runs after classifying
        if not ok:
            held[why] = held.get(why, 0) + 1
            continue
        c["score"] = scoring.score(c)
        c["band"] = scoring.band(c["score"]["total"])
        # the one-line description a reader sees, best available
        c["summary"] = (c.get("desc") or (c.get("probe") or {}).get("meta_desc")
                        or (c.get("probe") or {}).get("title") or "")[:240]
        kept.append(c)
    kept.sort(key=lambda x: (-x["score"]["total"], x["name"].lower()))
    for why, n in sorted(held.items(), key=lambda kv: -kv[1]):
        print(f"  held back {n:4d}  {why}")
    print(f"  {len(kept)} published of {len(companies)} checked")

    payload = {
        "generated": time.strftime("%Y-%m-%d", time.gmtime()),
        "count": len(kept),
        # published against checked, and why the rest were left out: a reader deserves
        # to know where the edge of the coverage is
        "checked": len(companies),
        "held_back": dict(sorted(held.items(), key=lambda kv: -kv[1])),
        "sectors": taxonomy.ALL,
        "sources": [
            {"name": "Y Combinator company directory", "url": "https://api.ycombinator.com/v0.1/companies",
             "what": "Indian YC-backed companies: batch, team size, status, industry tags"},
            {"name": "Wikidata", "url": "https://query.wikidata.org/",
             "what": "Indian software and internet companies: inception, website, headquarters"},
            {"name": "Wikipedia", "url": "https://en.wikipedia.org/w/api.php",
             "what": "editor-curated category lists of Indian software companies"},
            {"name": "Company homepages", "url": "",
             "what": "the product signals: pricing, docs, login, stack, social links"},
            {"name": "Wayback Machine", "url": "https://web.archive.org/",
             "what": "the year each domain first appeared on the web"},
            {"name": "Hacker News (Algolia index)", "url": "https://hn.algolia.com/api",
             "what": "how often each company is discussed"},
            {"name": "GitHub REST API", "url": "https://api.github.com",
             "what": "public repositories and stars, when a company links to an organisation"},
        ],
        "companies": kept,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"5. wrote {OUT.relative_to(Path(__file__).parent.parent)} ({OUT.stat().st_size // 1024} KB)")
    return payload


def main():
    ap = argparse.ArgumentParser(description="Build the India SaaS company database from free sources.")
    ap.add_argument("--limit", type=int, help="only enrich the first N companies (for a quick run)")
    ap.add_argument("--fresh", action="store_true", help="ignore the disk cache")
    a = ap.parse_args()
    run(limit=a.limit, fresh=a.fresh)


if __name__ == "__main__":
    main()
