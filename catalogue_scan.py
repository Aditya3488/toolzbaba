"""Measure what a shop is actually able to sell, from its own public product feed.

    python catalogue_scan.py boat-lifestyle.com
    python catalogue_scan.py mamaearth.in sugarcosmetics.com --csv out.csv --json out.json
    python catalogue_scan.py example.com --list-dead 40

Every online shop on Shopify or WooCommerce publishes its catalogue as JSON that anyone can read. This reads all
of it and answers four questions a brand usually cannot answer about itself:

  * how many products it still lists but cannot sell
  * whether those are spread evenly or piled up in the back of the catalogue
  * how deep the discounting runs across the whole range, which an average hides
  * whether the prices form a deliberate ladder or a long tail of one-offs

Read the WHOLE feed. The first page is the newest and best-stocked products, so judging a catalogue by it is
badly wrong: boat-lifestyle.com's first page was 15% sold out and the full 1,005-product feed was 57%.

Standard library only, so there is nothing to install. It reads public pages at a polite pace and sends no data
anywhere. Figures are only ever as good as the feed the shop publishes.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from urllib.parse import urlsplit

UA = "Mozilla/5.0 (compatible; CatalogueScan/1.0; +https://toolzbaba.com/visual-sitemap-generator)"
PAGE = 250          # Shopify's maximum page size
MAX_PAGES = 40      # 10,000 products is enough to describe any catalogue
PAUSE = 0.4         # seconds between requests, so a shop never notices us
TIMEOUT = 40


def get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read(12_000_000)
            if (r.headers.get("Content-Encoding") or "").lower() == "gzip":
                raw = gzip.decompress(raw)
            return json.loads(raw.decode("utf-8", "replace"))
    except Exception:   # a bad address or an odd server must end one request, never the whole run
        return None


def host_of(site: str) -> str | None:
    """The host part of what the user typed, or None if it cannot be a web address."""
    s = (site or "").strip()
    if not s.startswith(("http://", "https://")):
        s = "https://" + s
    try:
        host = urlsplit(s).netloc
    except ValueError:
        return None
    if not host or "." not in host or any(c.isspace() for c in host):
        return None
    return host


def shopify(host: str, say) -> list[dict]:
    """Products from /products.json, every page of it."""
    out: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        d = get_json(f"https://{host}/products.json?limit={PAGE}&page={page}")
        items = (d or {}).get("products") if isinstance(d, dict) else None
        if not items:
            break
        for p in items:
            vs = p.get("variants") or [{}]
            prices = [float(v.get("price") or 0) for v in vs if v.get("price")]
            mrps = [float(v.get("compare_at_price") or 0) for v in vs if v.get("compare_at_price")]
            price = min(prices) if prices else 0.0
            out.append({
                "title": (p.get("title") or "").strip(),
                "handle": p.get("handle") or "",
                "type": (p.get("product_type") or "").strip(),
                "price": price,
                "mrp": max(max(mrps) if mrps else 0.0, price),
                "available": any(v.get("available") for v in vs),
                "variants": len(vs),
                "published": (p.get("published_at") or p.get("created_at") or "")[:10],
            })
        say(f"  read {len(out)} products")
        if len(items) < PAGE:
            break
        time.sleep(PAUSE)
    return out


def woocommerce(host: str, say) -> list[dict]:
    """Products from the WooCommerce Store API, which needs no key."""
    out: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        d = get_json(f"https://{host}/wp-json/wc/store/v1/products?per_page=100&page={page}")
        if not isinstance(d, list) or not d:
            break
        for p in d:
            pr = p.get("prices") or {}
            unit = 10 ** int(pr.get("currency_minor_unit") or 0)
            price = float(pr.get("price") or 0) / unit
            mrp = float(pr.get("regular_price") or pr.get("price") or 0) / unit
            out.append({
                "title": (p.get("name") or "").strip(),
                "handle": (p.get("permalink") or "").rstrip("/").rsplit("/", 1)[-1],
                "type": ", ".join(c.get("name", "") for c in (p.get("categories") or [])[:1]),
                "price": price,
                "mrp": max(mrp, price),
                "available": bool(p.get("is_in_stock", True)),
                "variants": len(p.get("variations") or []) or 1,
                "published": "",
            })
        say(f"  read {len(out)} products")
        if len(d) < 100:
            break
        time.sleep(PAUSE)
    return out


def measure(host: str, ps: list[dict]) -> dict:
    """Turn a product list into the four answers."""
    n = len(ps)
    dead = [p for p in ps if not p["available"]]
    half = n // 2
    front, back = ps[:half], ps[half:]
    pc = lambda a, b: round(a / b * 100) if b else 0

    # Plenty of shops publish no price, or no MRP, in their feed. Counting those as "full price" would be a
    # lie: mamaearth.in publishes neither, and an early version of this reported all 916 products as full price.
    priced = [p for p in ps if p["price"] > 0]
    withmrp = [p for p in priced if p["mrp"] > p["price"]]
    disc = [1 - p["price"] / p["mrp"] for p in withmrp]
    buckets = [("full price", 0.0, 0.001), ("1-20% off", 0.001, 0.2), ("21-40% off", 0.2, 0.4), ("over 40% off", 0.4, 9.0)]
    at_full = len(priced) - len(withmrp)

    prices = sorted(p["price"] for p in priced)
    points = Counter(p["price"] for p in priced)
    months = Counter(p["published"][:7] for p in ps if p.get("published"))

    return {
        "host": host,
        "products": n,
        "soldOut": len(dead),
        "soldOutPc": pc(len(dead), n),
        "frontHalfPc": pc(sum(1 for p in front if not p["available"]), len(front)),
        "backHalfPc": pc(sum(1 for p in back if not p["available"]), len(back)),
        "pricedPc": pc(len(priced), n),
        "mrpPc": pc(len(withmrp), len(priced)),
        "atFullPrice": at_full,
        "discount": {name: sum(1 for d in disc if lo <= d < hi) for name, lo, hi in buckets if name != "full price"},
        "deepDiscountPc": pc(sum(1 for d in disc if d >= 0.4), len(priced)),
        "median": prices[len(prices) // 2] if prices else 0,
        "distinctPrices": len(points),
        "topPricePoints": points.most_common(5),
        "newestMonth": max(months) if months else "",
        "deadList": [(p["title"], p["handle"]) for p in dead],
    }


def report(m: dict, list_dead: int) -> str:
    L = [f"\n{m['host']}  —  {m['products']:,} products in the feed"]
    L.append("-" * 64)
    L.append(f"  Sold out, still listed : {m['soldOut']:,}  ({m['soldOutPc']}%)")
    if m["products"] >= 20:
        tail = m["backHalfPc"] - m["frontHalfPc"]
        L.append(f"  Front half / back half : {m['frontHalfPc']}% / {m['backHalfPc']}%"
                 + (f"   <- {tail} points worse in the back" if tail >= 10 else ""))
    if m["pricedPc"] < 50:
        L.append(f"  Prices                  : not published in the feed ({m['pricedPc']}% of products carry one),")
        L.append("                            so price and discount cannot be measured for this shop")
    else:
        if m["pricedPc"] < 100:
            L.append(f"  Prices published        : {m['pricedPc']}% of products (the rest are measured on nothing)")
        L.append(f"  Typical price (median)  : {m['median']:,.0f}")
        L.append(f"  Different prices        : {m['distinctPrices']:,} across {m['products']:,} products")
        if m["topPricePoints"]:
            L.append("  Repeated price points   : " + ", ".join(f"{p:,.0f} x{c}" for p, c in m["topPricePoints"]))
        if m["mrpPc"] == 0:
            L.append("  Discount depth          : no MRP published, so discounting cannot be measured")
        else:
            L.append("  Discount depth          : " + ", ".join(f"{k} {v:,}" for k, v in m["discount"].items())
                     + f", at full price {m['atFullPrice']:,}")
            if m["mrpPc"] < 100:
                L.append(f"                            (of the {m['mrpPc']}% of priced products that publish an MRP)")
    if m["newestMonth"]:
        L.append(f"  Newest product added    : {m['newestMonth']}")
    if list_dead and m["deadList"]:
        L.append(f"\n  Sold out but still live (first {min(list_dead, len(m['deadList']))}):")
        for t, h in m["deadList"][:list_dead]:
            L.append(f"    - {t[:62]}" + (f"   /products/{h}" if h else ""))
    return "\n".join(L)


def scan(site: str, quiet: bool) -> dict | None:
    host = host_of(site)
    if not host:
        print(f"{site!r} is not a web address. Try something like example.com", file=sys.stderr)
        return None
    say = (lambda *_a: None) if quiet else (lambda s: print(s, file=sys.stderr))
    say(f"{host}: reading the product feed")
    ps = shopify(host, say)
    kind = "shopify"
    if not ps:
        ps = woocommerce(host, say)
        kind = "woocommerce"
    if not ps:
        print(f"{host}: no public product feed found (not Shopify or WooCommerce, or it is turned off).", file=sys.stderr)
        return None
    m = measure(host, ps)
    m["platform"] = kind
    return m


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Measure a shop's catalogue from its own public product feed.")
    p.add_argument("sites", nargs="+", help="one or more shop addresses, e.g. example.com")
    p.add_argument("--json", metavar="FILE", help="write the full result, including every sold-out product")
    p.add_argument("--csv", metavar="FILE", help="write one row per shop")
    p.add_argument("--list-dead", type=int, default=0, metavar="N", help="also print the first N sold-out products")
    p.add_argument("--quiet", action="store_true", help="no progress on stderr")
    a = p.parse_args(argv)

    out = []
    for site in a.sites:
        m = scan(site, a.quiet)
        if m:
            out.append(m)
            print(report(m, a.list_dead))

    if len(out) > 1:
        tp = sum(m["products"] for m in out)
        ts = sum(m["soldOut"] for m in out)
        print(f"\n{'=' * 64}\nAll {len(out)} shops: {ts:,} of {tp:,} products sold out ({round(ts / tp * 100) if tp else 0}%)")

    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print(f"\nWrote {a.json}", file=sys.stderr)
    if a.csv:
        cols = ["host", "platform", "products", "soldOut", "soldOutPc", "frontHalfPc", "backHalfPc",
                "deepDiscountPc", "median", "distinctPrices", "newestMonth"]
        with open(a.csv, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(out)
        print(f"Wrote {a.csv}", file=sys.stderr)
    return 0 if out else 1


if __name__ == "__main__":
    sys.exit(main())
