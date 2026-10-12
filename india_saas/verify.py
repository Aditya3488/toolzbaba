"""The checks that stop a plausible-looking wrong answer getting published.

Free signals are noisy in specific, repeatable ways, and each function here
exists because the first run got something visibly wrong:

- a homepage links to someone else's GitHub, so the company appeared to have
  87,000 stars. Now a handle has to look like it belongs to the company.
- a startup sits on a recycled domain the Wayback Machine first saw in 1996, so
  a two-year-old company looked twenty years old. Now the known founding year
  wins whenever the archive disagrees with it.
- a YC company headquartered in San Francisco was labelled an Indian city,
  because the region filter and the office address are different fields.
"""
import re

# handles that appear on homepages but never belong to the company
GENERIC_HANDLES = {
    "orgs", "github", "features", "about", "topics", "explore", "pricing", "login",
    "sponsors", "readme", "trending", "collections", "marketplace", "apps", "settings",
    "vercel", "facebook", "google", "microsoft", "apple", "nodejs", "reactjs", "vuejs",
    "twbs", "tailwindlabs", "shadcn-ui", "stripe", "aws", "docker", "kubernetes",
}
# an office in one of these is not an Indian headquarters
NOT_INDIAN_PLACE = re.compile(
    r"\b(san francisco|new york|nyc|london|singapore|dubai|san jose|seattle|austin|boston|"
    r"palo alto|mountain view|sunnyvale|toronto|berlin|amsterdam|dublin|sydney|tokyo|"
    r"remote|united states|usa|uk|uae|canada|germany|australia|netherlands|ireland)\b", re.I)


def _squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def github_handle(raw_url: str, name: str, domain: str) -> str:
    """The GitHub handle, but only when it plausibly belongs to this company.

    A homepage often links to a framework or a founder's favourite repo. We keep
    the handle only when it shares a recognisable stem with the company name or
    its domain, which is what a real company organisation almost always does.
    """
    if not raw_url:
        return ""
    handle = raw_url.rstrip("/").rsplit("/", 1)[-1].strip()
    if not handle or handle.lower() in GENERIC_HANDLES or len(handle) < 2:
        return ""
    h = _squash(handle)
    root = _squash(domain.split(".")[0])
    nm = _squash(name)
    for other in (root, nm):
        if len(other) >= 4 and (other in h or h in other):
            return handle
        # "postmanlabs" against "postman": allow a short suffix on the company name
        if len(other) >= 4 and h.startswith(other[:max(4, len(other) - 2)]):
            return handle
    return ""


def batch_year(batch: str) -> int | None:
    """Y Combinator batch codes carry the year: W21, S19, F26, X25 -> 2021, 2019 ..."""
    m = re.fullmatch(r"[A-Za-z]{1,2}(\d{2})", (batch or "").strip())
    if not m:
        return None
    yy = int(m.group(1))
    return 2000 + yy if yy <= 60 else 1900 + yy


def founded_year(c: dict) -> tuple[int | None, str]:
    """The year the company itself started, and where that year came from.

    The Wayback date is only trusted when nothing better exists, and never when
    it predates a founding year we actually know: that means a recycled domain.
    """
    known, src = None, ""
    if str(c.get("founded") or "").isdigit():
        known, src = int(c["founded"]), "incorporation record"
    yc = batch_year(c.get("yc_batch") or "")
    if yc and (known is None or yc < known):
        known, src = yc, f'Y Combinator {c["yc_batch"]}'

    first = c.get("first_seen") or ""
    archive = int(first) if first.isdigit() else None
    if known and archive and archive < known - 2:
        return known, src + " (the domain is older: it was used before)"
    if known:
        return known, src
    if archive:
        return archive, "first Wayback Machine capture of the domain"
    return None, ""


def clean_city(city: str) -> str:
    """Keep an Indian office, drop one that is plainly somewhere else."""
    city = re.sub(r"\s+", " ", (city or "")).strip(" ,")
    if not city or NOT_INDIAN_PLACE.search(city):
        return ""
    # "Bengaluru, Karnataka, India" reads better as "Bengaluru, Karnataka"
    parts = [p.strip() for p in city.split(",") if p.strip() and p.strip().lower() != "india"]
    return ", ".join(parts[:2])


def is_software_business(c: dict) -> tuple[bool, str]:
    """Does the public evidence say this sells software? Returns (verdict, reason).

    A bank, a telecom operator or an IT services firm can all appear in a list of
    "Indian software companies" and all have a login page. The test is whether
    the company's own words place it in a sector, or an accelerator backed it.
    """
    probe = c.get("probe") or {}
    if not probe.get("live"):
        return False, "website not reachable"

    saas, svc = probe.get("saas_points", 0), probe.get("services_points", 0)
    pages = set(probe.get("pages") or [])
    product_page = bool(pages & {"pricing", "docs", "signup"})

    if c.get("yc_batch"):                        # an accelerator already vetted it
        return True, "accelerator backed"
    if c.get("sector") == "other-saas":
        return False, "nothing in its own words places it in a software sector"
    if saas < 3 and not product_page:
        return False, "homepage shows no product, price or documentation"
    if svc > saas:
        return False, "reads as an IT services or consulting firm"
    return True, "product signals on its own homepage"
