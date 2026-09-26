"""PDF + document tools (PyMuPDF, pdf2docx, LibreOffice)."""
import os
import re
import shutil
import subprocess
from pathlib import Path

import pymupdf

from toolkit import Ctx, ToolError, out_name, tool

PDF = {".pdf"}


def _kb(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f} MB"


def open_pdf(path: Path) -> pymupdf.Document:
    try:
        doc = pymupdf.open(path)
    except Exception:  # noqa: BLE001
        raise ToolError(f"'{Path(path).name[3:]}' is not a valid PDF.")
    if doc.needs_pass:
        raise ToolError("This PDF is password protected. Remove the password first.")
    return doc


def parse_pages(spec: str, count: int) -> list[int]:
    """'1-3,5,8-' -> zero-based page indexes (order kept, duplicates kept)."""
    spec = (spec or "all").strip().lower()
    if spec in ("", "all"):
        return list(range(count))
    pages = []
    for part in spec.replace(" ", "").split(","):
        m = re.fullmatch(r"(\d*)-?(\d*)", part)
        if not part or not m:
            raise ToolError(f"Can't read page range '{part}'. Use something like 1-3,5,8-10.")
        if "-" in part:
            a = int(m.group(1) or 1)
            b = int(m.group(2) or count)
        else:
            a = b = int(m.group(1))
        if a < 1 or b < a or b > count:
            raise ToolError(f"Page range '{part}' is outside this PDF (it has {count} pages).")
        pages.extend(range(a - 1, b))
    return pages


# ---------------------------------------------------------------- pdf -> image
@tool("pdf-to-image", accepts=PDF, max_mb=200)
def pdf_to_image(ctx: Ctx):
    dpi = max(50, min(400, ctx.opt("dpi", 150, int)))
    fmt = ctx.opt("format", "png")
    if fmt not in ("png", "jpg", "webp"):
        raise ToolError("Unsupported image format.")
    doc = open_pdf(ctx.inputs[0])
    pages = parse_pages(ctx.opt("pages", "all"), doc.page_count)
    if len(pages) > 300:
        raise ToolError("Too many pages at once (max 300). Use the page range box.")
    base = Path(ctx.display_name(ctx.inputs[0])).stem
    outs = []
    for n, p in enumerate(pages):
        pix = doc[p].get_pixmap(dpi=dpi, alpha=False)
        name = f"{base}_page{p + 1:03d}.{fmt}"
        dest = ctx.out_dir / name
        if fmt == "webp":
            from PIL import Image
            Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(dest, "WEBP", quality=90)
        else:
            pix.save(dest, jpg_quality=90) if fmt == "jpg" else pix.save(dest)
        outs.append(dest)
        ctx.progress((n + 1) / len(pages))
    ctx.info = {"summary": f"{len(outs)} page(s) rendered at {dpi} DPI"}
    return outs


# ---------------------------------------------------------------- merge
@tool("pdf-merge", accepts=PDF, max_mb=200, max_files=50, min_files=2)
def pdf_merge(ctx: Ctx):
    merged = pymupdf.open()
    total = 0
    for i, src in enumerate(ctx.inputs):
        doc = open_pdf(src)
        total += doc.page_count
        merged.insert_pdf(doc)
        ctx.progress((i + 1) / len(ctx.inputs))
    dest = ctx.out_dir / "merged.pdf"
    merged.save(dest, deflate=True, garbage=3)
    ctx.info = {"summary": f"Merged {len(ctx.inputs)} PDFs into {total} pages ({_kb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- split
@tool("pdf-split", accepts=PDF, max_mb=200)
def pdf_split(ctx: Ctx):
    mode = ctx.opt("mode", "each")
    doc = open_pdf(ctx.inputs[0])
    n = doc.page_count
    base = Path(ctx.display_name(ctx.inputs[0])).stem
    groups: list[list[int]] = []
    if mode == "each":
        groups = [[i] for i in range(n)]
    elif mode == "every_n":
        step = max(1, ctx.opt("every", 2, int))
        groups = [list(range(i, min(i + step, n))) for i in range(0, n, step)]
    elif mode == "ranges":  # each comma-separated range becomes its own file
        for part in ctx.opt("pages", "").split(","):
            if part.strip():
                groups.append(parse_pages(part, n))
    elif mode == "extract":  # all chosen pages into one file
        groups = [parse_pages(ctx.opt("pages", ""), n)]
    else:
        raise ToolError("Unknown split mode.")
    if not groups:
        raise ToolError("Tell me which pages to use.")
    if len(groups) > 300:
        raise ToolError("That would create too many files (max 300).")
    outs = []
    for i, pages in enumerate(groups):
        part = pymupdf.open()
        for p in pages:
            part.insert_pdf(doc, from_page=p, to_page=p)
        label = f"page{pages[0] + 1}" if len(pages) == 1 else f"pages{pages[0] + 1}-{pages[-1] + 1}"
        dest = ctx.out_dir / (f"{base}_extract.pdf" if mode == "extract" else f"{base}_{i + 1:02d}_{label}.pdf")
        part.save(dest, deflate=True, garbage=3)
        outs.append(dest)
        ctx.progress((i + 1) / len(groups))
    ctx.info = {"summary": f"Created {len(outs)} PDF file(s) from {n} pages"}
    return outs


# ---------------------------------------------------------------- compress
LEVELS = {"low": (200, 150, 80), "medium": (150, 110, 60), "high": (110, 72, 40)}  # threshold dpi, target dpi, jpeg q


@tool("pdf-compress", accepts=PDF, max_mb=200, max_files=10)
def pdf_compress(ctx: Ctx):
    level = ctx.opt("level", "medium")
    if level not in LEVELS:
        raise ToolError("Unknown compression level.")
    thr, target, q = LEVELS[level]
    outs, rows = [], []
    for i, src in enumerate(ctx.inputs):
        doc = open_pdf(src)
        try:
            doc.rewrite_images(dpi_threshold=thr, dpi_target=target, quality=q)
        except Exception:  # noqa: BLE001 - e.g. exotic image types; structure-only compression still helps
            pass
        dest = ctx.out_dir / out_name(src, "pdf", "_compressed")
        doc.save(dest, garbage=4, deflate=True, clean=True, use_objstms=True)
        before, after = src.stat().st_size, dest.stat().st_size
        if after >= before:
            shutil.copyfile(src, dest)
            after = before
        outs.append(dest)
        rows.append({"name": ctx.display_name(src), "before": before, "after": after})
        ctx.progress((i + 1) / len(ctx.inputs))
    tb, ta = sum(r["before"] for r in rows), sum(r["after"] for r in rows)
    ctx.info = {"summary": f"{_kb(tb)} \u2192 {_kb(ta)}  ({max(0, round((1 - ta / tb) * 100)) if tb else 0}% smaller)", "files": rows}
    return outs


# ---------------------------------------------------------------- pdf -> docx
@tool("pdf-to-docx", accepts=PDF, max_mb=50)
def pdf_to_docx(ctx: Ctx):
    from pdf2docx import Converter

    src = ctx.inputs[0]
    open_pdf(src).close()  # early, friendly validation
    dest = ctx.out_dir / out_name(src, "docx")
    cv = Converter(str(src))
    try:
        cv.convert(str(dest))
    finally:
        cv.close()
    ctx.info = {"summary": "Converted. Scanned PDFs (photos of pages) can't be turned into editable text without OCR."}
    return [dest]


# ---------------------------------------------------------------- docx -> pdf
def find_soffice() -> str | None:
    env = os.environ.get("LIBREOFFICE_PATH")
    if env and os.path.exists(env):
        return env
    for name in ("soffice", "libreoffice"):
        p = shutil.which(name)
        if p:
            return p
    for p in (r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if os.path.exists(p):
            return p
    return None


@tool("docx-to-pdf", accepts={".docx", ".doc", ".odt", ".rtf", ".txt", ".pptx", ".xlsx"}, max_mb=50, max_files=10)
def docx_to_pdf(ctx: Ctx):
    soffice = find_soffice()
    if not soffice:
        raise ToolError("LibreOffice is not installed on this server. Install it from libreoffice.org "
                        "(the Docker image already includes it), then try again.")
    outs = []
    profile = (ctx.out_dir.parent / "lo_profile").resolve().as_uri()
    for i, src in enumerate(ctx.inputs):
        proc = subprocess.run(
            [soffice, f"-env:UserInstallation={profile}", "--headless", "--norestore",
             "--convert-to", "pdf", "--outdir", str(ctx.out_dir), str(src)],
            capture_output=True, text=True, timeout=240)
        produced = ctx.out_dir / (src.stem + ".pdf")
        if not produced.exists():
            raise ToolError("Could not convert this document. " + (proc.stderr or proc.stdout or "")[-200:])
        dest = ctx.out_dir / out_name(src, "pdf")
        produced.rename(dest)
        outs.append(dest)
        ctx.progress((i + 1) / len(ctx.inputs))
    ctx.info = {"summary": f"Converted {len(outs)} document(s) to PDF"}
    return outs
