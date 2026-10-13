"""Tier 1, archives: Archive Converter, Archive Extractor and Create ZIP, and the plan's ZIP / TAR / TAR.GZ / GZ pages.

TGZ is the same format as TAR.GZ, so the tgz addresses redirect to the tar-gz pages instead of being second copies.
RAR, 7z, XZ, BZ2, ISO and CAB pages are left for when there is an engine that reads them.
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from i18n_archive import TOOLS as TL, STRINGS  # noqa: E402
from gen_docsheet import save_like, PLAN, LANGS  # noqa: E402

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"
NOT_YET = "RAR, 7z, XZ, BZ2, ISO and CAB cannot be opened in the browser yet."

BASE = {
    "archive-converter": {
        "slug": "archive-converter", "cat": "util", "icon": "🗜️", "name": "Archive Converter",
        "desc": "Convert between ZIP, TAR, TAR.GZ and GZ archives. Runs in your browser.",
        "kind": "client", "engine": "archive", "js": "archive", "tabAll": "All formats",
        "keywords": "zip tar tar.gz tgz gz gzip archive compressed convert",
        "about": ("Change an archive from one format to another: ZIP, TAR, TAR.GZ (also called TGZ) and GZ, in any direction. Every file "
                  "and folder moves across with its name and date, long names included. A GZ file holds a single file, so an archive "
                  f"with several files is packed into a TAR first when you ask for GZ (.tar.gz). {NOT_YET} Everything happens in your "
                  "browser, so nothing is uploaded."),
        "title": "Archive Converter Free: Convert ZIP, TAR, TAR.GZ, GZ Online | Toolz Baba",
        "metaDesc": "Convert archives between ZIP, TAR, TAR.GZ (TGZ) and GZ. Files, folders and names kept. Free, nothing uploaded.",
        "steps": ["Add your ZIP, TAR, TAR.GZ or GZ archive.", "Choose the format to convert to.", "Convert and download the new archive."],
        "faq": [
            {"q": "Which archives can I convert?", "a": f"ZIP, TAR, TAR.GZ (TGZ) and GZ, in any direction. {NOT_YET}"},
            {"q": "Are folders and file names kept?", "a": "Yes. Every file arrives with its folder, name and date, even names longer than 100 characters."},
            {"q": "Is my archive uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    },
    "archive-extractor": {
        "slug": "archive-extractor", "cat": "util", "icon": "📦", "name": "Archive Extractor",
        "desc": "Open a ZIP, TAR, TAR.GZ or GZ and take the files out, one by one or all at once.",
        "kind": "client", "engine": "archive", "js": "archive", "tabAll": "All archives",
        "keywords": "unzip extract open zip tar tar.gz tgz gz gzip archive files",
        "about": ("Open an archive without installing anything: add a ZIP, TAR, TAR.GZ (TGZ) or GZ and every file inside is listed with "
                  "its size and its own download button. If you want all of them, press \"Extract all\". It works on a phone too, where "
                  f"a .tar.gz is usually hard to open. The archive is opened in your browser, so nothing is uploaded. {NOT_YET}"),
        "title": "Archive Extractor Free: Open ZIP, TAR, TAR.GZ Online | Toolz Baba",
        "metaDesc": "Open a ZIP, TAR, TAR.GZ (TGZ) or GZ file online, see what is inside and download any file. No software, nothing uploaded.",
        "steps": ["Add your ZIP, TAR, TAR.GZ or GZ archive.", "Look through the files inside and download the one you need.", "Or press Extract all to take every file at once."],
        "faq": [
            {"q": "Can I take out just one file?", "a": "Yes. As soon as you add the archive, every file is listed with its own download button."},
            {"q": "Does it work on a phone?", "a": "Yes. It runs in the browser, so no app is needed on Android or iPhone."},
            {"q": "Is my archive uploaded?", "a": "No. It is opened inside your browser and never leaves your device."},
        ],
    },
    "create-zip": {
        "slug": "create-zip", "cat": "util", "icon": "🗂️", "name": "Create ZIP File",
        "desc": "Pack several files into one ZIP, TAR.GZ or TAR archive. Runs in your browser.",
        "kind": "client", "engine": "archive", "js": "archive", "tabAll": "All formats",
        "keywords": "create make zip tar.gz tgz archive compress pack files folder",
        "about": ("Put several files into one, easier to send by email or chat: a ZIP opens on every computer and phone, and TAR.GZ is "
                  "the usual choice on Linux and servers. Choose the files, type a name for the archive and download it. Two files with "
                  "the same name get different names automatically. The packing happens in your browser, so nothing is uploaded."),
        "title": "Create ZIP File Online Free: Pack Files into ZIP or TAR.GZ | Toolz Baba",
        "metaDesc": "Pack any files into one ZIP, TAR.GZ or TAR file to send them together. Free, no sign-up, nothing uploaded.",
        "steps": ["Add your files.", "Choose ZIP, TAR.GZ or TAR and the file name.", "Pack them and download the archive."],
        "faq": [
            {"q": "ZIP or TAR.GZ?", "a": "ZIP for almost everyone, because Windows, Mac, Android and iPhone open it directly. TAR.GZ is the usual choice on Linux and servers."},
            {"q": "How many files can I add?", "a": "Up to 500 at a time. The real limit is your device's memory."},
            {"q": "Are my files uploaded?", "a": "No. The archive is made inside your browser."},
        ],
    },
}

FMT = {"zip": "ZIP", "tar": "TAR", "tar-gz": "TAR.GZ", "gz": "GZ"}
KW = {"zip": "ZIP", "tar": "TAR", "tar-gz": "TAR GZ", "gz": "GZ"}      # how the plan's keywords write them
WHAT = {
    "zip": "ZIP opens on every computer and phone without extra software",
    "tar": "TAR keeps files and folders together without compressing them, the usual container on Linux",
    "tar-gz": "TAR.GZ (also called TGZ) is a TAR compressed with gzip, the usual archive on Linux and servers",
    "gz": "GZ compresses a single file with gzip",
}
IN_NOTE = {
    "zip": "Every file and folder in the ZIP is read, with its name and date.",
    "tar": "Every file and folder in the TAR is read, long names included.",
    "tar-gz": "The TAR.GZ (or TGZ) is unpacked and every file and folder in it is read.",
    "gz": "The file inside the GZ is unpacked; if it is a TAR, every file in it is read.",
}


def pair(s, d):
    S, D = FMT[s], FMT[d]
    extra = ""
    if d == "gz":
        extra = " A GZ file holds exactly one file: an archive with one file becomes that file .gz, and one with several files is packed into a TAR first, giving a .tar.gz."
    return {
        "name": f"{S} to {D}", "tab": f"{S} to {D}", "preset": {"format": d},
        "title": f"{KW[s]} to {KW[d]} Converter Free: Convert {S} to {D} Online",
        "desc": f"Convert {S} archives to {D}, with every file and folder kept. Nothing uploaded.",
        "metaDesc": f"Free {S} to {D} converter. Turn a {S} archive into {D} online, files, folders and names kept. Runs in your browser, so nothing is uploaded.",
        "about": f"Convert {S} archives to {D}. {IN_NOTE[s]} {WHAT[d]}.{extra} Several archives can be converted at once. The conversion runs in your browser, so your files never leave your device.",
        "steps": [f"Add your {S} archive.", f"{D} is already selected.", f"Convert and download the {D} file."],
        "faq": [
            {"q": f"How do I convert {S} to {D}?", "a": f"Add the {S} file above; {D} is already chosen. Press Convert and download the new archive."},
            {"q": "Are folders and file names kept?", "a": "Yes. Every file arrives with its folder, name and date, even names longer than 100 characters."},
            {"q": "Is my archive uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def hub(s):
    S = FMT[s]; others = [FMT[d] for d in FMT if d != s]; outs = ", ".join(others)
    return {
        "name": f"{S} Converter", "tab": f"{S} Converter",
        "title": f"{KW[s]} Converter Free: Convert {S} to {', '.join(others[:-1])} or {others[-1]} Online",
        "desc": f"Convert {S} archives to {outs}. Nothing uploaded.",
        "metaDesc": f"Free {S} converter. Change {S} archives into {outs} online, files and folders kept. Nothing is uploaded, because it runs in your browser.",
        "about": f"Convert {S} archives into {outs}. {IN_NOTE[s]} If you already know the format you want, its page is linked above and arrives with it chosen. {NOT_YET} Everything runs in your browser, so nothing is uploaded.",
        "steps": [f"Add your {S} archive.", "Choose the format you want.", "Convert and download."],
        "faq": [
            {"q": f"What can I convert {S} to?", "a": f"{outs}. Pick it from the list after you add your archive."},
            {"q": "Can I convert several archives at once?", "a": "Yes. Add as many as you like and they are all converted in one go."},
            {"q": "Is my archive uploaded?", "a": "No. It is converted inside your browser and never leaves your device."},
        ],
    }


def extract(s, kw):
    S = FMT[s]
    return {
        "name": f"Extract {S}", "tab": f"Extract {S}",
        "title": f"Extract {KW[s]} Online Free: Open {S} Files Without Software",
        "desc": f"Open a {S} file and take out any file inside, or all of them at once. Nothing uploaded.",
        "metaDesc": f"{kw[0].upper() + kw[1:]} online for free. Open a {S} file, see every file inside and download one or all of them. Works on phones too. Nothing is uploaded.",
        "about": f"Open a {S} file without installing anything. {IN_NOTE[s]} Each file is listed with its size and its own download button, and \"Extract all\" gives you every file at once. It works on a phone too. The archive is opened in your browser, so nothing is uploaded.",
        "steps": [f"Add your {S} file.", "Look through the files inside and download the one you need.", "Or press Extract all to take every file at once."],
        "faq": [
            {"q": f"How do I open a {S} file?", "a": f"Add it above. Every file inside appears straight away with a download button; nothing needs to be installed."},
            {"q": "Can I take out just one file?", "a": "Yes. Every file has its own download button."},
            {"q": "Is my file uploaded?", "a": "No. It is opened inside your browser and never leaves your device."},
        ],
    }


def create_targz():
    return {
        "name": "Create TAR.GZ", "tab": "Create TAR.GZ", "preset": {"format": "tar-gz"},
        "title": "Create TAR GZ Online Free: Pack Files into a TAR.GZ (TGZ)",
        "desc": "Pack several files into one TAR.GZ archive. Runs in your browser, nothing uploaded.",
        "metaDesc": "Create a TAR.GZ (TGZ) archive online for free. Pack any files into one compressed file for Linux or a server. Nothing is uploaded.",
        "about": "Pack several files into a TAR.GZ, the compressed archive Linux, macOS and servers use (also called TGZ). Choose the files, type a name and download it. Two files with the same name get different names automatically. For people on Windows or phones, a ZIP is usually easier; pick it in the list. The archive is made in your browser, so nothing is uploaded.",
        "steps": ["Add your files.", "TAR.GZ is already selected; type a name for the archive.", "Pack them and download the .tar.gz."],
        "faq": [
            {"q": "How do I make a tar.gz without a terminal?", "a": "Add the files here and press the button: you get the same .tar.gz that tar -czf would make."},
            {"q": "Is TGZ the same as TAR.GZ?", "a": "Yes. Both are a TAR archive compressed with gzip; only the name differs."},
            {"q": "Are my files uploaded?", "a": "No. The archive is made inside your browser."},
        ],
    }


# the same format under another name: a redirect to the page that already says it
TGZ = {"zip-to-tgz": "zip-to-tar-gz", "tar-to-tgz": "tar-to-tar-gz", "gz-to-tgz": "gz-to-tar-gz", "tgz-to-zip": "tar-gz-to-zip",
       "tgz-to-tar": "tar-gz-to-tar", "tgz-converter": "tar-gz-converter", "unzip": "extract-zip"}
SKIP = {"tar-gz-to-gz", "tgz-to-gz"}   # a TAR.GZ already is a GZ: there is nothing to convert


def main():
    plan = {r["URL"].strip().strip("/").split("/")[-1]: r for r in csv.DictReader(open(PLAN, encoding="utf-8"))}
    data = json.loads(TOOLS.read_text("utf-8"))
    slugs = {t["slug"] for t in data["tools"]}
    at = next(i for i, t in enumerate(data["tools"]) if t["cat"] == "util")
    for key in ("create-zip", "archive-extractor", "archive-converter"):
        if key not in slugs:
            data["tools"].insert(at, dict(BASE[key]))
    by = {t["slug"]: t for t in data["tools"]}
    taken = {t["slug"] for t in data["tools"]} | {v["slug"] for v in data["variants"]}
    taken |= {a for t in data["tools"] + data["variants"] for a in (t.get("aliases") or [])}
    new = []

    def add(slug, base, body):
        if slug in taken or slug not in plan or slug in SKIP:
            return
        b = by[base]
        new.append({"slug": slug, "base": base, "cat": b["cat"], "kind": b.get("kind", "client"), **body})
        taken.add(slug)

    for s in FMT:
        for d in FMT:
            if s != d:
                add(f"{s}-to-{d}", "archive-converter", pair(s, d))
        add(f"{s}-converter", "archive-converter", hub(s))
        add(f"extract-{s}", "archive-extractor", extract(s, (plan.get(f"extract-{s}") or {}).get("Keyword") or f"extract {s}"))
    add("create-tar-gz", "create-zip", create_targz())

    data["variants"] += new
    every = data["tools"] + data["variants"]
    aliased = 0
    for alias, target in TGZ.items():
        t = next((x for x in every if x["slug"] == target), None)
        if t and alias in plan and alias not in taken:
            t.setdefault("aliases", []).append(alias); taken.add(alias); aliased += 1

    for v in new:   # the plan's keyword must be in the page title
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
