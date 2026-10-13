"""Tier 1, spreadsheets and documents: the Spreadsheet Converter and Document to Image tools, and their format pages.

Only addresses from the plan's sheet are made. Pages for formats that already have a page elsewhere become redirects.
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from i18n_docsheet import TOOLS as TL, STRINGS  # noqa: E402

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
PLAN = Path(__file__).parent / "new-tool-urls.csv"   # the page plan: one row per address to build
TOOLS = ROOT / "static" / "assets" / "tools.json"
LANGS = ["hi", "bn", "es", "pt", "id", "fr", "de", "ru", "ja", "tr", "vi", "it", "ar", "pl"]

BASE = {
    "document-to-image": {
        "slug": "document-to-image", "cat": "pdf", "icon": "🖼️", "name": "Document to Image",
        "desc": "Turn Word, Markdown, HTML, text and Excel files into PNG, JPG, WebP and more. Runs in your browser.",
        "kind": "client", "engine": "pdf", "js": "server-pdf", "tabAll": "All formats",
        "keywords": "docx word excel xlsx xls markdown md html txt text document to png jpg jpeg webp image picture",
        "about": ("Turn a document into pictures: Word (DOCX), Markdown, HTML, plain text and spreadsheets (XLSX, XLS, CSV, ODS, Numbers) "
                  "become PNG, JPG, WebP, TIFF, GIF or BMP images. Choose one picture per page, or one long picture cut to the content, which "
                  "suits a table you want to post or paste into a chat. Pick the sharpness from 72 to 300 DPI. Headings, lists, tables and "
                  "pictures are kept; complex layouts such as columns and text boxes come out simpler than in Word. Hindi and other Indian "
                  "scripts are supported. Everything runs inside your browser, so the file is never uploaded."),
        "title": "Document to Image Converter Free: Word, Excel, HTML to PNG, JPG | Toolz Baba",
        "metaDesc": "Convert Word (DOCX), Markdown, HTML, text and Excel files to PNG, JPG, WebP, TIFF, GIF or BMP images. One picture per page or one long picture. Free, nothing uploaded.",
        "steps": ["Add your Word, Markdown, HTML, text or spreadsheet file.",
                  "Choose the picture format, one picture per page or one long picture, and the quality.",
                  "Convert and download the pictures."],
        "faq": [
            {"q": "Which files can I turn into pictures?", "a": "Word (DOCX), Markdown (MD), HTML, plain text (TXT) and spreadsheets: XLSX, XLS, CSV, TSV, ODS and Numbers. Old .doc, RTF and ODT files need to be saved as DOCX first."},
            {"q": "Can I get the whole document as one picture?", "a": "Yes. Choose \"One long picture\" and the document is drawn as a single picture, cut to the content, so there is no empty paper around a small table."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    },
    "spreadsheet-converter": {
        "slug": "spreadsheet-converter", "cat": "pdf", "icon": "📊", "name": "Spreadsheet Converter",
        "desc": "Convert between XLSX, XLS, ODS, CSV, TSV and Apple Numbers. Runs in your browser.",
        "kind": "client", "engine": "sheet", "js": "server-pdf", "tabAll": "All formats",
        "keywords": "excel xlsx xls csv tsv ods numbers spreadsheet sheet workbook convert",
        "about": ("Change a spreadsheet from one format to another: Excel (XLSX and the older XLS), OpenDocument (ODS), CSV, TSV and Apple "
                  "Numbers, in any direction. Values and formulas move across, and every sheet of a workbook is kept; a CSV or TSV holds one "
                  "table, so a workbook with several sheets gives one text file per sheet. Numbers with a leading zero, such as PIN codes and "
                  "phone numbers, stay as they were, and CSV files are saved as UTF-8 that Excel opens with Hindi and accented letters intact. "
                  "Colours, fonts and charts are not carried over. The conversion runs in your browser, so your data never leaves your device."),
        "title": "Spreadsheet Converter Free: XLSX, XLS, CSV, ODS, Numbers Online | Toolz Baba",
        "metaDesc": "Convert spreadsheets between Excel XLSX and XLS, CSV, TSV, ODS and Apple Numbers. Every sheet and formula kept, Hindi safe. Free, nothing uploaded.",
        "steps": ["Add your XLSX, XLS, ODS, CSV, TSV or Numbers files.", "Choose the format to convert to.", "Convert and download."],
        "faq": [
            {"q": "Are formulas and sheets kept?", "a": "Yes, every sheet, value and formula moves across between XLSX, XLS, ODS and Numbers. CSV and TSV only store values, one table per file. Colours, fonts and charts are not kept."},
            {"q": "Can I open Apple Numbers files without a Mac?", "a": "Yes. Add the .numbers file and convert it to XLSX, CSV or another format; nothing needs to be installed."},
            {"q": "Is my spreadsheet uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    },
}

# ---------------------------------------------------------------- spreadsheets
SHEET = {"xlsx": ("XLSX", "Excel workbook"), "xls": ("XLS", "Excel 97-2003 workbook"), "ods": ("ODS", "OpenDocument spreadsheet"),
         "csv": ("CSV", "comma-separated text file"), "tsv": ("TSV", "tab-separated text file"), "numbers": ("Numbers", "Apple Numbers spreadsheet")}
IN_NOTE = {
    "csv": "Every value is kept exactly as written: numbers with a leading zero, such as PIN codes and phone numbers, stay as text instead of losing the zero, and Hindi and accented letters come through intact.",
    "tsv": "Every value is kept exactly as written: numbers with a leading zero, such as PIN codes and phone numbers, stay as text instead of losing the zero, and Hindi and accented letters come through intact.",
    "numbers": "Numbers files from a Mac, iPhone or iPad are read directly, so you do not need a Mac to open them.",
    "xls": "Old .xls files from Excel 97 to 2003 are read directly, every sheet included.",
    "xlsx": "Every sheet of the workbook is read, with its values and formulas.",
    "ods": "ODS files from LibreOffice Calc, OpenOffice and Google Sheets are read with every sheet.",
}
OUT_NOTE = {
    "csv": "A CSV file holds one table, so a workbook with several sheets gives one CSV per sheet, delivered together in a ZIP. It is saved as UTF-8 with the mark Excel looks for, so Hindi and accented letters open correctly.",
    "tsv": "A TSV file holds one table, so a workbook with several sheets gives one TSV per sheet, delivered together in a ZIP. Tabs separate the columns, so commas inside your values need no quoting.",
    "xls": "XLS is the format of Excel 97 to 2003, for older software that cannot open XLSX. It holds at most 65,536 rows and 256 columns per sheet.",
    "xlsx": "XLSX opens in Excel, Google Sheets, LibreOffice and Numbers, with every sheet kept.",
    "ods": "ODS is the native format of LibreOffice Calc and OpenOffice, and Excel and Google Sheets open it too.",
    "numbers": "The Numbers file opens on a Mac, iPhone or iPad. Dates are written as the text you see, because Numbers counts dates differently.",
}
TEXTY = {"csv", "tsv"}


def sheet_pair(src, dst, kw):
    S, D = SHEET[src][0], SHEET[dst][0]
    kept = ("Only the values move across, because a text file has no formulas, colours or fonts." if dst in TEXTY or src in TEXTY
            else "Values and formulas move across; colours, fonts and charts do not.")
    return {
        "name": f"{S} to {D}", "tab": f"{S} to {D}", "preset": {"format": dst},
        "title": f"{S} to {D} Converter Free: Convert {S} to {D} Online",
        "desc": f"Convert {S} spreadsheets to {D}. Several files at once, nothing uploaded.",
        "metaDesc": f"Free {kw} converter. Change {'an' if SHEET[src][1][0] in 'AEIOU' else 'a'} {SHEET[src][1]} into {D} online, with every sheet kept. Runs in your browser, so nothing is uploaded.",
        "about": f"Convert {S} files to {D}. {IN_NOTE[src]} {OUT_NOTE[dst]} {kept} The conversion runs inside your browser, so your spreadsheet never leaves your device and there is no sign-up or limit.",
        "steps": [f"Add your {S} files.", f"{D} is already selected.", f"Convert and download the {D} file."],
        "faq": [
            {"q": f"How do I convert {S} to {D}?", "a": f"Add your {S} files above; {D} is already chosen. Press Convert and download the result. Several files can be converted at once."},
            {"q": "What is kept?", "a": kept + " Every sheet is converted."},
            {"q": "Is my file uploaded?", "a": "No. The conversion happens inside your browser, so your data stays on your device."},
        ],
    }


def sheet_hub(src):
    S = SHEET[src][0]
    outs = ", ".join(SHEET[d][0] for d in SHEET if d != src)
    return {
        "name": f"{S} Converter", "tab": f"{S} Converter",
        "title": f"{S} Converter Free: Convert {S} to {outs.replace(', Numbers', ' or Numbers')} Online",
        "desc": f"Convert {S} files to {outs}. Nothing uploaded.",
        "metaDesc": f"Free {S} converter. Change {S} files into {outs} online. Batch supported and nothing is uploaded, because it runs in your browser.",
        "about": f"Convert {S} files into whatever you need: {outs}. {IN_NOTE[src]} If you already know the format you want, the pages for each one are linked above and arrive with it chosen. Everything happens inside your browser, so your spreadsheets never leave your device.",
        "steps": [f"Add your {S} files.", "Choose the format you want.", "Convert and download."],
        "faq": [
            {"q": f"What can I convert {S} to?", "a": f"{outs}. Pick it from the list after you add your files."},
            {"q": "Can I convert several files at once?", "a": "Yes. Add as many as you like and they are all converted in one go."},
            {"q": f"Are my {S} files uploaded?", "a": "No. The conversion runs inside your browser, so your files stay on your device."},
        ],
    }


# ---------------------------------------------------------------- documents to pictures
DOC = {"docx": ("DOCX", "Word document"), "md": ("MD", "Markdown file"), "html": ("HTML", "web page"),
       "txt": ("TXT", "text file"), "xlsx": ("XLSX", "Excel workbook"), "xls": ("XLS", "Excel 97-2003 workbook")}
DOC_NOTE = {
    "docx": "Headings, paragraphs, lists, tables and pictures are kept; complex layouts such as columns and text boxes come out simpler than in Word.",
    "md": "The Markdown is laid out first, so headings, lists, tables, links and code blocks look the way they would on GitHub, not as raw symbols.",
    "html": "The page is drawn from the HTML file itself: inline styles and pictures embedded in the file are shown, while style sheets and pictures from other addresses are not fetched, so a self-contained file works best.",
    "txt": "Line breaks and spacing are kept exactly as in the file, on clean pages.",
    "xlsx": "Each sheet becomes a table on landscape pages, with the sheet name as a heading when there are several. Choose one long picture to get a table cut to its size instead of a full page.",
    "xls": "Each sheet becomes a table on landscape pages, with the sheet name as a heading when there are several. Choose one long picture to get a table cut to its size instead of a full page.",
}
IMG = {"png": ("PNG", "sharp text and lines with no blur, the best choice for documents"),
       "jpg": ("JPG", "small files that open everywhere, good for sending by chat or email"),
       "jpeg": ("JPEG", "small files that open everywhere, good for sending by chat or email"),
       "webp": ("WebP", "small files with sharp text, made for web pages"),
       "tiff": ("TIFF", "a format used for print and archiving"),
       "gif": ("GIF", "a format every program opens; text stays crisp because a document has few colours"),
       "bmp": ("BMP", "uncompressed pictures for older software, so the files are large")}


def doc_pair(src, dst):
    S, D = DOC[src][0], IMG[dst][0]
    long_name = {"md": "Markdown (MD)"}.get(src, S)
    return {
        "name": f"{S} to {D}", "tab": f"{S} to {D}", "preset": {"format": dst},
        "title": f"{S} to {D} Converter Free: Convert {long_name} to {D} Online",
        "desc": f"Turn a {DOC[src][1]} into {D} pictures, one per page or one long picture. Nothing uploaded.",
        "metaDesc": f"Free {S} to {D} converter. Turn a {DOC[src][1]} into {D} images online, one per page or as one long picture. Runs in your browser, so nothing is uploaded.",
        "about": f"Turn a {long_name} file into {D} pictures: {IMG[dst][1]}. {DOC_NOTE[src]} Choose one picture per page or one long picture cut to the content, and a sharpness from 72 to 300 DPI. Hindi and other Indian scripts are supported. The file is converted inside your browser, so it never leaves your device.",
        "steps": [f"Add your {S} file.", f"{D} is already selected; choose one picture per page or one long picture.", f"Convert and download the {D} pictures."],
        "faq": [
            {"q": f"How do I convert {S} to {D}?", "a": f"Add the {S} file above; {D} is already chosen. Press Convert to images and download the pictures. Several pages come together in a ZIP."},
            {"q": "Can I get one picture instead of one per page?", "a": "Yes. Choose \"One long picture\" and the whole file is drawn as a single picture, cut to the content."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def doc_hub(src):
    S = DOC[src][0]
    long_name = {"md": "Markdown (MD)"}.get(src, S)
    return {
        "name": f"{S} to Image", "tab": f"{S} to Image",
        "title": f"{S} to Image Converter Free: Convert {long_name} to PNG, JPG, WebP Online",
        "desc": f"Turn a {DOC[src][1]} into PNG, JPG, WebP, TIFF, GIF or BMP pictures. Nothing uploaded.",
        "metaDesc": f"Free {S} to image converter. Turn a {DOC[src][1]} into PNG, JPG, WebP, TIFF, GIF or BMP images online, one per page or one long picture. Nothing is uploaded.",
        "about": f"Turn a {long_name} file into pictures: PNG, JPG, WebP, TIFF, GIF or BMP. {DOC_NOTE[src]} Choose one picture per page or one long picture cut to the content. The pages for each picture format are linked above and arrive with it chosen. Everything runs inside your browser, so the file never leaves your device.",
        "steps": [f"Add your {S} file.", "Choose the picture format, and one picture per page or one long picture.", "Convert and download the pictures."],
        "faq": [
            {"q": f"Which picture formats can I turn {S} into?", "a": "PNG, JPG, JPEG, WebP, TIFF, GIF and BMP. PNG keeps text the sharpest; JPG makes the smallest files."},
            {"q": "Can I get one picture instead of one per page?", "a": "Yes. Choose \"One long picture\" and the whole file is drawn as a single picture, cut to the content."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


# ---------------------------------------------------------------- spreadsheets and text to PDF (the Word to PDF tool)
def to_pdf(src):
    S = {"csv": "CSV", "ods": "ODS", "numbers": "Numbers", "txt": "TXT"}[src]
    what = {"csv": "a CSV file", "ods": "an ODS spreadsheet", "numbers": "an Apple Numbers spreadsheet", "txt": "a plain text file"}[src]
    note = ("The text is kept line for line, on clean A4 pages." if src == "txt" else
            "Each sheet becomes a table on landscape pages, with the sheet name as a heading when there are several. The values are kept; colours, cell styles and charts are not.")
    return {
        "name": f"{S} to PDF", "tab": f"{S} to PDF",
        "title": f"{S} to PDF Converter Free: Convert {S} to PDF Online",
        "desc": f"Turn {what} into a PDF you can share and print. Runs in your browser.",
        "metaDesc": f"Free {S} to PDF converter. Turn {what} into a PDF online, ready to share and print. Hindi supported. Nothing is uploaded.",
        "about": f"Turn {what} into a PDF, when people only need to read or print it and nobody should change it by accident. {note} Hindi and other Indian scripts are supported. The file is converted inside your browser and never uploaded.",
        "steps": [f"Add your {S} file.", "Press Convert to PDF.", "Download the PDF."],
        "faq": [
            {"q": f"How do I convert {S} to PDF?", "a": f"Add the {S} file above, press Convert to PDF and download it. No sign-up is needed."},
            {"q": "Does it support Hindi?", "a": "Yes. Hindi and other Indian scripts show correctly in the PDF."},
            {"q": "Is my file uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


# friendly names that already have a page: a redirect, not a second page
ALIASES = {"markdown-to-pdf": ["md-to-pdf"], "markdown-to-word": ["md-to-docx"], "docx-to-markdown": ["docx-to-md"]}


def save_like(path, obj, raw):
    """Write JSON the way the file already is: same indent, same line endings (keeps the diff to the lines that changed)."""
    crlf = "\r\n" in raw
    second = raw.replace("\r\n", "\n").split("\n")[1] if "\n" in raw else ""
    indent = len(second) - len(second.lstrip(" "))
    text = json.dumps(obj, ensure_ascii=False, indent=indent) + "\n"
    if crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))


def main():
    plan = {r["URL"].strip().strip("/").split("/")[-1]: r for r in csv.DictReader(open(PLAN, encoding="utf-8"))}
    data = json.loads(TOOLS.read_text("utf-8"))
    slugs = {t["slug"] for t in data["tools"]}
    for key, entry in BASE.items():
        if key not in slugs:
            at = next(i for i, t in enumerate(data["tools"]) if t["slug"] == "word-to-pdf") + 1
            data["tools"].insert(at, dict(entry))
    by = {t["slug"]: t for t in data["tools"]}
    taken = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new, aliased = [], 0

    def add(slug, base, body):
        if slug in taken or slug not in plan:      # only addresses the plan asks for
            return
        b = by[base]
        new.append({"slug": slug, "base": base, "cat": b["cat"], "kind": b.get("kind", "client"), **body})
        taken.add(slug)

    for s in SHEET:
        for d in SHEET:
            if s != d:
                add(f"{s}-to-{d}", "spreadsheet-converter", sheet_pair(s, d, plan.get(f"{s}-to-{d}", {}).get("Keyword") or f"{s} to {d}"))
        add(f"{s}-converter", "spreadsheet-converter", sheet_hub(s))
    for s in DOC:
        for d in IMG:
            add(f"{s}-to-{d}", "document-to-image", doc_pair(s, d))
        add(f"{s}-to-image", "document-to-image", doc_hub(s))
    for s in ("csv", "ods", "numbers", "txt"):
        add(f"{s}-to-pdf", "word-to-pdf", to_pdf(s))
    for target, names in ALIASES.items():
        t = next((x for x in data["tools"] + data["variants"] if x["slug"] == target), None)
        for n in names:
            if t and n not in taken and n in plan:
                t.setdefault("aliases", []).append(n); taken.add(n); aliased += 1

    # the keyword from the plan must be in the title of its page
    for v in new:
        kw = (plan[v["slug"]].get("Keyword") or "").strip().lower()
        if kw and kw not in v["title"].lower() and kw not in v["name"].lower():
            print("  keyword not in title:", v["slug"], "|", kw, "|", v["title"])

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")

    for code in LANGS:   # the two tools in every language (their format pages stay English-only until translated)
        p = ROOT / "i18n" / code / "tools.json"
        raw = p.read_bytes().decode("utf-8"); tl = json.loads(raw)
        for key in BASE:
            tl[key] = TL[code][key]
        save_like(p, tl, raw)
        q = ROOT / "i18n" / code / "strings.json"
        rawq = q.read_bytes().decode("utf-8"); ui = json.loads(rawq)
        for phrase, tr in STRINGS.items():
            ui[phrase] = tr[code]
        save_like(q, ui, rawq)

    print(f"pages added: {len(new)} | redirects added: {aliased} | variants now {len(data['variants'])}")
    from collections import Counter
    print("  by tool:", dict(Counter(v["base"] for v in new)))


if __name__ == "__main__":
    main()
