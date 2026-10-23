"""Recognise tracking, ad, checkout, payment, review, chat and platform tools from page code."""
from __future__ import annotations

import re
from collections import Counter
from html import unescape as _html_unescape

# name, category, regex that proves it is there, optional regex that captures its ID
SIGNATURES = [
    ("Google Tag Manager", "Tag manager", r"googletagmanager\.com/gtm\.js|GTM-[A-Z0-9]{5,9}", r"\b(GTM-[A-Z0-9]{5,9})\b"),
    ("Google Analytics 4", "Analytics", r"\bG-[A-Z0-9]{8,12}\b", r"\b(G-[A-Z0-9]{8,12})\b"),
    ("Universal Analytics", "Analytics", r"\bUA-\d{4,10}-\d{1,3}\b", r"\b(UA-\d{4,10}-\d{1,3})\b"),
    ("Google Ads", "Ads", r"\bAW-\d{8,12}\b|googleadservices\.com", r"\b(AW-\d{8,12})\b"),
    ("Floodlight (DV360 / CM360)", "Ads", r"\bDC-\d{6,10}\b|fls\.doubleclick\.net", r"\b(DC-\d{6,10})\b"),
    ("Meta Pixel", "Ads", r"connect\.facebook\.net/[^\"']*fbevents|fbq\(\s*['\"]init|facebook\.com/tr\?", r"fbq\(\s*['\"]init['\"]\s*,\s*['\"](\d{10,20})"),
    ("TikTok Pixel", "Ads", r"analytics\.tiktok\.com|ttq\.load", r"ttq\.load\(\s*['\"]([A-Z0-9]{15,25})"),
    ("LinkedIn Insight", "Ads", r"snap\.licdn\.com|_linkedin_partner_id", r"_linkedin_partner_id\s*=\s*['\"]?(\d+)"),
    ("Microsoft Ads (UET)", "Ads", r"bat\.bing\.com|uetq", r"\bti\s*:\s*['\"]?(\d{6,12})"),
    ("Pinterest Tag", "Ads", r"pintrk\(|s\.pinimg\.com/ct/core\.js", None),
    ("Snap Pixel", "Ads", r"sc-static\.net/scevent|snaptr\(", None),
    ("X (Twitter) Pixel", "Ads", r"static\.ads-twitter\.com|twq\(", None),
    ("Reddit Pixel", "Ads", r"redditstatic\.com/ads|rdt\(\s*['\"]init", None),
    ("Quora Pixel", "Ads", r"qevents\.js|qp\(\s*['\"]init", None),
    ("Criteo", "Ads", r"static\.criteo\.net|dynamic\.criteo\.com|criteo\.com/js|['\"]criteo['\"]", None),
    ("Taboola", "Ads", r"taboola\.com|_tfa\.push", None),
    ("Outbrain", "Ads", r"outbrain\.com|obApi\(", None),
    ("Google AdSense", "Ads", r"pagead2\.googlesyndication\.com|adsbygoogle", r"(ca-pub-\d{10,20})"),
    ("Microsoft Clarity", "Insight", r"clarity\.ms/tag", r"clarity\.ms/tag/([a-z0-9]{6,12})"),
    ("Hotjar", "Insight", r"static\.hotjar\.com|hotjar\.com/c/|hjSiteSettings|\bhjid\b", None),
    ("Mixpanel", "Insight", r"cdn\.mxpnl\.com|mixpanel\.init", None),
    ("Segment", "Insight", r"cdn\.segment\.com|analytics\.load\(", None),
    ("Amplitude", "Insight", r"cdn\.amplitude\.com|amplitude\.getInstance", None),
    ("Heap", "Insight", r"cdn\.heapanalytics\.com|heap\.load", None),
    ("VWO", "Insight", r"dev\.visualwebsiteoptimizer\.com|_vwo_code", None),
    ("Optimizely", "Insight", r"cdn\.optimizely\.com", None),
    ("CleverTap", "Engagement", r"clevertap-prod\.com|clevertap\.com/|\bwzrk", None),
    ("MoEngage", "Engagement", r"moengage\.com|cdn\.moengage", None),
    ("WebEngage", "Engagement", r"webengage\.com|widget\.in\.webengage", None),
    ("OneSignal", "Engagement", r"onesignal\.com", None),
    ("Klaviyo", "Engagement", r"static\.klaviyo\.com|klaviyo\.com/onsite|_learnq", None),
    ("Mailchimp", "Engagement", r"chimpstatic\.com|list-manage\.com", None),
    ("HubSpot", "Engagement", r"js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics", None),
    ("Netcore Smartech", "Engagement", r"netcoresmartech\.com|cdnt\.netcoresmartech", None),
    ("Zoho SalesIQ", "Chat & support", r"salesiq\.zoho", None),
    ("Intercom", "Chat & support", r"widget\.intercom\.io|intercomSettings", None),
    ("Drift", "Chat & support", r"js\.driftt\.com", None),
    ("Tawk.to", "Chat & support", r"embed\.tawk\.to", None),
    ("Crisp", "Chat & support", r"client\.crisp\.chat", None),
    ("Freshchat / Freshdesk", "Chat & support", r"wchat\.freshchat\.com|freshworks\.com/|freshdesk\.com/widget|widget\.freshworks", None),
    ("Zendesk", "Chat & support", r"static\.zdassets\.com|zopim", None),
    ("Gorgias", "Chat & support", r"config\.gorgias\.chat|gorgias\.chat/|gorgias-chat", None),
    ("Sprinklr", "Chat & support", r"live-chat\.sprinklr\.com|sprinklr\.com/", None),
    ("LiveChat", "Chat & support", r"cdn\.livechatinc\.com", None),
    ("Tidio", "Chat & support", r"code\.tidio\.co", None),
    ("WhatsApp chat", "Chat & support", r"wa\.me/|api\.whatsapp\.com/send", None),
    ("Calendly", "Lead capture", r"calendly\.com", None),
    ("Typeform", "Lead capture", r"typeform\.com", None),
    ("Judge.me", "Reviews & loyalty", r"judge\.me/|judgeme", None),
    ("Yotpo", "Reviews & loyalty", r"yotpo\.com|staticw2\.yotpo", None),
    ("Okendo", "Reviews & loyalty", r"okendo\.io", None),
    ("Stamped", "Reviews & loyalty", r"stamped\.io", None),
    ("Loox", "Reviews & loyalty", r"loox\.io", None),
    ("Trustpilot", "Reviews & loyalty", r"widget\.trustpilot\.com|tp\.widget", None),
    ("Nector", "Reviews & loyalty", r"nector\.io|cdn\.nector", None),
    ("Smile.io", "Reviews & loyalty", r"smile\.io", None),
    ("LoyaltyLion", "Reviews & loyalty", r"loyaltylion", None),
    ("GoKwik checkout", "Checkout & payments", r"gokwik\.co", None),
    ("Shopflo checkout", "Checkout & payments", r"shopflo\.(?:co|com)", None),
    ("Razorpay", "Checkout & payments", r"checkout\.razorpay\.com|razorpay\.com/|razorpay", None),
    ("Simpl pay-later", "Checkout & payments", r"getsimpl\.com|cdn\.getsimpl|simplpay", None),
    ("Snapmint", "Checkout & payments", r"snapmint\.com", None),
    ("Cashfree", "Checkout & payments", r"cashfree\.com|sdk\.cashfree", None),
    ("PayU", "Checkout & payments", r"payu\.in|payumoney", None),
    ("Paytm", "Checkout & payments", r"securegw\.paytm|merchant\.paytm|paytmpayments", None),
    ("PayPal", "Checkout & payments", r"paypal\.com/sdk|paypalobjects", None),
    ("Stripe", "Checkout & payments", r"js\.stripe\.com", None),
    ("Klarna", "Checkout & payments", r"klarna\.com|klarnaservices", None),
    ("Algolia search", "Search", r"algolia\.net|algolianet|algoliasearch", None),
    ("Searchanise", "Search", r"searchanise\.(?:com|io)", None),
    ("Boost Commerce", "Search", r"boost-commerce|boostcommerce", None),
    ("Klevu", "Search", r"klevu\.com", None),
    ("Shopify", "Platform", r"cdn\.shopify\.com|Shopify\.theme|myshopify\.com", None),
    ("WooCommerce", "Platform", r"wp-content/plugins/woocommerce|wc-ajax=|woocommerce-no-js|wc-blocks", None),
    ("WordPress", "Platform", r"wp-content/|wp-includes/|/wp-json", None),
    ("Wix", "Platform", r"static\.wixstatic\.com|wix-code", None),
    ("Squarespace", "Platform", r"squarespace\.com|static1\.squarespace", None),
    ("Webflow", "Platform", r"webflow\.(?:com|io)|data-wf-site", None),
    ("Magento", "Platform", r"Magento_|mage/cookies|/static/version\d", None),
    ("BigCommerce", "Platform", r"bigcommerce\.com|cdn11\.bigcommerce", None),
    ("Next.js", "Platform", r"/_next/static|__NEXT_DATA__", None),
    ("Nuxt", "Platform", r"/_nuxt/|__NUXT__", None),
    ("Gatsby", "Platform", r"___gatsby", None),
    ("Cloudflare", "Platform", r"/cdn-cgi/|cloudflareinsights", None),
    ("OneTrust consent", "Consent", r"onetrust|optanon", None),
    ("Cookiebot consent", "Consent", r"cookiebot", None),
    ("Google reCAPTCHA", "Consent", r"google\.com/recaptcha|grecaptcha", None),
]
_COMPILED = [(n, c, re.compile(p, re.I), re.compile(i) if i else None) for n, c, p, i in SIGNATURES]

ECOMMERCE_EVENTS = ["view_item_list", "select_item", "view_item", "add_to_wishlist", "add_to_cart", "view_cart", "begin_checkout",
                    "add_shipping_info", "add_payment_info", "purchase", "refund"]
LEAD_EVENTS = ["generate_lead", "form_submit", "contact_form_submit", "sign_up", "submit_lead_form", "book_appointment", "phone_click", "click_to_call", "whatsapp_click"]
META_EVENTS = ["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Contact", "Schedule"]

SOCIAL = {"facebook.com": "Facebook", "instagram.com": "Instagram", "linkedin.com": "LinkedIn", "youtube.com": "YouTube",
          "twitter.com": "X (Twitter)", "x.com": "X (Twitter)", "pinterest.": "Pinterest", "tiktok.com": "TikTok", "t.me/": "Telegram"}
REVIEW_SITES = {"clutch.co": "Clutch", "goodfirms.co": "GoodFirms", "trustpilot.com": "Trustpilot", "designrush.com": "DesignRush",
                "g.page": "Google reviews", "g.co/kgs": "Google reviews", "upcity.com": "UpCity", "glassdoor": "Glassdoor", "justdial.com": "Justdial"}


GOOGLE_NATIVE = {"Google Ads", "Floodlight (DV360 / CM360)", "Google AdSense", "Google Analytics 4", "Universal Analytics"}

# Places a brand can send its own visitors to buy the same product, where someone else keeps the margin and the customer.
MARKETPLACES = {
    "amazon.": "Amazon", "amzn.": "Amazon", "flipkart.com": "Flipkart", "fkrt.": "Flipkart", "myntra.com": "Myntra",
    "nykaa.com": "Nykaa", "ajio.com": "AJIO", "meesho.com": "Meesho", "snapdeal.com": "Snapdeal", "tatacliq.com": "Tata CLiQ",
    "jiomart.com": "JioMart", "blinkit.com": "Blinkit", "zepto": "Zepto", "swiggy.com": "Instamart", "bigbasket.com": "BigBasket",
    "firstcry.com": "FirstCry", "purplle.com": "Purplle", "etsy.com": "Etsy", "ebay.": "eBay", "walmart.com": "Walmart",
    "target.com": "Target", "noon.com": "noon", "shopee.": "Shopee", "lazada.": "Lazada", "alibaba.com": "Alibaba",
    "aliexpress.com": "AliExpress", "shop.app": "Shop app", "instagram.com/shop": "Instagram Shop",
}

# What the announcement bar promises. These are the levers that move average order value the most in direct-to-consumer.
_NUM = r"([\d][\d,.]{1,9})"
OFFER_RULES = [
    ("freeShipOver", r"free\s+(?:standard\s+|express\s+)?(?:shipping|delivery)\s+(?:on\s+)?(?:all\s+)?(?:orders?\s+)?(?:over|above|from|worth|of)[^\d]{0,12}" + _NUM),
    ("freeShipAll", r"free\s+(?:shipping|delivery)\s+(?:on\s+)?(?:all\s+orders|everything|sitewide|site-wide|nationwide|india|worldwide)"),
    ("codFree", r"free\s+(?:cash\s+on\s+delivery|cod)\b"),
    ("cod", r"\bcash\s+on\s+delivery\b|\bcod\s+available\b|\(\s*cod\s*\)"),
    ("returnDays", r"(\d{1,3})[-\s]?days?\s+(?:easy\s+|free\s+|no[- ]questions[- ]asked\s+)?(?:returns?|exchanges?|replacement)"),
    ("freeReturns", r"free\s+(?:returns?|exchanges?)"),
    ("emi", r"\bno[-\s]?cost\s+emi\b|\beasy\s+emi\b"),
    ("bnpl", r"\bpay\s+later\b|\bbuy\s+now,?\s+pay\s+later\b|\b3\s+interest[- ]free\b"),
    ("firstOrder", r"(?:flat\s+)?" + _NUM + r"\s*%\s*(?:off|discount)\s+(?:on\s+)?(?:your\s+)?first\s+order"),
]
_OFFERS = [(k, re.compile(p, re.I)) for k, p in OFFER_RULES]

# Express buttons let a shopper skip the whole checkout form, so their presence is the cheapest friction win there is.
EXPRESS = {"Shop Pay": r"shop_?pay|shopify[-_]payment[-_]button|ShopPay", "Google Pay": r"google[-_\s]?pay|\bgpay\b",
           "Apple Pay": r"apple[-_]?pay", "PayPal express": r"paypal[-_]?(express|smart|button)", "Amazon Pay": r"amazon[-_]?pay",
           "Shopify dynamic checkout": r"dynamic[-_]checkout|shopify-payment-button__button"}
_EXPRESS = [(n, re.compile(p, re.I)) for n, p in EXPRESS.items()]


# Who actually runs the site. Brands trade under one name and are registered under another, and the registered
# one (with its company number) is what you need to look a business up in a public register.
SUFFIX = r"(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Public\s+Limited|Limited|Ltd\.?|LLP|L\.?L\.?C\.?|Inc\.?|Incorporated|Corporation|Corp\.?|GmbH|AG|B\.?V\.?|N\.?V\.?|S\.?A\.?S\.?|S\.?R\.?L\.?|S\.?L\.?|Pty\.?\s*Ltd\.?|Oy|AB|A/S|Sdn\.?\s*Bhd\.?)"
ENTITY_RULES = [
    ("cin", r"\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b"),                       # India, Companies Act
    ("gstin", r"\b(\d{2}[A-Z]{5}\d{4}[A-Z][\dA-Z]Z[\dA-Z])\b"),                  # India, GST
    ("companyNo", r"(?:company|registration|registered)\s*(?:no\.?|number)\s*[:\-]?\s*([A-Z]{0,2}\s?\d{6,8})"),
    ("vat", r"\bVAT\s*(?:reg\.?\w*)?\s*(?:no\.?|number|id)?\s*[:\-]?\s*([A-Z]{2}\s?[\dA-Z]{8,12})\b"),
    ("founded", r"(?:since|established(?:\s+in)?|founded(?:\s+in)?|est\.)\s+((?:18|19|20)\d{2})\b"),
    ("copyright", r"(?:©|&copy;|\(c\)|copyright)\s*(?:19|20)\d{2}\s*(?:[-–—]\s*((?:19|20)\d{2}))?"),
]
_ENTITY = [(k, re.compile(p, re.I)) for k, p in ENTITY_RULES]
_LEGAL_NAME = re.compile(r"([A-Z][A-Za-z0-9&.,''\-]{1,30}(?:\s+[A-Z][A-Za-z0-9&.,''\-]{1,30}){0,4}\s+" + SUFFIX + r")")
_PIN = re.compile(r"\b(\d{6}|\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[\dA-Z]?\s?\d[A-Z]{2})\b")
_STOPWORDY = re.compile(r"\b(?:the|this|that|these|those|and|or|but|you|we|us|our|your|their|have|has|had|will|shall|may|must"
                        r"|any|all|for|not|are|is|was|were|been|with|from|into|upon|such|which|who|whom|if|then|than|by|to|of"
                        r"|in|on|at|as|it|its|be|do|does|did|other|more|most|some|no|nor|so|also|per)\b", re.I)


def text_of(html: str, limit: int = 300_000) -> str:
    t = re.sub(r"<(script|style|noscript)[^>]*>[\s\S]*?</\1>", " ", html or "", flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", _html_unescape(t))[:limit]


def entity(html: str) -> dict:
    """Registered name, company numbers, founding year and a postal address, read off the page."""
    text = text_of(html)
    out: dict = {}
    for key, rx in _ENTITY:
        m = rx.search(text)
        if m and (not m.groups() or m.group(1)):
            out[key] = re.sub(r"\s+", " ", m.group(1)).strip() if m.groups() and m.group(1) else True
    names = [re.sub(r"\s+", " ", n).strip() for n in _LEGAL_NAME.findall(text)]
    # Terms-and-conditions prose trips the suffix rule: "...THAT YOU AND WE HAVE AG" looked like a German company.
    names = [n for n in names if 6 <= len(n) <= 70 and not _STOPWORDY.search(n)]
    if names:
        out["legalName"] = Counter(names).most_common(1)[0][0]
        out["legalNames"] = [n for n, _ in Counter(names).most_common(3)]
    # the sentence around a postcode is almost always the registered address
    for m in _PIN.finditer(text):
        around = text[max(0, m.start() - 140):m.end()]   # stop at the postcode: anything after it is the next sentence
        if re.search(r"(address|registered|office|regd|corporate)", around, re.I):
            out["address"] = re.sub(r"^\W+", "", around.split(":")[-1]).strip()[:160]
            break
    return out


# What a response header gives away about who serves the site. Header names arrive lower-cased.
CDN_RULES = [("Cloudflare", r"cloudflare"), ("Fastly", r"fastly"), ("Akamai", r"akamai|AkamaiGHost"),
             ("Amazon CloudFront", r"cloudfront|x-amz-cf"), ("Vercel", r"vercel"), ("Netlify", r"netlify"),
             ("Google Cloud", r"\bgse\b|google frontend"), ("Azure CDN", r"azure|windows-azure"),
             ("Shopify", r"shopify"), ("Sucuri", r"sucuri"), ("Imperva", r"incapsula|imperva"), ("BunnyCDN", r"bunnycdn"),
             ("KeyCDN", r"keycdn"), ("StackPath", r"stackpath|highwinds")]
SERVER_RULES = [("nginx", r"nginx"), ("Apache", r"apache"), ("LiteSpeed", r"litespeed"), ("IIS", r"microsoft-iis"),
                ("Caddy", r"caddy"), ("Envoy", r"envoy"), ("OpenResty", r"openresty"), ("Cowboy", r"cowboy")]
RUNTIME_RULES = [("PHP", r"\bphp\b"), ("ASP.NET", r"asp\.net"), ("Express", r"express"), ("Next.js", r"next\.js|x-nextjs"),
                 ("Ruby on Rails", r"\bphusion|passenger|rails"), ("Django", r"\bdjango\b"), ("Laravel", r"laravel")]
# Most specific platform first: a WooCommerce shop also sets WordPress and PHP cookies, and naming the
# shop is more use than naming the language it happens to run on.
COOKIE_RULES = [("WooCommerce", r"^woocommerce_|^wp_woocommerce"), ("WordPress", r"^wordpress|^wp-"),
                ("Shopify", r"^_shopify|^_secure_session|^cart_"), ("Magento", r"^mage-|^form_key"),
                ("Laravel", r"^laravel_session|^xsrf-token"), ("Django", r"^csrftoken|^sessionid"),
                ("Adobe/Omniture", r"^s_cc|^s_sq"), ("PHP", r"^phpsessid"),
                ("ASP.NET", r"^asp\.net|^\.aspxauth"), ("Java", r"^jsessionid")]
SECURITY_HEADERS = [("HSTS", "strict-transport-security"), ("Content-Security-Policy", "content-security-policy"),
                    ("X-Frame-Options", "x-frame-options"), ("X-Content-Type-Options", "x-content-type-options"),
                    ("Referrer-Policy", "referrer-policy"), ("Permissions-Policy", "permissions-policy")]


def _first(rules, *values) -> str:
    hay = " ".join(v for v in values if v).lower()
    return next((name for name, pat in rules if re.search(pat, hay, re.I)), "")


def stack_from_headers(h: dict) -> dict:
    """CDN, web server, runtime and security headers, from one page's response headers."""
    if not h:
        return {}
    # header names arrive in whatever case the server used, and in different shapes from the two drivers:
    # the proxy sends cookie names already split out, a direct fetch sends raw Set-Cookie lines
    low = {str(k).lower(): v for k, v in h.items()}
    g = lambda k: "" if low.get(k) is None else str(low.get(k))
    cookies = low.get("cookienames") or []
    if not cookies and low.get("set-cookie"):
        raw = low["set-cookie"]
        lines = raw if isinstance(raw, list) else str(raw).split("\n")
        cookies = [c.split("=")[0].strip() for c in lines if "=" in c][:12]
    out: dict = {}
    cdn = _first(CDN_RULES, g("server"), g("via"), g("x-cache"), g("x-served-by"), g("x-amz-cf-pop"), g("x-vercel-id"),
                 "cloudflare" if g("cf-ray") or g("cf-cache-status") else "")
    if cdn:
        out["cdn"] = cdn
    srv = _first(SERVER_RULES, g("server"))
    if srv:
        out["server"] = srv
    # some headers are a signal by their name alone, whatever value they carry
    named = " ".join(k for k in ("x-nextjs-cache", "x-aspnet-version", "x-drupal-cache", "x-litespeed-cache") if g(k))
    run = _first(RUNTIME_RULES, g("x-powered-by"), g("x-generator"), named)
    if run:
        out["runtime"] = run
    # each cookie name is matched on its own: the rules are anchored with ^, so joining them into one
    # string meant only the first cookie could ever match
    cms = next((name for name, pat in COOKIE_RULES for c in cookies if re.search(pat, str(c), re.I)), "")
    if cms:
        out["cms"] = cms
    present = [name for name, key in SECURITY_HEADERS if g(key)]
    out["security"] = present
    out["securityMissing"] = [name for name, key in SECURITY_HEADERS if not g(key)]
    if g("content-encoding"):
        out["compression"] = g("content-encoding")
    if cookies:
        out["cookies"] = cookies[:10]
    if g("cf-cache-status") or g("x-cache"):
        out["cacheStatus"] = (g("cf-cache-status") or g("x-cache"))[:40]
    return out


def marketplaces(hosts: dict) -> dict:
    """Marketplace -> how many links point at it, from the outside hosts the crawl saw."""
    out: dict[str, int] = {}
    for host, n in (hosts or {}).items():
        for needle, name in MARKETPLACES.items():
            if needle in host:
                out[name] = out.get(name, 0) + n
                break
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def offers(html: str) -> dict:
    """Shipping, COD, returns and payment promises written on the page (usually the announcement bar)."""
    text = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", html or "", flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", _html_unescape(text))[:200_000]
    out: dict = {}
    for key, rx in _OFFERS:
        m = rx.search(text)
        if not m:
            continue
        out[key] = m.group(1) if m.groups() and m.group(1) else True
    return out


def express_checkout(html: str) -> list[str]:
    return [n for n, rx in _EXPRESS if rx.search(html or "")]


def split_gtm(code: str) -> tuple[str, str]:
    """(resource, runtime) parts of a gtm.js file: resource holds the site's own tags, triggers and events."""
    i, j = code.find('"resource"'), code.find('"runtime"')
    if i >= 0 and j > i:
        return code[i:j], code[j:]
    return code, ""


def detect(code: str) -> dict:
    """{tool name: {"cat": category, "ids": [...]}} for everything recognised in the code."""
    found: dict[str, dict] = {}
    for name, cat, pat, idre in _COMPILED:
        if pat.search(code):
            ids = sorted(set(idre.findall(code)))[:4] if idre else []
            found[name] = {"cat": cat, "ids": ids}
    return found


def events(code: str) -> list[str]:
    seen = []
    for e in ECOMMERCE_EVENTS + LEAD_EVENTS + META_EVENTS:
        if re.search(r"['\"]%s['\"]" % re.escape(e), code) and e not in seen:
            seen.append(e)
    return seen


def contacts(html: str) -> dict:
    tel = sorted({re.sub(r"[^\d+]", "", m) for m in re.findall(r'href=["\']tel:([^"\']+)', html, re.I)})[:6]
    mail = sorted({m.split("?")[0] for m in re.findall(r'href=["\']mailto:([^"\']+)', html, re.I)})[:6]
    wa = bool(re.search(r"wa\.me/|api\.whatsapp\.com/send", html, re.I))
    socials, reviews = {}, {}
    for href in re.findall(r'href=["\'](https?://[^"\']+)', html, re.I):
        low = href.lower()
        for k, v in SOCIAL.items():
            if k in low and v not in socials and not re.search(r"/(sharer|share|intent)[/?]", low):
                socials[v] = href
        for k, v in REVIEW_SITES.items():
            if k in low and v not in reviews:
                reviews[v] = href
    forms = len(re.findall(r"<form\b", html, re.I))
    email_inputs = len(re.findall(r'<input[^>]+type=["\']email', html, re.I))
    return {"phones": tel, "emails": mail, "whatsapp": wa, "socials": socials, "reviewSites": reviews, "forms": forms, "emailInputs": email_inputs}


def gtm_ids(code: str) -> list[str]:
    return sorted(set(re.findall(r"\b(GTM-[A-Z0-9]{5,9})\b", code)))[:3]


def currency(html: str) -> str:
    m = re.search(r'Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"', html) or re.search(r'"currency(?:Code)?"\s*:\s*"([A-Z]{3})"', html) or \
        re.search(r'priceCurrency"\s*:\s*"([A-Z]{3})"', html)
    return m.group(1) if m else ""


SYMBOL = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AUD": "A$", "CAD": "C$", "AED": "AED ", "SGD": "S$", "JPY": "¥", "MYR": "RM "}
