"""Test the India SaaS database: the rules, the scoring and the generated pages.

Runs entirely offline against the committed india_saas/data/companies.json, so it
needs no network and no API key:
    python tests/smoke_india_saas.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from india_saas import pages, resolve, score as scoring, taxonomy, verify  # noqa: E402

RESULTS = []


def check(name, ok, note=""):
    RESULTS.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name.ljust(58) + str(note)[:90])


# ---------------------------------------------------------------- the taxonomy
def test_taxonomy():
    cases = [
        ("Practo: book appointments with doctors, hospital management", "healthtech-saas"),
        ("Razorpay: payment gateway, UPI, lending and banking for business", "fintech-saas"),
        ("Darwinbox: hiring, onboarding, employee engagement software", "hr-recruiting"),
        ("Postman: API platform for developers to build and test", "devtools-infrastructure"),
        ("Freshdesk: helpdesk and ticketing for customer support teams", "customer-support"),
        ("A shop that sells handmade candles by post", "other-saas"),
    ]
    for text, want in cases:
        got, _, _ = taxonomy.classify(text)
        check(f"taxonomy: {text[:34]}", got == want, f"got {got}, wanted {want}")
    check("taxonomy: every sector slug is unique",
          len({s["slug"] for s in taxonomy.ALL}) == len(taxonomy.ALL))
    check("taxonomy: every sector has a name, a description and words",
          all(s["name"] and s["desc"] and (s["words"] or s["slug"] == "other-saas") for s in taxonomy.ALL))


# ------------------------------------------------------------------- the rules
def test_verify():
    # a GitHub link on a homepage is only this company's when it looks like it
    check("verify: keeps a matching GitHub org",
          verify.github_handle("https://github.com/postmanlabs", "Postman", "postman.com") == "postmanlabs")
    check("verify: keeps an exact-name org",
          verify.github_handle("https://github.com/zerodha", "Zerodha", "zerodha.com") == "zerodha")
    check("verify: drops someone else's org",
          verify.github_handle("https://github.com/facebook", "Aerotime", "aerotime.ai") == "")
    check("verify: drops a GitHub site link",
          verify.github_handle("https://github.com/features", "Anything", "anything.com") == "")
    check("verify: drops an empty link", verify.github_handle("", "X", "x.com") == "")

    check("verify: reads a YC batch year", verify.batch_year("W21") == 2021)
    check("verify: reads a one-letter batch", verify.batch_year("S19") == 2019)
    check("verify: ignores a non-batch", verify.batch_year("") is None)

    # a recycled domain must not age a young company
    y, why = verify.founded_year({"yc_batch": "W21", "first_seen": "1996"})
    check("verify: founding year beats a recycled domain", y == 2021 and "older" in why, f"{y} / {why}")
    y, _ = verify.founded_year({"first_seen": "2014"})
    check("verify: falls back to the archive year", y == 2014)
    y, _ = verify.founded_year({})
    check("verify: no year when nothing is known", y is None)

    check("verify: drops a foreign office", verify.clean_city("San Francisco") == "")
    check("verify: keeps an Indian office", verify.clean_city("Bengaluru, Karnataka, India") == "Bengaluru, Karnataka")

    live = {"probe": {"live": True, "saas_points": 9, "services_points": 1, "pages": ["pricing", "docs"]},
            "sector": "sales-crm"}
    check("verify: publishes a clear product company", verify.is_software_business(live)[0])
    check("verify: holds back a dead site", not verify.is_software_business({"probe": {"live": False}})[0])
    check("verify: holds back an unclassifiable company",
          not verify.is_software_business({**live, "sector": "other-saas"})[0])
    check("verify: holds back a services firm",
          not verify.is_software_business({**live, "probe": {**live["probe"], "saas_points": 2,
                                                             "services_points": 9, "pages": []}})[0])
    check("verify: an accelerator overrides the sector test",
          verify.is_software_business({**live, "sector": "other-saas", "yc_batch": "S21"})[0])


# ------------------------------------------------------------- the score
def test_score():
    empty = scoring.score({"probe": {"live": False}})
    check("score: an empty company scores 0", empty["total"] == 0, empty["total"])
    rich = scoring.score({
        "probe": {"live": True, "saas_points": 18, "services_points": 1,
                  "pages": ["pricing", "docs", "signup", "login", "security", "status", "blog", "careers"]},
        "age_year": 2012, "age_source": "incorporation record",
        "github": {"handle": "acme", "repos": 90, "stars": 18000},
        "hn": {"stories": 35, "top_points": 500}, "yc_batch": "S14", "status": "Public", "team_size": 900})
    check("score: a strong company scores high", rich["total"] >= 80, rich["total"])
    check("score: never goes above 100", rich["total"] <= 100, rich["total"])
    check("score: every part stays inside its maximum",
          all(0 <= p["points"] <= p["max"] for p in rich["parts"].values()))
    check("score: every part explains itself", all(p["why"] for p in rich["parts"].values()))
    check("score: the parts add up to 100 possible", sum(p["max"] for p in rich["parts"].values()) == 100)
    check("score: bands read in order",
          [scoring.band(n) for n in (10, 40, 60, 85)] == ["Thin evidence", "Early", "Growing", "Established"])


# ------------------------------------------------------- entity resolution
def test_resolve():
    a = [{"name": "Zoho Corporation", "website": "https://www.zoho.com/", "source": "wikipedia", "tags": ["CRM"]}]
    b = [{"name": "Zoho", "website": "http://zoho.com", "source": "wikidata", "founded": "1996", "tags": ["SaaS"]}]
    cos, drops = resolve.resolve([a, b])
    check("resolve: the same domain merges into one company", len(cos) == 1, [c["name"] for c in cos])
    if cos:
        check("resolve: the merge keeps both sources", set(cos[0]["sources"]) == {"wikipedia", "wikidata"})
        check("resolve: the merge keeps both tags", set(cos[0]["tags"]) == {"CRM", "SaaS"})
        check("resolve: the merge fills the missing founding year", cos[0].get("founded") == "1996")
        check("resolve: www is stripped from the domain", cos[0]["domain"] == "zoho.com")

    junk = [{"name": "2026 TCS Nashik workplace harassment case", "website": "https://x.in", "source": "wikipedia"},
            {"name": "List of Indian IT companies", "website": "https://y.in", "source": "wikipedia"},
            {"name": "No Website Co", "website": "", "source": "wikipedia"},
            {"name": "SurveyMonkey", "website": "https://surveymonkey.com", "source": "wikidata"}]
    cos2, drops2 = resolve.resolve([junk])
    check("resolve: encyclopaedia noise is dropped", len(cos2) == 0, [c["name"] for c in cos2])
    check("resolve: each drop is counted with a reason", sum(drops2.values()) == 4, drops2)
    check("resolve: slugs are safe for a URL",
          all(re.fullmatch(r"[a-z0-9-]+", resolve.slugify(n)) for n in
              ("Zoho Corp.", "63 Moons Technologies", "AlgoSurg Inc", "Thé Café & Co")))


# ---------------------------------------------------------- the built pages
def test_pages():
    payload = pages.load()
    if not payload:
        check("pages: companies.json is present", False, "run python -m india_saas.pipeline first")
        return
    cos = payload["companies"]
    check("pages: the database has companies", len(cos) > 0, len(cos))
    check("pages: the count matches the list", payload["count"] == len(cos))
    check("pages: every company has a unique slug", len({c["slug"] for c in cos}) == len(cos))
    check("pages: no slug collides with a sub-path", not ({c["slug"] for c in cos} & pages.RESERVED_SLUGS))
    check("pages: every company has a known sector",
          all(c["sector"] in taxonomy.BY_SLUG for c in cos))
    check("pages: every company has a domain and a score",
          all(c.get("domain") and isinstance(c.get("score", {}).get("total"), int) for c in cos))
    check("pages: the list is sorted by score",
          all(cos[i]["score"]["total"] >= cos[i + 1]["score"]["total"] for i in range(len(cos) - 1)))
    check("pages: no company kept a non-Indian office",
          all(not verify.NOT_INDIAN_PLACE.search(c.get("city") or "") for c in cos),
          [c["city"] for c in cos if verify.NOT_INDIAN_PLACE.search(c.get("city") or "")][:3])
    check("pages: tags are not duplicated",
          all(len(c.get("tags") or []) == len(set(c.get("tags") or [])) for c in cos))

    built = list(pages.all_pages(payload))
    check("pages: one page per company, sector and index",
          len(built) == len(cos) + len({c["sector"] for c in cos}) + 1, len(built))
    paths = [p for p, _, _, _, _, _ in built]
    check("pages: no two pages write the same file", len(set(paths)) == len(paths))

    for rel, url, title, desc, body, ld in built:
        if not (title and desc and body):
            check(f"pages: {rel} is complete", False, "empty title, description or body")
            return
        if len(desc) > 300:
            check(f"pages: {rel} description is short enough", False, len(desc))
            return
        if "{SITE_URL}" in body:
            check(f"pages: {rel} has no unresolved placeholder", False)
            return
    check(f"pages: all {len(built)} pages have a title, a description and a body", True)
    check("pages: every page carries structured data", all(ld for _, _, _, _, _, ld in built))

    body = next(b for r, _, _, _, b, _ in built if r == "india-saas-startups.html")
    check("pages: the index links to a sector", "/india-saas-startups/sector/" in body)
    check("pages: the index names its sources", "Wayback" in body and "Hacker News" in body)
    check("pages: the index says funding is left out", "Funding and valuation are deliberately left out" in body)

    one = next(b for r, _, _, _, b, _ in built if r.startswith("india-saas-startups/") and "/sector/" not in r)
    check("pages: a company page shows its score breakdown", "out of 100" in one)
    check("pages: a company page shows the evidence column", "Evidence found" in one)


def main():
    print("India SaaS database\n" + "-" * 72)
    test_taxonomy()
    test_verify()
    test_score()
    test_resolve()
    test_pages()
    print("-" * 72)
    bad = RESULTS.count(False)
    print(f"{RESULTS.count(True)}/{len(RESULTS)} passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
