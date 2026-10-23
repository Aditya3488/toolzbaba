"""Tier 1, MuPDF and vector group: AI Converter, SVG Converter, image -> SVG pages, and e-books (EPUB, MOBI, FB2) to PDF and pictures.

Left out on purpose: XPS / OXPS (this MuPDF build has no XPS reader), SVG -> PDF / EPS / AI / CDR and AI -> EPS / PSD / CDR
(nothing shipped writes them), AZW3 (not tested), and e-book outputs (EPUB, MOBI, AZW3, FB2 writers).
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from i18n_vector import TOOLS as TL, STRINGS  # noqa: E402
from gen_docsheet import save_like, PLAN, LANGS, IMG, doc_pair, doc_hub, DOC, DOC_NOTE  # noqa: E402

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

BASE = {
    "ai-converter": {
        "slug": "ai-converter", "cat": "image", "icon": "✒️", "name": "AI Converter",
        "desc": "Convert Illustrator (AI) files to PNG, JPG, SVG, PDF and more. Runs in your browser.",
        "kind": "client", "engine": "pdf", "js": "server-pdf", "tabAll": "All formats",
        "keywords": "ai illustrator adobe vector artwork logo convert png jpg svg pdf open without illustrator",
        "about": ("Open and convert AI files without Illustrator: PNG, JPG, WebP, TIFF or ICO pictures, a plain PDF, or an SVG where the "
                  "shapes stay vectors. Every artboard becomes its own file, and the sharpness of pictures goes from 72 to 300 DPI. AI "
                  "files from Illustrator 9 onwards carry a PDF inside (\"Create PDF Compatible File\", on by default), and that is what "
                  "is drawn. PDFs work too. Everything happens in your browser, so nothing is uploaded."),
        "title": "AI File Converter Free: AI to PNG, JPG, SVG, PDF Online | Toolz Baba",
        "metaDesc": "Convert an Illustrator AI file to PNG, JPG, WebP, SVG, PDF or ICO without Illustrator. Each artboard separately. Free, nothing uploaded.",
        "steps": ["Add your AI file.", "Choose the format and the quality.", "Convert and download."],
        "faq": [
            {"q": "Can I open an AI file without Illustrator?", "a": "Yes. AI files saved from Illustrator 9 onwards carry a PDF inside, which this tool reads directly. Nothing needs to be installed."},
            {"q": "Why did my AI file not open?", "a": "It was saved without PDF compatibility, or it comes from Illustrator 8 or older. Open it in Illustrator and save it again with \"Create PDF Compatible File\" ticked."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    },
    "svg-converter": {
        "slug": "svg-converter", "cat": "image", "icon": "🔷", "name": "SVG Converter",
        "desc": "Convert SVG to PNG, JPG, WebP, ICO and more, at any width you like. Runs in your browser.",
        "kind": "client", "engine": "image", "js": "server-image", "tabAll": "All formats",
        "keywords": "svg vector logo icon convert png jpg webp ico favicon rasterize export",
        "about": ("An SVG is a vector with no pixels of its own, so when you convert it you choose the width and the drawing comes out "
                  "sharp at exactly that size: 64 pixels for an icon or 4000 for a poster. PNG, WebP and ICO keep the transparency; for "
                  "JPG, pick a background colour. The ICO holds every size from 16 to 256 pixels for websites and Windows. The SVG is "
                  "drawn in your browser, so nothing is uploaded."),
        "title": "SVG Converter Free: SVG to PNG, JPG, WebP, ICO Online | Toolz Baba",
        "metaDesc": "Convert SVG to PNG, JPG, WebP, ICO, AVIF, GIF, BMP or TIFF, sharp at any width. Several files at once. Free, nothing uploaded.",
        "steps": ["Add your SVG files.", "Choose the format and the width.", "Convert and download."],
        "faq": [
            {"q": "How big can the picture be?", "a": "Up to 8000 pixels wide, with sharp edges at every size, because the SVG is drawn at that size."},
            {"q": "Is the transparency kept?", "a": "Yes, in PNG, WebP, AVIF and ICO. JPG and BMP cannot be transparent; pick a background colour for them."},
            {"q": "Is my file uploaded?", "a": "No. The SVG is drawn inside your browser."},
        ],
    },
}

OUT = {"png": ("PNG", "a sharp picture with a transparent background, the usual choice for logos"),
       "jpg": ("JPG", "a small picture with a white background, for sending and sharing"),
       "webp": ("WebP", "a small, sharp picture with transparency, made for websites"),
       "ico": ("ICO", "an icon file with every size from 16 to 256 pixels, for a website favicon or a Windows icon"),
       "pdf": ("PDF", "a plain PDF that opens in any viewer, for printing or sending to someone without Illustrator"),
       "svg": ("SVG", "a vector file for the web and for Inkscape, Figma or Canva: shapes stay shapes and scale without blur")}


def ai_pair(d):
    D, what = OUT[d]
    return {
        "name": f"AI to {D}", "tab": f"AI to {D}", "preset": {"format": d},
        "title": f"AI to {D} Converter Free: Convert Illustrator AI to {D} Online",
        "desc": f"Turn an Illustrator AI file into {D} without Illustrator. Nothing uploaded.",
        "metaDesc": f"Free AI to {D} converter. Turn an Adobe Illustrator AI file into {D} online, without Illustrator, every artboard included. Nothing is uploaded.",
        "about": (f"Turn an Illustrator AI file into {D}: {what}. You do not need Illustrator: AI files from Illustrator 9 onwards carry "
                  f"a PDF inside (\"Create PDF Compatible File\", on by default), and that is what is drawn. Every artboard becomes its own "
                  f"file. The conversion runs in your browser, so the artwork never leaves your device."),
        "steps": ["Add your AI file.", f"{D} is already selected." + ("" if d in ("svg", "pdf") else " Choose the quality."), f"Convert and download the {D}."],
        "faq": [
            {"q": f"How do I convert AI to {D} without Illustrator?", "a": f"Add the AI file above; {D} is already chosen. Press Convert and download it. Nothing needs to be installed."},
            {"q": "Why did my AI file not open?", "a": "It was saved without PDF compatibility, or it is from Illustrator 8 or older. Save it again from Illustrator with \"Create PDF Compatible File\" ticked."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def pdf_to_svg():
    return {
        "name": "PDF to SVG", "tab": "PDF to SVG", "preset": {"format": "svg"}, "dropLabel": "Drop your PDF here",
        "title": "PDF to SVG Converter Free: Convert PDF Pages to SVG Online",
        "desc": "Turn PDF pages into SVG vector files. Shapes stay shapes. Nothing uploaded.",
        "metaDesc": "Free PDF to SVG converter. Turn each PDF page into an SVG vector file online: lines and shapes stay sharp at any size. Nothing is uploaded.",
        "about": ("Turn the pages of a PDF into SVG files, one per page. Lines, shapes and text stay vectors (the text becomes outlines, so it "
                  "looks the same on every computer), which makes the SVG sharp at any size: good for putting a drawing or a logo from a PDF "
                  "onto a website, or editing it in Inkscape, Figma or Illustrator. Photos inside the PDF stay photos. Choose all pages or a "
                  "range. The conversion runs in your browser, so the PDF never leaves your device."),
        "steps": ["Add your PDF.", "SVG is already selected; choose the pages.", "Convert and download the SVG files."],
        "faq": [
            {"q": "Is the SVG really vector?", "a": "Yes. Lines and shapes are written as SVG paths, and text as outlines. Photos in the PDF stay pictures inside the SVG."},
            {"q": "Can I edit the text in the SVG?", "a": "Not as text: it is turned into outlines so it looks right everywhere. You can still recolour, move or resize it."},
            {"q": "Is my PDF uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


SVG_OUT = {"png": ("PNG", "transparency kept, the usual choice for logos and icons"), "jpg": ("JPG", "a white background, small files for sharing"),
           "webp": ("WebP", "transparency kept and small files, made for websites"), "ico": ("ICO", "every size from 16 to 256 pixels in one icon, for a favicon or Windows")}


def svg_pair(d):
    D, what = SVG_OUT[d]
    return {
        "name": f"SVG to {D}", "tab": f"SVG to {D}", "preset": {"format": d},
        "title": f"SVG to {D} Converter Free: Convert SVG to {D} Online" + (" (Favicon)" if d == "ico" else ""),
        "desc": f"Turn SVG into {D}, sharp at the width you choose. Several files at once, nothing uploaded.",
        "metaDesc": f"Free SVG to {D} converter. Turn SVG files into {D} online at any width, with sharp edges. Batch supported and nothing is uploaded.",
        "about": (f"Turn SVG files into {D}: {what}. An SVG has no pixels of its own, so " + ("the icon is drawn fresh at every size it holds, 16 to 256 pixels. " if d == "ico" else "you choose the width and the drawing is made sharp at exactly that size, from a small icon to a poster. ")
                  + "Add as many files as you like. The SVG is drawn in your browser, so nothing is uploaded."),
        "steps": ["Add your SVG files.", f"{D} is already selected" + ("." if d == "ico" else "; choose the width."), f"Convert and download the {D}."],
        "faq": [
            {"q": f"How do I convert SVG to {D}?", "a": f"Add the SVG files above; {D} is already chosen. Press Convert and download." + ("" if d == "ico" else " Change the width first if you need a bigger or smaller picture.")},
            {"q": "Will it be blurry?", "a": "No. The SVG is drawn at the final size, not stretched from a small picture, so the edges stay sharp."},
            {"q": "Is my file uploaded?", "a": "No. The SVG is drawn inside your browser."},
        ],
    }


RASTER = {"png": "PNG", "jpg": "JPG", "webp": "WebP", "ico": "ICO"}


def to_svg(s):
    S = RASTER[s]
    return {
        "name": f"{S} to SVG", "tab": f"{S} to SVG", "dropLabel": f"Drop your {S} images here",
        "title": f"{S} to SVG Converter Free: Convert {S} to SVG Vector Online",
        "desc": f"Trace a {S} image into an SVG vector that scales without blur. Nothing uploaded.",
        "metaDesc": f"Free {S} to SVG converter. Trace a {S} logo, icon or drawing into a real SVG vector online, sharp at any size. Nothing is uploaded.",
        "about": (f"Turn a {S} into an SVG by tracing it: the colours and edges become vector shapes, so the result scales to any size "
                  "without blur. It works best on logos, icons, signatures and flat illustrations; photos turn into many small shapes and "
                  "a larger file. Choose logo, photo or black and white line art before you convert. The tracing runs in your browser, so "
                  "the image never leaves your device."),
        "steps": [f"Add your {S} images.", "Choose the type of image: logo, photo or line art.", "Convert and download the SVG."],
        "faq": [
            {"q": f"Is this a real vector, or a {S} inside an SVG?", "a": "A real vector: the image is traced into shapes. Nothing of the original picture is embedded."},
            {"q": "Which images work best?", "a": "Logos, icons, text and flat drawings with clear edges. Photos work, but the SVG gets large and looks painted."},
            {"q": "Is my image uploaded?", "a": "No. It is traced inside your browser."},
        ],
    }


EB = {"epub": ("EPUB", "an EPUB e-book"), "mobi": ("MOBI", "a Kindle MOBI e-book"), "fb2": ("FB2", "an FB2 (FictionBook) e-book")}


def ebook_pdf(s):
    S, what = EB[s]
    return {
        "name": f"{S} to PDF", "tab": f"{S} to PDF", "dropLabel": f"Drop your {S} file here",
        "title": f"{S} to PDF Converter Free: Convert {S} to PDF Online",
        "desc": f"Turn {what} into a PDF for printing or reading anywhere. Nothing uploaded.",
        "metaDesc": f"Free {S} to PDF converter. Turn {what} into an A4 PDF online, with chapters, pictures and text kept. Hindi supported. Nothing is uploaded.",
        "about": (f"Turn {what} into a PDF: the book is laid out on A4 pages with its chapters, headings, pictures and styles, ready to print "
                  "or to read on any device without an e-book app. Hindi and other Indian scripts are supported. Books with DRM (the copy "
                  "lock on many store-bought books) cannot be opened. The conversion runs in your browser, so the book never leaves your device."),
        "steps": [f"Add your {S} file.", "Press Convert to PDF.", "Download the PDF."],
        "faq": [
            {"q": f"How do I convert {S} to PDF?", "a": f"Add the {S} file above, press Convert to PDF and download it. No app or sign-up is needed."},
            {"q": "Why does my book not open?", "a": "Books bought in some stores are locked with DRM, which only the store's own app can open. Books without DRM convert fine."},
            {"q": "Is my book uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def main():
    plan = {r["URL"].strip().strip("/").split("/")[-1]: r for r in csv.DictReader(open(PLAN, encoding="utf-8"))}
    data = json.loads(TOOLS.read_text("utf-8"))
    slugs = {t["slug"] for t in data["tools"]}
    for key, after in (("ai-converter", "image-to-svg"), ("svg-converter", "image-to-svg")):
        if key not in slugs:
            at = next(i for i, t in enumerate(data["tools"]) if t["slug"] == after) + 1
            data["tools"].insert(at, dict(BASE[key]))
    by = {t["slug"]: t for t in data["tools"]}
    taken = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(slug, base, body):
        if slug in taken or slug not in plan:
            return
        b = by[base]
        new.append({"slug": slug, "base": base, "cat": b["cat"], "kind": b.get("kind", "client"), **body})
        taken.add(slug)

    for d in OUT:
        add(f"ai-to-{d}", "ai-converter", ai_pair(d))
    add("pdf-to-svg", "ai-converter", pdf_to_svg())
    for d in SVG_OUT:
        add(f"svg-to-{d}", "svg-converter", svg_pair(d))
    for s in RASTER:
        add(f"{s}-to-svg", "image-to-svg", to_svg(s))
    for s in EB:
        add(f"{s}-to-pdf", "word-to-pdf", ebook_pdf(s))
    # EPUB pictures: the same copy as the other document pages, with the e-book's own note
    DOC["epub"] = ("EPUB", "EPUB e-book")
    DOC_NOTE["epub"] = "The book is laid out page by page with its chapters, pictures and styles. Books with DRM (a store's copy lock) cannot be opened."
    for d in IMG:
        add(f"epub-to-{d}", "document-to-image", doc_pair("epub", d))
    add("epub-to-image", "document-to-image", doc_hub("epub"))

    data["variants"] += new
    aliased = 0
    for alias, target in {"ebook-to-pdf": "epub-to-pdf"}.items():
        t = next((x for x in data["variants"] if x["slug"] == target), None)
        if t and alias in plan and alias not in taken:
            t.setdefault("aliases", []).append(alias); taken.add(alias); aliased += 1
    for v in new:
        kw = (plan[v["slug"]].get("Keyword") or "").strip().lower()
        if kw and kw not in v["title"].lower():
            print("  keyword not in title:", v["slug"], "|", kw, "|", v["title"])
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")

    for code in LANGS:
        p = ROOT / "i18n" / code / "tools.json"; raw = p.read_bytes().decode("utf-8"); tl = json.loads(raw)
        for key in BASE:
            tl[key] = TL[code][key]
        save_like(p, tl, raw)
        q = ROOT / "i18n" / code / "strings.json"; rawq = q.read_bytes().decode("utf-8"); ui = json.loads(rawq)
        for phrase, tr in STRINGS.items():
            ui[phrase] = tr[code]
        save_like(q, ui, rawq)
    print(f"pages added: {len(new)} | redirects added: {aliased} | variants now {len(data['variants'])}")
    print("  ", sorted(v["slug"] for v in new))


if __name__ == "__main__":
    main()
