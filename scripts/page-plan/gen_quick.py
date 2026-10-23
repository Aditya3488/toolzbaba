"""The quick wins in the plan's "Other" group: pages the shipped engines already handle.

- Compress WebP and Compress AVIF (the compress screen, with a WebP / AVIF encoder).
- JPG <-> JPEG and the JFIF pages: the same JPEG written under another name (convert-image with an "ext" preset). JFIF
  pages and JPEG Converter are twins of their JPG page (canonical), like Compress JPEG is of Compress JPG.
- Plain text, Word and email pages on the document converter: TXT to MD / DOCX, MD to TXT, DOCX to TXT, EML to PDF,
  and the TXT, DOCX and Document converter hubs (the same screen with a shorter list of converters).
- Friendly-name redirects: excel-to-* -> xlsx-to-*, webpage-to-* -> html-to-*, text-to-pdf, delete-pages-from-pdf,
  jpeg-to-pdf, md-converter, email-to-pdf.

Idempotent: only adds what is not there yet. Run from the repo root: python scripts/page-plan/gen_quick.py .
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"
PLAN = ROOT / "scripts" / "page-plan" / "new-tool-urls.csv"

F = {"jpg": "JPG", "jpeg": "JPEG", "jfif": "JFIF", "png": "PNG", "webp": "WebP", "gif": "GIF", "bmp": "BMP", "tiff": "TIFF", "ico": "ICO", "avif": "AVIF", "heic": "HEIC", "heif": "HEIF"}
PRIVATE = "Runs in your browser, so nothing is uploaded."
FAQ_PRIVATE = {"q": "Is my file uploaded?", "a": "No. Everything happens inside your browser; your file never leaves your device."}


def same_jpeg(src, dst):
    """JPG, JPEG and JFIF are one format: the page re-saves the picture under the other name (and can re-encode it)."""
    s, d = F[src], F[dst]
    why = {"jpeg": "Some forms, cameras and older programs insist on the four-letter .jpeg ending.",
           "jpg": "Most websites, forms and phones expect the three-letter .jpg ending.",
           "jfif": "JFIF is the name of the standard JPEG file layout; a few programs and upload forms ask for the .jfif ending."}[dst]
    return {
        "name": f"{s} to {d}", "tab": f"{s} to {d}", "preset": {"format": "jpg", "ext": dst},
        "title": f"{s} to {d} Converter Free: Convert {s} to {d} Online",
        "desc": f"Save {s} pictures with the .{dst} ending. {why} Many files at once, in your browser.",
        "metaDesc": f"Free {s} to {d} converter. {why} Convert many {s} files at once online; nothing is uploaded.",
        "about": (f"{s} and {d} are the same picture format: JPEG. The difference is only the name at the end of the file, and some "
                  f"programs, forms and devices accept one but not the other. {why} This page writes your {s} pictures as .{dst} files. "
                  f"The picture is re-saved at high quality, so it looks the same; if you only need the name changed, renaming the file "
                  f"would also work, and this page simply does it for many files at once. Everything runs inside your browser."),
        "steps": [f"Add your {s} files.", f"{d} is already selected.", f"Convert and download the .{dst} files."],
        "faq": [
            {"q": f"Is {d} different from {s}?", "a": f"No. Both are JPEG pictures; only the file ending differs. {why}"},
            {"q": "Does the picture lose quality?", "a": "It is re-saved at high quality (90%), which is not visible. If you want to keep the bytes exactly as they are, rename the file instead."},
            FAQ_PRIVATE,
        ],
    }


def to_jfif(src):
    s = F[src]
    return {
        "name": f"{s} to JFIF", "tab": f"{s} to JFIF", "preset": {"format": "jpg", "ext": "jfif"},
        "title": f"{s} to JFIF Converter Free: Convert {s} to JFIF Online",
        "desc": f"Turn {s} pictures into JFIF (a JPEG with the .jfif ending). Many files at once, in your browser.",
        "metaDesc": f"Free {s} to JFIF converter. Convert {s} pictures to JFIF, the standard JPEG file, online and in batch. Nothing is uploaded.",
        "about": (f"JFIF is the standard layout of a JPEG file, so a .jfif file is a JPEG under another name. A few programs and upload "
                  f"forms ask for that ending. This page converts your {s} pictures to JPEG and writes them as .jfif files. Transparent "
                  f"areas become white, because JPEG has no transparency. Everything runs inside your browser."),
        "steps": [f"Add your {s} files.", "JFIF is already selected; adjust the quality if you want.", "Convert and download the .jfif files."],
        "faq": [
            {"q": "What is a JFIF file?", "a": "A JPEG picture with the .jfif ending. Any program that opens JPEG opens it; some only accept it under the .jpg name, and the JFIF to JPG page gives you that."},
            {"q": f"What happens to transparency in a {s}?", "a": "JPEG has no transparency, so transparent areas are filled with white."},
            FAQ_PRIVATE,
        ],
    }


def jpeg_hub():
    return {
        "name": "JPEG Converter", "title": "JPEG Converter Free: Convert JPEG Online, No Sign-Up",
        "desc": "Convert JPEG files to JPG, PNG, WebP, AVIF, GIF, BMP, TIFF or ICO. Many files at once, nothing uploaded.",
        "metaDesc": "Free JPEG converter. Change JPEG files into PNG, WebP, AVIF, GIF, BMP, TIFF or ICO online, or save them as .jpg. Batch supported and nothing is uploaded.",
        "about": ("Convert JPEG pictures into whatever you need: PNG, WebP, AVIF, GIF, BMP, TIFF or ICO, or simply the .jpg ending. JPEG and "
                  "JPG are the same format, so everything the JPG converter does works here too. Add as many files as you like and convert "
                  "them in one go. Everything happens inside your browser, so your pictures never leave your device."),
        "steps": ["Add your JPEG files.", "Choose the format you want.", "Convert and download."],
        "faq": [
            {"q": "What can I convert JPEG to?", "a": "PNG, WebP, AVIF, GIF, BMP, TIFF or ICO, or the same picture with the .jpg ending. Pick it from the list after you add your files."},
            {"q": "Is JPEG the same as JPG?", "a": "Yes. The three-letter name comes from old systems that allowed only three letters; the pictures are identical."},
            FAQ_PRIVATE,
        ],
    }


def compress(fmt):
    s = F[fmt]
    extra = {"webp": "WebP keeps transparency, so logos and stickers stay see-through.",
             "avif": "AVIF keeps more detail than JPG or WebP at the same size, so you can go lower before you notice anything."}[fmt]
    return {
        "name": f"Compress {s}", "tab": s, "ui": f"target-{fmt}", "js": "compress-target", "media": fmt,
        "title": f"Compress {s} Online Free: Reduce {s} File Size | Toolz Baba",
        "desc": f"Make {s} pictures smaller with a quality slider and a live before/after preview. {extra} Many files at once, in your browser.",
        "metaDesc": f"Free {s} compressor. Reduce the size of {s} pictures online with a quality slider and a live preview; {extra.lower()} Nothing is uploaded.",
        "about": (f"Shrink {s} pictures without turning them into another format. Move the quality slider and watch the before and after "
                  f"sizes and the preview update; set a maximum width to shrink the pixels as well. {extra} "
                  + ("Or set a target size, such as under 100 KB, and the page finds the best quality that fits. " if fmt == "webp" else
                     "AVIF takes a few seconds to encode, so each change of the slider takes a moment. ")
                  + "Add many files and download them all as one ZIP. Everything runs inside your browser."),
        "steps": [f"Add your {s} files.", "Move the quality slider" + (" or set a target size" if fmt == "webp" else "") + " and check the preview.", "Download one picture or all of them as a ZIP."],
        "faq": [
            {"q": f"How much smaller does a {s} get?", "a": "It depends on the picture and the quality you choose. Photos often shrink by half or more at 70–80% quality with no visible change."},
            {"q": f"Is the result still a {s}?", "a": f"Yes. The picture is re-saved as {s}; only its quality (and, if you set a width, its size in pixels) changes."},
            FAQ_PRIVATE,
        ],
    }


def doc_page(slug, mode, name, tab, title, desc, meta, about, steps, faq, hub_modes=None):
    v = {"name": name, "tab": tab, "engine": "convert", "js": "convert-tools", "ui": "markdown-tool", "mode": mode,
         "title": title, "desc": desc, "metaDesc": meta, "about": about, "steps": steps, "faq": faq + [FAQ_PRIVATE]}
    if hub_modes:
        v["pickMode"] = True
        v["modes"] = hub_modes
    return v


DOC_PAGES = {
    "txt-to-md": doc_page("txt-to-md", "txt2md", "TXT to MD", "Text to Markdown",
        "TXT to MD Converter Free: Convert Text to Markdown Online",
        "Turn a plain text file into Markdown. Bullets and numbering get their marks, line breaks are kept, and you see the preview. In your browser.",
        "Free TXT to MD converter. Turn plain text into a Markdown file online: bullets and numbering get the Markdown marks, line breaks are kept, with a live preview. Nothing is uploaded.",
        "Plain text is already valid Markdown, so this page mostly gets the details right: bullets written with • or * become Markdown list items, "
        "1) becomes 1., and a line break inside a paragraph is kept as a line break, so the rendered page looks like your text did. Nothing else "
        "is changed. Type or load the text, watch the preview on the right, add # headings where you want them, and download the .md file. "
        "Everything runs inside your browser.",
        ["Load your .txt file, or paste the text.", "Check the preview; add # in front of lines you want as headings.", "Convert and download the .md file."],
        [{"q": "Why does the Markdown look the same as my text?", "a": "Because plain text is valid Markdown. The page only adds the marks for bullets and numbering and keeps your line breaks; headings are yours to add with #."},
         {"q": "Can I convert several files?", "a": "Yes. Load them one after another, or paste text and download each result."}]),
    "txt-to-docx": doc_page("txt-to-docx", "txt2docx", "TXT to DOCX", "Text to Word",
        "TXT to DOCX Converter Free: Convert Text to Word Online",
        "Turn a plain text file into a Word document (.docx). Each blank line starts a paragraph. Runs in your browser.",
        "Free TXT to DOCX converter. Turn plain text into a Word document online: paragraphs and line breaks are kept, and the file opens in Word, Google Docs and LibreOffice. Nothing is uploaded.",
        "Turn plain text into a Word document. Each blank line starts a new paragraph and line breaks inside a paragraph are kept, so the document "
        "reads exactly like the text. The .docx file opens in Microsoft Word, Google Docs, LibreOffice and on your phone. Type or paste the text, "
        "or load a .txt file, then download. Everything runs inside your browser.",
        ["Load your .txt file, or paste the text.", "Press Create Word file.", "Download the .docx document."],
        [{"q": "Will the formatting be kept?", "a": "Plain text has no formatting; the Word file gets your paragraphs and line breaks in a clean default style. For headings and bold, write Markdown and use Markdown to Word."},
         {"q": "Does the file open in Google Docs?", "a": "Yes. It is a standard .docx, which Word, Google Docs, LibreOffice and Pages all open."}]),
    "md-to-txt": doc_page("md-to-txt", "md2txt", "MD to TXT", "Markdown to Text",
        "MD to TXT Converter Free: Convert Markdown to Plain Text Online",
        "Strip the Markdown marks and keep the words: headings, bold and links become plain text, lists keep their bullets. Runs in your browser.",
        "Free MD to TXT converter. Turn a Markdown file into plain text online: the # and ** marks go, links become their words, lists keep their bullets and tables become one line per row. Nothing is uploaded.",
        "Get the words out of a Markdown file. The marks go: # headings, **bold**, *italic*, `code` and [links](...) become plain words, lists keep "
        "their bullets and numbers, and each table row becomes one line with the cells separated by |. A blank line sits between paragraphs. "
        "Paste the Markdown or load an .md file, and download the .txt. Everything runs inside your browser.",
        ["Load your .md file, or paste the Markdown.", "Press Convert to plain text.", "Copy the result or download the .txt file."],
        [{"q": "What happens to links?", "a": "The link text stays and the address goes. If you need the addresses, convert to HTML instead."},
         {"q": "Are tables kept?", "a": "Each row becomes one line, with the cells separated by a | sign, so the information is all there."}]),
    "docx-to-txt": doc_page("docx-to-txt", "docx2txt", "DOCX to TXT", "Word to Text",
        "DOCX to TXT Converter Free: Convert Word to Plain Text Online",
        "Get all the text out of a Word document as a plain .txt file. Lists keep their bullets, tables become lines. Runs in your browser.",
        "Free DOCX to TXT converter. Extract all the text from a Word document into a plain text file online: paragraphs, lists and table rows are kept in order. Nothing is uploaded.",
        "Pull the words out of a Word document into a plain text file. Paragraphs stay in order with a blank line between them, lists keep their "
        "bullets and numbers, and each table row becomes one line with the cells separated by |. Pictures, fonts and colours are left out, "
        "which is the point of plain text. Add one or many .docx files; old .doc files need to be saved as .docx in Word first. Everything "
        "runs inside your browser.",
        ["Add your .docx files.", "Press Convert to plain text.", "Copy the result or download the .txt file."],
        [{"q": "Does it work with old .doc files?", "a": "No. Open the file in Word and save it as .docx first; then it works."},
         {"q": "Are headers, footers and comments included?", "a": "The main text, lists and tables are. Headers, footers, footnotes and comments are left out."}]),
    "eml-to-pdf": doc_page("eml-to-pdf", "eml2pdf", "EML to PDF", "Email to PDF",
        "EML to PDF Converter Free: Convert Email (EML) to PDF Online",
        "Turn a saved email (.eml) into a PDF: sender, date, subject, the message and its pictures. Attachments are listed. Runs in your browser.",
        "Free EML to PDF converter. Turn an email saved as .eml from Outlook, Gmail, Apple Mail or Thunderbird into a PDF online, with the sender, date, subject, message and embedded pictures. Nothing is uploaded.",
        "Turn an email into a PDF you can file, print or send on. Save the message as an .eml file (Outlook: drag it to a folder or File > Save As; "
        "Gmail: open the message menu and choose Download message; Apple Mail: File > Save As, Raw Message Source; Thunderbird: Save As) and "
        "add it here. The PDF shows the sender, recipients, date and subject, then the message as it looked, with the pictures that were "
        "inside the email. Attachments are listed by name at the end but not converted. Pictures loaded from the web are not fetched, because "
        "the PDF is made on your device and nothing leaves it. Add many .eml files at once and get them all as one ZIP.",
        ["Save the email as an .eml file and add it (or several).", "Choose the page size and text size if you want.", "Press Create PDF and download."],
        [{"q": "How do I get an .eml file from Gmail or Outlook?", "a": "Gmail: open the email, click the three-dot menu and choose Download message. Outlook: drag the email to your desktop, or use File > Save As. Apple Mail: File > Save As and choose Raw Message Source."},
         {"q": "Are attachments converted?", "a": "No. They are listed by name and size at the end of the PDF. Pictures that were part of the message itself are included."},
         {"q": "Can I convert an Outlook .msg file?", "a": "Not yet. Open it in Outlook and save it as .eml, or forward it to an address where you can download it as .eml."}]),
    "txt-converter": doc_page("txt-converter", "txt2md", "TXT Converter", "TXT converter",
        "TXT Converter Free: Convert Text to Word, PDF or Markdown Online",
        "Turn a plain text file into a Word document, a PDF or Markdown. Paste the text or load a .txt file. Runs in your browser.",
        "Free TXT converter. Turn plain text into a Word document (DOCX), a PDF or a Markdown file online, from a .txt file or pasted text. Nothing is uploaded.",
        "One page for everything you can make from plain text: a Word document, a PDF or a Markdown file. Choose the converter at the top, paste "
        "the text or load a .txt file, check the preview and download. Paragraphs and line breaks are kept in every case. Everything runs "
        "inside your browser, so your text never leaves your device.",
        ["Choose what to make: Word, PDF or Markdown.", "Load your .txt file, or paste the text.", "Convert and download."],
        [{"q": "What can I convert a TXT file to?", "a": "A Word document (.docx), a PDF or a Markdown (.md) file, all from this page."},
         {"q": "Can I convert text to an image?", "a": "Yes, on the Text to Image page, which turns the text into PNG, JPG or WebP pictures."}],
        hub_modes=["txt2md", "txt2docx", "txt2pdf"]),
    "docx-converter": doc_page("docx-converter", "docx2pdf", "DOCX Converter", "DOCX converter",
        "DOCX Converter Free: Convert Word to PDF, Markdown or Text Online",
        "Turn a Word document into a PDF, Markdown or plain text, in your browser. Lists, tables and pictures are kept where the format allows.",
        "Free DOCX converter. Turn a Word document into a PDF, a Markdown file or plain text online. Headings, lists and tables are kept; nothing is uploaded.",
        "One page for the common things to do with a Word document: make a PDF, turn it into Markdown for the web or a README, or get the plain "
        "text out of it. Choose the converter at the top, add one or many .docx files and download. For a PDF that keeps the exact page "
        "layout of Word, the Word to PDF page uses the full document engine; the PDF here keeps headings, lists, tables and pictures in a "
        "clean reading layout. Old .doc files need to be saved as .docx in Word first. Everything runs inside your browser.",
        ["Choose what to make: PDF, Markdown or plain text.", "Add your .docx files.", "Convert and download."],
        [{"q": "What can I convert a DOCX file to?", "a": "PDF, Markdown or plain text here; pictures of the pages on the Word to Image page; and the Spreadsheet and Markdown converters cover the rest."},
         {"q": "Does it keep my formatting?", "a": "Headings, lists, bold / italic, links, tables and pictures are kept where the format has them. Markdown and plain text have no fonts or colours."}],
        hub_modes=["docx2pdf", "docx2md", "docx2txt"]),
    "document-converter": doc_page("document-converter", "md2pdf", "Document Converter", "Document converter",
        "Document Converter Free: Word, PDF, Markdown, HTML and Text Online",
        "Convert between Word, PDF, Markdown, HTML, plain text and email (EML), with a live preview. Everything runs in your browser.",
        "Free document converter. Turn Word, Markdown, HTML, plain text and emails into PDF, Word, Markdown, HTML or text online, with a preview. Nothing is uploaded.",
        "Every document conversion on this site in one place: Markdown to PDF, HTML or Word; HTML to PDF or Markdown; Word to Markdown, text or PDF; "
        "PDF to Markdown; plain text to Markdown, Word or PDF; and a saved email (.eml) to PDF. Choose the converter at the top, then type, paste "
        "or load your file and download the result. Spreadsheets have their own converter, and pictures of document pages are made on the "
        "Document to Image page. Everything runs inside your browser, so nothing is uploaded.",
        ["Choose the conversion at the top.", "Type, paste or load your document.", "Convert and download."],
        [{"q": "Which documents can I convert?", "a": "Markdown, HTML, Word (.docx), plain text, PDF (to Markdown) and emails saved as .eml. Spreadsheets have their own converter."},
         {"q": "Can I convert PDF to Word here?", "a": "PDF to Word is its own tool, with a full page-layout engine. This page turns a PDF into Markdown."}],
        hub_modes=["md2pdf", "md2html", "md2docx", "md2txt", "html2pdf", "html2md", "docx2pdf", "docx2md", "docx2txt", "pdf2md", "txt2md", "txt2docx", "txt2pdf", "eml2pdf"]),
}

ALIASES = {   # friendly name -> the page it should land on
    **{f"excel-to-{x}": f"xlsx-to-{x}" for x in ["webp", "tiff", "png", "jpg", "jpeg", "gif", "bmp", "image"]},
    **{f"webpage-to-{x}": f"html-to-{x}" for x in ["webp", "tiff", "png", "jpg", "jpeg", "gif", "bmp", "image"]},
    "text-to-pdf": "txt-to-pdf", "delete-pages-from-pdf": "delete-pdf-pages", "jpeg-to-pdf": "jpg-to-pdf",
    "md-converter": "markdown-converter", "email-to-pdf": "eml-to-pdf",
}


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    by = {t["slug"]: t for t in data["tools"]}
    plan = {r["URL"].strip().strip("/").split("/")[-1]: r for r in csv.DictReader(open(PLAN, encoding="utf-8"))}
    have = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    have |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new, no_kw = [], []

    def add(slug, base, body, canonical=None):
        if slug in have or base not in by:
            return
        b = by[base]
        v = {"slug": slug, "base": base, "cat": b["cat"], "kind": b.get("kind", "client"), **body}
        if canonical:
            v["canonical"] = canonical
        kw = (plan.get(slug) or {}).get("Keyword", "").strip().lower()
        if kw and kw not in v["title"].lower():
            no_kw.append((slug, kw))
        new.append(v)
        have.add(slug)

    add("compress-webp", "compress-image", compress("webp"))
    add("compress-avif", "compress-image", compress("avif"))
    add("jpg-to-jpeg", "convert-image", same_jpeg("jpg", "jpeg"))
    add("jpeg-to-jpg", "convert-image", same_jpeg("jpeg", "jpg"))
    add("jpg-to-jfif", "convert-image", same_jpeg("jpg", "jfif"))
    add("jpeg-to-jfif", "convert-image", same_jpeg("jpeg", "jfif"), canonical="jpg-to-jfif")
    for src in ["png", "webp", "gif", "bmp", "tiff", "ico", "avif", "heic", "heif"]:
        add(f"{src}-to-jfif", "convert-image", to_jfif(src), canonical=f"{src}-to-jpg" if f"{src}-to-jpg" in have else None)
    add("jpeg-converter", "convert-image", jpeg_hub(), canonical="jpg-converter" if "jpg-converter" in have else None)
    for slug, body in DOC_PAGES.items():
        add(slug, "markdown-converter", body)

    added_alias = 0
    for name, target in ALIASES.items():
        if name in have:
            continue
        t = next((x for x in data["tools"] + data["variants"] + new if x["slug"] == target), None)
        if not t:
            print("  no page for alias", name, "->", target)
            continue
        t.setdefault("aliases", []).append(name)
        have.add(name)
        added_alias += 1

    data["variants"] += new
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"pages added: {len(new)} | redirects added: {added_alias} | variants now {len(data['variants'])}")
    for slug, kw in no_kw:
        print("  title lacks its keyword:", slug, repr(kw))


if __name__ == "__main__":
    main()
