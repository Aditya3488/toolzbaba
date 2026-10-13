"""Font conversion in the browser: Python's fontTools running in Pyodide (loaded by font-worker.js).

Reads TTF, OTF, WOFF, WOFF2, TTC / OTC, EOT (uncompressed), DFONT, SVG fonts and Type 1 (PFB / PFA).
Writes TTF, OTF, WOFF, WOFF2, TTC, EOT, SVG fonts and DFONT.
TrueType (quadratic) and CFF (cubic) outlines are converted when the format needs the other kind.
"""
import io
import os
import struct
import xml.etree.ElementTree as ET

from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import ControlBoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTCollection, TTFont, newTable

TMP = "/tmp" if os.path.isdir("/tmp") else "."
EXT = {"ttf": "ttf", "otf": "otf", "woff": "woff", "woff2": "woff2", "ttc": "ttc", "eot": "eot", "svg": "svg", "dfont": "dfont"}


class FontError(Exception):
    """A message for the person converting the font."""


# ---------------------------------------------------------------- reading
def sniff(data, name):
    head, ext = data[:4], name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if head in (b"\x00\x01\x00\x00", b"true", b"typ1"):
        return "ttf"
    if head == b"OTTO":
        return "otf"
    if head == b"wOFF":
        return "woff"
    if head == b"wOF2":
        return "woff2"
    if head == b"ttcf":
        return "ttc"
    if len(data) > 36 and data[34:36] == b"LP":
        return "eot"
    if data[:2] == b"\x80\x01" or data[:14] in (b"%!PS-AdobeFont", b"%!FontType1-1.") or data[:11] == b"%!FontType1":
        return "t1"
    text = data[:4096].lstrip()
    if text.startswith((b"<?xml", b"<svg", b"<!DOCTYPE", b"<!--")):
        return "svg"
    if ext in ("dfont", "suit") or (len(data) > 16 and struct.unpack(">I", data[:4])[0] == 256):
        return "dfont"
    return None


def eot_unwrap(data):
    eot_size, font_size, _version, flags = struct.unpack("<IIII", data[:16])
    if flags & 0x4:
        raise FontError("This EOT is compressed with MicroType Express, which cannot be unpacked here. Most EOT files are not; try the font's TTF or WOFF instead.")
    end = min(eot_size, len(data))
    font = data[end - font_size:end]
    if flags & 0x10000000:   # the font data is XOR-ed with 0x50
        font = bytes(b ^ 0x50 for b in font)
    if font[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
        raise FontError("The font inside this EOT could not be found.")
    return font


def from_t1(data, name):
    from fontTools.t1Lib import T1Font
    path = os.path.join(TMP, "in_t1." + ("pfa" if data[:1] == b"%" else "pfb"))
    with open(path, "wb") as f:
        f.write(data)
    try:
        t1 = T1Font(path)
        t1.parse()
    except Exception as e:
        raise FontError(f"'{name}' is not a Type 1 font this tool can read ({e}).")
    fd, cs_in = t1.font, t1.font["CharStrings"]
    matrix = fd.get("FontMatrix", [0.001, 0, 0, 0.001, 0, 0])
    upm = int(round(1 / matrix[0])) if matrix[0] else 1000
    order = [".notdef"] + [g for g in cs_in.keys() if g != ".notdef"]
    charstrings, metrics, cmap = {}, {}, {}
    for g in order:
        if g not in cs_in:
            pen = T2CharStringPen(0, None); charstrings[g] = pen.getCharString(); metrics[g] = (0, 0); continue
        glyph = cs_in[g]
        bounds = ControlBoundsPen(None); glyph.draw(bounds)
        pen = T2CharStringPen(glyph.width, None); glyph.draw(pen)
        charstrings[g] = pen.getCharString()
        metrics[g] = (int(round(glyph.width)), int(round(bounds.bounds[0])) if bounds.bounds else 0)
        u = agl.toUnicode(g)
        if len(u) == 1 and ord(u[0]) not in cmap:
            cmap[ord(u[0])] = g
    if not cmap:   # a symbol font: its own codes, in the private area symbol fonts use
        enc = fd.get("Encoding")
        if isinstance(enc, list):
            for code, g in enumerate(enc):
                if g in cs_in and g != ".notdef":
                    cmap[0xF000 + code] = g
    info = fd.get("FontInfo", {})
    family = info.get("FamilyName") or fd.get("FontName", "Font")
    weight = info.get("Weight", "Regular")
    ps = fd.get("FontName", family.replace(" ", ""))
    bbox = fd.get("FontBBox", [0, -200, 1000, 800])
    fb = FontBuilder(upm, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(ps, {"FullName": info.get("FullName", family), "FamilyName": family, "Weight": weight}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=int(bbox[3]), descent=int(bbox[1]))
    style = "Regular" if weight in ("Regular", "Normal", "Book", "Roman", "Medium") else weight
    fb.setupNameTable({"familyName": family, "styleName": style, "fullName": info.get("FullName", family), "psName": ps})
    fb.setupOS2(sTypoAscender=int(bbox[3]), sTypoDescender=int(bbox[1]), usWinAscent=max(0, int(bbox[3])), usWinDescent=max(0, -int(bbox[1])))
    fb.setupPost(isFixedPitch=int(bool(info.get("isFixedPitch", 0))), underlinePosition=int(info.get("UnderlinePosition", -100)), underlineThickness=int(info.get("UnderlineThickness", 50)))
    return reopen(fb.font)


def from_svg(data, name):
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise FontError(f"'{name}' is not valid SVG ({e}).")
    local = lambda el: el.tag.rsplit("}", 1)[-1]
    font_el = next((el for el in root.iter() if local(el) == "font"), None)
    if font_el is None:
        raise FontError(f"'{name}' is an SVG drawing, not an SVG font: it has no <font> in it. To turn a drawing into a picture, use the SVG Converter.")
    face = next((el for el in font_el if local(el) == "font-face"), None)
    attr = lambda el, k, d=None: el.get(k, d) if el is not None else d
    upm = int(float(attr(face, "units-per-em", 1000)))
    ascent = int(float(attr(face, "ascent", upm * 0.8)))
    descent = int(float(attr(face, "descent", -upm * 0.2)))
    descent = -abs(descent)
    family = attr(face, "font-family", None) or font_el.get("id") or "SVG Font"
    default_adv = int(float(font_el.get("horiz-adv-x", upm // 2)))
    order, glyphs, metrics, cmap, used = [".notdef"], {}, {}, {}, set()

    def build(d, adv):
        pen = TTGlyphPen(None)
        bounds = ControlBoundsPen(None)
        if d:
            parse_path(d, Cu2QuPen(pen, 1.0, reverse_direction=False))
            parse_path(d, bounds)
        return pen.glyph(), (int(adv), int(round(bounds.bounds[0])) if bounds.bounds else 0)

    missing = next((el for el in font_el if local(el) == "missing-glyph"), None)
    glyphs[".notdef"], metrics[".notdef"] = build(attr(missing, "d", ""), float(attr(missing, "horiz-adv-x", default_adv)))
    for el in font_el:
        if local(el) != "glyph":
            continue
        u = el.get("unicode")
        if not u or len(u) != 1 or ord(u) in cmap:
            continue   # ligatures (several characters) need layout rules this simple font does not carry
        g = el.get("glyph-name") or f"uni{ord(u):04X}"
        if g in used or g == ".notdef":
            g = f"uni{ord(u):04X}"
        used.add(g)
        try:
            glyphs[g], metrics[g] = build(el.get("d", ""), float(el.get("horiz-adv-x", default_adv)))
        except Exception:
            continue
        order.append(g)
        cmap[ord(u)] = g
    if len(order) == 1:
        raise FontError(f"'{name}' has an SVG font with no usable letters in it.")
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent)
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "fullName": family, "psName": "".join(c for c in family if c.isalnum()) or "SVGFont"})
    fb.setupOS2(sTypoAscender=ascent, sTypoDescender=descent, usWinAscent=ascent, usWinDescent=-descent)
    fb.setupPost()
    return reopen(fb.font)


def from_dfont(data, name):
    from fontTools.ttLib import macUtils
    path = os.path.join(TMP, "in.dfont")
    with open(path, "wb") as f:
        f.write(data)
    try:
        idx = macUtils.getSFNTResIndices(path)
    except Exception:
        idx = []
    if not idx:
        raise FontError(f"'{name}' has no fonts inside (a DFONT holds them as 'sfnt' resources). Bitmap-only Mac suitcases cannot be converted.")
    return [reopen(TTFont(path, res_name_or_index=i, lazy=False)) for i in idx]


def reopen(font):
    """A font as freshly read from bytes (every table compiled and decompiled once, so later edits start clean)."""
    b = io.BytesIO(); font.save(b)
    return TTFont(io.BytesIO(b.getvalue()), lazy=False)


def load(data, name):
    """bytes -> a list of fonts (a collection or a DFONT can hold several)."""
    kind = sniff(data, name)
    try:
        if kind in ("ttf", "otf", "woff", "woff2"):
            f = TTFont(io.BytesIO(data), lazy=False); f.flavor = None
            return [f]
        if kind == "ttc":
            fonts = TTCollection(io.BytesIO(data), lazy=False).fonts
            for f in fonts:
                f.flavor = None
            return [reopen(f) for f in fonts]
        if kind == "eot":
            return [TTFont(io.BytesIO(eot_unwrap(data)), lazy=False)]
        if kind == "t1":
            return [from_t1(data, name)]
        if kind == "svg":
            return [from_svg(data, name)]
        if kind == "dfont":
            return from_dfont(data, name)
    except FontError:
        raise
    except Exception as e:
        raise FontError(f"'{name}' could not be read as a font: {e}")
    raise FontError(f"'{name}' is not a font this tool can open (TTF, OTF, WOFF, WOFF2, TTC, EOT, DFONT, SVG font or Type 1).")


# ---------------------------------------------------------------- outlines
def is_variable(font):
    return "fvar" in font


def to_quadratic(font):
    """CFF (cubic) outlines -> TrueType (quadratic): what TTF and EOT need."""
    if "glyf" in font:
        return font
    if "CFF2" in font or is_variable(font):
        raise FontError("This is a variable OpenType font with CFF2 outlines; it can be converted to WOFF, WOFF2 or TTC, but not to TrueType outlines.")
    order, gs = font.getGlyphOrder(), font.getGlyphSet()
    glyphs = {}
    for g in order:
        pen = TTGlyphPen(None)
        gs[g].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyphs[g] = pen.glyph()
    font["loca"] = newTable("loca")
    glyf = font["glyf"] = newTable("glyf")
    glyf.glyphOrder, glyf.glyphs = order, glyphs
    for tag in ("CFF ", "VORG"):
        if tag in font:
            del font[tag]
    hmtx = font["hmtx"]
    for g in order:
        glyphs[g].recalcBounds(glyf)
        adv, lsb = hmtx[g]
        hmtx[g] = (adv, getattr(glyphs[g], "xMin", 0))
    maxp = font["maxp"] = newTable("maxp")
    maxp.tableVersion = 0x00010000
    for k in ("maxZones",):
        setattr(maxp, k, 1)
    for k in ("maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
        setattr(maxp, k, 0)
    post = font["post"]
    post.formatType, post.extraNames, post.mapping, post.glyphOrder = 2.0, [], {}, order
    font.sfntVersion = "\x00\x01\x00\x00"
    return reopen(font)


def to_cubic(font):
    """TrueType outlines -> CFF: what OTF means to most programs."""
    if "CFF " in font or "CFF2" in font:
        return font
    if is_variable(font):
        raise FontError("This is a variable font; it can be converted to WOFF, WOFF2 or TTC, but turning its outlines into OTF (CFF) would lose the variations.")
    order, gs, hmtx = font.getGlyphOrder(), font.getGlyphSet(), font["hmtx"]
    charstrings = {}
    for g in order:
        pen = T2CharStringPen(hmtx[g][0], gs)
        gs[g].draw(pen)
        charstrings[g] = pen.getCharString()
    name = font["name"]
    ps = (name.getDebugName(6) or name.getDebugName(4) or "Font").replace(" ", "")
    for tag in ("glyf", "loca", "fpgm", "prep", "cvt ", "gasp", "hdmx", "LTSH", "VDMX"):   # TrueType hinting has no meaning in CFF
        if tag in font:
            del font[tag]
    fb = FontBuilder(font=font)   # (it takes the font as CFF once the TrueType tables are gone)
    fb.setupCFF(ps, {"FullName": name.getDebugName(4) or ps, "FamilyName": name.getDebugName(1) or ps, "Weight": name.getDebugName(2) or "Regular"}, charstrings, {})
    maxp = font["maxp"] = newTable("maxp")
    maxp.tableVersion, maxp.numGlyphs = 0x00005000, len(order)
    font["post"].formatType = 3.0
    font.sfntVersion = "OTTO"
    return reopen(font)


# ---------------------------------------------------------------- writing
def raw(font, flavor=None):
    font.flavor = flavor
    b = io.BytesIO(); font.save(b)
    font.flavor = None
    return b.getvalue()


def names(font):
    n = font["name"]
    get = lambda i: n.getDebugName(i) or ""
    return get(1), get(2), get(5), get(4)


def eot_bytes(font):
    font = to_quadratic(font)
    data = raw(font)
    f = TTFont(io.BytesIO(data))
    os2, head = f["OS/2"], f["head"]
    p = os2.panose
    panose = bytes([p.bFamilyType, p.bSerifStyle, p.bWeight, p.bProportion, p.bContrast, p.bStrokeVariation, p.bArmStyle, p.bLetterForm, p.bMidline, p.bXHeight])
    family, style, version, full = (s.encode("utf-16-le") for s in names(f))
    body = struct.pack("<10sBBIHH", panose, 1, os2.fsSelection & 1, os2.usWeightClass, os2.fsType, 0x504C)
    body += struct.pack("<IIIIII", os2.ulUnicodeRange1, os2.ulUnicodeRange2, os2.ulUnicodeRange3, os2.ulUnicodeRange4,
                        getattr(os2, "ulCodePageRange1", 0), getattr(os2, "ulCodePageRange2", 0))
    body += struct.pack("<IIIIIH", head.checkSumAdjustment, 0, 0, 0, 0, 0)
    for s in (family, style, version, full):
        body += struct.pack("<H", len(s)) + s + struct.pack("<H", 0)
    body = body[:-2] + struct.pack("<HH", 0, 0)   # after the full name: padding, then an empty root string
    head_len = 16 + len(body)
    return struct.pack("<IIII", head_len + len(data), len(data), 0x00020001, 0) + body + data


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def svg_bytes(font):
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap() or {}, font["hmtx"]
    upm, hhea = font["head"].unitsPerEm, font["hhea"]
    family = names(font)[0] or "Font"
    fid = "".join(c for c in family if c.isalnum()) or "font"
    out = ['<?xml version="1.0" standalone="no"?>', '<svg xmlns="http://www.w3.org/2000/svg">', "<defs>",
           f'<font id="{esc(fid)}" horiz-adv-x="{upm // 2}">',
           f'<font-face font-family="{esc(family)}" units-per-em="{upm}" ascent="{hhea.ascent}" descent="{hhea.descent}"/>']

    def path(g):
        pen = SVGPathPen(gs); gs[g].draw(pen); return pen.getCommands()
    out.append(f'<missing-glyph horiz-adv-x="{hmtx[".notdef"][0]}" d="{path(".notdef")}"/>' if ".notdef" in hmtx.metrics else "<missing-glyph/>")
    for cp, g in sorted(cmap.items()):
        if cp < 0x20 or 0xD800 <= cp <= 0xDFFF:
            continue
        out.append(f'<glyph glyph-name="{esc(g)}" unicode="&#x{cp:X};" horiz-adv-x="{hmtx[g][0]}" d="{path(g)}"/>')
    out += ["</font>", "</defs>", "</svg>", ""]
    return "\n".join(out).encode("utf-8")


def dfont_bytes(datas):
    """Fonts -> a Mac DFONT: a resource file kept in the data fork, with each font as an 'sfnt' resource."""
    blob = b"".join(struct.pack(">I", len(d)) + d for d in datas)
    data_off = 256
    type_list = struct.pack(">H", 0) + b"sfnt" + struct.pack(">HH", len(datas) - 1, 10)
    refs, off = b"", 0
    for i, d in enumerate(datas):
        refs += struct.pack(">hhI", 128 + i, -1, off & 0xFFFFFF) + b"\0\0\0\0"
        off += 4 + len(d)
    rmap = bytes(16) + bytes(4) + bytes(2) + struct.pack(">H", 0) + struct.pack(">HH", 28, 28 + len(type_list) + len(refs)) + type_list + refs
    header = struct.pack(">IIII", data_off, data_off + len(blob), len(blob), len(rmap))
    return header + bytes(data_off - 16) + blob + rmap


def ps_name(font, fallback):
    n = font["name"].getDebugName(6) or font["name"].getDebugName(4) or fallback
    return "".join(c for c in n if c.isalnum() or c in "-_") or fallback


def convert(files, fmt):
    """files: [(name, bytes)] -> (outputs [(name, bytes)], summary)"""
    if fmt not in EXT:
        raise FontError("Choose the format to convert to.")
    loaded = []   # (stem, font)
    for name, data in files:
        stem = name.rsplit(".", 1)[0] if "." in name else name
        fonts = load(data, name)
        for i, f in enumerate(fonts):
            loaded.append((stem if len(fonts) == 1 else f"{stem}-{ps_name(f, str(i + 1))}", f))
    size_in = sum(len(d) for _, d in files)
    outs = []
    if fmt in ("ttc", "dfont"):   # a collection: every font that was added goes into one file
        stem = files[0][0].rsplit(".", 1)[0] if len(files) == 1 else "fonts"   # one file in: its own name
        if fmt == "ttc":
            c = TTCollection()
            c.fonts = [f for _, f in loaded]
            b = io.BytesIO(); c.save(b)
            outs.append((f"{stem}.ttc", b.getvalue()))
        else:
            outs.append((f"{stem}.dfont", dfont_bytes([raw(f) for _, f in loaded])))
    else:
        for stem, f in loaded:
            if fmt == "ttf":
                data = raw(to_quadratic(f))
            elif fmt == "otf":
                data = raw(to_cubic(f))
            elif fmt in ("woff", "woff2"):
                data = raw(f, fmt)
            elif fmt == "eot":
                data = eot_bytes(f)
            else:
                data = svg_bytes(f)
            outs.append((f"{stem}.{EXT[fmt]}", data))
    size_out = sum(len(d) for _, d in outs)
    kb = lambda n: f"{n / 1024:.0f} KB" if n < 1048576 else f"{n / 1048576:.1f} MB"
    change = f", {round(100 - size_out * 100 / size_in)}% smaller" if size_out < size_in * 0.95 else ""
    summary = f"Converted {len(loaded)} font(s) to {fmt.upper()} ({kb(size_out)}{change})."
    return outs, summary


def convert_js(js_files, fmt):
    """The worker's entry point: JS [[name, Uint8Array]] -> {outs: [{name, data}], summary} (or {error})."""
    try:
        files = [(str(f[0]), f[1].to_bytes()) for f in js_files]
        outs, summary = convert(files, str(fmt))
        return {"outs": [{"name": n, "data": d} for n, d in outs], "summary": summary}
    except FontError as e:
        return {"error": str(e)}
