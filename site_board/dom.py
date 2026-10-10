"""A very small DOM built with html.parser, enough to read menus, footers and headings."""
from __future__ import annotations

import html as _html
import re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
SKIP_TEXT = {"script", "style", "noscript", "template", "svg"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "data")

    def __init__(self, tag=None, attrs=None, parent=None, data=None):
        self.tag, self.attrs, self.parent, self.data = tag, attrs or {}, parent, data
        self.children: list[Node] = []

    def iter(self):
        stack = [self]
        while stack:
            n = stack.pop()
            yield n
            stack.extend(reversed(n.children))

    def find_all(self, *tags):
        return [n for n in self.iter() if n.tag in tags]

    def text(self, limit: int = 400) -> str:
        out, size = [], 0
        stack = [self]
        while stack and size < limit * 2:
            n = stack.pop()
            if n.tag is None:
                out.append(n.data)
                size += len(n.data)
            elif n.tag not in SKIP_TEXT:
                stack.extend(reversed(n.children))
        return re.sub(r"\s+", " ", " ".join(out)).strip()[:limit]

    def cls(self) -> str:
        return (self.attrs.get("class") or "") + " " + (self.attrs.get("id") or "")

    def ancestors(self):
        n = self.parent
        while n is not None:
            yield n
            n = n.parent


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, {k: (v or "") for k, v in attrs}, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, {k: (v or "") for k, v in attrs}, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        if data.strip():
            self.cur.children.append(Node(None, None, self.cur, data))


def parse(html: str) -> Node:
    b = _Builder()
    try:
        b.feed(html)
        b.close()
    except Exception:  # broken markup: keep what was parsed
        pass
    return b.root


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", _html.unescape(s or "")).strip()


# ---------- fast regex readers for every crawled page ----------
_T = re.compile(r"<title[^>]*>([\s\S]*?)</title>", re.I)
_H1 = re.compile(r"<h1[^>]*>([\s\S]*?)</h1>", re.I)
_TAGS = re.compile(r"<[^>]+>")
_DEAD = re.compile(r"<(script|style|noscript|template)\b[^>]*>[\s\S]*?</\1>", re.I)
_H2 = re.compile(r"<h2[\s>]", re.I)
_H3 = re.compile(r"<h3[\s>]", re.I)
_IMG = re.compile(r"<img\b[^>]*>", re.I)
_ALT = re.compile(r"\balt\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))", re.I)
_SRC = re.compile(r"\b(?:src|data-src)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))", re.I)
_SCHEMA = re.compile(r'"@type"\s*:\s*"([A-Za-z][A-Za-z0-9]{2,39})"')
_HREF = re.compile(r"<a\b[^>]*?\bhref\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))", re.I)
_LANG = re.compile(r"<html[^>]*\blang\s*=\s*[\"']?([A-Za-z-]{2,10})", re.I)
_VIEWPORT = re.compile(r'<meta[^>]+name\s*=\s*["\']?viewport', re.I)
_HREFLANG = re.compile(r'<link[^>]+hreflang\s*=\s*["\']?([A-Za-z-]{2,10})', re.I)
SCAN_CAP = 400_000  # only the first part of a very long page is measured, to keep the crawl quick


def _attr(m, *groups) -> str:
    """The first non-empty capture of a quoted / unquoted attribute match."""
    for g in groups:
        if m.group(g):
            return m.group(g)
    return ""


def _alt_of(img_tag: str) -> str:
    """The alt text of one <img ...> tag (empty when it has none, or has an empty one)."""
    m = _ALT.search(img_tag)
    return clean(_attr(m, 1, 2, 3)) if m else ""


def page_links(html: str, limit: int = 400) -> list[str]:
    """Every href on the page, in order, as written (the crawler turns them into same-site paths)."""
    out, seen = [], set()
    for m in _HREF.finditer(html[:SCAN_CAP]):
        h = clean(_attr(m, 1, 2, 3))
        if h and h not in seen:
            seen.add(h)
            out.append(h)
            if len(out) >= limit:
                break
    return out


def _val(name: str) -> str:
    """Attribute whose value may be in double quotes, single quotes or bare (minified pages drop the quotes)."""
    return r'%s\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))' % name


def meta(html: str, name: str) -> str:
    n = r'(?:name|property)\s*=\s*["\']?%s["\']?(?=[\s/>])' % re.escape(name)
    m = re.search(r"<meta[^>]+%s[^>]*%s" % (n, _val("content")), html, re.I) or \
        re.search(r"<meta[^>]+%s[^>]*%s" % (_val("content"), n), html, re.I)
    return clean(_attr(m, 1, 2, 3)) if m else ""


def page_facts(html: str, deep: bool = False) -> dict:
    """Title, description, keywords, H1s, canonical, noindex and review stars from a page's HTML.

    With deep=True it also measures the things the board's page report shows: word count, headings, images and
    their alt text, the share picture, structured-data types, language and whether the page is mobile-ready.
    Only the first SCAN_CAP characters are measured, so one enormous page cannot slow the whole crawl down.
    """
    t = _T.search(html)
    h1s = [clean(_TAGS.sub(" ", m.group(1))) for m in _H1.finditer(html)]
    _rel = r'rel\s*=\s*["\']?canonical["\']?(?=[\s/>])'
    canon = re.search(r"<link[^>]+%s[^>]*%s" % (_rel, _val("href")), html, re.I) or \
        re.search(r"<link[^>]+%s[^>]*%s" % (_val("href"), _rel), html, re.I)
    rv = re.search(r'"ratingValue"\s*:\s*"?([\d.]+)', html)
    rc = re.search(r'"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)', html)
    robots = meta(html, "robots")
    out = {"t": clean(t.group(1)) if t else "", "d": meta(html, "description") or meta(html, "og:description"),
           "k": meta(html, "keywords"), "h1": [h for h in h1s if h][:3], "c": _attr(canon, 1, 2, 3) if canon else ""}
    if "noindex" in robots.lower():
        out["ni"] = True
    if deep:
        head = html[:SCAN_CAP]
        words = _TAGS.sub(" ", _DEAD.sub(" ", head))
        out["w"] = len(words.split())
        out["h2"] = len(_H2.findall(head))
        out["h3"] = len(_H3.findall(head))
        imgs = _IMG.findall(head)
        out["im"] = len(imgs)
        out["ia"] = sum(1 for tag in imgs if not _alt_of(tag))
        pic = meta(html, "og:image") or meta(html, "twitter:image")
        if not pic:  # no share picture set: the first real picture on the page stands in for it
            for tag in imgs[:8]:
                m = _SRC.search(tag)
                src = clean(_attr(m, 1, 2, 3)) if m else ""
                if src and not src.startswith("data:"):
                    pic = src
                    break
        if pic:
            out["og"] = pic[:300]
        types = [x for x in dict.fromkeys(_SCHEMA.findall(head)) if x.lower() not in ("imageobject", "listitem")]
        if types:
            out["sc"] = types[:6]
        lang = _LANG.search(head)
        if lang:
            out["lang"] = lang.group(1).lower()
        if not _VIEWPORT.search(head):
            out["nvp"] = True
        hl = [x.lower() for x in dict.fromkeys(_HREFLANG.findall(head))]
        if hl:
            out["hl"] = len(hl)
        out["b"] = len(html)
    if rv:
        try:
            v = float(rv.group(1))
            if 0 < v <= 5:
                out["rv"] = round(v, 2)
                if rc:
                    out["rc"] = int(rc.group(1))
        except ValueError:
            pass
    return out
