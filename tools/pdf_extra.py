"""More PDF tools: organize (reorder / delete / rotate), sign, page numbers, protect, unlock."""
import secrets
from pathlib import Path

import pymupdf

from toolkit import Ctx, ToolError, out_name, tool
from tools.imgutil import hex_to_rgb
from tools.pdf_tools import PDF, _kb, open_pdf

MAX_PAGES = 3000


def _pages_list(ctx: Ctx, key: str) -> list:
    v = ctx.opts.get(key)
    if not isinstance(v, list) or not v:
        raise ToolError("Nothing to do: the page list is empty.")
    if len(v) > MAX_PAGES:
        raise ToolError(f"Too many pages (max {MAX_PAGES}).")
    return v


# ---------------------------------------------------------------- organize
@tool("organize-pdf", accepts=PDF, max_mb=200)
def organize_pdf(ctx: Ctx):
    """opts.pages = [{"p": 3, "r": 90}, ...]  new page order; p = original page (1-based), r = extra rotation."""
    src = open_pdf(ctx.inputs[0])
    n = src.page_count
    plan = _pages_list(ctx, "pages")
    out = pymupdf.open()
    for i, item in enumerate(plan):
        try:
            p, r = int(item["p"]), int(item.get("r", 0))
        except (KeyError, TypeError, ValueError):
            raise ToolError("The page list is not valid.")
        if not 1 <= p <= n:
            raise ToolError(f"Page {p} doesn't exist: this PDF has {n} pages.")
        if r % 90:
            raise ToolError("Rotation must be a multiple of 90 degrees.")
        out.insert_pdf(src, from_page=p - 1, to_page=p - 1)
        page = out[out.page_count - 1]
        if r % 360:
            page.set_rotation((page.rotation + r) % 360)
        ctx.progress((i + 1) / len(plan))
    dest = ctx.out_dir / out_name(ctx.inputs[0], "pdf", "_organized")
    out.save(dest, deflate=True, garbage=3)
    ctx.info = {"summary": f"New PDF with {len(plan)} of {n} pages ({_kb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- sign
@tool("esign-pdf", accepts={".pdf", ".png"}, max_mb=200, max_files=2, min_files=2)
def sign_pdf(ctx: Ctx):
    """inputs: the PDF and a transparent PNG signature.
    opts.placements = [{"page": 1, "x": .6, "y": .8, "w": .25, "h": .08}, ...] as fractions of the page as shown."""
    pdf_path = next((p for p in ctx.inputs if p.suffix.lower() == ".pdf"), None)
    sig_path = next((p for p in ctx.inputs if p.suffix.lower() == ".png"), None)
    if not pdf_path or not sig_path:
        raise ToolError("Add a PDF and a signature image.")
    doc = open_pdf(pdf_path)
    png = sig_path.read_bytes()
    placements = _pages_list(ctx, "placements")
    for i, pl in enumerate(placements):
        try:
            pn, x, y, w, h = int(pl["page"]), float(pl["x"]), float(pl["y"]), float(pl["w"]), float(pl["h"])
        except (KeyError, TypeError, ValueError):
            raise ToolError("A signature position is not valid.")
        if not 1 <= pn <= doc.page_count:
            raise ToolError(f"Page {pn} doesn't exist.")
        if not (0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 and 0 < h <= 1):
            raise ToolError("A signature is outside the page.")
        page = doc[pn - 1]
        vis = page.rect  # the page as the viewer shows it (rotation applied)
        rect = pymupdf.Rect(vis.x0 + x * vis.width, vis.y0 + y * vis.height,
                            vis.x0 + min(1, x + w) * vis.width, vis.y0 + min(1, y + h) * vis.height)
        page.insert_image(rect * page.derotation_matrix, stream=png, rotate=page.rotation, keep_proportion=False, overlay=True)
        ctx.progress((i + 1) / len(placements))
    dest = ctx.out_dir / out_name(pdf_path, "pdf", "_signed")
    doc.save(dest, deflate=True, garbage=3)
    ctx.info = {"summary": f"Signature added in {len(placements)} place(s)"}
    return [dest]


# ---------------------------------------------------------------- page numbers
FORMATS = {
    "n": "{n}", "page_n": "Page {n}", "page_n_of_total": "Page {n} of {total}",
    "n_of_total": "{n} / {total}", "dash": "- {n} -",
}


@tool("add-page-numbers-to-pdf", accepts=PDF, max_mb=200)
def pdf_page_numbers(ctx: Ctx):
    pos = ctx.opt("position", "bc")
    fmt = FORMATS.get(ctx.opt("format", "n"))
    if pos not in ("bl", "bc", "br", "tl", "tc", "tr") or not fmt:
        raise ToolError("Unknown position or format.")
    start = ctx.opt("start", 1, int)
    first = max(1, ctx.opt("first_page", 1, int))  # pages before this one are left unnumbered
    size = max(6.0, min(48.0, ctx.opt("font_size", 11, float)))
    margin = max(4.0, ctx.opt("margin", 12, float)) * 72 / 25.4
    color = tuple(c / 255 for c in hex_to_rgb(ctx.opt("color", "#333333"), (51, 51, 51)))
    doc = open_pdf(ctx.inputs[0])
    n_pages = doc.page_count
    if first > n_pages:
        raise ToolError(f"The PDF only has {n_pages} pages.")
    total = start + (n_pages - first)
    for i, page in enumerate(doc):
        if i + 1 < first:
            continue
        text = fmt.format(n=start + (i + 1 - first), total=total)
        tw = pymupdf.get_text_length(text, fontname="helv", fontsize=size)
        vis = page.rect
        x = vis.x0 + (margin if pos[1] == "l" else vis.width - margin - tw if pos[1] == "r" else (vis.width - tw) / 2)
        y = vis.y0 + (margin + size * 0.8 if pos[0] == "t" else vis.height - margin)
        # draw upright on the page as viewed, even if the page itself is rotated
        page.insert_text(pymupdf.Point(x, y) * page.derotation_matrix, text, fontname="helv", fontsize=size,
                         color=color, rotate=page.rotation)
        ctx.progress((i + 1) / n_pages)
    dest = ctx.out_dir / out_name(ctx.inputs[0], "pdf", "_numbered")
    doc.save(dest, deflate=True, garbage=3)
    ctx.info = {"summary": f"Numbered {n_pages - first + 1} page(s) ({_kb(dest.stat().st_size)})"}
    return [dest]


# ---------------------------------------------------------------- protect / unlock
@tool("protect-pdf", accepts=PDF, max_mb=200)
def protect_pdf(ctx: Ctx):
    pw = ctx.opt("password", "")
    if len(pw) < 4:
        raise ToolError("Choose a password of at least 4 characters.")
    perm = pymupdf.PDF_PERM_ACCESSIBILITY
    if ctx.opt("allow_print", True, lambda v: v in (True, "true", 1, "1")):
        perm |= pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_PRINT_HQ
    if ctx.opt("allow_copy", False, lambda v: v in (True, "true", 1, "1")):
        perm |= pymupdf.PDF_PERM_COPY
    if ctx.opt("allow_edit", False, lambda v: v in (True, "true", 1, "1")):
        perm |= pymupdf.PDF_PERM_MODIFY | pymupdf.PDF_PERM_ANNOTATE | pymupdf.PDF_PERM_FORM | pymupdf.PDF_PERM_ASSEMBLE
    doc = open_pdf(ctx.inputs[0])
    dest = ctx.out_dir / out_name(ctx.inputs[0], "pdf", "_protected")
    # the owner password is random and never shown: the restrictions can't be lifted by guessing it
    doc.save(dest, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw=pw, owner_pw=secrets.token_urlsafe(24),
             permissions=perm, garbage=3, deflate=True)
    ctx.info = {"summary": "PDF locked with AES-256 encryption. Keep the password safe: it can't be recovered."}
    return [dest]


@tool("unlock-pdf", accepts=PDF, max_mb=200)
def unlock_pdf(ctx: Ctx):
    try:
        doc = pymupdf.open(ctx.inputs[0])
    except Exception:  # noqa: BLE001
        raise ToolError("This is not a valid PDF.")
    if not doc.is_encrypted:
        raise ToolError("This PDF is not password protected.")
    if not doc.needs_pass:
        raise ToolError("This PDF opens without a password; it only has usage restrictions (printing, copying). "
                        "This tool removes a password that you know, so nothing was changed.")
    pw = ctx.opt("password", "")
    if not pw:
        raise ToolError("Enter the PDF's password.")
    if not doc.authenticate(pw):
        raise ToolError("That password is not correct.")
    dest = ctx.out_dir / out_name(ctx.inputs[0], "pdf", "_unlocked")
    doc.save(dest, encryption=pymupdf.PDF_ENCRYPT_NONE, garbage=3, deflate=True)
    ctx.info = {"summary": "Password removed: the PDF now opens without one."}
    return [dest]
