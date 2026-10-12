"""Recognise tracking, ad, checkout, payment, review, chat and platform tools from page code."""
from __future__ import annotations

import re
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
