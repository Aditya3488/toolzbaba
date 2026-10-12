"""The Baba Score: 0-100, and every point of it explainable.

Tracxn ships a score and never says how it is made. This one is published with
its own arithmetic, because a score built from free signals has no business
pretending to be a valuation. It measures how much public evidence exists that a
company is a real, running SaaS business, and nothing more.

Six parts, 100 points:
  product        30   what the homepage proves it sells (a price, docs, a login)
  saas_clarity   15   product company, or an IT services shop wearing product words
  longevity      15   how long the domain has existed on the web
  developers     15   public code and the attention it gets
  mindshare      15   how often people actually discuss it
  validation     10   accelerator backing, an exit, an encyclopaedia entry

Not in the score, deliberately: funding raised and valuation. Neither can be had
for free and reliably, so the score does not pretend to know them.
"""
import math

# what each homepage page proves about a product, in points
PAGE_POINTS = {"pricing": 8, "docs": 6, "signup": 4, "security": 4, "login": 3,
               "status": 3, "blog": 2, "careers": 2}
PRODUCT_MAX = 30


def _log_scale(value: float, full: float, points: float) -> float:
    """Diminishing returns: `full` earns the lot, a tenth of it earns about half."""
    if value <= 0:
        return 0.0
    return min(points, points * math.log1p(value) / math.log1p(full))


def score(c: dict) -> dict:
    """Return {'total': int, 'parts': {name: {'points', 'max', 'why'}}}."""
    probe = c.get("probe") or {}
    gh = c.get("github") or {}
    hn = c.get("hn") or {}
    parts: dict[str, dict] = {}

    # --- product: what the site itself proves it sells ---
    pages = probe.get("pages") or []
    got = sorted(((p, PAGE_POINTS[p]) for p in pages if p in PAGE_POINTS), key=lambda kv: -kv[1])
    pts = min(PRODUCT_MAX, sum(v for _, v in got))
    parts["product"] = {
        "points": pts, "max": PRODUCT_MAX,
        "why": ("has " + ", ".join(p for p, _ in got)) if got else
               ("homepage reachable, but no product pages found" if probe.get("live") else "site not reachable"),
    }

    # --- saas clarity: product company, or services shop? ---
    s, v = probe.get("saas_points") or 0, probe.get("services_points") or 0
    if s + v == 0:
        clarity, why = 0.0, "no product or services wording found"
    else:
        clarity = max(0.0, min(15.0, 15.0 * (s - v) / max(s + v, 8)))
        why = f"{s} product signals against {v} services signals"
    parts["saas_clarity"] = {"points": round(clarity, 1), "max": 15, "why": why}

    # --- longevity: how long the company has actually existed ---
    # verify.founded_year decides which year to trust: a recycled domain must not
    # make a two-year-old company look twenty years old.
    year = c.get("age_year")
    if year:
        years = max(0, 2026 - int(year))
        parts["longevity"] = {"points": round(_log_scale(years, 20, 15), 1), "max": 15,
                              "why": f"operating since {year} ({years} years), from {c.get('age_source') or 'public record'}"}
    else:
        parts["longevity"] = {"points": 0, "max": 15, "why": "no founding year or archive capture found"}

    # --- developers: public code ---
    stars, repos = gh.get("stars") or 0, gh.get("repos") or 0
    if gh.get("handle"):
        dev = _log_scale(stars, 20000, 11) + _log_scale(repos, 100, 4)
        parts["developers"] = {"points": round(dev, 1), "max": 15,
                               "why": f"{repos} public repos, {stars:,} stars on GitHub"}
    else:
        parts["developers"] = {"points": 0, "max": 15, "why": "no public GitHub organisation found"}

    # --- mindshare: is anyone talking about it? ---
    stories, top = hn.get("stories") or 0, hn.get("top_points") or 0
    mind = _log_scale(stories, 40, 9) + _log_scale(top, 600, 6)
    parts["mindshare"] = {"points": round(mind, 1), "max": 15,
                          "why": (f"{stories} Hacker News stories, best scored {top} points" if stories
                                  else "no Hacker News discussion found")}

    # --- validation: someone other than the company vouched for it ---
    val, notes = 0.0, []
    if c.get("yc_batch"):
        val += 5
        notes.append(f"Y Combinator {c['yc_batch']}")
    status = (c.get("status") or "").lower()
    if status in ("public", "acquired"):
        val += 3
        notes.append(status)
    if c.get("wikipedia") or c.get("wikidata"):
        val += 2
        notes.append("encyclopaedia entry")
    team = c.get("team_size") or 0
    if team >= 50:
        val += 1
        notes.append(f"{team} staff")
    parts["validation"] = {"points": round(min(10.0, val), 1), "max": 10,
                           "why": ", ".join(notes) if notes else "no third-party validation found"}

    total = round(sum(p["points"] for p in parts.values()))
    return {"total": min(100, total), "parts": parts}


def band(total: int) -> str:
    """A plain word for the score, so a reader need not guess what 61 means."""
    if total >= 70:
        return "Established"
    if total >= 50:
        return "Growing"
    if total >= 30:
        return "Early"
    return "Thin evidence"
