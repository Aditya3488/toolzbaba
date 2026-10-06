"""Builds the font library: python scripts/get_fonts.py   (needs internet, node/npm and the fonttools package)
Downloads static TTF files of free Google fonts (from the @expo-google-fonts packages on npm, which carry every weight as a plain .ttf),
keeps Regular, Bold and (for some) the italics, finds out which scripts each font can really draw, and writes
static/assets/fonts/*.ttf plus static/assets/fonts/fonts.json (used by the PDF Editor and the Font Library page)."""
import json, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / "static" / "assets" / "fonts"
# id, display name, npm package, category, which styles to keep
SANS, SERIF, DISPLAY, HAND, MONO, INDIC = "sans", "serif", "display", "handwriting", "mono", "indic"
ALL4 = ("400Regular", "700Bold", "400Regular_Italic", "700Bold_Italic")
RB = ("400Regular", "700Bold")
R1 = ("400Regular",)
FONTS = [
    # metric-compatible with Arial, Times New Roman and Courier New: the best match when you edit text that is already in a PDF
    ("arimo", "Arimo", "arimo", SANS, ALL4), ("tinos", "Tinos", "tinos", SERIF, ALL4), ("cousine", "Cousine", "cousine", MONO, ALL4),
    ("inter", "Inter", "inter", SANS, ALL4), ("roboto", "Roboto", "roboto", SANS, ALL4), ("open-sans", "Open Sans", "open-sans", SANS, ALL4), ("lato", "Lato", "lato", SANS, ALL4),
    ("montserrat", "Montserrat", "montserrat", SANS, ALL4), ("poppins", "Poppins", "poppins", SANS, ALL4), ("nunito", "Nunito", "nunito", SANS, ALL4), ("source-sans-3", "Source Sans 3", "source-sans-3", SANS, ALL4),
    ("work-sans", "Work Sans", "work-sans", SANS, ALL4), ("dm-sans", "DM Sans", "dm-sans", SANS, ALL4), ("raleway", "Raleway", "raleway", SANS, ALL4), ("rubik", "Rubik", "rubik", SANS, ALL4),
    ("karla", "Karla", "karla", SANS, ALL4), ("ubuntu", "Ubuntu", "ubuntu", SANS, ALL4),
    ("playfair-display", "Playfair Display", "playfair-display", SERIF, ALL4), ("merriweather", "Merriweather", "merriweather", SERIF, RB), ("lora", "Lora", "lora", SERIF, ALL4),
    ("libre-baskerville", "Libre Baskerville", "libre-baskerville", SERIF, ALL4), ("pt-serif", "PT Serif", "pt-serif", SERIF, ALL4), ("crimson-text", "Crimson Text", "crimson-text", SERIF, ALL4),
    ("bebas-neue", "Bebas Neue", "bebas-neue", DISPLAY, R1), ("oswald", "Oswald", "oswald", DISPLAY, RB), ("anton", "Anton", "anton", DISPLAY, R1), ("abril-fatface", "Abril Fatface", "abril-fatface", DISPLAY, R1),
    ("dancing-script", "Dancing Script", "dancing-script", HAND, RB), ("caveat", "Caveat", "caveat", HAND, RB), ("satisfy", "Satisfy", "satisfy", HAND, R1), ("great-vibes", "Great Vibes", "great-vibes", HAND, R1),
    ("shadows-into-light", "Shadows Into Light", "shadows-into-light", HAND, R1), ("indie-flower", "Indie Flower", "indie-flower", HAND, R1), ("pacifico", "Pacifico", "pacifico", HAND, R1),
    ("roboto-mono", "Roboto Mono", "roboto-mono", MONO, ALL4), ("source-code-pro", "Source Code Pro", "source-code-pro", MONO, ALL4), ("courier-prime", "Courier Prime", "courier-prime", MONO, ALL4),
    ("noto-sans-devanagari", "Noto Sans Devanagari", "noto-sans-devanagari", INDIC, RB), ("noto-serif-devanagari", "Noto Serif Devanagari", "noto-serif-devanagari", INDIC, RB),
    ("hind", "Hind", "hind", INDIC, RB), ("mukta", "Mukta", "mukta", INDIC, RB), ("tiro-devanagari-hindi", "Tiro Devanagari Hindi", "tiro-devanagari-hindi", INDIC, ("400Regular", "400Regular_Italic")),
    ("baloo-2", "Baloo 2", "baloo-2", INDIC, RB), ("kalam", "Kalam", "kalam", INDIC, RB),
    ("noto-sans-bengali", "Noto Sans Bengali", "noto-sans-bengali", INDIC, RB), ("noto-sans-tamil", "Noto Sans Tamil", "noto-sans-tamil", INDIC, RB), ("noto-sans-telugu", "Noto Sans Telugu", "noto-sans-telugu", INDIC, RB),
    ("noto-sans-gujarati", "Noto Sans Gujarati", "noto-sans-gujarati", INDIC, RB), ("noto-sans-gurmukhi", "Noto Sans Gurmukhi", "noto-sans-gurmukhi", INDIC, RB),
    ("noto-sans-kannada", "Noto Sans Kannada", "noto-sans-kannada", INDIC, RB), ("noto-sans-malayalam", "Noto Sans Malayalam", "noto-sans-malayalam", INDIC, RB),
]
PROBE = {"latin": 0x41, "devanagari": 0x915, "bengali": 0x995, "gurmukhi": 0xA15, "gujarati": 0xA95, "tamil": 0xB95, "telugu": 0xC15, "kannada": 0xC95, "malayalam": 0xD15, "cyrillic": 0x416, "greek": 0x396}
STYLE_KEY = {"400Regular": "regular", "700Bold": "bold", "400Regular_Italic": "italic", "700Bold_Italic": "boldItalic"}

def scripts_of(path):
    cmap = TTFont(str(path), lazy=True).getBestCmap()
    return [k for k, cp in PROBE.items() if cp in cmap]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    meta_path = OUT / "fonts.json"
    meta = {f["id"]: f for f in json.loads(meta_path.read_text("utf-8"))["fonts"]} if meta_path.exists() else {}
    tmp = Path(tempfile.mkdtemp())
    for fid, name, pkg, cat, styles in FONTS:
        if only and fid not in only:
            continue
        if fid in meta and all((OUT / f["file"]).exists() for f in meta[fid]["files"].values()):
            continue
        print("get", name)
        subprocess.run(f"npm pack @expo-google-fonts/{pkg}", cwd=tmp, shell=True, check=True, capture_output=True)
        tgz = sorted(tmp.glob(f"expo-google-fonts-{pkg}-*.tgz"))[-1]
        files, lic = {}, ""
        with tarfile.open(tgz) as t:
            try: lic = t.extractfile("package/LICENSE_FONT").read().decode("utf-8", "ignore")
            except KeyError: pass
            for st in styles:
                for m in t.getmembers():
                    if m.name.startswith(f"package/{st}/") and m.name.endswith(".ttf"):
                        data = t.extractfile(m).read(); fn = f"{fid}-{STYLE_KEY[st]}.ttf"
                        (OUT / fn).write_bytes(data); files[STYLE_KEY[st]] = {"file": fn, "size": len(data)}
        if "regular" not in files:
            print("  !! no regular file for", name); continue
        licence = "Apache-2.0" if "Apache License" in lic else "SIL Open Font License 1.1" if "Open Font License" in lic else "Ubuntu Font Licence 1.0" if "UBUNTU FONT LICENCE" in lic.upper() else "see the font's licence"
        head = next((l.strip() for l in lic.splitlines() if l.strip().lower().startswith("copyright")), "")
        meta[fid] = {"id": fid, "name": name, "category": cat, "scripts": scripts_of(OUT / files["regular"]["file"]), "license": licence, "copyright": head, "files": files}
        tgz.unlink()
    order = [f[0] for f in FONTS]
    fonts = [meta[i] for i in order if i in meta]
    meta_path.write_text(json.dumps({"fonts": fonts}, ensure_ascii=False, indent=1), "utf-8")
    total = sum(f.stat().st_size for f in OUT.glob("*.ttf"))
    print(f"{len(fonts)} fonts, {len(list(OUT.glob('*.ttf')))} files, {total / 1e6:.1f} MB")
    shutil.rmtree(tmp, ignore_errors=True)

main()
