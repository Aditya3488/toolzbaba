"""Crawl a website into a report: menu, footer, sitemaps, page SEO facts, tracking tools and (for shops) the catalogue."""
from __future__ import annotations

import datetime as _dt
import re
import time
from collections import Counter
from urllib.parse import urljoin, urlsplit

from . import detect as D
from .dom import Node, clean, page_facts, parse
from .driver import JSON, Batch, Get, Sleep, Stats, run
from .fetch import FetchError, Fetcher

SKIP_EXT = re.compile(r"\.(?:jpg|jpeg|png|gif|webp|svg|avif|ico|pdf|zip|rar|mp4|mp3|mov|webm|css|js|json|xml|txt|docx?|xlsx?|pptx?)(?:$|\?)", re.I)
LOCALE_PREFIX = re.compile(r"^/[a-z]{2}(?:-[a-z]{2})?(?:/|$)", re.I)
HEADINGISH = re.compile(r"title|heading|header|label|caption|menu-head|col-head", re.I)
PLACEHOLDER = re.compile(r"^(?:sub ?)?(?:heading|title|text|section|lorem ipsum.*|your (?:heading|title).*)$", re.I)
SCRIPT_BLOCK = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.I | re.S)
TEMPLATE_STR = re.compile(r"`([^`]{200,})`")


def _norm(href: str, base: str, host: str) -> str | None:
    """Same-site path+query (lower-cased path) for a link, or None for other sites / non-pages."""
    if not href:
        return None
    href = href.strip()
    if href.startswith(("#", "javascript:", "mailto:", "tel:", "sms:", "whatsapp:", "data:")):
        return None
    u = urlsplit(urljoin(base, href))
    if u.scheme not in ("http", "https"):
        return None
    h = (u.hostname or "").lower()
    if h.replace("www.", "", 1) != host.replace("www.", "", 1):
        return None
    if SKIP_EXT.search(u.path or ""):
        return None
    path = re.sub(r"/{2,}", "/", u.path or "/")
    if len(path) > 1:
        path = path.rstrip("/")
    q = re.sub(r"(?:^|&)(utm_[^&]*|gclid=[^&]*|fbclid=[^&]*)", "", u.query or "").strip("&")
    return path + (("?" + q) if q else "")  # keep the case: some servers treat /Page and /page differently


def _link_text(a: Node) -> str:
    t = a.text(80) or a.attrs.get("aria-label", "") or a.attrs.get("title", "")
    if not t:
        img = next((n for n in a.iter() if n.tag == "img"), None)
        t = img.attrs.get("alt", "") if img else ""
    return clean(t)[:70]


def _is_heading(n: Node) -> bool:
    if n.tag in ("h2", "h3", "h4", "h5", "h6"):
        return True
    if n.tag in ("strong", "b", "p", "span", "div", "li", "dt") and HEADINGISH.search(n.cls()):
        t = n.text(60)
        return 0 < len(t) <= 45 and not any(c.tag == "ul" for c in n.children)
    return False


def _walk_groups(container: Node, base: str, host: str, skip: set[int] | None = None, default: str = "Links"):
    """Group the links inside a container by the nearest heading before them (mega-menus, footer columns)."""
    groups: list[dict] = []
    cur = None
    seen: set[str] = set()
    skip = skip or set()

    top = None  # (name, sub-heading tag) when headings nest, e.g. "Earbuds" > "Shop by Price"

    def new(name, href=None, tag=None):
        nonlocal cur, top
        if cur is not None and tag:
            if not cur["links"] and not cur["href"] and not cur.get("sub") and cur.get("tag") not in (None, tag):
                top = (cur["name"], tag)
            elif not (cur.get("sub") and top and top[1] == tag):
                top = None
        sub = bool(top and tag and top[1] == tag)
        cur = {"name": name[:80] or default, "href": href, "links": [], "tag": tag}
        if sub:
            cur["sub"] = (top[0] + " · " + name)[:80]
        groups.append(cur)

    stack = [(container, False)]
    while stack:
        n, in_head = stack.pop()
        if id(n) in skip or n.tag in ("script", "style", "svg", "noscript", "form"):
            continue
        if n.tag is not None and not in_head and _is_heading(n):
            a = next((x for x in n.iter() if x.tag == "a"), None)
            href = _norm(a.attrs.get("href", ""), base, host) if a else None
            new(n.text(60), href, n.tag)
            if href:
                seen.add(href)
            stack.extend((c, True) for c in reversed(n.children))
            continue
        if n.tag == "li" and any(c.tag in ("ul", "ol") for c in n.children):
            a = next((c for c in n.children if c.tag == "a"), None) or next((x for x in n.children if x.tag in ("span", "div") and x.text(40)), None)
            if a is not None:
                href = _norm(a.attrs.get("href", ""), base, host) if a.tag == "a" else None
                new(a.text(60) if a.tag != "a" else _link_text(a), href)
                if href:
                    seen.add(href)
                stack.extend((c, in_head) for c in reversed([c for c in n.children if c is not a]))
                continue
        if n.tag == "a" and not in_head:
            href = _norm(n.attrs.get("href", ""), base, host)
            text = _link_text(n)
            if href and text and href not in seen:
                seen.add(href)
                if cur is None:
                    new(default)
                cur["links"].append([text, href])
            continue
        stack.extend((c, in_head) for c in reversed(n.children))
    repeats = Counter(g["name"] for g in groups if g.get("sub"))
    for g in groups:  # "Shop by Price" under every category becomes "Earbuds · Shop by Price"; one-off headings stay as they are
        full = g.pop("sub", None)
        g.pop("tag", None)
        if full and repeats[g["name"]] > 1:
            g["name"] = full
    return [g for g in groups if g["links"] or g["href"]]


def script_menus(html: str) -> Node | None:
    """Menus some themes keep inside a script and inject later, e.g. $('nav').html(`<ul>...</ul>`), as one <nav>."""
    frags = []
    for attrs, body in SCRIPT_BLOCK.findall(html):
        if "src=" in attrs or "json" in attrs.lower() or "<li" not in body:
            continue
        for m in TEMPLATE_STR.finditer(body):
            t = m.group(1)
            if t.count("<li") >= 3 and "href=" in t:
                frags.append(re.sub(r"\$\{[^}]*\}", "", t))
    if not frags:
        return None
    return next((n for n in parse("<nav data-from-script>" + "".join(frags)[:3_000_000] + "</nav>").children if n.tag == "nav"), None)


def extract_menu(root: Node, base: str, host: str):
    """Top menu as [{label, href, groups:[{name, href, links:[[text, href]]}]}] plus loose header links."""
    footers = {id(n) for n in root.iter() if n.tag == "footer" or (n.tag in ("div", "section") and re.search(r"(^|\s)(site-)?footer", n.cls(), re.I))}

    def in_footer(n):
        return id(n) in footers or any(id(a) in footers for a in n.ancestors())

    navs = [n for n in root.iter() if (n.tag in ("header", "nav") or n.attrs.get("role") == "navigation") and not in_footer(n)]
    best, best_score = None, 0.0
    for nav in navs:
        for ul in nav.find_all("ul", "ol"):
            lis = [c for c in ul.children if c.tag == "li"]
            if len(lis) < 2:
                continue
            nested_in_li = any(a.tag == "li" for a in ul.ancestors())
            links = sum(1 for _ in ul.find_all("a"))
            score = len(lis) * (1 + min(links, 400) ** 0.5) * (0.3 if nested_in_li else 1)
            if score > best_score:
                best, best_score = ul, score
    menu = []
    used: set[str] = set()
    if best is not None:
        for li in [c for c in best.children if c.tag == "li"][:12]:
            lab = next((c for c in li.iter() if c is not li and c.tag in ("a", "button", "span", "summary", "div") and c.text(40)), None)
            if lab is None:
                continue
            label = (_link_text(lab) if lab.tag == "a" else lab.text(40)).strip()
            if not label or len(label) > 40:
                continue
            href = _norm(lab.attrs.get("href", ""), base, host) if lab.tag == "a" else None
            groups = _walk_groups(li, base, host, skip={id(lab)}, default=label)
            menu.append({"label": label, "href": href, "groups": groups})
            used.update(l[1] for g in groups for l in g["links"])
            used.update(g["href"] for g in groups if g["href"])
            if href:
                used.add(href)
    loose, seen = [], set(used)
    for nav in navs:
        for a in nav.find_all("a"):
            href = _norm(a.attrs.get("href", ""), base, host)
            t = _link_text(a)
            if href and t and href not in seen and href != "/":
                seen.add(href)
                loose.append([t, href])
    return menu, loose[:40]


def extract_footer(root: Node, base: str, host: str):
    foot = next((n for n in root.iter() if n.tag == "footer"), None) or \
        next((n for n in root.iter() if n.tag in ("div", "section") and re.search(r"(^|\s)(site-)?footer", n.cls(), re.I)), None)
    return _walk_groups(foot, base, host, default="Footer links") if foot is not None else []


def home_sections(root: Node) -> list[list[str]]:
    """Section headings of the homepage in order, each with the funnel stage it most likely serves."""
    out, seen = [], set()
    for n in root.iter():
        if n.tag in ("h1", "h2") and not any(a.tag in ("header", "footer", "nav") for a in n.ancestors()):
            t = n.text(70)
            if 3 <= len(t) <= 70 and t.lower() not in seen and not PLACEHOLDER.match(t):
                seen.add(t.lower())
                low = t.lower()
                stg = ("Trust" if re.search(r"review|testimonial|trusted|client|partner|award|certif|why |about|our team|happy|rated|stories|case stud", low)
                       else "Convert" if re.search(r"contact|get in touch|quote|subscribe|newsletter|book|call|enquir|sign up|join|talk to", low)
                       else "Browse" if re.search(r"shop|collection|categor|deal|best ?seller|new|launch|product|offer|sale|price|plan|package|service", low)
                       else "Retain" if re.search(r"blog|insight|news|article|resource|learn", low)
                       else "Land" if not out else "Browse")
                out.append([t, stg])
    return out[:24]


def sitemap_urls(base: str, host: str, progress=None, cap: int = 20000):
    """(Crawl steps) Every page URL listed in robots.txt sitemaps / sitemap.xml, index files followed."""
    starts = []
    try:
        robots = yield Get(urljoin(base, "/robots.txt"), max_bytes=200_000, accept="text/plain,*/*")
        if robots.status == 200:
            starts += re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots.text)
    except FetchError:
        pass
    starts += [urljoin(base, "/sitemap.xml"), urljoin(base, "/sitemap_index.xml")]
    todo, done, urls, types, seen_urls = list(dict.fromkeys(starts)), set(), [], {}, set()
    skip = re.compile(r"/[a-z]{2}-[a-z]{2}/sitemap|metaobject|image|video|news-sitemap|sitemap_agentic", re.I)
    while todo and len(done) < 40 and len(urls) < cap:  # one level of sitemap files at a time, read together
        level = [sm for sm in dict.fromkeys(todo) if sm not in done and not skip.search(sm)][:40 - len(done)]
        done.update(todo)
        todo = []
        answers = yield Batch([Get(sm, max_bytes=12_000_000, accept="application/xml,text/xml,*/*") for sm in level])
        for sm, r in zip(level, answers):
            if isinstance(r, FetchError) or r.status != 200 or "<" not in r.text[:500]:
                continue
            locs = [clean(x) for x in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", r.text)]
            if "<sitemapindex" in r.text[:2000].lower():
                todo.extend(l for l in locs if l not in done)
                continue
            kind = re.sub(r"[_-]?\d+$", "", (urlsplit(sm).path.rsplit("/", 1)[-1] or "sitemap").split(".")[0]) or "sitemap"
            for l in locs:
                p = _norm(l, base, host)
                if p and p not in seen_urls:  # /sitemap.xml and /sitemap_index.xml are often the same list
                    seen_urls.add(p)
                    urls.append(p)
                    types[kind] = types.get(kind, 0) + 1
        if progress:
            progress(f"Read {len(done)} sitemap file(s), {len(urls)} URLs")
    return urls[:cap], types


def shop_catalog(base: str, platform: str, menu, progress=None, cap: int = 2500):
    """(Crawl steps) Products, and which collection each belongs to, from the public Shopify / WooCommerce feeds."""
    if platform == "Shopify":
        products = []
        for page in range(1, 12):
            j = yield Get(urljoin(base, f"/products.json?limit=250&page={page}"), max_bytes=8_000_000, accept=JSON, json=True)
            items = (j or {}).get("products") or []
            if not items:
                break
            for p in items:
                vs = p.get("variants") or [{}]
                price = min(float(v.get("price") or 0) for v in vs)
                mrp = max(float(v.get("compare_at_price") or v.get("price") or 0) for v in vs)
                products.append({"h": p.get("handle"), "t": p.get("title", ""), "type": p.get("product_type", ""), "price": price, "mrp": max(mrp, price),
                                 "avail": any(v.get("available") for v in vs), "v": len(vs), "created": (p.get("created_at") or "")[:10]})
            if progress:
                progress(f"Read {len(products)} products from the store feed")
            if len(products) >= cap:
                break
        colls = {}
        handles = []
        for item in menu:
            for href in [item.get("href")] + [g.get("href") for g in item["groups"]] + [l[1] for g in item["groups"] for l in g["links"]]:
                m = re.match(r"^/collections/([^/?#]+)$", href or "")
                if m and m.group(1) not in handles and m.group(1) != "all":
                    handles.append(m.group(1))
        open_ = {h: 1 for h in handles[:30]}  # collection -> next page to read; all collections are read together
        while open_:
            hs = list(open_)
            answers = yield Batch([Get(urljoin(base, f"/collections/{h}/products.json?limit=250&page={open_[h]}"), max_bytes=8_000_000, accept=JSON, json=True) for h in hs])
            for h, j in zip(hs, answers):
                items = (j or {}).get("products") or [] if isinstance(j, dict) else []
                colls.setdefault(h, []).extend(p.get("handle") for p in items)
                if len(items) < 250 or open_[h] >= 5:
                    del open_[h]
                else:
                    open_[h] += 1
        if progress:
            progress(f"Read {len(colls)} collections")
        return {"products": products[:cap], "collections": colls, "kind": "shopify"}
    if platform == "WooCommerce":
        products = []
        for page in range(1, 25):
            j = yield Get(urljoin(base, f"/wp-json/wc/store/v1/products?per_page=100&page={page}"), max_bytes=8_000_000, accept=JSON, json=True)
            if not isinstance(j, list) or not j:
                break
            for p in j:
                pr = p.get("prices") or {}
                unit = 10 ** int(pr.get("currency_minor_unit") or 0)
                price = float(pr.get("price") or 0) / unit
                mrp = float(pr.get("regular_price") or pr.get("price") or 0) / unit
                path = urlsplit(p.get("permalink") or "").path.rstrip("/")
                products.append({"h": path.lstrip("/"), "t": clean(p.get("name", "")), "type": ", ".join(c.get("name", "") for c in (p.get("categories") or [])[:1]),
                                 "price": price, "mrp": max(mrp, price), "avail": bool(p.get("is_in_stock", True)), "v": len(p.get("variations") or []) or 1,
                                 "created": "", "cur": pr.get("currency_code", "")})
            if progress:
                progress(f"Read {len(products)} products from the store feed")
            if len(products) >= cap:
                break
        return {"products": products[:cap], "collections": {}, "kind": "woocommerce"} if products else None
    return None


def _page_facts(path: str, r) -> dict:
    """What the board keeps about one checked page, from its Response (or the FetchError that stopped it)."""
    if isinstance(r, FetchError):
        return {"s": 0, "err": str(r)[:120], "t": "", "d": "", "k": "", "h1": []}
    facts = page_facts(r.text) if r.status == 200 else {"t": "", "d": "", "k": "", "h1": []}
    facts["s"] = r.status
    final = urlsplit(r.url).path.rstrip("/") or "/"
    if r.redirected and final.lower() != (path.split("?")[0].lower() or "/"):
        facts["f"] = final
    return facts


def report_steps(url: str, max_pages: int = 300, progress=None, stats=None):
    """(Crawl steps) The whole report: run it with driver.run() on a PC, or web.py's driver in the browser."""
    t0 = time.time()
    say = progress or (lambda *_a, **_k: None)
    stats = stats if stats is not None else Stats()
    say("Reading the homepage", 0.02)
    home = yield Get(url, max_bytes=5_000_000, retries=5)
    if home.status == 429:
        raise FetchError("The site is limiting how fast it can be read (429 Too Many Requests). Wait a few minutes and try again, or check fewer pages.")
    if home.status >= 400:
        raise FetchError(f"The homepage answered with an error ({home.status}).")
    fu = urlsplit(home.url)
    host = (fu.hostname or "").lower()
    base = f"{fu.scheme}://{fu.netloc}/"
    domain = host[4:] if host.startswith("www.") else host
    root = parse(home.text)
    nav = script_menus(home.text)
    if nav is not None:
        nav.parent = root
        root.children.append(nav)
    menu, header_links = extract_menu(root, base, host)
    footer = extract_footer(root, base, host)
    tools = D.detect(home.text)
    evs = D.events(home.text)
    cont = D.contacts(home.text)
    say(f"Found {len(menu)} menu sections and {sum(len(g['links']) for g in footer)} footer links", 0.06)

    tag_ids = {}
    gids = D.gtm_ids(home.text)[:2]
    codes = yield Batch([Get(f"https://www.googletagmanager.com/gtm.js?id={gid}", max_bytes=4_000_000, accept="*/*") for gid in gids])
    for gid, r in zip(gids, codes):
        if isinstance(r, FetchError) or r.status != 200:
            continue
        res, runtime = D.split_gtm(r.text)
        found = D.detect(res)
        for name, info in D.detect(runtime).items():  # library code mentions every Google product; only count others
            if name not in D.GOOGLE_NATIVE and name not in found:
                found[name] = info
        for name, info in found.items():
            if info["cat"] in ("Platform", "Consent") or (name in D.GOOGLE_NATIVE and not info["ids"]):
                continue
            cur = tools.setdefault(name, {"cat": info["cat"], "ids": [], "via": gid})
            cur["ids"] = sorted(set(cur["ids"]) | set(info["ids"]))[:4]
        evs = list(dict.fromkeys(evs + D.events(res)))
        tag_ids[gid] = True
    say(f"Recognised {len(tools)} tools and tags", 0.09)

    platform = next((n for n in ("Shopify", "WooCommerce", "Magento", "BigCommerce", "Wix", "Squarespace", "Webflow", "WordPress") if n in tools), "")
    if not platform:
        j = yield Get(urljoin(base, "/products.json?limit=1"), accept=JSON, json=True)
        if isinstance(j, dict) and "products" in j:
            platform = "Shopify"
            tools["Shopify"] = {"cat": "Platform", "ids": []}
    say("Reading the sitemap", 0.11)
    sm_urls, sm_types = yield from sitemap_urls(base, host, progress=lambda m: say(m, 0.14))

    shop = None
    if platform in ("Shopify", "WooCommerce"):
        say("Reading the product catalogue", 0.17)
        shop = yield from shop_catalog(base, platform, menu, progress=lambda m: say(m, 0.2))
        if shop:
            shop["currency"] = D.currency(home.text) or (shop["products"][0].get("cur", "") if shop["products"] else "")

    # crawl order: home, menu, footer, header extras, then sitemap pages (products after pages, blog posts last)
    labels: dict[str, str] = {}
    order: list[str] = ["/"]
    for item in menu:
        if item["href"]:
            order.append(item["href"]); labels.setdefault(item["href"], item["label"])
        for g in item["groups"]:
            if g["href"]:
                order.append(g["href"]); labels.setdefault(g["href"], g["name"])
            for t, h in g["links"]:
                order.append(h); labels.setdefault(h, t)
    for g in footer:
        for t, h in g["links"]:
            order.append(h); labels.setdefault(h, t)
    for t, h in header_links:
        order.append(h); labels.setdefault(h, t)
    rank = lambda p: (3 if re.search(r"/(blogs?|news|articles?|posts?)/.+", p) else 2 if re.search(r"^/(products?|item|p)/", p) else 1 if re.search(r"^/(collections?|categor|product-category|shop)/", p) else 0)
    extra = [p for p in sm_urls if not LOCALE_PREFIX.match(p) or not platform]
    order += sorted(extra, key=rank)
    if shop and shop["kind"] == "shopify":
        order += [f"/products/{p['h']}".lower() for p in shop["products"]]
    crawl, seen = [], set()
    for p in order:
        if p and p.lower() not in seen:
            seen.add(p.lower())
            crawl.append(p)
    crawl = [p for p in crawl if p != "/"]
    if shop and shop.get("products"):  # keep room for product pages: their ratings and reviews live there
        is_prod = re.compile(r"^/(products?|product-page|item|p)/", re.I)
        avail = {f"/products/{p['h']}".lower() for p in shop["products"] if p.get("avail")}
        prods = sorted((p for p in crawl if is_prod.match(p)), key=lambda p: p.lower() not in avail)
        rest = [p for p in crawl if not is_prod.match(p)]
        quota = min(len(prods), max(10, min(150, int(max_pages * 0.35))))
        keep = rest[:max_pages - quota]
        crawl = keep + prods[:max_pages - len(keep)]
    crawl = crawl[:max_pages]

    pages: dict[str, dict] = {}
    done = [0]

    def page_get(path, retries=None):
        return Get(urljoin(base, path), max_bytes=1_800_000, stop_h1=True, retries=retries)

    def each(i, r):
        pages[crawl[i]] = _page_facts(crawl[i], r)
        done[0] += 1
        if done[0] % 10 == 0 or done[0] == len(crawl):
            say(f"Checked {done[0]} of {len(crawl)} pages" + (f" (site asked us to slow down {stats.rate_limited}×)" if stats.rate_limited else ""), 0.22 + 0.66 * done[0] / max(1, len(crawl)))

    say(f"Checking {len(crawl)} pages", 0.22)
    yield Batch([page_get(p) for p in crawl], each=each)
    limited = [p for p, f in pages.items() if f.get("s") == 429]
    if limited:  # second, slower pass: one page at a time once the site has had a breather
        say(f"Re-checking {len(limited)} pages the site asked us to slow down on", 0.89)
        yield Sleep(min(20, 2 + len(limited)))
        for path in limited[:60]:
            try:
                r = yield page_get(path, retries=6)
            except FetchError as e:
                r = e
            pages[path] = _page_facts(path, r)
        for f in pages.values():
            if f.get("s") == 429:  # still limited: unknown, not broken
                f.update(s=None, rl=1)
    pages["/"] = {**page_facts(home.text), "s": home.status, **({"f": fu.path.rstrip('/').lower()} if home.redirected and fu.path not in ("", "/") else {})}

    og_name = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]*content=["\']([^"\']+)', home.text, re.I)
    title = pages["/"].get("t", "")
    brand = clean(og_name.group(1)) if og_name else (re.split(r"\s[|:–—-]\s", title)[0] if title else domain.split(".")[0].title())
    return {
        "version": 1, "url": url, "final": home.url, "host": host, "domain": domain, "base": base, "brand": brand[:40],
        "created": _dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "platform": platform,
        "type": "shop" if shop and shop.get("products") else ("leadgen" if cont["forms"] or cont["phones"] or cont["emails"] else "content"),
        "homeRedirect": pages["/"].get("f", ""), "menu": menu, "headerLinks": header_links, "footer": footer, "labels": labels,
        "pages": pages, "sitemapCount": len(sm_urls), "sitemapTypes": sm_types, "crawled": len(crawl),
        "blogCount": sum(1 for p in sm_urls if re.search(r"/(blogs?|news|articles?|posts?|insights?)/.+", p, re.I)),
        "tools": tools, "gtm": list(tag_ids), "events": evs, "contacts": cont, "shop": shop,
        "homeSections": home_sections(root), "requests": stats.requests, "rateLimited": stats.rate_limited,
        "notChecked": sum(1 for f in pages.values() if f.get("rl")), "seconds": round(time.time() - t0, 1),
    }


def build_report(url: str, max_pages: int = 300, shots: bool = True, progress=None, allow_private: bool = False, workers: int = 6) -> dict:
    """Crawl a site on this computer (threads, standard library) into a report."""
    t0 = time.time()
    say = progress or (lambda *_a, **_k: None)
    F = Fetcher(allow_private=allow_private)
    report = run(report_steps(url, max_pages, progress=say, stats=F), F, workers=workers)
    if shots:
        from . import shots as S
        say("Taking screenshots", 0.9)
        try:
            S.attach(report, progress=lambda m: say(m, 0.93))
        except Exception as e:  # screenshots are a bonus, never a failure
            report["shotError"] = str(e)[:160]
    report["seconds"] = round(time.time() - t0, 1)
    say("Report ready", 1.0)
    return report
