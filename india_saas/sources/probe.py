"""What a company's own homepage says about it.

This is the "technology signals" layer: one request per domain, from which we read
everything at once — the real title and description, whether the site sells a
product with a price (the clearest tell that a company is SaaS rather than an IT
services shop), what it is built on, and where its profiles are.

One request per company, nothing else, so the whole run stays polite and fast.
"""
import re
import urllib.parse

from .. import net

# the markers below are matched against the homepage HTML, lowercased
SAAS_WORDS = [
    ("pricing", 3), ("start free trial", 4), ("free trial", 3), ("book a demo", 3), ("request a demo", 3),
    ("get started free", 3), ("per month", 2), ("per user", 3), ("/month", 2), ("sign up free", 3),
    ("start for free", 3), ("no credit card", 3), ("subscription", 1), ("api documentation", 2),
    ("integrations", 1), ("dashboard", 1), ("platform", 1), ("saas", 2), ("cloud-based", 2),
]
# a services company talks about people and projects, not plans and seats
SERVICES_WORDS = [
    ("staff augmentation", 4), ("it services", 3), ("consulting services", 3), ("hire developers", 4),
    ("our clients include", 2), ("outsourcing", 3), ("development company", 3), ("case studies", 1),
    ("years of experience", 2), ("we deliver", 1), ("end-to-end services", 3), ("offshore", 3),
]
# Broadening the seed lists brought in every kind of Indian business, and industry
# words alone cannot tell them apart: a real bank matches "banking" exactly as well
# as banking software does, and its homepage has a login and a pricing page too.
# These are the words a company uses when it serves the public directly rather than
# selling software to another business.
RETAIL_WORDS = [
    ("savings account", 5), ("current account", 4), ("interest rate", 4), ("ifsc", 5),
    ("nearest branch", 5), ("branch locator", 5), ("atm", 3), ("apply for a loan", 4),
    ("emi calculator", 3), ("premium calculator", 3), ("buy policy", 4), ("renew policy", 4),
    ("showroom", 5), ("dealership", 5), ("test drive", 5), ("book a table", 5),
    ("order online", 3), ("add to cart", 4), ("free delivery", 3), ("shop now", 3),
    ("admission", 4), ("hostel", 5), ("syllabus", 3), ("campus", 3), ("prospectus", 4),
    ("box office", 5), ("showtimes", 5), ("epaper", 5), ("subscribe to the newspaper", 5),
    ("tariff plan", 3), ("recharge now", 4), ("prepaid", 3), ("postpaid", 4),
    ("flight tickets", 4), ("book your stay", 4), ("menu", 2), ("outlets", 3),
]

STACK = {
    "Next.js": ("/_next/", "__next_f", "next/static"), "React": ("react", "data-reactroot"),
    "Vue": ("vue.js", "__vue__", "nuxt"), "Angular": ("ng-version", "angular"),
    "Webflow": ("webflow", "wf-domain"), "WordPress": ("wp-content", "wp-includes"),
    "Shopify": ("cdn.shopify.com",), "Framer": ("framerusercontent",), "Wix": ("wix.com", "wixstatic"),
    "HubSpot": ("hs-scripts", "hubspot"), "Intercom": ("intercom",), "Segment": ("segment.com/analytics",),
    "Google Tag Manager": ("googletagmanager",), "Cloudflare": ("cdn-cgi",),
    "Tailwind CSS": ("tailwind",), "Stripe": ("js.stripe.com",), "Razorpay": ("razorpay",),
    "Mixpanel": ("mixpanel",), "Amplitude": ("amplitude",), "Crisp": ("crisp.chat",),
    "Zoho": ("zohocdn", "zoho.com/salesiq"), "Calendly": ("calendly",),
}
SOCIAL = {
    "linkedin": r"linkedin\.com/(?:company|in)/[A-Za-z0-9._%+-]+",
    "twitter": r"(?:twitter|x)\.com/[A-Za-z0-9_]{2,16}",
    "github": r"github\.com/[A-Za-z0-9-]{2,39}",
    "youtube": r"youtube\.com/(?:@|c/|channel/|user/)[A-Za-z0-9_.-]+",
}
PAGE_HINTS = {"pricing": r'href="[^"]*?/pricing', "docs": r'href="[^"]*?/(?:docs|developers?|api)\b',
              "blog": r'href="[^"]*?/blog', "careers": r'href="[^"]*?/(?:careers|jobs)\b',
              "login": r'href="[^"]*?/(?:login|signin|sign-in|app)\b',
              "signup": r'href="[^"]*?/(?:signup|sign-up|register|get-started)\b',
              "status": r'href="[^"]*?status\.', "security": r'href="[^"]*?/(?:security|trust)\b'}


def domain_of(url: str) -> str:
    """The bare hostname, as a hostname is actually written on the wire.

    India has real domains in Devanagari (भारतीयरेल.सरकार.भारत), and urllib encodes a
    host as latin-1, so one of those raises rather than returning a result. Converting
    to punycode here is what a browser does with the same address.
    """
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:                      # a malformed address is not a domain
        return ""
    if host.startswith("www."):
        host = host[4:]
    if any(ord(ch) > 127 for ch in host):
        try:
            host = host.encode("idna").decode("ascii")
        except (UnicodeError, ValueError):
            return ""
    # some source records hold two things in the website field ("example.io, https"),
    # and urlparse hands that back as a hostname quite happily
    return host if re.fullmatch(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+", host) else ""


def _tag(html: str, pattern: str) -> str:
    m = re.search(pattern, html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:300] if m else ""


def probe(domain: str) -> dict:
    """Fetch one homepage and read every signal we can off it."""
    out = {"live": False, "url": "", "title": "", "meta_desc": "", "stack": [], "pages": [],
           "social": {}, "saas_points": 0, "services_points": 0, "retail_points": 0,
           "html_bytes": 0}
    if not domain:
        return out
    # short and single-shot: a few hundred of these domains are parked or gone, and
    # a generous timeout with a retry turns each dead one into a minute of waiting
    html = net.fetch(f"https://{domain}/", timeout=12, retries=0)
    if html is None:
        html = net.fetch(f"http://{domain}/", timeout=8, retries=0)
    if html is None:
        return out

    low = html.lower()
    out["live"] = True
    out["url"] = f"https://{domain}/"
    out["html_bytes"] = len(html)
    out["title"] = _tag(html, r"<title[^>]*>(.*?)</title>")
    out["meta_desc"] = (_tag(html, r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']')
                        or _tag(html, r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']'))
    out["stack"] = sorted(n for n, marks in STACK.items() if any(m in low for m in marks))
    out["pages"] = sorted(n for n, rx in PAGE_HINTS.items() if re.search(rx, low))
    for name, rx in SOCIAL.items():
        m = re.search(rx, html, re.I)
        if m:
            out["social"][name] = "https://" + m.group(0).lstrip("/")
    out["saas_points"] = sum(w for word, w in SAAS_WORDS if word in low)
    out["services_points"] = sum(w for word, w in SERVICES_WORDS if word in low)
    out["retail_points"] = sum(w for word, w in RETAIL_WORDS if word in low)
    return out
