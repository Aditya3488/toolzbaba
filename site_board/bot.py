"""SiteBot: a free, offline question-answering bot over a crawl report. No AI service, no API key.

How it thinks: the question is normalised (Hinglish words mapped to English), scored against ~40 intents by cue words,
entities are pulled out (page / product names by fuzzy matching, prices like "under 2000", platform names), and the
best intent's handler builds an answer from the crawl data. If nothing fits, a BM25 search over every page answers.
Every answer is {"answer": text, "pages": [slugs], "highlight": [slugs], "follow": [suggested questions]}.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from difflib import SequenceMatcher

from . import model as M

HINGLISH = {
    "kitne": "how many", "kitna": "how much", "kitni": "how many", "kya": "what", "kaise": "how", "kaun": "which", "kaunsa": "which",
    "kaunse": "which", "sabse": "most", "sasta": "cheap", "saste": "cheap", "sasti": "cheap", "mehenga": "expensive", "mehnga": "expensive",
    "mehengi": "expensive", "achha": "good", "accha": "good", "bura": "bad", "galti": "problem", "galtiyan": "problems", "dikhao": "show",
    "batao": "tell", "bata": "tell", "hai": "", "hain": "", "ka": "", "ki": "", "ke": "", "mein": "in", "par": "on", "aur": "and",
    "kahan": "where", "kyu": "why", "kyon": "why", "chahiye": "need", "sudhar": "improve", "badhao": "increase", "bikri": "sales",
    "daam": "price", "keemat": "price", "rate": "price", "stock": "stock", "khatam": "sold out", "naya": "new", "purana": "old",
}
TOPIC_NOISE = re.compile(r"\b(cheapest|cheaper|cheap|lowest|low|prices?|priced|most|expensive|costliest|costly|premium|best|top|rated|ratings?|highest|high|"
                         r"reviewed|reviews?|products?|items?|discounts?|discounted|biggest|big|offers?|deals?|sold|out|stock|available|which|what|are|is|show|"
                         r"list|me|the|of|with|has|have|their|they|sell|selling|sellers?|popular|ones?|any|in|on|for|kaun|sa|se|sabse)\b")
STOP = set("a an the is are was were be of to in on at for and or with by from about this that these those it its do does did can could should would "
           "me my i you your we our they their them what which who how why where when there here any some all please tell show give list".split())


def norm(q: str) -> str:
    q = q.lower().replace("’", "'")
    q = re.sub(r"[₹$€£]", " ", q)
    q = re.sub(r"(\d)\s*k\b", lambda m: m.group(1) + "000", q)
    q = re.sub(r"(\d),(\d{3})", r"\1\2", q)
    words = re.findall(r"[a-z0-9\.\-+]+|[^\sa-z0-9]", q)
    return " ".join(HINGLISH.get(w, w) for w in words).strip()


def tokens(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 1]


# intent: (cue words or phrases, weight); a phrase scores higher than a single word
INTENTS = {
    "greet": ["hi", "hello", "hey", "namaste", "help", "what can you do", "who are you"],
    "summary": ["summary", "overview", "summarise", "summarize", "about this site", "about the site", "tell me about", "explain the site", "what is this site", "brief"],
    "count_pages": ["how many pages", "number of pages", "total pages", "page count", "how big", "size of the site", "how many urls"],
    "count_products": ["how many products", "number of products", "total products", "product count", "catalogue size", "catalog size"],
    "structure": ["structure", "sections", "menu", "navigation", "categories", "main pages", "site map", "sitemap", "hierarchy", "what sections"],
    "section": ["what is in", "what's in", "inside", "pages in", "pages under", "products in", "show section"],
    "seo_overall": ["seo", "seo problems", "seo issues", "biggest problems", "what is wrong", "issues", "mistakes", "errors", "audit", "health", "score"],
    "broken": ["broken", "404", "dead link", "not found", "error pages", "broken links"],
    "redirects": ["redirect", "redirects", "301", "302", "moved"],
    "no_desc": ["meta description", "no description", "missing description", "without description", "descriptions"],
    "no_title": ["missing title", "no title", "without title", "title missing", "empty title"],
    "long_title": ["long title", "long titles", "title length", "titles too long", "over 60"],
    "no_h1": ["h1", "heading", "no h1", "missing h1", "multiple h1"],
    "dup_titles": ["duplicate", "same title", "duplicate titles", "repeated titles"],
    "noindex": ["noindex", "not indexed", "blocked from google", "hidden from google"],
    "worst_pages": ["worst pages", "fix first", "lowest score", "priority pages", "which pages to fix"],
    "keywords": ["keyword", "keywords", "target", "targeting", "rank for", "search terms", "topics"],
    "page_info": ["seo of", "about the page", "page details", "details of", "check page", "info on", "information about"],
    "tracking": ["tracking", "analytics", "pixel", "pixels", "tag manager", "gtm", "ga4", "google analytics", "measure", "tags", "conversion"],
    "ads": ["ads", "advert", "advertising", "ad platforms", "paid", "ppc", "campaign", "running ads", "facebook ads", "google ads", "meta ads", "marketing spend"],
    "has_tool": ["do they use", "does it use", "are they using", "is there", "do they have", "using"],
    "tools": ["tools", "tech stack", "technology", "stack", "built with", "platform", "cms", "apps", "plugins", "software"],
    "checkout": ["checkout", "payment", "payments", "pay", "cod", "cash on delivery", "upi", "razorpay", "gokwik"],
    "funnel": ["funnel", "journey", "customer journey", "conversion path", "how do they sell", "sales process", "from visit", "steps"],
    "contact": ["contact", "phone", "call", "email", "whatsapp", "address", "reach them", "number", "social", "instagram", "facebook page", "linkedin page"],
    "improve": ["improve", "better", "recommend", "recommendation", "suggestion", "advice", "grow", "increase sales", "more sales", "more leads", "what should", "fix", "opportunity", "weakness", "competitor", "beat them", "outrank"],
    "cheapest": ["cheap", "cheapest", "lowest price", "least expensive", "budget", "affordable", "minimum price"],
    "expensive": ["expensive", "costliest", "highest price", "premium", "most expensive", "maximum price"],
    "under_price": ["under", "below", "less than", "within", "upto", "up to", "between"],
    "best_rated": ["best rated", "highest rated", "top rated", "best reviews", "best product", "rating", "ratings", "stars"],
    "most_reviewed": ["most reviewed", "most reviews", "popular", "best seller", "bestseller", "best selling", "top products", "most bought"],
    "discount": ["discount", "discounts", "off", "sale", "offer", "deal", "deals", "mrp"],
    "stock": ["out of stock", "sold out", "in stock", "available", "availability", "stock"],
    "price_of": ["price of", "cost of", "how much is", "how much does", "price for"],
    "compare": ["compare", "vs", "versus", "difference between", "better than"],
    "lines": ["product lines", "series", "ranges", "lines", "collections", "brands"],
    "reviews_total": ["total reviews", "how many reviews", "review count", "average rating"],
    "home": ["homepage", "home page", "front page", "landing page", "first page"],
    "blog": ["blog", "articles", "posts", "content marketing", "news"],
    "thanks": ["thanks", "thank you", "great", "awesome", "ok", "okay", "cool", "nice"],
}


class SiteBot:
    def __init__(self, report: dict):
        self.r = report
        self.m = M.build(report)
        self.seo = self.m["seo_counts"]
        self.brand = report.get("brand") or report["domain"]
        self.title_count = Counter(f.get("t") for f in report["pages"].values() if f.get("s") == 200 and f.get("t"))
        self.brand_names = {self.brand.lower(), self.brand.split()[0].lower(), report["domain"].split(".")[0].lower()}
        self.brand_words = {w for w in re.sub(r"[^\w\s]", "", self.brand.lower()).split() if len(w) > 2} | {report["domain"].split(".")[0].lower()}
        self.items = []  # every card: dict(slug, path, label, section, l1, kind, facts, prod, audit-ish score)
        for l1 in self.m["DATA"]:
            for sec in l1["secs"]:
                for gname, hub, links in sec["groups"]:
                    for lab, slug in ([[gname, hub]] if hub else []) + links:
                        path = "/" + slug if slug else "/"
                        f = report["pages"].get(path, {})
                        self.items.append({"slug": slug, "path": path, "label": lab, "sec": sec["name"], "l1": l1["name"], "group": gname,
                                           "f": f, "p": self.m["PROD"].get(slug), "score": self._score(f)})
        if not any(i["slug"] == "" for i in self.items):
            self.items.insert(0, {"slug": "", "path": "/", "label": "Home", "sec": "Home", "l1": "Home", "group": "", "f": report["pages"].get("/", {}), "p": None, "score": self._score(report["pages"].get("/", {}))})
        self.prods = [i for i in self.items if i["p"]]
        self._index()

    # ---------- helpers ----------
    def _score(self, f: dict) -> int:
        if not f or f.get("s") is None:
            return -1
        if f.get("s") != 200:
            return 0
        s = 100
        t, d = f.get("t", ""), f.get("d", "")
        if not t or t.strip().lower() in self.brand_names: s -= 30
        if t and self.title_count.get(t, 0) > 1 and t.strip().lower() not in self.brand_names: s -= 20
        if not d or "create next app" in d.lower(): s -= 25
        if not f.get("h1"): s -= 15
        elif len(f["h1"]) > 1: s -= 5
        if len(t) > 60: s -= 8
        if len(d) > 160: s -= 7
        return max(0, s)

    def _index(self):
        self.docs = []
        for it in self.items:
            f = it["f"]
            text = " ".join([it["label"], it["label"], it["sec"], it["group"], it["path"].replace("/", " ").replace("-", " "), f.get("t", ""), f.get("d", ""), " ".join(f.get("h1", [])), f.get("k", "")])
            self.docs.append(Counter(tokens(text)))
        self.df = Counter(w for d in self.docs for w in d)
        self.avgdl = sum(sum(d.values()) for d in self.docs) / max(1, len(self.docs))

    def search(self, q: str, k: int = 6, pool=None) -> list[dict]:
        qt = tokens(q)
        if not qt:
            return []
        N = len(self.docs)
        scored = []
        for i, d in enumerate(self.docs):
            if pool is not None and self.items[i] not in pool:
                continue
            dl = sum(d.values()) or 1
            s = 0.0
            for w in qt:
                if w in d:
                    idf = math.log(1 + (N - self.df[w] + 0.5) / (self.df[w] + 0.5))
                    s += idf * d[w] * 2.2 / (d[w] + 1.2 * (0.25 + 0.75 * dl / self.avgdl))
            if s > 0:
                scored.append((s, i))
        scored.sort(reverse=True)
        return [self.items[i] for _, i in scored[:k]]

    def find(self, q: str, pool=None, min_ratio: float = 0.55):
        """Best page/product whose name appears in the question (fuzzy)."""
        pool = pool if pool is not None else self.items
        ql = norm(q)
        best, best_s = None, 0.0
        qt = set(tokens(ql))
        for it in pool:
            for name in (it["label"].lower(), re.sub(r"[-_/]+", " ", it["path"].strip("/").split("/")[-1]).lower()):
                if not name or len(name) < 3:
                    continue
                nt = set(tokens(name))
                if not nt:
                    continue
                overlap = len(nt & qt) / len(nt)
                cover = len(nt & qt) / len(qt) if len(qt) >= 2 else 0.0  # most of the question's words are in this name
                contains = 1.0 if name in ql else 0.0
                ratio = SequenceMatcher(None, name, ql).find_longest_match(0, len(name), 0, len(ql)).size / max(1, len(name))
                s = max(contains, overlap * 0.9 + (0.1 if overlap == 1 else 0), ratio * 0.95, cover * 0.92)
                if s > best_s or (s == best_s and best and len(name) > len(best["label"])):
                    best, best_s = it, s
        return best if best_s >= min_ratio else None

    def money(self, n: float) -> str:
        cur = (self.m["X"].get("catalog") or {}).get("cur", "")
        return f"{cur}{round(n):,}"

    def plist(self, items, n=8, extra=None) -> str:
        lines = []
        for it in items[:n]:
            e = extra(it) if extra else ""
            lines.append(f"- **{it['label']}**{(' · ' + e) if e else ''}")
        return "\n".join(lines)

    def ptext(self, it) -> str:
        p, f = it["p"], it["f"]
        off = round((1 - p["p"] / p["m"]) * 100) if p and p["m"] > p["p"] > 0 else 0
        return " · ".join(x for x in [self.money(p["p"]) if p else "", f"{off}% off" if off else "", f"★{f['rv']} ({f.get('rc', 0):,})" if f.get("rv") else "", "sold out" if p and not p["a"] else ""] if x)

    def out(self, answer, pages=None, highlight=None, follow=None):
        return {"answer": answer, "pages": [p["slug"] for p in (pages or [])][:8], "highlight": [p["slug"] for p in (highlight or [])],
                "follow": follow or []}

    # ---------- intent detection ----------
    def intent(self, q: str) -> tuple[str, float]:
        scores = {}
        padded = f" {q} "
        for name, cues in INTENTS.items():
            s = 0.0
            for c in cues:
                if f" {c} " in padded:
                    s += 1.0 + 0.6 * c.count(" ")
            if s:
                scores[name] = s
        if not scores:
            return "", 0.0
        # products questions only make sense for shops
        if not self.prods:
            for k in ("cheapest", "expensive", "under_price", "best_rated", "most_reviewed", "discount", "stock", "price_of", "lines", "count_products", "reviews_total"):
                scores.pop(k, None)
        if not scores:
            return "", 0.0
        best = max(scores, key=scores.get)
        return best, scores[best]

    def ask(self, question: str) -> dict:
        q = norm(question or "")
        if not q:
            return self.h_greet(q)
        name, score = self.intent(q)
        price = self._price_range(q)
        if price and self.prods and name in ("", "under_price", "cheapest", "discount", "best_rated", "most_reviewed", "structure", "lines", "section"):
            return self.h_under_price(q, price)
        if name == "summary":  # "tell me about <a page>" is about that page, not the whole site
            it = self.find(q, min_ratio=0.75)
            if it and it["slug"] and not re.search(r"(site|website|company|business|brand)", q):
                return self.h_page_info(q)
        handler = getattr(self, "h_" + name, None) if name else None
        if handler:
            try:
                res = handler(q)
                if res:
                    return res
            except Exception as e:  # never crash on a question
                return self.out(f"I hit a problem answering that ({type(e).__name__}). Try asking it another way.")
        return self.h_search(q)

    def _price_range(self, q: str):
        m = re.search(r"(?:between|from)\s+(\d{2,7})\s+(?:and|to|-)\s+(\d{2,7})", q)
        if m:
            return float(m.group(1)), float(m.group(2))
        m = re.search(r"(?:under|below|less than|within|upto|up to|max|maximum|<)\s*(\d{2,7})", q)
        if m:
            return 0.0, float(m.group(1))
        m = re.search(r"(?:above|over|more than|>)\s*(\d{2,7})", q)
        if m:
            return float(m.group(1)), 1e12
        return None

    # ---------- handlers ----------
    def h_greet(self, q):
        shop = bool(self.prods)
        return self.out(f"I've read **{self.r['domain']}** ({len(self.r['pages'])} pages checked{f', {len(self.prods)} products' if shop else ''}). Ask me about:\n"
                        "- the site structure and what's in each section\n- SEO problems, broken links, missing titles or descriptions\n"
                        "- tracking tools, ad platforms and the tech stack\n- the sales funnel and how visitors convert\n"
                        + ("- products, prices, discounts, ratings and stock\n" if shop else "- contact options and lead capture\n") + "- what to improve first",
                        follow=self.m["X"]["suggest"])

    def h_thanks(self, q):
        return self.out("Happy to help! Ask me anything else about the site.", follow=["What should they fix first?", "Give me a summary"])

    def h_summary(self, q):
        r, sc, X = self.r, self.seo, self.m["X"]
        kinds = {"shop": "an online shop", "leadgen": "a lead-generation (services) site", "content": "a content site"}[r["type"]]
        ads = [a[0] for a in X["stack"]["ads"] if a[2] == "good"]
        sec = ", ".join(l["name"] for l in self.m["DATA"][:6])
        cat = X.get("catalog")
        lines = [f"**{self.brand}** ({r['domain']}) is {kinds}" + (f" built on {r['platform']}" if r.get("platform") else "") + ".",
                 f"- **Size:** {r.get('sitemapCount', 0):,} URLs in the sitemap, {sc['ok']} pages checked" + (f", {cat['total']:,} products ({cat['avail']:,} in stock)" if cat else "") + ".",
                 f"- **Main sections:** {sec}.",
                 f"- **Ads & tracking:** " + (", ".join(ads) if ads else "no ad pixels found") + f"; {len(r['tools'])} tools recognised.",
                 f"- **SEO health:** {len(sc['noDesc'])} pages without a description, {len(sc['longTitle'])} long titles, {len(sc['broken'])} broken links."]
        if r.get("homeRedirect"):
            lines.append(f"- **Note:** the homepage redirects to {r['homeRedirect']}.")
        if cat:
            lines.append(f"- **Catalogue:** prices {self.money(cat['min'])}–{self.money(cat['max'])}, average discount {cat['disc']}%" + (f", average rating ★{cat['rating']}" if cat["rating"] else "") + ".")
        if X["recs"]:
            lines.append(f"- **First thing to fix:** {X['recs'][0]}")
        return self.out("\n".join(lines), follow=["What are the biggest SEO problems?", "Which ad platforms do they use?", "Explain their sales funnel"])

    def h_count_pages(self, q):
        r = self.r
        types = ", ".join(f"{k.replace('sitemap_', '').replace('_', ' ')}: {v:,}" for k, v in sorted(r.get("sitemapTypes", {}).items(), key=lambda kv: -kv[1])[:6])
        return self.out(f"The sitemap lists **{r.get('sitemapCount', 0):,} URLs**" + (f" ({types})" if types else "") + f". I checked **{len(r['pages'])} pages** and the board shows {len(self.items)} cards in {len(self.m['DATA'])} sections."
                        + (f" {r['notChecked']} of them couldn't be checked because the site asked us to slow down." if r.get("notChecked") else ""),
                        follow=["What are the main sections?", "How many products are there?" if self.prods else "Which pages are broken?"])

    def h_count_products(self, q):
        cat = self.m["X"]["catalog"]
        if not cat:
            return self.out("This site doesn't have a product feed I could read, so it doesn't look like an online shop.")
        return self.out(f"Their catalogue feed has **{cat['total']:,} products**; **{cat['avail']:,}** are in stock ({round(cat['avail'] / max(1, cat['total']) * 100)}%). "
                        f"Prices run from {self.money(cat['min'])} to {self.money(cat['max'])} with an average discount of {cat['disc']}%.", follow=["Which products are cheapest?", "Which products are sold out?", "Which product lines are biggest?"])

    def h_structure(self, q):
        lines = [f"The board groups the site into **{len(self.m['DATA'])} sections**:"]
        for l in self.m["DATA"]:
            n = sum(len(g[2]) + (1 if g[1] else 0) for s in l["secs"] for g in s["groups"])
            lines.append(f"- **{l['name']}**: {n} pages" + (f" in {len(l['secs'])} parts ({', '.join(s['name'] for s in l['secs'][:4])}{'…' if len(l['secs']) > 4 else ''})" if len(l["secs"]) > 1 else ""))
        return self.out("\n".join(lines), follow=[f"What is in {self.m['DATA'][0]['name']}?" if self.m["DATA"] else "Give me a summary", "Which section has the most SEO problems?"])

    def h_section(self, q):
        names = [(l["name"], l, None) for l in self.m["DATA"]] + [(s["name"], l, s) for l in self.m["DATA"] for s in l["secs"]]
        best, bs = None, 0.0
        for n, l, s in names:
            r = SequenceMatcher(None, n.lower(), q).find_longest_match(0, len(n), 0, len(q)).size / max(1, len(n))
            if n.lower() in q:
                r = 1.0 + len(n) / 100
            if r > bs:
                best, bs = (n, l, s), r
        if not best or bs < 0.6:
            return None
        n, l, s = best
        secs = [s] if s else l["secs"]
        its = [i for i in self.items if i["l1"] == l["name"] and (s is None or i["sec"] == s["name"])]
        groups = [g for sx in secs for g in sx["groups"]]
        lines = [f"**{n}** has {len(its)} pages in {len(groups)} groups:"] + [f"- **{g[0]}**: {len(g[2]) + (1 if g[1] else 0)}" + (f" ({', '.join(x[0] for x in g[2][:3])}{'…' if len(g[2]) > 3 else ''})" if g[2] else "") for g in groups[:10]]
        bad = [i for i in its if i["score"] >= 0 and i["score"] < 70]
        if bad:
            lines.append(f"\n{len(bad)} of them have SEO problems.")
        return self.out("\n".join(lines), pages=its[:6], highlight=its, follow=[f"SEO problems in {n}", "What should they fix first?"])

    def h_seo_overall(self, q):
        sc = self.seo
        sec_q = self.h_section(q) if re.search(r"\b(in|section)\b", q) else None
        rows = [("Broken pages", sc["broken"]), ("No title", sc["noTitle"]), ("No meta description", sc["noDesc"]), ("Duplicate titles", [p for v in sc["dupTitles"].values() for p in v]),
                ("No H1 heading", sc["noH1"]), ("Titles over 60 characters", sc["longTitle"]), ("Descriptions over 160 characters", sc["longDesc"]), ("Set to noindex", sc["noindex"])]
        rows = [(a, b) for a, b in rows if b]
        if not rows:
            return self.out(f"Good news: the {sc['ok']} pages I checked all have a title, description and H1, and none are broken.")
        avg = round(sum(i["score"] for i in self.items if i["score"] >= 0) / max(1, sum(1 for i in self.items if i["score"] >= 0)))
        lines = [f"Average SEO score is **{avg}/100** over {sc['ok']} pages. The problems, most serious first:"] + [f"- **{a}:** {len(b)} page(s)" for a, b in rows]
        worst = sorted([i for i in self.items if i["score"] >= 0], key=lambda i: i["score"])[:6]
        bad = [i for i in self.items if 0 <= i["score"] < 70]
        if sec_q:
            return sec_q
        return self.out("\n".join(lines), pages=worst, highlight=bad, follow=["Which pages should they fix first?", "Show pages without a description", "Which links are broken?"])

    def _list_answer(self, paths, title, empty, follow=None, why=None):
        its = [i for i in self.items if i["path"] in set(paths)] or [{"slug": p.lstrip("/"), "label": p, "path": p, "f": {}, "p": None} for p in paths]
        if not paths:
            return self.out(empty, follow=follow)
        body = f"**{len(paths)} {title}**" + (f". {why}" if why else ":") + "\n" + "\n".join(f"- {i['label']} ({i['path']})" for i in its[:10]) + ("\n- …" if len(paths) > 10 else "")
        return self.out(body, pages=its, highlight=its, follow=follow)

    def h_broken(self, q):
        rows = self.m["BROKEN"]
        nc = self.r.get("notChecked") or 0
        if not rows and nc:
            return self.out(f"No broken links among the {self.seo['ok']} pages I could check. {nc} page(s) weren't checked because the site asked us to slow down; build the board again later to cover them.")
        if not rows:
            return self.out(f"No broken links: all {self.seo['ok']} pages I checked answered normally.", follow=["Any redirects?", "What are the biggest SEO problems?"])
        its = [i for i in self.items if i["path"] in set(self.seo["broken"])]
        return self.out(f"**{len(rows)} broken page(s)** (they return an error):\n" + "\n".join(f"- {a} · {b}" for a, b in rows[:12]) + "\n\nFix the link or redirect each one to the closest working page.",
                        pages=its, highlight=its, follow=["Any redirects?", "What should they fix first?"])

    def h_redirects(self, q):
        rd = self.seo["redirects"]
        lines = [f"- {p} → {self.r['pages'][p]['f']}" for p in rd[:12]]
        note = f"The homepage itself redirects to {self.r['homeRedirect']}.\n" if self.r.get("homeRedirect") else ""
        return self.out(note + (f"**{len(rd)} link(s) redirect** somewhere else:\n" + "\n".join(lines) if rd else "No redirects among the pages I checked."), follow=["Which links are broken?"])

    def h_no_desc(self, q):
        return self._list_answer(self.seo["noDesc"], "pages without a meta description", "Every page I checked has a meta description.", ["Which titles are too long?", "What should they fix first?"], "Google will write its own snippet for these")

    def h_no_title(self, q):
        brand_only = [p for p, f in self.r["pages"].items() if f.get("s") == 200 and f.get("t", "").strip().lower() in self.brand_names]
        return self._list_answer(self.seo["noTitle"] + brand_only, "pages with no real title", "Every page has its own title.", ["Show duplicate titles"], "A title that is empty or only the brand name targets no keyword")

    def h_long_title(self, q):
        return self._list_answer(self.seo["longTitle"], "titles over 60 characters", "All titles fit in Google's results.", ["Show pages without a description"], "Google cuts them off in search results")

    def h_no_h1(self, q):
        if "multiple" in q or "more than one" in q:
            return self._list_answer(self.seo["multiH1"], "pages with more than one H1", "No page has more than one H1.")
        return self._list_answer(self.seo["noH1"], "pages without an H1 heading", "Every page I checked has an H1 heading.", ["Show duplicate titles"])

    def h_dup_titles(self, q):
        d = self.seo["dupTitles"]
        if not d:
            return self.out("No duplicate titles: every page has its own.")
        lines = [f"- \"{t}\" on {len(ps)} pages" for t, ps in list(d.items())[:8]]
        its = [i for i in self.items if i["path"] in {p for v in d.values() for p in v}]
        return self.out(f"**{len(d)} title(s) are shared by several pages**, so those pages compete with each other in Google:\n" + "\n".join(lines), pages=its, highlight=its)

    def h_noindex(self, q):
        return self._list_answer(self.seo["noindex"], "pages set to noindex", "No checked page is hidden from Google with noindex.")

    def h_worst_pages(self, q):
        worst = sorted([i for i in self.items if i["score"] >= 0], key=lambda i: i["score"])[:10]
        def why(i):
            f = i["f"]
            p = [x for x, c in [("broken", f.get("s") not in (200, None)), ("no title", not f.get("t")), ("no description", not f.get("d")), ("no H1", not f.get("h1")), ("long title", len(f.get("t", "")) > 60)] if c]
            return f"score {i['score']}" + (": " + ", ".join(p) if p else "")
        return self.out("Fix these first (lowest SEO score):\n" + self.plist(worst, 10, why), pages=worst, highlight=worst, follow=["What should they improve?", "Show pages without a description"])

    def h_keywords(self, q):
        it = self.find(q)
        if it and it["slug"] != "" and len(it["label"]) > 3 and it["label"].lower() in q:
            return self.h_page_info(q)
        stop = set("and the for of in to a with your our we by on at is best top online buy price india official home page services service".split()) | {self.brand.lower()}
        g = Counter()
        for i in self.items:
            w = re.findall(r"[a-z0-9]+", i["f"].get("t", "").lower())
            for n in (2, 3):
                for k in range(len(w) - n + 1):
                    s = w[k:k + n]
                    if s[0] in stop or s[-1] in stop:
                        continue
                    g[" ".join(s)] += 1
        top = [k for k, v in g.most_common(14) if v > 1]
        topic = re.sub(r".*\b(about|for|on|targeting|target)\b", "", q).strip()
        hits = self.search(topic, 6) if topic and topic != q else []
        msg = "Phrases their page titles repeat most (what they try to rank for):\n" + "\n".join(f"- {k} ({g[k]} pages)" for k in top[:12]) if top else "Their titles don't repeat any phrase often."
        if hits:
            msg += f"\n\nPages matching \"{topic}\":\n" + self.plist(hits, 6)
        return self.out(msg, pages=hits, follow=["Which titles are too long?", "What should they improve?"])

    def h_page_info(self, q):
        it = self.find(q) or (self.search(q, 1) or [None])[0]
        if not it:
            return None
        f = it["f"]
        if not f or f.get("s") is None:
            why = " (the site asked us to slow down, so it wasn't checked)" if f and f.get("rl") else ""
            if it["p"]:
                return self.out(f"**{it['label']}** ({it['path']}) · {self.ptext(it)}" + (f", listed at {self.money(it['p']['m'])}" if it["p"]["m"] > it["p"]["p"] else "")
                                + f". I didn't open its page during the crawl{why}, so I have no SEO or review details for it.", pages=[it], highlight=[it])
            return self.out(f"**{it['label']}** is on the board ({it['path']}) but I didn't open it during the crawl{why}.", pages=[it])
        issues = [x for x, c in [("it returns an error " + str(f.get("s")), f.get("s") != 200), ("no title", not f.get("t")), ("the title is only the brand name", f.get("t", "").strip().lower() in self.brand_names),
                                  (f"the same title is used on {self.title_count.get(f.get('t'), 0) - 1} other page(s)", self.title_count.get(f.get("t"), 0) > 1),
                                  ("the description is a website-template default", "create next app" in f.get("d", "").lower()), ("no meta description", not f.get("d")),
                                  ("no H1 heading", not f.get("h1")), (f"title is {len(f.get('t', ''))} characters (over 60)", len(f.get("t", "")) > 60),
                                  (f"description is {len(f.get('d', ''))} characters (over 160)", len(f.get("d", "")) > 160), ("set to noindex", f.get("ni"))] if c]
        lines = [f"**{it['label']}** ({it['path']}) in {it['l1']} › {it['sec']}", f"- **SEO score:** {it['score']}/100" + (" · " + "; ".join(issues) if issues else " · no problems"),
                 f"- **Title:** {f.get('t') or '(none)'}", f"- **Description:** {f.get('d') or '(none)'}", f"- **H1:** {', '.join(f.get('h1', [])) or '(none)'}"]
        if it["p"]:
            lines.append(f"- **Product:** {self.ptext(it)}")
        if f.get("k"):
            lines.append(f"- **Meta keywords:** {f['k'][:160]}")
        return self.out("\n".join(lines), pages=[it], highlight=[it], follow=["What should they fix first?", "Compare it with another page" if not it["p"] else "Which products are similar?"])

    def h_tracking(self, q):
        T = self.r["tools"]
        groups = {}
        for n, i in T.items():
            if i["cat"] in ("Tag manager", "Analytics", "Ads", "Insight"):
                groups.setdefault(i["cat"], []).append(n + (f" ({', '.join(i['ids'][:2])})" if i["ids"] else ""))
        if not groups:
            return self.out("I found no analytics or ad tracking on the homepage or in a tag container.")
        lines = [f"- **{k}:** {', '.join(v)}" for k, v in groups.items()]
        ev = self.r.get("events", [])
        if ev:
            lines.append(f"- **Tracked steps:** {' → '.join(ev[:10])}")
        return self.out("What they measure:\n" + "\n".join(lines), follow=["Which ad platforms do they use?", "Explain their sales funnel"])

    def h_ads(self, q):
        if re.search(r"\b(meta|facebook|fb|instagram|google ads|adwords|tiktok|linkedin|bing|microsoft|pinterest|snapchat|criteo)\b", q):
            return self.h_has_tool(q)  # "do they run facebook ads?" is about one platform: answer yes or no
        ads = self.m["X"]["stack"]["ads"]
        L = self.m["X"]["stack"]["links"]
        if ads[0][2] == "off":
            body = "I found **no ad pixels** (Google Ads, Meta, TikTok, LinkedIn…). They may not run paid ads, or they don't measure them on the site."
        else:
            body = "Ad platforms with tags on the site (so they likely spend there):\n" + "\n".join(f"- **{a[0]}**: {a[3]}" for a in ads)
        body += f"\n\nTo see their live ads: Google Ads Transparency ({L['google']}) and the Meta Ad Library ({L['meta']})."
        return self.out(body, follow=["Which tracking tools do they use?", "What should they improve?"])

    def h_has_tool(self, q):
        T = self.r["tools"]
        aliases = {"meta": "Meta Pixel", "facebook": "Meta Pixel", "fb": "Meta Pixel", "instagram": "Meta Pixel", "google ads": "Google Ads", "adwords": "Google Ads",
                   "ga4": "Google Analytics 4", "google analytics": "Google Analytics 4", "analytics": "Google Analytics 4", "gtm": "Google Tag Manager", "tag manager": "Google Tag Manager",
                   "tiktok": "TikTok Pixel", "linkedin": "LinkedIn Insight", "bing": "Microsoft Ads (UET)", "microsoft": "Microsoft Ads (UET)", "clarity": "Microsoft Clarity",
                   "hotjar": "Hotjar", "criteo": "Criteo", "shopify": "Shopify", "wordpress": "WordPress", "woocommerce": "WooCommerce", "whatsapp": "WhatsApp chat",
                   "razorpay": "Razorpay", "gokwik": "GoKwik checkout", "klaviyo": "Klaviyo", "hubspot": "HubSpot", "chat": "", "reviews": "", "pinterest": "Pinterest Tag", "snapchat": "Snap Pixel"}
        for k, v in aliases.items():
            if re.search(r"\b" + re.escape(k) + r"\b", q):
                if not v:
                    cat = "Chat & support" if k == "chat" else "Reviews & loyalty"
                    names = [n for n, i in T.items() if i["cat"] == cat]
                    return self.out((f"Yes: {', '.join(names)}." if names else f"No {k} tool found on the site."))
                if v in T:
                    i = T[v]
                    return self.out(f"**Yes**, {v} is on the site" + (f" (ID {', '.join(i['ids'])})" if i["ids"] else "") + (f", loaded through Google Tag Manager {i['via']}" if i.get("via") else "") + ".")
                return self.out(f"**No**, I didn't find {v} on the homepage or in their tag container.")
        for n in T:
            if re.search(r"" + re.escape(n.lower().split()[0]) + r"", q):
                return self.out(f"**Yes**, {n} is on the site.")
        if re.search(r"ads?|advert|ad platform|marketing", q):
            return self.h_ads(q)
        return self.h_tools(q)

    def h_tools(self, q):
        T = self.r["tools"]
        cats = {}
        for n, i in T.items():
            cats.setdefault(i["cat"], []).append(n)
        if not cats:
            return self.out("I couldn't recognise any tools in the page code.")
        lines = [f"**{len(T)} tools recognised**" + (f" on a {self.r['platform']} site" if self.r.get("platform") else "") + ":"] + [f"- **{c}:** {', '.join(ns)}" for c, ns in cats.items()]
        return self.out("\n".join(lines), follow=["Which ad platforms do they use?", "How does checkout work?" if self.prods else "How do visitors contact them?"])

    def h_checkout(self, q):
        stg = {s["n"]: s for s in self.m["STG"]}
        parts = [stg[k] for k in ("Add to cart", "Checkout", "Pay & order") if k in stg]
        if not parts:
            return self.h_contact(q)
        body = "\n".join(f"- **{s['n']}:** " + "; ".join(f"{a} ({b})" for a, b, *_ in s["items"]) for s in parts)
        return self.out("How buying works on the site:\n" + body, follow=["Explain their sales funnel", "Which tracking tools do they use?"])

    def h_funnel(self, q):
        F = self.m["X"]["funnel"]
        lines = [f"**{F['title']}** ({F['summary']})"] + [f"- **{s['n']}** ({s['d'].lower()}): " + ", ".join(a for a, *_ in s["items"][:5]) for s in self.m["STG"]]
        if F["notes"]:
            lines.append("\nObservations:\n" + "\n".join(f"- **{a}:** {b}" for a, b in F["notes"]))
        return self.out("\n".join(lines), follow=["What should they improve?", "Which ad platforms do they use?"])

    def h_contact(self, q):
        C = self.r["contacts"]
        lines = []
        if C["phones"]: lines.append(f"- **Phone:** {', '.join(C['phones'])}")
        if C["emails"]: lines.append(f"- **Email:** {', '.join(C['emails'])}")
        if C["whatsapp"]: lines.append("- **WhatsApp:** chat link on the homepage")
        if C["forms"]: lines.append(f"- **Forms:** {C['forms']} on the homepage")
        chat = [n for n, i in self.r["tools"].items() if i["cat"] == "Chat & support"]
        if chat: lines.append(f"- **Live chat:** {', '.join(chat)}")
        if C["socials"]: lines.append("- **Social:** " + ", ".join(C["socials"]))
        if C.get("reviewSites"): lines.append("- **Review sites linked:** " + ", ".join(C["reviewSites"]))
        cp = [i for i in self.items if re.search(r"contact|get-in-touch|enquir|help-cent", i["path"], re.I)][:3]
        return self.out(("How visitors can reach them:\n" + "\n".join(lines)) if lines else "I found no phone, email, form or chat on the homepage.", pages=cp, follow=["Explain their sales funnel"])

    def h_improve(self, q):
        recs = self.m["X"]["recs"]
        if not recs:
            return self.out("The site is in good shape on everything I check. Next steps would be content and backlinks, which need tools like Ahrefs.")
        return self.out("What I'd do, in order:\n" + "\n".join(f"- {r}" for r in recs), follow=["Which pages should they fix first?", "Explain their sales funnel"])

    # ----- shop handlers -----
    def _topic(self, q, pool):
        """Narrow a product list to what the question is about ("best rated earbuds" -> earbuds), if anything."""
        t = TOPIC_NOISE.sub(" ", q)
        if not tokens(t):
            return pool, ""
        hits = self.search(t, 400, pool=pool)
        return (hits, " ".join(tokens(t))) if hits else (pool, "")

    def _rank(self, key, reverse=False, avail_only=False, n=8, q=""):
        ps = [i for i in self.prods if (i["p"]["a"] or not avail_only) and i["p"]["p"] > 0]
        ps, topic = self._topic(q, ps)
        return sorted(ps, key=key, reverse=reverse)[:n], topic

    def h_cheapest(self, q):
        ps, topic = self._rank(lambda i: i["p"]["p"], avail_only=True, q=q)
        return self.out(f"Cheapest {topic or 'products'} in stock:\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Which products are most expensive?", "Products under 1000"])

    def h_expensive(self, q):
        ps, topic = self._rank(lambda i: i["p"]["p"], reverse=True, q=q)
        return self.out(f"Most expensive {topic or 'products'}:\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Which products are cheapest?", "Which products are best rated?"])

    def h_under_price(self, q, rng=None):
        rng = rng or self._price_range(q)
        if not rng:
            return self.h_cheapest(q)
        lo, hi = rng
        pool = [i for i in self.prods if lo <= i["p"]["p"] <= hi and i["p"]["a"]]
        topic = re.sub(r"(under|below|less than|within|upto|up to|between|from|above|over|more than|and|to)\s*\d+|\d+", " ", q)
        topic_hits = self.search(topic, 400, pool=pool) if tokens(topic) and tokens(topic) != ["products"] else pool
        pool = topic_hits or pool
        pool = sorted(pool, key=lambda i: -(i["f"].get("rc") or 0))
        if not pool:
            return self.out(f"No in-stock products between {self.money(lo)} and {self.money(hi) if hi < 1e11 else 'up'}.")
        label = f"under {self.money(hi)}" if lo == 0 else (f"over {self.money(lo)}" if hi > 1e11 else f"between {self.money(lo)} and {self.money(hi)}")
        return self.out(f"**{len(pool)} products {label}** in stock (most reviewed first):\n" + self.plist(pool, 10, self.ptext), pages=pool, highlight=pool, follow=["Which of these is best rated?", "Which products are cheapest?"])

    def h_best_rated(self, q):
        rated, topic = self._topic(q, [i for i in self.prods if i["f"].get("rv")])
        ps = sorted([i for i in rated if (i["f"].get("rc") or 0) >= 10], key=lambda i: (-i["f"]["rv"], -(i["f"].get("rc") or 0)))[:8]
        if not ps:
            ps = sorted(rated, key=lambda i: -i["f"]["rv"])[:8]
        if not ps:
            return self.out("I found no star ratings on the product pages.")
        return self.out(f"Best-rated {topic or 'products'} (10+ reviews):\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Which products have the most reviews?"])

    def h_most_reviewed(self, q):
        rev, topic = self._topic(q, [i for i in self.prods if i["f"].get("rc")])
        ps = sorted(rev, key=lambda i: -i["f"]["rc"])[:8]
        if not ps:
            return self.out("I found no review counts on the product pages.")
        if topic:
            return self.out(f"Most-reviewed {topic}:\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Which products are best rated?"])
        tot = sum(i["f"].get("rc", 0) for i in self.prods)
        return self.out(f"Most-reviewed products (a good sign of best sellers). {tot:,} reviews in total:\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Which products are best rated?", "Which products are cheapest?"])

    def h_reviews_total(self, q):
        cat = self.m["X"]["catalog"]
        return self.out(f"Products with ratings average **★{cat['rating']}**, with **{cat['reviews']:,} reviews** in total on the pages I read." if cat and cat["rating"] else "I found no ratings on the product pages.")

    def h_discount(self, q):
        ps, _t = self._topic(q, [i for i in self.prods if i["p"]["m"] > i["p"]["p"] > 0 and i["p"]["a"]])
        ps = sorted(ps, key=lambda i: -(1 - i["p"]["p"] / i["p"]["m"]))[:8]
        cat = self.m["X"]["catalog"]
        return self.out(f"Average discount is **{cat['disc']}%** off the listed price. Biggest discounts in stock:\n" + self.plist(ps, 8, self.ptext), pages=ps, highlight=ps, follow=["Products under 1000", "Which products are sold out?"])

    def h_stock(self, q):
        sold = [i for i in self.prods if not i["p"]["a"]]
        cat = self.m["X"]["catalog"]
        if "in stock" in q and "out" not in q:
            return self.out(f"**{cat['avail']:,} of {cat['total']:,}** products are in stock ({round(cat['avail'] / max(1, cat['total']) * 100)}%).")
        sold_sorted = sorted(sold, key=lambda i: -(i["f"].get("rc") or 0))
        return self.out(f"**{cat['total'] - cat['avail']:,} products are sold out** ({100 - round(cat['avail'] / max(1, cat['total']) * 100)}% of the feed). The most-reviewed sold-out ones (worth restocking or redirecting):\n" + self.plist(sold_sorted, 8, self.ptext),
                        pages=sold_sorted, highlight=sold_sorted, follow=["Which products are cheapest?"])

    def h_price_of(self, q):
        it = self.find(q, pool=self.prods)
        if not it:
            hits = self.search(q, 4, pool=self.prods)
            if not hits:
                return None
            return self.out("Closest matches:\n" + self.plist(hits, 4, self.ptext), pages=hits)
        return self.out(f"**{it['label']}**: {self.ptext(it)}" + (f" (listed {self.money(it['p']['m'])})" if it["p"]["m"] > it["p"]["p"] else "") + f". {it['p']['v']} colour/variant option(s).", pages=[it], highlight=[it], follow=[f"Compare {it['label']} with another product"])

    def h_compare(self, q):
        parts = re.split(r"\bvs\b|\bversus\b|\bor\b|\band\b|\bwith\b|,", re.sub(r"^(compare|difference between)\s+", "", q))
        found = []
        for p in parts:
            it = self.find(p, pool=self.prods or self.items, min_ratio=0.6)
            if it and it not in found:
                found.append(it)
        if len(found) < 2:
            return self.out("Tell me the two names to compare, like \"compare Airdopes 131 vs Airdopes 141\".")
        a, b = found[:2]
        stars = lambda f: f"★{f['rv']} ({f.get('rc', 0):,} reviews)" if f.get("rv") else "not checked"
        score = lambda it: f"{it['score']}/100" if it["score"] >= 0 else "not checked"
        if a["p"] and b["p"]:
            rows = [("Price", self.money(a["p"]["p"]), self.money(b["p"]["p"])), ("Discount", f"{round((1 - a['p']['p'] / a['p']['m']) * 100) if a['p']['m'] > a['p']['p'] else 0}%", f"{round((1 - b['p']['p'] / b['p']['m']) * 100) if b['p']['m'] > b['p']['p'] else 0}%"),
                    ("Rating", stars(a["f"]), stars(b["f"])), ("Stock", "in stock" if a["p"]["a"] else "sold out", "in stock" if b["p"]["a"] else "sold out"), ("SEO score", score(a), score(b))]
        else:
            rows = [("SEO score", score(a), score(b)), ("Title length", len(a["f"].get("t", "")), len(b["f"].get("t", ""))), ("Has description", bool(a["f"].get("d")), bool(b["f"].get("d")))]
        body = f"**{a['label']}** vs **{b['label']}**\n" + "\n".join(f"- **{k}:** {x} · {y}" for k, x, y in rows)
        return self.out(body, pages=[a, b], highlight=[a, b])

    def h_lines(self, q):
        c = Counter()
        for i in self.prods:
            words = [w for w in i["label"].split() if re.sub(r"[^\w]", "", w).lower() not in self.brand_words] or i["label"].split() or ["Other"]
            c[words[0].lower()] += 1
        shown = {}
        for i in self.prods:
            for w in i["label"].split():
                shown.setdefault(w.lower(), w)
        top = [(shown.get(k, k).strip(",-:"), v) for k, v in c.most_common(12)]
        return self.out("Biggest product lines:\n" + "\n".join(f"- **{k}**: {v} products" for k, v in top), follow=[f"What is the cheapest {top[0][0]}?" if top else "Which products are cheapest?"])

    def h_home(self, q):
        secs = self.r.get("homeSections", [])
        f = self.r["pages"].get("/", {})
        lines = [f"**Homepage title:** {f.get('t') or '(none)'}"]
        if self.r.get("homeRedirect"):
            lines.append(f"It redirects to **{self.r['homeRedirect']}**.")
        if secs:
            lines.append("Sections in page order:\n" + "\n".join(f"- {t} ({s})" for t, s in secs[:14]))
        return self.out("\n".join(lines), pages=[i for i in self.items if i["slug"] == ""][:1], follow=["Explain their sales funnel"])

    def h_blog(self, q):
        posts = [i for i in self.items if re.search(r"/(blogs?|news|articles?|posts?|insights)(/|$)", i["path"])]
        n = self.r.get("blogCount") or sum(v for k, v in self.r.get("sitemapTypes", {}).items() if re.search(r"blog|article|post|news", k, re.I))
        return self.out(f"The sitemap lists **{n:,} blog/news URLs**; {len(posts)} are on the board." + ("\n" + self.plist(posts, 6) if posts else ""), pages=posts, follow=["What keywords do they target?"])

    def h_search(self, q):
        hits = self.search(q, 6)
        if not hits:
            return self.out("I couldn't match that to anything on the site. Try asking about SEO problems, tracking, ads, the funnel" + (", products or prices" if self.prods else ", or contact options") + ".", follow=self.m["X"]["suggest"])
        it = hits[0]
        if self.find(q, pool=hits[:3], min_ratio=0.7):
            return self.h_page_info(q)
        return self.out("Pages that best match your question:\n" + self.plist(hits, 6, lambda i: self.ptext(i) if i["p"] else (i["f"].get("t", "")[:70] or i["path"])), pages=hits, highlight=hits,
                        follow=[f"Tell me about {it['label']}", "What are the biggest SEO problems?"])


def answer(report: dict, question: str) -> dict:
    return SiteBot(report).ask(question)
