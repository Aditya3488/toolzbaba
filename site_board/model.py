"""Turn a crawl report into everything the board shows: sections, cards, funnel, tracking map, catalogue and advice."""
from __future__ import annotations

import re
from collections import Counter, OrderedDict

from .detect import SYMBOL

PALETTE = ["--c-about", "--c-services", "--c-tech", "--c-dm", "--c-ai", "--c-res", "--c-contact", "--c-x1", "--c-x2", "--c-x3"]
CAT_COLOR = {"Checkout & payments": "--c-dm", "Engagement": "--c-ai", "Reviews & loyalty": "--c-services", "Chat & support": "--c-tech",
             "Search": "--c-res", "Insight": "--c-about", "Lead capture": "--c-contact", "Platform": "--c-x2", "Consent": "--c-x3"}
CHUNK = 24


def humanize(path: str) -> str:
    seg = [s for s in re.split(r"[/?]", path) if s]
    if not seg:
        return "Home"
    s = re.sub(r"[-_]+", " ", seg[-1]).strip()
    s = re.sub(r"\.(html?|php|aspx?)$", "", s)
    return (s[:1].upper() + s[1:])[:60] if s else path


def short_title(t: str, brand: str = "") -> str:
    t = re.split(r"\s[|–—]\s|\s\|\s?|\s-\s", t or "")[0].strip()
    if brand and t.lower().startswith(brand.lower() + " "):
        t = t[len(brand) + 1:]
    return t[:70]


def find_pages(rep: dict, pattern: str, limit: int = 3) -> list[str]:
    rx = re.compile(pattern, re.I)
    out = [p for p, f in rep["pages"].items() if p != "/" and f.get("s") == 200 and rx.search(p)]
    return sorted(out, key=len)[:limit]


class Board:
    def __init__(self, rep: dict, max_cards: int = 2200):
        self.rep, self.max_cards = rep, max_cards
        self.used: set[str] = set()
        self.cards = 0
        self.data: list[dict] = []
        self.prod: dict[str, dict] = {}
        self.where: dict[str, str] = {}  # slug -> "Menu" / "Footer" / "Sitemap"
        self.brand = rep.get("brand") or ""
        self.brand_words = {w for w in re.sub(r"[^\w\s]", "", self.brand.lower()).split() if len(w) > 2} | {rep.get("domain", "").split(".")[0].lower()}

    # ---- labels ----
    def label(self, path: str) -> str:
        lab = self.rep["labels"].get(path)
        if lab:
            return lab
        f = self.rep["pages"].get(path) or {}
        return short_title(f.get("t", ""), self.brand) or (f.get("h1") or [""])[0][:60] or humanize(path)

    def take(self, path: str | None) -> bool:
        if not path or path in self.used or self.cards >= self.max_cards:
            return False
        self.used.add(path)
        self.cards += 1
        return True

    @staticmethod
    def slug(path: str) -> str:
        return "" if path == "/" else path.lstrip("/")

    # ---- product groups (shops) ----
    def product_groups(self, handles: list[str], by_handle: dict) -> list:
        series: "OrderedDict[str, list]" = OrderedDict()
        for h in handles:
            p = by_handle.get(h)
            path = f"/products/{h}".lower()
            if not p or not self.take(path):
                continue
            name = short_title(p["t"], self.brand) or p["t"]
            words = [w for w in name.split() if re.sub(r"[^\w]", "", w).lower() not in self.brand_words] or name.split()
            first = re.sub(r"[^\w]", "", (words or ["Other"])[0]) or "Other"
            series.setdefault(first[:1].upper() + first[1:], []).append([name, self.slug(path), h])
            self.prod[self.slug(path)] = {"p": p["price"], "m": p["mrp"], "a": p["avail"], "v": p["v"], "c": p.get("created", "")}
        pages = self.rep["pages"]
        groups = []
        for s, items in sorted(series.items(), key=lambda kv: -len(kv[1])):
            items.sort(key=lambda it: -(pages.get("/" + it[1], {}).get("rc") or 0))
            parts = (len(items) + CHUNK - 1) // CHUNK
            for i in range(parts):
                groups.append([f"{s} ({i + 1}/{parts})" if parts > 1 else s, None, [[a, b] for a, b, _ in items[i * CHUNK:(i + 1) * CHUNK]]])
        return groups

    def link_groups(self, groups: list, where: str) -> list:
        out = []
        for g in groups:
            hub = g.get("href") if g.get("href") and self.take(g["href"]) else None
            if hub:
                self.where[hub] = where
            items = []
            for text, h in g["links"]:
                if self.take(h):
                    items.append([text[:70] or self.label(h), self.slug(h)])
                    self.where[h] = where
            for i in range(0, max(1, len(items)), CHUNK):
                chunk = items[i:i + CHUNK]
                if chunk or (hub and i == 0):
                    name = g["name"] if len(items) <= CHUNK else f"{g['name']} ({i // CHUNK + 1})"
                    out.append([name, self.slug(hub) if hub and i == 0 else None, chunk])
        return out

    def build(self) -> list[dict]:
        rep = self.rep
        self.take("/")
        shop = rep.get("shop") or {}
        by_handle = {p["h"]: p for p in shop.get("products", [])} if shop else {}
        colls = shop.get("collections", {}) if shop else {}
        for item in rep.get("menu", [])[:10]:
            secs = []
            # a shop's collection links become sections holding their products
            other_groups = []
            for g in item["groups"]:
                links = ([[g["name"], g["href"]]] if g.get("href") else []) + g["links"]
                coll_links = [(t, h) for t, h in links if re.match(r"^/collections/[^/]+$", h or "") and h.split("/")[-1] in colls]
                if coll_links:
                    for t, h in coll_links:
                        handle = h.split("/")[-1]
                        groups = []
                        if self.take(h):
                            groups.append(["Category page", self.slug(h), []])
                            self.where[h] = "Menu"
                        groups += self.product_groups(colls.get(handle, []), by_handle)
                        if groups:
                            secs.append({"name": t[:40], "groups": groups})
                    rest = [l for l in g["links"] if l not in [list(x) for x in coll_links]]
                    if rest:
                        other_groups.append({"name": g["name"], "href": None, "links": rest})
                else:
                    other_groups.append(g)
            if item.get("href") and item["href"] not in self.used and not any(g.get("href") == item["href"] for g in other_groups):
                other_groups.insert(0, {"name": f"{item['label']} page", "href": item["href"], "links": []})
            lg = self.link_groups(other_groups, "Menu")
            for i in range(0, len(lg), 8):
                part = lg[i:i + 8]
                secs.append({"name": item["label"] if len(lg) <= 8 else f"{item['label']} · {part[0][0][:28]}", "groups": part})
            if secs:
                self.data.append({"name": item["label"][:40], "secs": secs})
        # shop products not reached through the menu
        if by_handle:
            left = [h for h in by_handle if f"/products/{h}".lower() not in self.used]
            if left:
                by_type: "OrderedDict[str, list]" = OrderedDict()
                for h in left:
                    by_type.setdefault((by_handle[h].get("type") or "Other").strip()[:30] or "Other", []).append(h)
                secs = [{"name": t, "groups": self.product_groups(hs, by_handle)} for t, hs in sorted(by_type.items(), key=lambda kv: -len(kv[1]))]
                secs = [s for s in secs if s["groups"]]
                if secs:
                    self.data.append({"name": "More products", "secs": secs[:12]})
        if rep.get("headerLinks"):
            lg = self.link_groups([{"name": "Top bar & extra links", "href": None, "links": rep["headerLinks"]}], "Header")
            if lg:
                self.data.append({"name": "Header links", "secs": [{"name": "Header links", "groups": lg}]})
        if rep.get("footer"):
            lg = self.link_groups(rep["footer"], "Footer")
            if lg:
                self.data.append({"name": "Footer", "secs": [{"name": "Footer" if len(lg) <= 6 else f"Footer {i // 6 + 1}", "groups": lg[i:i + 6]} for i in range(0, len(lg), 6)]})
        # everything else that was crawled, by first folder
        rest = [p for p in rep["pages"] if p not in self.used and rep["pages"][p].get("s") is not None]
        folders: "OrderedDict[str, list]" = OrderedDict()
        for p in sorted(rest):
            seg = p.strip("/").split("/")[0].split("?")[0] if "/" in p.strip("/") else "Top-level pages"
            folders.setdefault(seg, []).append(p)
        secs = []
        for seg, ps in sorted(folders.items(), key=lambda kv: -len(kv[1]))[:14]:
            items = [[self.label(p), self.slug(p)] for p in ps if self.take(p)]
            for p in ps:
                self.where.setdefault(p, "Sitemap")
            groups = [[f"{humanize('/' + seg) if seg != 'Top-level pages' else seg} ({i // CHUNK + 1})" if len(items) > CHUNK else (humanize('/' + seg) if seg != "Top-level pages" else seg), None, items[i:i + CHUNK]] for i in range(0, len(items), CHUNK)]
            if groups:
                secs.append({"name": humanize("/" + seg) if seg != "Top-level pages" else seg, "groups": groups[:12]})
        if secs:
            self.data.append({"name": "Other pages", "secs": secs})
        return self.data


def _tool_names(rep, cat):
    return [n for n, i in rep["tools"].items() if i["cat"] == cat]


def stack(rep: dict) -> dict:
    T = rep["tools"]
    tm = [["Google Tag Manager", g] for g in rep.get("gtm", [])]
    tags = []
    for n, i in T.items():
        if i["cat"] in ("Analytics", "Ads", "Insight") and len(tags) < 9:
            role = {"Analytics": "Analytics", "Ads": "Ads & retargeting", "Insight": "Heatmaps / testing"}[i["cat"]]
            tags.append([n.replace(" (DV360 / CM360)", ""), (i["ids"][0] if i["ids"] else "found"), role + (" · via Tag Manager" if i.get("via") else "")])
    ads = []
    ad_desc = {
        "Google Ads": "Conversion tag found, so they buy Google Search, Shopping or YouTube ads.",
        "Meta Pixel": "Facebook and Instagram ads can retarget visitors and track sales.",
        "TikTok Pixel": "TikTok ads are measured on the site.",
        "LinkedIn Insight": "LinkedIn ads are measured (B2B audiences).",
        "Microsoft Ads (UET)": "Bing / Microsoft Search ads are measured.",
        "Floodlight (DV360 / CM360)": "Google Marketing Platform: programmatic display and video.",
        "Criteo": "Retargeting ads that follow visitors around the web.",
        "Pinterest Tag": "Pinterest ads are measured.", "Snap Pixel": "Snapchat ads are measured.", "X (Twitter) Pixel": "X ads are measured.",
        "Taboola": "Native ads on news sites.", "Outbrain": "Native ads on news sites.", "Google AdSense": "The site itself shows Google ads.",
        "Reddit Pixel": "Reddit ads are measured.", "Quora Pixel": "Quora ads are measured.",
    }
    for n, i in T.items():
        if i["cat"] == "Ads" and n in ad_desc:
            ids = ", ".join(i["ids"][:2])
            ads.append([n.replace(" (DV360 / CM360)", ""), "Active" + (f" · {len(i['ids'])} ID" + ("s" if len(i["ids"]) > 1 else "") if i["ids"] else ""), "good", ad_desc[n] + (f" ({ids})" if ids and n != "Meta Pixel" else "")])
    if not ads:
        ads.append(["No ad pixels found", "None", "off", "No Google Ads, Meta, TikTok or LinkedIn tags were found, so paid ads are not measured on the site."])
    cats = OrderedDict()
    for n, i in T.items():
        if i["cat"] in CAT_COLOR and i["cat"] != "Consent":
            cats.setdefault(i["cat"], []).append(n)
    tools = [[c, ", ".join(ns), CAT_COLOR[c]] for c, ns in cats.items()]
    ev = rep.get("events", [])
    notes = []
    eco = [e for e in ev if e in ("view_item", "add_to_cart", "begin_checkout", "purchase")]
    if len(eco) >= 3:
        notes.append(["Full-funnel tracking", f"They track {len(ev)} steps, from {ev[0]} to {ev[-1]}, so ads can target people by how far they got."])
    elif not ads or ads[0][2] == "off":
        notes.append(["Ads are not measured", "Without ad pixels or conversion events, any money spent on ads can't be tied to leads or sales."])
    lead = [e for e in ev if e in ("generate_lead", "form_submit", "contact_form_submit", "submit_lead_form")]
    if lead and not eco:
        notes.append(["Only forms count as leads", "Form submissions are tracked; calls, WhatsApp and chat are not, so lead counts are lower than reality."])
    if any(n in T for n in ("Microsoft Clarity", "Hotjar")):
        notes.append(["They watch visitors", "Heatmaps and session recordings (Clarity / Hotjar) show where people click and drop off."])
    if not notes:
        notes.append(["Tracking basics", f"{len(T)} tools recognised on the homepage and in the tag container."])
    d = rep["domain"]
    links = {"google": f"https://adstransparency.google.com/?region=anywhere&domain={d}",
             "meta": f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q={(rep.get('brand') or d).replace(' ', '%20')}&search_type=keyword_unordered",
             "linkedin": f"https://www.linkedin.com/ad-library/search?keyword={(rep.get('brand') or d).replace(' ', '%20')}"}
    return {"tagManagers": tm, "tags": tags, "ads": ads[:6], "tools": tools, "events": ev[:12], "notes": notes[:3], "links": links}


def catalog(rep: dict) -> dict | None:
    shop = rep.get("shop") or {}
    ps = shop.get("products") or []
    if not ps:
        return None
    disc = [1 - p["price"] / p["mrp"] for p in ps if p["mrp"] > p["price"] > 0]
    rated = [f for k, f in rep["pages"].items() if k.startswith("/products/") and f.get("rv")]
    cur = shop.get("currency") or ""
    return {"total": len(ps), "avail": sum(1 for p in ps if p["avail"]), "disc": round(sum(disc) / len(disc) * 100) if disc else 0,
            "min": min(p["price"] for p in ps), "max": max(p["price"] for p in ps),
            "rating": round(sum(f["rv"] for f in rated) / len(rated), 1) if rated else 0, "reviews": sum(f.get("rc", 0) for f in rated),
            "cur": SYMBOL.get(cur, (cur + " ") if cur else "")}


def seo_counts(rep: dict) -> dict:
    ok = {p: f for p, f in rep["pages"].items() if f.get("s") == 200}
    tc = Counter(f.get("t") for f in ok.values() if f.get("t"))
    return {"ok": len(ok), "noTitle": [p for p, f in ok.items() if not f.get("t")], "noDesc": [p for p, f in ok.items() if not f.get("d")],
            "longTitle": [p for p, f in ok.items() if len(f.get("t", "")) > 60], "longDesc": [p for p, f in ok.items() if len(f.get("d", "")) > 160],
            "noH1": [p for p, f in ok.items() if not f.get("h1")], "multiH1": [p for p, f in ok.items() if len(f.get("h1", [])) > 1],
            "noindex": [p for p, f in ok.items() if f.get("ni")], "dupTitles": {t: [p for p, f in ok.items() if f.get("t") == t] for t, n in tc.items() if n > 1},
            "broken": [p for p, f in rep["pages"].items() if (f.get("s") or 0) >= 400 or f.get("s") == 0],
            "redirects": [p for p, f in rep["pages"].items() if f.get("f")]}


def funnel(rep: dict, cat: dict | None, st: dict, seo: dict) -> tuple[list, dict]:
    T, C = rep["tools"], rep["contacts"]
    has = lambda *ns: [n for n in ns if n in T]
    ads_items = []
    for name, label, text in [("Google Ads", "Google ads", "Search, Shopping or YouTube ads (conversion tag found)"), ("Meta Pixel", "Facebook & Instagram", "Meta pixel tracks visits for ads and retargeting"),
                              ("TikTok Pixel", "TikTok ads", "TikTok pixel on the site"), ("LinkedIn Insight", "LinkedIn ads", "LinkedIn tag for B2B audiences"),
                              ("Microsoft Ads (UET)", "Microsoft ads", "Bing search ads tag"), ("Criteo", "Retargeting (Criteo)", "Ads that follow visitors around the web"),
                              ("Floodlight (DV360 / CM360)", "Programmatic display", "Google Marketing Platform Floodlight tags")]:
        if name in T:
            ads_items.append([label, text])
    types = rep.get("sitemapTypes", {})
    blogish = rep.get("blogCount") or sum(v for k, v in types.items() if re.search(r"blog|article|post|news", k, re.I))
    organic = ["Organic search", f"{rep.get('sitemapCount', 0):,} URLs in the sitemap" + (f", {blogish:,} blog posts" if blogish else "")]
    social = ["Social profiles", ", ".join(list(C.get("socials", {}))[:5]) or "No social profiles linked from the homepage"]
    first = lambda pat: (find_pages(rep, pat, 1) or [None])[0]
    s = lambda p: p.lstrip("/") if p else None
    home_note = "The homepage redirects to " + rep["homeRedirect"] if rep.get("homeRedirect") else "First impression and main menu"
    notes = []
    if rep.get("homeRedirect"):
        notes.append(["The homepage is a redirect", f"/ sends every visitor to {rep['homeRedirect']}, so that page is the real front door."])
    if seo["broken"]:
        notes.append([f"{len(seo['broken'])} broken link" + ("s" if len(seo["broken"]) > 1 else ""), "Pages linked from the site return an error: " + ", ".join(seo["broken"][:3]) + ("…" if len(seo["broken"]) > 3 else "")])
    if rep["type"] == "shop" and cat:
        notes.append([f"{round(cat['avail'] / max(1, cat['total']) * 100)}% in stock", f"{cat['avail']:,} of {cat['total']:,} products can be bought today. Sold-out pages still collect search and ad clicks."])
    if seo["noDesc"]:
        notes.append([f"{len(seo['noDesc'])} pages without a description", "Google writes its own snippet for these, usually a weaker one."])
    if rep["type"] == "shop":
        checkout = has("GoKwik checkout", "Shopflo checkout") or (["Shopify checkout"] if rep.get("platform") == "Shopify" else ["Store checkout"])
        pay = has("Razorpay", "Simpl pay-later", "Snapmint", "Cashfree", "PayU", "Paytm", "PayPal", "Stripe", "Klarna")
        reviews = has("Judge.me", "Yotpo", "Okendo", "Stamped", "Loox", "Trustpilot")
        loyal = has("Nector", "Smile.io", "LoyaltyLion")
        eng = has("Klaviyo", "CleverTap", "MoEngage", "WebEngage", "OneSignal", "Mailchimp", "Netcore Smartech")
        search = has("Algolia search", "Searchanise", "Boost Commerce", "Klevu")
        coll = first(r"^/(collections?|product-category|category|shop)/")
        prod = first(r"^/(products?|product)/")
        deal = first(r"sale|deal|offer|discount|clearance")
        STG = [
            {"n": "Discover", "d": "Where shoppers first meet the brand", "c": "--c-about", "items": (ads_items or [["No ad tags found", "Paid ads are not measured on the site"]]) + [organic, social]},
            {"n": "Land", "d": "First page after the click", "c": "--c-tech", "items": [["Homepage", home_note, ""]] + ([["Category pages", f"{types.get('sitemap_collections', 0) or len(rep['shop'].get('collections', {}))} collections", s(coll)]] if coll else []) + ([["Product pages", "Shopping ads usually land straight on a product", s(prod)]] if prod else []) + ([["Deal pages", "Sale and offer pages", s(deal)]] if deal else [])},
            {"n": "Browse", "d": "Finding the right product", "c": "--c-services", "items": [["Menu", f"{len(rep['menu'])} main sections"]] + ([["Site search", ", ".join(search)]] if search else ([["Search page", "Built-in search", "search"]] if "/search" in rep["pages"] else [])) + [["Collections", f"{len(rep['shop'].get('collections', {}))} collections linked from the menu"]]},
            {"n": "Evaluate", "d": "Convincing on the product page", "c": "--c-ai", "items": [["Price & discount", f"Average {cat['disc']}% off the listed price" if cat and cat["disc"] else "Prices on product pages"]] + ([["Ratings & reviews", ", ".join(reviews) + (f", average ★{cat['rating']}" if cat and cat['rating'] else "")]] if reviews else ([["Ratings", f"Average ★{cat['rating']} on rated products"]] if cat and cat["rating"] else [])) + [[t, "Policy page", s(p)] for t, p in [("Returns & shipping", first(r"return|refund|shipping|delivery")), ("Warranty", first(r"warrant"))] if p]},
            {"n": "Add to cart", "d": "Committing to buy", "c": "--c-dm", "items": [["Add to cart", "Tracked as add_to_cart" if "add_to_cart" in rep["events"] else "Cart button on product pages"]] + ([["Cart page", "Order summary before checkout", "cart"]] if rep["pages"].get("/cart", {}).get("s") == 200 else [])},
            {"n": "Checkout", "d": "Contact and address", "c": "--c-contact", "items": [[c, "Checkout used by the store"] for c in checkout] + ([["Shipping info", "Tracked as add_shipping_info"]] if "add_shipping_info" in rep["events"] else [])},
            {"n": "Pay & order", "d": "Payment and confirmation", "c": "--c-x1", "items": ([[p, "Payment option found on the site"] for p in pay[:4]] or [["Payment", "Payment step of the store checkout"]]) + ([["Purchase event", "Sales are reported to analytics and ad platforms"]] if "purchase" in rep["events"] else [])},
            {"n": "After purchase", "d": "Delivery, support, repeat", "c": "--c-res", "items": [[t, "Help page", s(p)] for t, p in [("Track your order", first(r"track|order")), ("Contact & support", first(r"contact|support|help"))] if p] + ([["Email & push", ", ".join(eng)]] if eng else []) + ([["Loyalty", ", ".join(loyal)]] if loyal else []) + ([["Referral", "Refer-a-friend page", s(first(r"refer"))]] if first(r"refer") else [])},
        ]
        title, desc = "Sales funnel: visit to purchase", f"Every step a shopper takes on {rep['domain']}, from the first ad or search to the order and after. Built from the live pages and tracking tags. Click a linked card to inspect that page."
    else:
        chat = has("Zoho SalesIQ", "Intercom", "Drift", "Tawk.to", "Crisp", "Freshchat / Freshdesk", "Zendesk", "LiveChat", "Tidio", "Sprinklr")
        book = has("Calendly", "Typeform")
        eng = has("HubSpot", "Mailchimp", "Klaviyo", "CleverTap", "MoEngage", "WebEngage", "OneSignal")
        hubs = [it for it in rep["menu"] if it.get("href")][:3]
        reviews = list(C.get("reviewSites", {}))
        STG = [
            {"n": "Attract", "d": "Where visitors come from", "c": "--c-about", "items": (ads_items or [["No ad tags found", "Paid ads are not measured on the site"]]) + [organic, social] + ([["Review sites", ", ".join(reviews[:4])]] if reviews else [])},
            {"n": "Land", "d": "The first page they see", "c": "--c-tech", "items": [["Homepage", home_note, ""]] + [[h["label"], "Main section page", s(h["href"])] for h in hubs] + ([["Location pages", "City / area landing pages", s(first(r"near|city|location|-in-[a-z]+$"))]] if first(r"near|city|location|-in-[a-z]+$") else [])},
            {"n": "Trust", "d": "Proof that keeps them reading", "c": "--c-services", "items": [[t, "Proof page", s(p)] for t, p in [("Testimonials", first(r"testimonial|review")), ("Case studies", first(r"case-stud|success")), ("Portfolio", first(r"portfolio|work|projects")), ("About us", first(r"about|who-we-are|our-story|company"))] if p] + ([["Review badges", ", ".join(reviews[:3])]] if reviews else [])},
            {"n": "Convert", "d": "How they become a lead", "c": "--c-dm", "items": ([["Contact page", "Main enquiry page", s(first(r"contact|get-in-touch|enquir|quote"))]] if first(r"contact|get-in-touch|enquir|quote") else []) + ([["Forms", f"{C['forms']} form(s) on the homepage"]] if C["forms"] else []) + ([["Phone", ", ".join(C["phones"][:2])]] if C["phones"] else []) + ([["Email", ", ".join(C["emails"][:2])]] if C["emails"] else []) + ([["WhatsApp", "WhatsApp chat link"]] if C["whatsapp"] else []) + ([["Live chat", ", ".join(chat)]] if chat else []) + ([["Booking", ", ".join(book)]] if book else [])},
            {"n": "Grow", "d": "Bring them back and upsell", "c": "--c-ai", "items": [[t, "Page", s(p)] for t, p in [("Pricing / packages", first(r"pric|package|plan")), ("Blog", first(r"^/blogs?(/|$)|^/news|^/insights"))] if p] + ([["Email & CRM", ", ".join(eng)]] if eng else []) + ([["Newsletter signup", "Email box on the homepage"]] if C["emailInputs"] else [])},
        ]
        title, desc = "Sales funnel: visit to lead", f"How a visitor moves from first click to enquiry on {rep['domain']}. Built from the live pages, contact options and tracking tags. Click a linked card to inspect that page."
    for stg in STG:
        if not stg["items"]:
            stg["items"] = [["Nothing found", "No page or tool for this step was found"]]
    summary = f"{len(STG)} steps from the first visit to " + ("the order and after." if rep["type"] == "shop" else "an enquiry.")
    return STG, {"title": title, "desc": desc, "summary": summary, "notes": notes[:4]}


def recommendations(rep: dict, seo: dict, st: dict, cat: dict | None) -> list[str]:
    r = []
    if seo["broken"]:
        r.append(f"Fix the {len(seo['broken'])} broken link(s) first: " + ", ".join(seo["broken"][:4]) + ".")
    if seo["noTitle"]:
        r.append(f"Give the {len(seo['noTitle'])} page(s) with no title a unique title with their main keyword.")
    if seo["noDesc"]:
        r.append(f"Write meta descriptions for {len(seo['noDesc'])} page(s); Google shows them as the snippet under the link.")
    if seo["dupTitles"]:
        r.append(f"{len(seo['dupTitles'])} title(s) are shared by several pages, so those pages compete with each other. Make each one unique.")
    if len(seo["longTitle"]) > 5:
        r.append(f"Shorten {len(seo['longTitle'])} titles to under 60 characters so Google doesn't cut them off.")
    if seo["noH1"]:
        r.append(f"Add one H1 heading to the {len(seo['noH1'])} page(s) that have none.")
    T = rep["tools"]
    if not any(i["cat"] == "Ads" for i in T.values()):
        r.append("Add Google Ads and Meta pixels (through Google Tag Manager) before spending on ads, so every lead or sale is measured.")
    if rep["type"] == "shop" and "purchase" not in rep["events"]:
        r.append("Track e-commerce events (view_item, add_to_cart, begin_checkout, purchase) in GA4 and the ad pixels.")
    if rep["type"] != "shop" and not any(e in rep["events"] for e in ("generate_lead", "form_submit", "contact_form_submit")):
        r.append("Track form submissions, calls and WhatsApp clicks as conversions so ad platforms can optimise for leads.")
    if cat and cat["total"] and cat["avail"] / cat["total"] < 0.6:
        r.append("Many products are sold out: redirect old sold-out pages to the newest model or show alternatives on them.")
    if rep["type"] == "shop" and not any(T.get(n) for n in ("Judge.me", "Yotpo", "Okendo", "Stamped", "Loox", "Trustpilot")):
        r.append("Add a review app with star ratings and Product schema; stars in Google results lift clicks.")
    if not rep["contacts"].get("whatsapp") and rep["type"] != "shop":
        r.append("Add a WhatsApp chat button; many Indian buyers prefer it to forms.")
    return r[:8]


def build(rep: dict, max_cards: int = 2200) -> dict:
    """Everything render.py needs."""
    b = Board(rep, max_cards)
    data = b.build()
    br = {l["name"]: PALETTE[i % len(PALETTE)] for i, l in enumerate(data)}
    seo = {p.lower(): {k: v for k, v in f.items() if k in ("s", "f", "t", "d", "k", "h1", "c", "rv", "rc", "ni")} for p, f in rep["pages"].items()}
    sc = seo_counts(rep)
    broken = [[p + (" → " + rep["pages"][p]["f"] if rep["pages"][p].get("f") else ""), {"Menu": "Linked from the menu", "Footer": "Linked from the footer", "Header": "Linked from the header"}.get(b.where.get(p, ""), "Listed in the sitemap")] for p in sc["broken"]]
    cat = catalog(rep)
    st = stack(rep)
    stg, fun = funnel(rep, cat, st, sc)
    brand = rep.get("brand") or rep["domain"]
    mark = re.sub(r"[^A-Za-z0-9]", "", brand)[:4] or rep["domain"][:3]
    names = {brand.lower(), brand.split()[0].lower(), rep["domain"].split(".")[0].lower()}
    brand_title = next((f["t"] for f in rep["pages"].values() if f.get("s") == 200 and f.get("t", "").strip().lower() in names), brand)
    X = {
        "site": {"domain": rep["domain"], "host": rep["host"], "brand": brand, "brandTitle": brand_title, "mark": mark,
                 "homeNote": ("Redirects to " + rep["homeRedirect"]) if rep.get("homeRedirect") else (rep.get("platform") or "Homepage")},
        "funnel": fun, "stack": st, "catalog": cat, "recs": recommendations(rep, sc, st, cat),
        "home": {"h": rep.get("homeH") or 0, "sections": rep.get("homeSections", [])} if rep.get("shots", {}).get("home") else None,
        "gallery": rep.get("gallery", []),
        "suggest": (["Give me a summary", "Which products are cheapest?", "What are the biggest SEO problems?", "Which ad platforms do they use?"] if rep["type"] == "shop"
                    else ["Give me a summary", "What are the biggest SEO problems?", "How do visitors contact them?", "Which tracking tools do they use?"]),
        "slides": {"stack": f"{len(rep['tools'])} tools recognised: analytics, ad pixels and site tools.", "health": f"{sc['ok']} pages checked; {len(sc['noDesc'])} have no description, {len(sc['broken'])} are broken.",
                   "catalog": f"{cat['total']:,} products, {cat['disc']}% average discount, {round(cat['avail'] / max(1, cat['total']) * 100)}% in stock." if cat else "",
                   "lines": "Click a bubble to list and highlight its pages.", "gallery": "Screenshots of the main pages.", "home": "The homepage from top to bottom."},
    }
    return {"DATA": data, "PROD": b.prod, "SEO": seo, "BROKEN": broken, "STG": stg, "BR": br, "X": X, "SHOTDATA": rep.get("shots", {}), "seo_counts": sc, "cards": b.cards}
