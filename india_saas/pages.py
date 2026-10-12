"""Turn companies.json into page bodies. build.py wraps these in static/saas.html.

Three kinds of page, the same shape Tracxn uses and for the same reason: one
index that ranks everything, one page per sector, and one page per company. The
company page shows its score broken into its parts, which is the one thing a
paid database will not show you.
"""
import html
import json
from pathlib import Path

from . import score as scoring
from .taxonomy import BY_SLUG

DATA = Path(__file__).parent / "data" / "companies.json"
BASE = "/india-saas-startups"
RESERVED_SLUGS = {"sector", "index", "about", "sources"}


def load() -> dict | None:
    """The generated database, or None when the pipeline has not been run yet."""
    try:
        return json.loads(DATA.read_text("utf-8"))
    except (OSError, ValueError):
        return None


def e(s) -> str:
    return html.escape(str(s or ""), quote=True)


def _bar(points: float, mx: float) -> str:
    pct = 0 if not mx else max(0, min(100, round(100 * points / mx)))
    return f'<span class="bar"><i style="width:{pct}%"></i></span>'


def _stat(value, label) -> str:
    return f'<div class="stat"><b>{e(value)}</b><span>{e(label)}</span></div>'


def _crumb(trail: list[tuple[str, str]]) -> str:
    bits = []
    for name, href in trail:
        bits.append(f'<a href="{e(href)}">{e(name)}</a>' if href else e(name))
    return '<div class="crumb">' + " / ".join(bits) + "</div>"


def _company_rows(companies: list[dict], *, show_sector: bool = True, rank_from: int = 1) -> str:
    head = ("<tr><th>#</th><th>Company</th>" + ("<th>Sector</th>" if show_sector else "")
            + "<th>City</th><th>Stage</th><th class='num'>Score</th><th></th></tr>")
    rows = []
    for i, c in enumerate(companies, rank_from):
        sc = c["score"]["total"]
        sector = f'<td><a href="{BASE}/sector/{e(c["sector"])}">{e(BY_SLUG[c["sector"]]["name"])}</a></td>' if show_sector else ""
        stage = c.get("yc_batch") or (c.get("status") or "").title() or "—"
        rows.append(
            f'<tr><td class="num">{i}</td>'
            f'<td><b><a href="{BASE}/{e(c["slug"])}">{e(c["name"])}</a></b><br>'
            f'<span style="color:var(--faint);font-size:.82rem">{e(c["domain"])}</span></td>'
            f'{sector}<td>{e(c.get("city") or "—")}</td><td>{e(stage)}</td>'
            f'<td class="num"><b>{sc}</b></td><td class="barcell">{_bar(sc, 100)}</td></tr>')
    return f'<div class="scroll"><table>{head}{"".join(rows)}</table></div>'


def _sources_note(payload: dict) -> str:
    items = "".join(
        f'<li><b>{e(s["name"])}</b> — {e(s["what"])}</li>' for s in payload.get("sources", []))
    return (f'<h2 id="sources">Where this data comes from</h2>'
            f'<p>Every figure on this page was built from sources that are free to anyone, with no '
            f'account and no subscription. Nothing here is scraped from a paid database.</p><ul>{items}</ul>')


def _coverage_note(payload: dict) -> str:
    """Say plainly how many companies were examined and why most did not make it."""
    held = payload.get("held_back") or {}
    checked = payload.get("checked") or 0
    if not held or not checked:
        return ""
    rows = "".join(f'<tr><td class="num">{n}</td><td class="wrap">{e(why)}</td></tr>'
                   for why, n in held.items())
    return (f'<h2 id="coverage">What is not here</h2>'
            f'<p>{checked} Indian companies were examined for this edition and '
            f'{payload["count"]} were published. The rest were held back, and here is exactly '
            f'why. A directory that only shows its hits is hiding its error rate.</p>'
            f'<div class="scroll"><table><tr><th>Companies</th><th>Held back because</th></tr>'
            f'{rows}</table></div>'
            f'<p>Two of those reasons are limitations rather than judgements: a site that builds '
            f'itself with JavaScript can look empty to a single page fetch, and a company whose '
            f'homepage avoids plain product words is hard to place in a sector. If a company '
            f'belongs here, <a href="/contact">say so</a>.</p>')


def _method_note() -> str:
    return ('<div class="note"><b>How to read this.</b> The score measures how much <i>public evidence</i> '
            'exists that a company is a real, running SaaS business — not how much it has raised and not '
            'what it is worth. Funding and valuation are deliberately left out, because neither can be '
            'got for free and reliably, and a number you cannot check is worse than no number.</div>')


# --------------------------------------------------------------------- index
def index(payload: dict) -> tuple[str, str, str, list]:
    cos = payload["companies"]
    counts: dict[str, int] = {}
    for c in cos:
        counts[c["sector"]] = counts.get(c["sector"], 0) + 1
    live_sectors = [s for s in payload["sectors"] if counts.get(s["slug"])]

    cards = "".join(
        f'<a class="sec" href="{BASE}/sector/{e(s["slug"])}"><b>{e(s["name"])}</b>'
        f'<span>{e(s["desc"])}</span><em>{counts[s["slug"]]} '
        f'{"company" if counts[s["slug"]] == 1 else "companies"}</em></a>'
        for s in sorted(live_sectors, key=lambda s: -counts[s["slug"]]))

    top = cos[:60]
    median = sorted(c["score"]["total"] for c in cos)[len(cos) // 2] if cos else 0
    yc = sum(1 for c in cos if c.get("yc_batch"))

    body = (
        _crumb([("Toolz Baba", "/"), ("India SaaS Startups", "")])
        + "<h1>India SaaS Startups Database</h1>"
        + f'<p class="meta">{len(cos)} Indian software companies · {len(live_sectors)} sectors · '
          f'rebuilt {e(payload["generated"])}</p>'
        + '<p class="lede">A free, open directory of Indian SaaS and software companies, built entirely '
          'from public sources. Every company is placed in a sector and scored on the public evidence '
          'that it is a real, operating product business. The score is shown broken into its parts on '
          'each profile, so you can check the working.</p>'
        + '<div class="stats">'
        + _stat(len(cos), "companies profiled")
        + _stat(len(live_sectors), "sectors covered")
        + _stat(yc, "Y Combinator backed")
        + _stat(median, "median score")
        + "</div>"
        + _method_note()
        + "<h2>Browse by sector</h2>"
        + f'<div class="sectors">{cards}</div>'
        + f"<h2>Top {len(top)} by score</h2>"
        + '<p>Ranked by the public evidence of a running product business. Open any company for the '
          'full breakdown of how its score was reached.</p>'
        + _company_rows(top)
        + _coverage_note(payload)
        + _sources_note(payload)
        + "<h2>Questions</h2>"
        + "<h3>Is this free?</h3><p>Yes, all of it, with no sign-up. It is built from free public "
          "sources and published as plain pages.</p>"
        + "<h3>How is a company chosen for the list?</h3><p>A company has to appear in at least one "
          "public list of Indian software companies, have a working website, and show on that website "
          "that it sells a software product. Companies whose sites read as IT services or consultancy "
          "score low on product clarity and most are left out.</p>"
        + "<h3>Does it include funding or valuation?</h3><p>No. Reliable private funding data is not "
          "free, so rather than guess, the database leaves it out and measures what can be checked.</p>"
        + "<h3>How often is it updated?</h3><p>Whenever the pipeline is re-run. The date above is when "
          "this copy was built.</p>"
        + "<h3>My company is listed and something is wrong.</h3>"
          f'<p>Tell us on the <a href="/contact">contact page</a> and it will be corrected or removed.</p>')

    ld = [
        {"@context": "https://schema.org", "@type": "Dataset",
         "name": "India SaaS Startups Database",
         "description": f"A free directory of {len(cos)} Indian SaaS and software companies, "
                        "classified by sector and scored on public evidence.",
         "url": "{SITE_URL}" + BASE, "license": "https://creativecommons.org/licenses/by/4.0/",
         "isAccessibleForFree": True, "dateModified": payload["generated"],
         "creator": {"@type": "Organization", "name": "Toolz Baba"},
         "keywords": ["India", "SaaS", "startups", "software companies", "B2B"]},
        {"@context": "https://schema.org", "@type": "ItemList", "numberOfItems": len(top),
         "itemListElement": [{"@type": "ListItem", "position": i, "name": c["name"],
                              "url": "{SITE_URL}" + f'{BASE}/{c["slug"]}'}
                             for i, c in enumerate(top, 1)]},
    ]
    title = f"India SaaS Startups Database – {len(cos)} Indian Software Companies"
    desc = (f"Free directory of {len(cos)} Indian SaaS companies across {len(live_sectors)} sectors. "
            "Sector maps, competitor lists and an open score for every company. No sign-up.")
    return title, desc, body, ld


# -------------------------------------------------------------------- sector
def sector(payload: dict, slug: str) -> tuple[str, str, str, list]:
    sec = BY_SLUG[slug]
    cos = [c for c in payload["companies"] if c["sector"] == slug]
    others = sorted({c["sector"] for c in payload["companies"]} - {slug})
    links = "".join(f'<li><a href="{BASE}/sector/{e(s)}">{e(BY_SLUG[s]["name"])}</a></li>' for s in others)
    top = cos[0] if cos else None

    body = (
        _crumb([("Toolz Baba", "/"), ("India SaaS Startups", BASE), (sec["name"], "")])
        + f'<h1>{e(sec["name"])} companies in India</h1>'
        + f'<p class="meta">{len(cos)} {"company" if len(cos) == 1 else "companies"} · '
          f'updated {e(payload["generated"])}</p>'
        + f'<p class="lede">{e(sec["desc"])} Ranked by the public evidence that each one is a '
          f'running product business.</p>'
        + (f'<div class="stats">{_stat(len(cos), "companies")}'
           f'{_stat(top["name"] if top else "—", "highest scored")}'
           f'{_stat(sum(1 for c in cos if c.get("yc_batch")), "Y Combinator backed")}</div>' if cos else "")
        + _company_rows(cos, show_sector=False)
        + _method_note()
        + f'<h2>Other sectors</h2><ul>{links}</ul>'
        + f'<p><a href="{BASE}">Back to the full India SaaS database</a></p>')

    ld = [{"@context": "https://schema.org", "@type": "ItemList", "numberOfItems": len(cos),
           "itemListElement": [{"@type": "ListItem", "position": i, "name": c["name"],
                                "url": "{SITE_URL}" + f'{BASE}/{c["slug"]}'}
                               for i, c in enumerate(cos, 1)]}]
    title = f'{sec["name"]} Companies in India – {len(cos)} Listed'
    desc = f'{len(cos)} Indian {sec["name"].lower()} companies, ranked and scored. {sec["desc"]} Free, no sign-up.'
    return title, desc, body, ld


# ------------------------------------------------------------------- company
PART_NAMES = {"product": "Product evidence", "saas_clarity": "Product vs services",
              "longevity": "Years on the web", "developers": "Public code",
              "mindshare": "Discussion", "validation": "Third-party validation"}


def company(payload: dict, c: dict) -> tuple[str, str, str, list]:
    sec = BY_SLUG[c["sector"]]
    probe, gh, hn = c.get("probe") or {}, c.get("github") or {}, c.get("hn") or {}
    total = c["score"]["total"]

    peers = [x for x in payload["companies"] if x["sector"] == c["sector"]]
    rank = next((i for i, x in enumerate(peers, 1) if x["slug"] == c["slug"]), 0)

    # the score, part by part: the whole point of the page
    part_rows = "".join(
        f'<tr><td><b>{e(PART_NAMES.get(k, k))}</b></td>'
        f'<td class="num">{p["points"]}</td><td class="num" style="color:var(--faint)">/ {p["max"]}</td>'
        f'<td class="barcell">{_bar(p["points"], p["max"])}</td>'
        f'<td class="wrap">{e(p["why"])}</td></tr>'
        for k, p in c["score"]["parts"].items())

    # what the homepage proved
    found = probe.get("pages") or []
    sig_rows = "".join(f"<tr><td><b>{e(label)}</b></td><td class='wrap'>{val}</td></tr>" for label, val in [
        ("Website", f'<a href="https://{e(c["domain"])}/" rel="nofollow noopener">{e(c["domain"])}</a>'),
        ("Sector", f'<a href="{BASE}/sector/{e(c["sector"])}">{e(sec["name"])}</a>'),
        ("Headquarters", e(c.get("city") or "Not stated publicly")),
        ("Operating since", e(f'{c["age_year"]} — {c.get("age_source") or ""}'.rstrip(" —")
                              if c.get("age_year") else "No founding year found")),
        ("Domain first archived", e(c.get("first_seen") or "No capture found")),
        ("Team size", e(f'{c["team_size"]} (as last published)' if c.get("team_size") else "Not published")),
        ("Accelerator", e(f'Y Combinator {c["yc_batch"]}' if c.get("yc_batch") else "None found")),
        ("Status", e((c.get("status") or "Not stated").title())),
        ("Product pages found", e(", ".join(found) if found else "None found on the homepage")),
        ("Built with", e(", ".join(probe.get("stack") or []) or "Nothing recognisable detected")),
        ("Public code", (f'<a href="{e(gh["url"])}" rel="nofollow noopener">{e(gh["handle"])}</a> — '
                         f'{gh["repos"]} repos, {gh["stars"]:,} stars' if gh.get("handle") else "None found")),
        ("Hacker News", (f'{hn["stories"]} stories, best <a href="{e(hn["top_url"])}" rel="nofollow noopener">'
                         f'{e(hn["top_title"])}</a> ({hn["top_points"]} points)'
                         if hn.get("stories") else "No discussion found")),
    ])

    social = probe.get("social") or {}
    links = "".join(f'<li><a href="{e(u)}" rel="nofollow noopener">{e(k.title())}</a></li>'
                    for k, u in sorted(social.items()))
    for label, key in (("Wikipedia", "wikipedia"), ("Wikidata", "wikidata"), ("Y Combinator", "yc_url")):
        if c.get(key):
            links += f'<li><a href="{e(c[key])}" rel="nofollow noopener">{e(label)}</a></li>'

    peer_table = _company_rows([p for p in peers if p["slug"] != c["slug"]][:12], show_sector=False)
    tags = "".join(f"<li>{e(t)}</li>" for t in (c.get("tags") or [])[:14])

    body = (
        _crumb([("Toolz Baba", "/"), ("India SaaS Startups", BASE),
                (sec["name"], f'{BASE}/sector/{c["sector"]}'), (c["name"], "")])
        + f'<h1>{e(c["name"])} — company profile</h1>'
        + f'<p class="meta">{e(sec["name"])} · {e(c.get("city") or "India")} · '
          f'updated {e(payload["generated"])}</p>'
        + f'<div class="big"><b>{total}</b><i>/ 100 &nbsp;·&nbsp; {e(c["band"])}'
          + (f' &nbsp;·&nbsp; ranked {rank} of {len(peers)} in {e(sec["name"])}' if rank else "") + "</i></div>"
        + (f'<p class="lede">{e(c["summary"])}</p>' if c.get("summary") else "")
        + (f'<ul class="chips">{tags}</ul>' if tags else "")
        + f'<h2>How {e(c["name"])} scored {total} out of 100</h2>'
        + '<p>Each part below is measured from a public source and shown with the evidence behind it. '
          'No part of this score is private, estimated or bought.</p>'
        + f'<div class="scroll"><table><tr><th>Part</th><th class="num">Points</th><th></th><th></th>'
          f'<th>Evidence found</th></tr>{part_rows}</table></div>'
        + _method_note()
        + f'<h2>What we found about {e(c["name"])}</h2>'
        + f'<div class="scroll"><table>{sig_rows}</table></div>'
        + (f"<h2>Profiles and links</h2><ul>{links}</ul>" if links else "")
        + (f'<h2>Other {e(sec["name"])} companies in India</h2>'
           f'<p>The nearest comparables in the same sector, ranked by the same score.</p>{peer_table}'
           if len(peers) > 1 else "")
        + "<h2>Questions</h2>"
        + f'<h3>What does {e(c["name"])} do?</h3><p>{e(c.get("summary") or sec["desc"])}</p>'
        + f'<h3>Where is {e(c["name"])} based?</h3>'
          f'<p>{e(c["name"])} is {e("based in " + c["city"] if c.get("city") else "an Indian company")}.</p>'
        + f'<h3>Is {e(c["name"])} a SaaS company?</h3>'
          f'<p>Its own homepage scores {probe.get("saas_points", 0)} on product signals against '
          f'{probe.get("services_points", 0)} on services signals'
          + (f', and it publishes {", ".join(found)}. ' if found else ". ")
          + f'On that evidence it is classed under {e(sec["name"])}.</p>'
        + f'<h3>How was this profile built?</h3><p>Entirely from free public sources — no paid database '
          f'was used and nothing was taken from a subscription service. '
          f'<a href="{BASE}#sources">See the full source list</a>.</p>'
        + f'<p><a href="{BASE}">Back to the India SaaS database</a> · '
          f'<a href="/contact">Report a correction</a></p>')

    org = {"@context": "https://schema.org", "@type": "Organization", "name": c["name"],
           "url": f'https://{c["domain"]}/', "description": c.get("summary") or sec["desc"],
           "address": {"@type": "PostalAddress", "addressCountry": "IN",
                       **({"addressLocality": c["city"]} if c.get("city") else {})}}
    if c.get("logo"):
        org["logo"] = c["logo"]
    same = [u for u in social.values()] + [c[k] for k in ("wikipedia", "wikidata") if c.get(k)]
    if same:
        org["sameAs"] = same
    ld = [org, {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "India SaaS Startups", "item": "{SITE_URL}" + BASE},
        {"@type": "ListItem", "position": 2, "name": sec["name"],
         "item": "{SITE_URL}" + f'{BASE}/sector/{c["sector"]}'},
        {"@type": "ListItem", "position": 3, "name": c["name"],
         "item": "{SITE_URL}" + f'{BASE}/{c["slug"]}'}]}]

    title = f'{c["name"]} – Company Profile, Sector & Competitors'
    desc = (f'{c["name"]}: {c.get("summary") or sec["desc"]}'[:120].rstrip()
            + f' Scored {total}/100 on public evidence, ranked {rank} of {len(peers)} in '
              f'{sec["name"]}. Free profile.')
    return title, desc, body, ld


def all_pages(payload: dict):
    """Yield (relative file path, url path, title, desc, body, json-ld) for every page."""
    t, d, b, ld = index(payload)
    # a file, not a folder index: Cloudflare Pages serves a folder only at a trailing
    # slash and redirects to it, which would point every canonical at a redirect
    yield "india-saas-startups.html", BASE, t, d, b, ld
    for slug in sorted({c["sector"] for c in payload["companies"]}):
        t, d, b, ld = sector(payload, slug)
        yield f"india-saas-startups/sector/{slug}.html", f"{BASE}/sector/{slug}", t, d, b, ld
    for c in payload["companies"]:
        t, d, b, ld = company(payload, c)
        yield f'india-saas-startups/{c["slug"]}.html', f'{BASE}/{c["slug"]}', t, d, b, ld
