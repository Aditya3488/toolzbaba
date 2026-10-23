"""Y Combinator's public company directory.

api.ycombinator.com/v0.1/companies is open, needs no key, and takes a
`regions` filter, so we ask it only for India and walk the pages it reports.
It is the single best free list of funded Indian startups: it carries the batch,
the team size, whether the company is still active, and YC's own industry tags.
"""
from .. import net

API = "https://api.ycombinator.com/v0.1/companies"


def fetch() -> list[dict]:
    out, page, pages = [], 1, 1
    while page <= pages and page <= 80:   # the guard is for a bad `totalPages`, never reached in practice
        d = net.get_json(f"{API}?regions=India&page={page}")
        if not d:
            break
        pages = max(pages, int(d.get("totalPages") or 1))
        for c in d.get("companies", []):
            if "India" not in (c.get("regions") or []):
                continue
            out.append({
                "name": (c.get("name") or "").strip(),
                "website": (c.get("website") or "").strip(),
                "desc": (c.get("oneLiner") or "").strip(),
                "long_desc": (c.get("longDescription") or "").strip(),
                "city": ", ".join(c.get("locations") or []),
                "team_size": c.get("teamSize") or None,
                # tags and industries overlap ("B2B" is usually in both), so fold them
                # into one list, keeping the first spelling of each
                "tags": list(dict.fromkeys(
                    t.strip() for t in (c.get("tags") or []) + (c.get("industries") or []) if t and t.strip())),
                "yc_batch": c.get("batch") or "",
                "yc_url": c.get("url") or "",
                "status": (c.get("status") or "").strip(),   # Active / Acquired / Public / Inactive
                "logo": c.get("smallLogoUrl") or "",
                "source": "ycombinator",
            })
        page += 1
    return [c for c in out if c["name"]]
