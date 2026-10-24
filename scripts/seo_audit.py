"""Crawl the built site (dist/) the way a search engine does: start at the home page, follow only real <a href> links in
the HTML (no JavaScript), and report for every address in the sitemap how many clicks away it is, how many pages link
to it, and the basics a page needs to be indexed (title, description, canonical, noindex, amount of text).

    python scripts/seo_audit.py            summary
    python scripts/seo_audit.py --csv out  also write out/seo_audit.csv with one row per sitemap address
"""
import csv, html, os, re, sys
from collections import Counter, defaultdict, deque

DIST = os.path.join(os.path.dirname(__file__), '..', 'dist')
SITE = 'https://toolzbaba.com'
LANGS = {'hi', 'bn', 'es', 'pt', 'id', 'fr', 'de', 'ru', 'ja', 'tr', 'vi', 'it', 'ar', 'pl'}


def file_for(path):
    p = path.strip('/')
    for cand in ([os.path.join(DIST, 'index.html')] if not p else [os.path.join(DIST, p + '.html'), os.path.join(DIST, p, 'index.html')]):
        if os.path.isfile(cand):
            return cand
    return None


def norm(href, base):
    if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:', 'data:')):
        return None
    if href.startswith('//'):
        return None
    if href.startswith('http'):
        if not href.startswith(SITE):
            return None
        href = href[len(SITE):] or '/'
    if not href.startswith('/'):
        href = base.rsplit('/', 1)[0] + '/' + href
    href = href.split('#')[0].split('?')[0]
    if href != '/':
        href = href.rstrip('/')
    if re.search(r'\.(png|jpe?g|webp|svg|ico|css|js|json|xml|txt|pdf|woff2?)$', href) or href.startswith(('/assets/', '/api/', '/admin', '/i/', '/f/')):
        return None
    return href


TEXT_STRIP = re.compile(r'<(script|style|noscript|template)[^>]*>.*?</\1>', re.S | re.I)


def page_info(path):
    f = file_for(path)
    if not f:
        return None
    h = open(f, encoding='utf-8', errors='replace').read()
    title = re.search(r'<title>(.*?)</title>', h, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', h)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', h)
    robots = re.search(r'<meta name="robots" content="([^"]*)"', h)
    body = TEXT_STRIP.sub(' ', h)
    main = re.search(r'<main[^>]*>(.*)</main>', body, re.S)
    words = len(html.unescape(re.sub(r'<[^>]+>', ' ', main.group(1) if main else body)).split())
    links = re.findall(r'<a\s[^>]*href="([^"]+)"', h)
    hreflang = re.findall(r'<link rel="alternate" hreflang="[^"]+" href="([^"]+)"', h)
    return dict(title=html.unescape(title.group(1).strip()) if title else '', desc=html.unescape(desc.group(1)) if desc else '',
                canon=canon.group(1) if canon else '', robots=robots.group(1) if robots else '', words=words, links=links, hreflang=hreflang)


def main():
    sm = open(os.path.join(DIST, 'sitemap.xml'), encoding='utf-8').read()
    urls = [u[len(SITE):] or '/' for u in re.findall(r'<loc>([^<]+)</loc>', sm)]
    urls = ['/' if u == '/' else u.rstrip('/') for u in urls]
    info, inbound, depth = {}, defaultdict(set), {'/': 0}
    q = deque(['/'])
    while q:   # breadth first from the home page, HTML links only
        p = q.popleft()
        if p not in info:
            info[p] = page_info(p)
        i = info[p]
        if not i:
            continue
        for href in i['links']:
            t = norm(href, p)
            if not t:
                continue
            inbound[t].add(p)
            if t not in depth:
                depth[t] = depth[p] + 1
                q.append(t)
    for u in urls:
        if u not in info:
            info[u] = page_info(u)
    rows = []
    for u in urls:
        i = info[u] or {}
        lang = u.split('/')[1] if u.split('/')[1] in LANGS else 'en'
        rows.append(dict(url=u, lang=lang, depth=depth.get(u, ''), inbound=len(inbound.get(u, ())), words=i.get('words', 0),
                         title=i.get('title', ''), desc_len=len(i.get('desc', '')), canon_ok=(i.get('canon', '') == SITE + (u if u != '/' else '/')),
                         noindex='noindex' in i.get('robots', ''), missing=not i))
    en = [r for r in rows if r['lang'] == 'en']
    def summary(rs, name):
        unreach = [r for r in rs if r['depth'] == '']
        d = Counter(r['depth'] for r in rs if r['depth'] != '')
        print(f'--- {name}: {len(rs)} pages')
        print('  not reachable by HTML links from the home page:', len(unreach))
        print('  clicks from home:', dict(sorted(d.items())))
        print('  linked from only 1 page:', sum(1 for r in rs if r['inbound'] == 1), ' from 2-3:', sum(1 for r in rs if 2 <= r['inbound'] <= 3))
        print('  words on page (median):', sorted(r['words'] for r in rs)[len(rs) // 2], ' under 150 words:', sum(1 for r in rs if r['words'] < 150))
        print('  canonical not itself:', sum(1 for r in rs if not r['canon_ok']), ' noindex:', sum(1 for r in rs if r['noindex']), ' file missing:', sum(1 for r in rs if r['missing']))
        dup = Counter(r['title'] for r in rs)
        print('  duplicate titles:', sum(n for t, n in dup.items() if n > 1))
        return unreach
    un = summary(en, 'English')
    print('  examples not reachable:', [r['url'] for r in un[:12]])
    summary([r for r in rows if r['lang'] != 'en'], 'Other languages')
    print('home page links:', len(set(filter(None, (norm(h, '/') for h in info['/']['links'])))))
    if '--csv' in sys.argv:
        out = sys.argv[sys.argv.index('--csv') + 1]
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, 'seo_audit.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
        print('wrote', os.path.join(out, 'seo_audit.csv'))


if __name__ == '__main__':
    main()
