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


def meta(html: str, name: str) -> str:
    m = re.search(r'<meta[^>]+(?:name|property)=["\']%s["\'][^>]*content=["\']([^"\']*)' % re.escape(name), html, re.I) or \
        re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:name|property)=["\']%s["\']' % re.escape(name), html, re.I)
    return clean(m.group(1)) if m else ""


def page_facts(html: str) -> dict:
    """Title, description, keywords, H1s, canonical, noindex and review stars from a page's HTML."""
    t = _T.search(html)
    h1s = [clean(_TAGS.sub(" ", m.group(1))) for m in _H1.finditer(html)]
    canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']*)', html, re.I) or \
        re.search(r'<link[^>]+href=["\']([^"\']*)["\'][^>]*rel=["\']canonical["\']', html, re.I)
    rv = re.search(r'"ratingValue"\s*:\s*"?([\d.]+)', html)
    rc = re.search(r'"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)', html)
    robots = meta(html, "robots")
    out = {"t": clean(t.group(1)) if t else "", "d": meta(html, "description") or meta(html, "og:description"),
           "k": meta(html, "keywords"), "h1": [h for h in h1s if h][:3], "c": canon.group(1) if canon else ""}
    if "noindex" in robots.lower():
        out["ni"] = True
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
