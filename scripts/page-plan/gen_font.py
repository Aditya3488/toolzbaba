"""Tier 1, fonts: the Font Converter (fontTools in Pyodide) and the plan's font pages.

Not made: anything -> PFB (there is no Type 1 writer). svg-converter stays the picture tool; the font pages that start or
end in SVG are about SVG fonts and say so.
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from i18n_font import TOOLS as TL, STRINGS  # noqa: E402
from gen_docsheet import save_like, PLAN, LANGS  # noqa: E402

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

BASE = {
    "slug": "font-converter", "cat": "util", "icon": "🔤", "name": "Font Converter",
    "desc": "Convert between TTF, OTF, WOFF, WOFF2, EOT, TTC, DFONT, SVG fonts and Type 1. Runs in your browser.",
    "kind": "client", "engine": "font", "js": "font-converter", "tabAll": "All formats",
    "keywords": "font typeface ttf otf woff woff2 eot ttc dfont pfb type1 webfont convert",
    "about": ("Convert any font to the format you need: WOFF2 for websites (the smallest), TTF or OTF for Windows, Mac and design apps, "
              "TTC for several fonts in one file, and EOT, SVG font or DFONT for older systems. Every glyph, metric, kerning pair and name "
              "is kept; when the format needs the other kind of curves (TrueType or CFF), the curves are converted and the shapes stay the "
              "same. Old Type 1 (PFB) fonts open too. Converting a font does not change its licence. Python's fontTools runs in your "
              "browser, so the font is not uploaded."),
    "title": "Font Converter Free: Convert TTF, OTF, WOFF2, WOFF Online | Toolz Baba",
    "metaDesc": "Convert fonts to TTF, OTF, WOFF, WOFF2, EOT, TTC, SVG or DFONT. WOFF2 for websites, TTF for design. Free, nothing uploaded.",
    "steps": ["Add your font files.", "Choose the format to convert to.", "Convert and download."],
    "faq": [
        {"q": "Which format should I use on a website?", "a": "WOFF2. It is the smallest and every current browser reads it. Add WOFF as well only if you need very old browsers."},
        {"q": "Is anything lost?", "a": "In WOFF, WOFF2, TTC and DFONT the font is the same, only packed differently. Between TTF and OTF the shapes stay the same and only the hinting is dropped."},
        {"q": "Is my font uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
    ],
}

LABEL = {"ttf": "TTF", "otf": "OTF", "woff": "WOFF", "woff2": "WOFF2", "ttc": "TTC", "eot": "EOT", "dfont": "DFONT", "pfb": "PFB", "svg": "SVG"}
IN_NOTE = {
    "ttf": "Every glyph, metric, kerning pair and name in the TTF is read.",
    "otf": "OpenType fonts with CFF or TrueType outlines are both read.",
    "woff": "The WOFF is unpacked to the full font first.",
    "woff2": "The WOFF2 is decompressed (it uses Brotli) to the full font first.",
    "ttc": "Every font inside the collection is converted, each to its own file.",
    "eot": "The font inside the EOT is taken out; EOT files compressed with MicroType Express are the one kind that cannot be opened.",
    "dfont": "Every font inside the Mac suitcase is converted, each to its own file.",
    "pfb": "The Type 1 (PostScript) outlines, widths and glyph names are read and turned into a modern font, with each letter matched to its Unicode character from its glyph name.",
    "svg": "The file must be an SVG font, one with a <font> element and a <glyph> for each letter; an ordinary SVG drawing has no letters to convert.",
}
OUT_NOTE = {
    "ttf": "TTF (TrueType) installs on Windows, Mac and Linux and works in every design program. CFF outlines are turned into TrueType curves that look the same.",
    "otf": "OTF here means OpenType with CFF (PostScript) outlines, the kind type designers ship. TrueType curves become cubic CFF curves with the same shapes; TrueType hinting is dropped.",
    "woff": "WOFF is a compressed font for websites that every browser of the last decade reads; WOFF2 is smaller if you only need current browsers.",
    "woff2": "WOFF2 is the smallest web font format, usually 30 to 60% smaller than the TTF, and every current browser supports it in @font-face.",
    "ttc": "A TTC (TrueType Collection) keeps several fonts in one file: add several fonts and they all go into the same collection.",
    "eot": "EOT is the web font format of old Internet Explorer (versions 6 to 8). Only those browsers need it; everything else uses WOFF or WOFF2.",
    "svg": "An SVG font describes every letter as an SVG path. Old iPhones needed it for web fonts; today it is handy for editing letter shapes or loading them into icon, embroidery and cutting-machine programs.",
    "dfont": "DFONT is the Mac's own font suitcase format, kept for older Mac software. The fonts are stored inside as standard TrueType or OpenType data.",
}
LOSS = {
    "woff": "Nothing: the font is the same, only compressed for the web.",
    "woff2": "Nothing: the font is the same, only compressed for the web.",
    "ttc": "Nothing: each font is stored as it is inside the collection.",
    "dfont": "Nothing: each font is stored as it is inside the suitcase.",
    "ttf": "The shapes, widths and kerning stay the same. Fonts with CFF outlines lose their PostScript hints, which modern screens rarely use.",
    "otf": "The shapes, widths and kerning stay the same. TrueType hinting has no place in a CFF font, so it is dropped.",
    "eot": "The shapes and widths stay the same; the EOT carries a TrueType copy of the font.",
    "svg": "SVG fonts have no kerning or OpenType features, so those are left out; every letter shape and width is kept.",
}


def title_label(fmt, side):
    return "SVG Font" if fmt == "svg" else LABEL[fmt]


def pair(s, d):
    S, D = LABEL[s], LABEL[d]
    Sf, Df = title_label(s, 0), title_label(d, 1)
    return {
        "name": f"{S} to {D}", "tab": f"{S} to {D}", "preset": {"format": d}, "dropLabel": f"Drop your {Sf} files here",
        "title": f"{S} to {D} Converter Free: Convert {Sf} {'' if s == 'svg' else 'Font '}to {Df} Online",
        "desc": f"Convert {Sf} fonts to {Df}, every letter and metric kept. Nothing uploaded.",
        "metaDesc": f"Free {S} to {D} font converter. Turn {Sf} files into {Df} online with every glyph, width and name kept. Runs in your browser, so nothing is uploaded.",
        "about": f"Convert {Sf} fonts to {Df}. {IN_NOTE[s]} {OUT_NOTE[d]} Several fonts can be converted at once. Converting does not change the font's licence. The conversion runs in your browser, so your fonts never leave your device.",
        "steps": [f"Add your {Sf} files.", f"{Df} is already selected.", f"Convert and download the {Df}."],
        "faq": [
            {"q": f"How do I convert {S} to {D}?", "a": f"Add the {Sf} files above; {Df} is already chosen. Press Convert and download the result."},
            {"q": "Is anything lost?", "a": LOSS[d]},
            {"q": "Is my font uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def hub(s):
    S = LABEL[s]
    return {
        "name": f"{S} Converter", "tab": f"{S} Converter", "dropLabel": f"Drop your {S} files here",
        "title": f"{S} Converter Free: Convert {S} Fonts to WOFF2, TTF, OTF and More",
        "desc": f"Convert {S} fonts to WOFF2, WOFF, TTF, OTF, EOT, TTC, SVG or DFONT. Nothing uploaded.",
        "metaDesc": f"Free {S} converter. Turn {S} fonts into WOFF2, WOFF, TTF, OTF, EOT, TTC, SVG or DFONT online. Runs in your browser, so nothing is uploaded.",
        "about": f"Convert {S} fonts into whatever you need: WOFF2 or WOFF for a website, TTF or OTF for design programs, TTC, EOT, SVG font or DFONT for older systems. {IN_NOTE[s]} If you already know the format you want, its page is linked above and arrives with it chosen. Everything runs in your browser, so nothing is uploaded.",
        "steps": [f"Add your {S} files.", "Choose the format you want.", "Convert and download."],
        "faq": [
            {"q": f"What can I convert {S} to?", "a": "WOFF2, WOFF, TTF, OTF, EOT, TTC, SVG font and DFONT. Pick it from the list after you add your fonts."},
            {"q": "Can I convert several fonts at once?", "a": "Yes. Add as many as you like; for TTC and DFONT they all go into one file."},
            {"q": "Is my font uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def main():
    plan = {r["URL"].strip().strip("/").split("/")[-1]: r for r in csv.DictReader(open(PLAN, encoding="utf-8"))}
    data = json.loads(TOOLS.read_text("utf-8"))
    if "font-converter" not in {t["slug"] for t in data["tools"]}:
        at = next(i for i, t in enumerate(data["tools"]) if t["slug"] == "font-library") + 1
        data["tools"].insert(at, dict(BASE))
    by = {t["slug"]: t for t in data["tools"]}
    taken = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(slug, body):
        if slug in taken or slug not in plan:
            return
        b = by["font-converter"]
        new.append({"slug": slug, "base": "font-converter", "cat": b["cat"], "kind": b.get("kind", "client"), **body})
        taken.add(slug)

    ins = ["ttf", "otf", "woff", "woff2", "ttc", "eot", "dfont", "pfb", "svg"]
    outs = ["ttf", "otf", "woff", "woff2", "ttc", "eot", "svg", "dfont"]   # no PFB writer
    for s in ins:
        for d in outs:
            if s != d:
                add(f"{s}-to-{d}", pair(s, d))
        if s != "svg":
            add(f"{s}-converter", hub(s))
    data["variants"] += new
    for v in new:
        kw = (plan[v["slug"]].get("Keyword") or "").strip().lower()
        if kw and kw not in v["title"].lower():
            print("  keyword not in title:", v["slug"], "|", kw, "|", v["title"])
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    for code in LANGS:
        p = ROOT / "i18n" / code / "tools.json"; raw = p.read_bytes().decode("utf-8"); tl = json.loads(raw)
        tl["font-converter"] = TL[code]
        save_like(p, tl, raw)
        q = ROOT / "i18n" / code / "strings.json"; rawq = q.read_bytes().decode("utf-8"); ui = json.loads(rawq)
        for phrase, tr in STRINGS.items():
            ui[phrase] = tr[code]
        save_like(q, ui, rawq)
    print(f"pages added: {len(new)} | variants now {len(data['variants'])}")
    left = sorted(s for s in plan if any(s.startswith(f + "-to-") or s == f + "-converter" for f in ins) and s not in taken and "-to-" in s)
    print("  font pages from the plan not made:", left)


if __name__ == "__main__":
    main()
