// The live PDF (runs in the browser with MuPDF). The editor does not paint things on top of the page: it changes the PDF itself, one edit at a time,
// and draws the page again from that PDF, so what you see is exactly what is saved. HT.pdfLive.open(file) -> a Live document:
//   live.count, live.size(i), live.render(i, scale) -> ImageData, live.lines(i) -> the text lines of a page (font, size, colour, position, runs)
//   live.editLine(i, line, text, { dx, dy }), live.deleteLine(i, line), live.addText(i, { x, y, size, color, text, font, bold, italic })
//   live.undo(), live.redo(), live.canUndo(), live.canRedo(), live.save() -> Blob
// A text edit takes the old letters out of the page for good (MuPDF redaction removes the glyphs from the content stream) and writes the new text as real
// text. Each run keeps the PDF's own font when that font can draw the new letters (the codes come from its ToUnicode map, and a test drawing checks that
// the glyph is really in the font: subset fonts only hold the letters that were used). Otherwise the run gets the closest font of the font library.
// Page coordinates in this file are "device" points (top-left origin, y down), the same as the structured text; toPdf() turns them into PDF user space.
(() => {
  const V = '/assets/vendor/';
  let M = null;
  const mu = async () => M || (M = await import(V + 'mupdf-1.28.1/mupdf.js'));
  const num = v => (Math.round(v * 1000) / 1000).toString();
  const hex = (codes, nb) => '<' + codes.map(c => c.toString(16).padStart(nb * 2, '0')).join('') + '>';
  const u8 = b => b.asUint8Array ? b.asUint8Array() : b;

  // Windows-1252: what a "Latin" simple font without a ToUnicode map expects
  const W1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  const winCode = ch => { const c = ch.codePointAt(0); return c < 0x80 || (c >= 0xA0 && c <= 0xFF) ? c : W1252[c] != null ? W1252[c] : null; };

  // ToUnicode CMap -> { c2u, u2c, nb (bytes per code) }
  function parseToUnicode(bytes) {
    const txt = new TextDecoder('latin1').decode(bytes), c2u = new Map(), u2c = new Map(); let nb = 1;
    const uni = h => { let s = ''; for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
    const put = (c, s) => { c2u.set(c, s); if (!u2c.has(s)) u2c.set(s, c); };
    const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(txt); if (cs) nb = Math.max(1, Math.ceil(cs[1].length / 2));
    for (const blk of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const x of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) put(parseInt(x[1], 16), uni(x[2]));
    for (const blk of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const x of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(x[1], 16), hi = Math.min(parseInt(x[2], 16), lo + 65535);
      if (x[3]) { const base = uni(x[3]), last = base.charCodeAt(base.length - 1); for (let c = lo; c <= hi; c++) put(c, base.slice(0, -1) + String.fromCharCode(last + c - lo)); }
      else { const arr = [...x[4].matchAll(/<([0-9a-fA-F]+)>/g)].map(y => uni(y[1])); for (let c = lo; c <= hi && c - lo < arr.length; c++) put(c, arr[c - lo]); }
    }
    return { c2u, u2c, nb };
  }

  // the closest font of the font library for a font the PDF has (name, weight, style): sans -> Arimo (Arial/Helvetica), serif -> Tinos (Times), mono -> Cousine (Courier)
  function guessFont(name, f) {
    const n = (name || '').replace(/^[A-Z]{6}\+/, '').toLowerCase();
    const bold = f.bold === true || f.weight === 'bold' || /bold|black|heavy|semibold|demi|-bd\b|,bd\b/.test(n), italic = f.italic === true || f.style === 'italic' || /italic|oblique|-it\b|,it\b|slanted/.test(n);
    const mono = f.mono === true || f.family === 'monospace' || /courier|mono|consolas|menlo|typewriter|cousine|code/.test(n);
    const serif = !mono && (f.serif === true || f.family === 'serif' || /times|georgia|garamond|serif|palatino|minion|cambria|bookman|century|tinos|roman|didot|baskerville/.test(n) && !/sans/.test(n));
    return { id: mono ? 'cousine' : serif ? 'tinos' : 'arimo', bold, italic, mono, serif };
  }

  class Live {
    constructor(m, doc) { this.m = m; this.doc = doc; this.count = doc.countPages(); this.native = new Map(); this.fontCache = new Map(); this.inkCache = new Map(); this.stCache = new Map(); this.learned = new Map(); }
    page(i) { if (i < 0 || i >= this.count) throw new Error('Page ' + (i + 1) + ' does not exist.'); return this.doc.loadPage(i); }
    size(i) { const p = this.page(i), [x0, y0, x1, y1] = p.getBounds(); return [x1 - x0, y1 - y0, p.getObject().getInheritable('Rotate').valueOf() || 0]; }

    // ---------------------------------------------------------------- drawing
    render(i, scale) {
      const m = this.m, page = this.page(i), px = page.toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, false, true);
      try {
        const w = px.getWidth(), h = px.getHeight(), nc = px.getNumberOfComponents(), stride = px.getStride(), src = px.getPixels(), out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0, d = 0; y < h; y++) for (let x = 0, s = y * stride; x < w; x++, s += nc) { out[d++] = src[s]; out[d++] = src[s + 1]; out[d++] = src[s + 2]; out[d++] = 255; }
        return new ImageData(out, w, h);
      } finally { px.destroy(); page.destroy(); }
    }

    // ---------------------------------------------------------------- reading the text
    // lines: [{ id, blk, text, bbox:{x,y,w,h}, ox, oy (where the first letter starts, on its baseline), size, runs:[{ text, name, size, color:[r,g,b], bold, italic, x0, x1 }], chars, editable }]
    lines(i) {
      const page = this.page(i), st = page.toStructuredText('preserve-whitespace'), out = []; let cur = null, blk = -1;
      st.walk({
        beginTextBlock: () => { blk++; },
        beginLine: (bbox, wmode, dir) => { cur = { id: out.length, blk, text: '', bbox: { x: bbox[0], y: bbox[1], w: bbox[2] - bbox[0], h: bbox[3] - bbox[1] }, chars: [], horizontal: wmode === 0 && Math.abs(dir[1]) < 0.01 && dir[0] > 0 }; },
        onChar: (c, origin, font, size, quad, color) => {
          const col = Array.isArray(color) ? color.slice(0, 3).map(v => v > 1 ? v / 255 : v) : [0, 0, 0];
          cur.chars.push({ c, ox: origin[0], oy: origin[1], name: font.getName(), size, x0: Math.min(quad[0], quad[4]), x1: Math.max(quad[2], quad[6]), color: col, bold: font.isBold(), italic: font.isItalic(), mono: font.isMono(), serif: font.isSerif() });
          cur.text += c;
          const L = this.learned.get(font.getName()) || this.learned.set(font.getName(), new Map()).get(font.getName()), qx = Math.abs(Math.max(quad[2], quad[6]) - Math.min(quad[0], quad[4]));
          if (size > 0 && qx > 0) L.set(c, qx / size);
        },
        endLine: () => {
          if (!cur.chars.length) { cur = null; return; }
          const ch = cur.chars, first = ch[0], runs = [];
          for (const c of ch) {
            const last = runs[runs.length - 1];
            if (last && last.name === c.name && Math.abs(last.size - c.size) < 0.05 && last.color.every((v, k) => Math.abs(v - c.color[k]) < 0.01)) { last.text += c.c; last.x1 = c.x1; }
            else runs.push({ text: c.c, name: c.name, size: c.size, color: c.color, bold: c.bold, italic: c.italic, mono: c.mono, serif: c.serif, x0: c.x0, x1: c.x1 });
          }
          Object.assign(cur, { ox: first.ox, oy: first.oy, size: first.size, runs, editable: cur.horizontal });
          cur.id = out.length; out.push(cur); cur = null;
        },
      });
      page.destroy(); return out;
    }

    // ---------------------------------------------------------------- the fonts of a page (by the name the structured text reports)
    pageFonts(i) {
      const key = 'f' + i, hit = this.fontCache.get(key); if (hit) return hit;
      const map = new Map(), page = this.page(i);
      try {
        const res = page.getObject().getInheritable('Resources'), fonts = res.isNull() ? null : res.get('Font');
        if (fonts && !fonts.isNull()) fonts.forEach((val, rk) => {
          try {
            const f = val.resolve(), base = f.get('BaseFont').isName() ? f.get('BaseFont').asName().replace(/^\//, '') : '', sub = f.get('Subtype').asName(), tu = f.get('ToUnicode');
            let fd = f.get('FontDescriptor'); if (fd.isNull() && !f.get('DescendantFonts').isNull()) fd = f.get('DescendantFonts').get(0).get('FontDescriptor');
            const embedded = !fd.isNull() && ['FontFile', 'FontFile2', 'FontFile3'].some(k => !fd.get(k).isNull()), enc = f.get('Encoding'), encName = enc.isName() ? enc.asName() : enc.isDictionary() ? 'dict' : '';
            if (!map.has(base)) map.set(base, { key: String(rk), base, obj: f, ref: val, sub, embedded, enc: encName, uni: tu.isNull() ? null : parseToUnicode(u8(tu.readStream())) });
          } catch { }
        });
      } finally { page.destroy(); }
      this.fontCache.set(key, map); return map;
    }

    // ---------------------------------------------------------------- can this PDF font draw these letters?
    // Draws the letters on a scratch page and checks that ink came out: a subset font keeps a code in its map even when the outline was thrown away.
    inkOf(info, codes) {
      const m = this.m, key = info.base + '|' + info.key, have = this.inkCache.get(key) || this.inkCache.set(key, new Map()).get(key), todo = [...new Set(codes)].filter(c => !have.has(c));
      if (todo.length) {
        try {
          const sd = new m.PDFDocument(); sd.enableJournal(); sd.beginOperation('probe'); const fobj = sd.graftObject(info.obj), cell = 48, cols = Math.min(todo.length, 16), rows = Math.ceil(todo.length / cols), nb = info.uni ? info.uni.nb : 1;
          const content = todo.map((c, k) => `BT /P 36 Tf 1 0 0 1 ${(k % cols) * cell + 6} ${(rows - 1 - Math.floor(k / cols)) * cell + 12} Tm ${hex([c], nb)} Tj ET`).join('\n');
          sd.insertPage(-1, sd.addPage([0, 0, cols * cell, rows * cell], 0, { Font: { P: fobj } }, content)); sd.endOperation();
          const pg = sd.loadPage(0), px = pg.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false, false), w = px.getWidth(), s = px.getPixels(), stride = px.getStride(), nc = px.getNumberOfComponents();
          todo.forEach((c, k) => { let dark = 0; const x0 = (k % cols) * cell, y0 = Math.floor(k / cols) * cell; for (let y = y0; y < y0 + cell; y++) for (let x = x0; x < x0 + cell; x++) if (s[y * stride + x * nc] < 160) dark++; have.set(c, dark > 3); });
          px.destroy(); pg.destroy(); void w;
        } catch (e) { console.log('LIVE inkOf failed: ' + e + ' ' + String(e && e.stack).slice(0, 400)); todo.forEach(c => have.set(c, false)); }
      }
      return have;
    }
    // the codes that write `text` in this PDF font, or null when it can't (a letter is missing from the font)
    codesFor(info, text) {
      if (!info || info.sub === 'Type3') return null;   // a Type 3 font draws each letter from drawing commands: its codes mean nothing to us
      const chars = [...text];
      if (info.uni) {
        const codes = chars.map(ch => info.uni.u2c.get(ch)); if (codes.some(c => c == null)) return null;
        const need = codes.filter((c, k) => !/\s/.test(chars[k])), ink = this.inkOf(info, need);
        return need.every(c => ink.get(c)) ? { codes, nb: info.uni.nb } : null;
      }
      if (!info.embedded && info.sub !== 'Type0' && (info.enc === 'WinAnsiEncoding' || info.enc === '' || info.enc === 'MacRomanEncoding')) {   // Helvetica, Times ...: not embedded, plain Latin codes
        const codes = chars.map(winCode); return codes.some(c => c == null) ? null : { codes, nb: 1 };
      }
      return null;
    }

    // ---------------------------------------------------------------- the font library as a fallback
    async fallbackFont(spec, text) {
      const F = HT.fonts; await F.ready();
      const need = F.scriptsOf ? F.scriptsOf(text) : null; let id = spec.id;
      if (need && need.size && ![...need].every(s => F.get(id).scripts.includes(s))) { const pick = F.list.find(f => [...need].every(s => f.scripts.includes(s))); if (pick) id = pick.id; }   // the wanted font stays unless it lacks a script the text needs
      const r = F.resolve(id, spec.bold, spec.italic), key = r.url;
      if (!this.native.has(key)) { const b = await F.bytes(id, spec.bold, spec.italic); this.native.set(key, new this.m.Font(F.get(id).name.replace(/\s+/g, '') + '-' + r.style, new Uint8Array(b.data))); }
      const font = this.native.get(key), miss = [...text].filter(ch => !/\s/.test(ch) && !font.encodeCharacter(ch.codePointAt(0)));
      return { font, key, covers: !miss.length };
    }

    // ---------------------------------------------------------------- paragraphs
    // Lines that belong together (same block, font, size and colour, the next baseline one line-height lower, the line above reaching the right margin)
    // become one paragraph: { id, lines, text, x, right, width, indent, lineH, oy, size, bbox, chars, runs, align, wrap }.
    // align is read from the lines (all left edges equal: left, and justified when the right edges are equal too; all centres equal: centre; all right edges equal: right);
    // a single line is centred when it sits on the middle of the page, right when it ends on the right margin.
    paragraphs(i) {
      const lines = this.lines(i).filter(l => l.editable), [pw] = this.size(i), paras = [], dom = l => l.runs.reduce((a, r) => (r.text.length > a.text.length ? r : a), l.runs[0]);
      const right = l => l.bbox.x + l.bbox.w, centre = l => l.bbox.x + l.bbox.w / 2, MARK = /^(?:[•●○▪■◦‣*\-–—]|\d{1,3}[.)]|\(?[a-zA-Z][.)])(?:\s|$)/;
      for (const l of lines) {
        const p = paras[paras.length - 1], pl = p && p.lines[p.lines.length - 1];
        let join = false;
        if (pl && !MARK.test(l.text) && !MARK.test(pl.text)) {
          const s = l.size, dy = l.oy - pl.oy, dl = dom(l), dp = dom(pl), maxR = Math.max(...p.lines.map(right)), same = pl.blk === l.blk;
          const leftOk = Math.abs(l.ox - pl.ox) <= 3 * s, centreOk = Math.abs(centre(l) - centre(pl)) <= 2, rightOk = Math.abs(right(l) - right(pl)) <= 1.5;
          // MuPDF puts each line of centred or right-aligned text in a block of its own, so those join across blocks (when the line above is long, to keep table columns apart)
          const placed = same ? (leftOk || centreOk || rightOk) : ((centreOk || rightOk) && pl.bbox.w > 12 * s);
          join = Math.abs(l.size - pl.size) <= 0.1 * s && dl.name === dp.name && dy > 0.9 * s && dy < 1.65 * s && placed && (centreOk || rightOk ? true : right(pl) >= Math.max(maxR, right(l)) - 4 * s);
        }
        if (join) p.lines.push(l); else paras.push({ lines: [l] });
      }
      const pf = this.pageFonts(i), reusable = name => { const f = pf.get(name); return !!f && f.sub !== 'Type3' && (!!f.uni || (!f.embedded && f.sub !== 'Type0')); };
      const margin = Math.min(...lines.map(l => l.bbox.x), pw), pageRight = Math.min(pw - margin, Math.max(...lines.map(right), 0));
      paras.forEach((p, id) => {
        const ls = p.lines, first = ls[0], rt = Math.max(...ls.map(right));
        const gaps = ls.slice(1).map((l, k) => l.oy - ls[k].oy).sort((a, b) => a - b), x0 = Math.min(...ls.map(l => l.bbox.x));
        let align = 'left';
        if (ls.length > 1) {
          const lefts = ls.slice(1).map(l => l.ox), rights = ls.slice(0, -1).map(right), spread = a => Math.max(...a) - Math.min(...a);
          if (spread(lefts) <= 1.5) align = ls.length >= 3 && spread(rights) <= 1.5 ? 'justify' : 'left';
          else if (spread(ls.map(centre)) <= 2) align = 'centre'; else if (spread(ls.map(right)) <= 1.5) align = 'right';
        } else if (Math.abs(centre(first) - pw / 2) <= 3 && first.bbox.x > margin + 8) align = 'centre';
        else if (Math.abs(rt - (pw - margin)) <= 2 && first.bbox.x > margin + 20) align = 'right';
        const x = align === 'left' || align === 'justify' ? Math.min(...ls.slice(ls.length > 1 ? 1 : 0).map(l => l.ox)) : Math.min(...ls.map(l => l.ox)), chars = []; let text = '';
        ls.forEach((l, k) => { if (k && chars.length && !/\s/.test(chars[chars.length - 1].c)) { chars.push({ ...chars[chars.length - 1], c: ' ' }); text += ' '; } chars.push(...l.chars); text += l.text; });
        // the frame the text is wrapped in: left and justified text is as wide as the column (the longest line of the page that starts at the same place), centred text
        // is as wide as the page's margins allow around its middle, right-aligned text reaches back to the left margin
        let fx = x, fr = rt;
        if (align === 'left' || align === 'justify') fr = Math.max(rt, ...lines.filter(l => Math.abs(l.ox - x) <= 3 && right(l) <= pw - margin + 4).map(right));
        else if (align === 'right') fx = Math.min(x, margin);
        else { const cx0 = (x + rt) / 2, half = Math.min(cx0 - margin, pageRight - cx0); if (half > (rt - x) / 2) { fx = cx0 - half; fr = cx0 + half; } }
        Object.assign(p, { id, reuse: ls.every(l => l.runs.every(r => reusable(r.name))), text, x: fx, right: fr, width: fr - fx, indent: ls.length > 1 && (align === 'left' || align === 'justify') ? first.ox - x : 0, lineH: gaps.length ? gaps[Math.floor(gaps.length / 2)] : first.size * 1.2,
          oy: first.oy, size: first.size, chars, runs: first.runs, align, wrap: ls.length > 1, bbox: { x: x0, y: Math.min(...ls.map(l => l.bbox.y)), w: rt - x0, h: Math.max(...ls.map(l => l.bbox.y + l.bbox.h)) - Math.min(...ls.map(l => l.bbox.y)) }, blk: first.blk });
      });
      return paras;
    }

    // ---------------------------------------------------------------- how wide letters are
    // em width of a letter: first what the page itself shows for that font (exact, character spacing included), then the font's own width table
    advance(info, ch, name) {
      const L = this.learned.get(name), lw = L && L.get(ch); if (lw != null && lw > 0) return lw;
      if (info) { const w = this.dictWidth(info, ch); if (w != null) return w; }
      return null;
    }
    dictWidth(info, ch) {
      if (!info._w) info._w = this.readWidths(info);
      const code = info.uni ? info.uni.u2c.get(ch) : (!info.embedded && info.sub !== 'Type0') ? winCode(ch) : null;
      return code == null ? null : info._w(code);
    }
    readWidths(info) {
      const f = info.obj;
      try {
        if (info.sub === 'Type0') {
          const d = f.get('DescendantFonts').get(0), dw = d.get('DW').isNull() ? 1000 : d.get('DW').asNumber(), W = new Map(), wa = d.get('W');
          if (!wa.isNull()) { let k = 0; const n = wa.length; while (k < n) { const c = wa.get(k).asNumber(), nx = wa.get(k + 1); if (nx.isArray()) { for (let q = 0; q < nx.length; q++) W.set(c + q, nx.get(q).asNumber()); k += 2; } else { const c2 = nx.asNumber(), w = wa.get(k + 2).asNumber(); for (let q = c; q <= c2 && q - c < 70000; q++) W.set(q, w); k += 3; } } }
          return code => (W.has(code) ? W.get(code) : dw) / 1000;
        }
        const first = f.get('FirstChar').isNull() ? 0 : f.get('FirstChar').asNumber(), ws = f.get('Widths'), fd = f.get('FontDescriptor'), mw = !fd.isNull() && !fd.get('MissingWidth').isNull() ? fd.get('MissingWidth').asNumber() : 0;
        if (!ws.isNull()) return code => { const k = code - first; return (k >= 0 && k < ws.length ? ws.get(k).asNumber() : mw) / 1000; };
      } catch { }
      try { const bf = new this.m.Font(info.base.replace(/^[A-Z]{6}\+/, '')); return code => { const g = bf.encodeCharacter(code); return g ? bf.advanceGlyph(g) : null; }; } catch { return () => null; }   // a standard font without a width table: MuPDF has them built in
    }

    // ---------------------------------------------------------------- writing text
    // device point -> PDF user space, and the 4 numbers of a text matrix that makes text run along the screen's horizontal (so rotated pages work too)
    toPdf(page) {
      const [a, b, c, d, e, f] = page.getTransform(), det = a * d - b * c, inv = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
      return { pt: (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]], lin: [inv[0], inv[1], -inv[2], -inv[3]] };
    }
    // makes sure the page draws its own text with the graphics state of a fresh page, then adds a stream after the original ones
    appendContent(page, text) {
      const doc = this.doc, pg = page.getObject(); let cur = pg.get('Contents');
      const wrapped = cur.isArray() && cur.length > 1 && (() => { try { const s = cur.get(0); return s.isStream() && new TextDecoder().decode(u8(s.readStream())).trim() === 'q'; } catch { return false; } })();
      if (!wrapped) {
        const arr = doc.newArray(); arr.push(doc.addStream(new TextEncoder().encode('q\n'), doc.newDictionary()));
        if (cur.isArray()) cur.forEach(s => arr.push(s)); else if (!cur.isNull()) arr.push(cur);
        arr.push(doc.addStream(new TextEncoder().encode('\nQ\n'), doc.newDictionary())); pg.put('Contents', arr); cur = arr;
      }
      cur.push(doc.addStream(new TextEncoder().encode(text), doc.newDictionary()));
    }
    resDict(page, key) {
      const doc = this.doc, pg = page.getObject(); let res = pg.get('Resources');
      if (res.isNull()) { const inh = pg.getInheritable('Resources'); if (inh.isNull()) { res = doc.newDictionary(); } else res = inh; pg.put('Resources', res); }
      let d = res.get(key); if (d.isNull()) { res.put(key, doc.newDictionary()); d = res.get(key); }
      return d;
    }
    fontDict(page) { return this.resDict(page, 'Font'); }

    // Decides, for every letter of `chars` ([{ ch, st }], st = the look), which font draws it and with which code, and how wide it is. The PDF's own font when it
    // can draw the letters of a run, else the closest font of the font library (split where that font stops covering the letters).
    async plan(pf, chars) {
      const units = new Array(chars.length), sig = st => [st.fontId || st.name, (+st.size).toFixed(2), st.color.map(v => v.toFixed(3)).join(','), +!!st.bold, +!!st.italic].join('|');
      for (let k = 0; k < chars.length;) {
        let e = k + 1; while (e < chars.length && sig(chars[e].st) === sig(chars[k].st)) e++;
        const st = chars[k].st, text = chars.slice(k, e).map(c => c.ch).join('');
        if (/[ऀ-෿]/.test(text) && !st.fontId) throw new Error('INDIC');
        const info = st.name != null && !st.fontId ? pf.get(st.name) : null, reuse = this.codesFor(info, text);
        if (reuse) {
          const seg = { kind: 'pdf', info, size: st.size, color: st.color };
          reuse.codes.forEach((c, q) => { const ch = chars[k + q].ch, adv = this.advance(info, ch, st.name); units[k + q] = { seg, code: c, nb: reuse.nb, ch, w: (adv != null ? adv : 0.5) * st.size }; });
        } else {
          const spec = st.fontId ? { id: st.fontId, bold: !!st.bold, italic: !!st.italic } : guessFont(st.name, st); let q = k;
          while (q < e) {
            const rest = chars.slice(q, e).map(c => c.ch), fb = await this.fallbackFont(spec, rest.join(''));
            let n = 0; while (n < rest.length && (/\s/.test(rest[n]) || fb.font.encodeCharacter(rest[n].codePointAt(0)))) n++;
            const use = n ? fb : await this.fallbackFont({ ...spec, id: 'arimo' }, rest[0]), take = n || 1, piece = rest.slice(0, take);
            const bytes = piece.map(winCode), simple = bytes.every(x => x != null), seg = { kind: 'fb', font: use.font, simple, size: st.size, color: st.color };
            piece.forEach((ch, p) => { const gid = use.font.encodeCharacter(ch.codePointAt(0)); units[q + p] = { seg, code: simple ? bytes[p] : gid, nb: simple ? 1 : 2, ch, w: use.font.advanceGlyph(gid) * st.size }; });
            q += take;
          }
        }
        k = e;
      }
      return units;
    }

    // line breaks: greedy filling of `units` into lines no wider than `limit` (the first line has `limit - indent`), words are split only when one is wider than the line
    reflow(units, limit, indent, wrap) {
      const n = units.length, lines = []; let from = 0, w = 0, lastBreak = -1, wAtBreak = 0, lim = limit - indent;
      if (!wrap) return [{ from: 0, to: n, w: units.reduce((a, u) => a + u.w, 0) }];
      const sum = (a, b) => { let s = 0; for (let q = a; q < b; q++) s += units[q].w; return s; };
      for (let k = 0; k < n; k++) {
        const u = units[k];
        if (u.ch === ' ') { lastBreak = k; wAtBreak = w; w += u.w; continue; }
        if (w + u.w > lim + 0.01 && k > from) {
          if (lastBreak >= from) { lines.push({ from, to: lastBreak, w: wAtBreak }); from = lastBreak + 1; while (from < k && units[from].ch === ' ') from++; w = sum(from, k); lastBreak = -1; }
          else { lines.push({ from, to: k, w: sum(from, k) }); from = k; w = 0; }
          lim = limit;
        }
        w += u.w;
      }
      let to = n; while (to > from && units[to - 1].ch === ' ') to--;
      lines.push({ from, to, w: sum(from, to) }); return lines;
    }

    // paints the lines onto the page. lines: [{ units, from, to, x, y (baseline, device points), extra (points added after each space) }]
    emit(page, lines) {
      const doc = this.doc, T = this.toPdf(page), fd = this.fontDict(page), made = new Map(); let cnt = 0, out = '';
      const nameOf = seg => {
        if (seg.kind === 'pdf') { if (fd.get(seg.info.key).isNull()) fd.put(seg.info.key, seg.info.ref); return seg.info.key; }   // redaction drops a font the page no longer uses: put it back
        const slot = seg.simple ? 's' : 'c', m = made.get(seg.font) || made.set(seg.font, {}).get(seg.font);
        if (!m[slot]) { const ref = seg.simple ? doc.addSimpleFont(seg.font, 'Latin') : doc.addFont(seg.font), nm = 'TB' + Date.now().toString(36) + (++cnt); fd.put(nm, ref); m[slot] = nm; }
        return m[slot];
      };
      for (const ln of lines) {
        const [px, py] = T.pt(ln.x, ln.y); let ops = '', k = ln.from;
        while (k < ln.to) {
          const seg = ln.units[k].seg; let e = k; while (e < ln.to && ln.units[e].seg === seg) e++;
          const arr = []; let buf = [];
          for (let q = k; q < e; q++) {
            buf.push(ln.units[q].code);
            if (ln.extra && ln.units[q].ch === ' ' && q < ln.to - 1) { arr.push(hex(buf, ln.units[q].nb)); buf = []; arr.push(num(-ln.extra / seg.size * 1000)); }
          }
          if (buf.length) arr.push(hex(buf, ln.units[e - 1].nb));
          ops += `${seg.color.map(num).join(' ')} rg /${nameOf(seg)} ${num(seg.size)} Tf [${arr.join(' ')}] TJ\n`; k = e;
        }
        if (ops) out += `q BT ${T.lin.map(num).join(' ')} ${num(px)} ${num(py)} Tm\n${ops}ET Q\n`;
      }
      if (out) this.appendContent(page, out);
    }

    // takes the letters of some lines out of the page for good
    // hard: the letters are pixels (a scan) or drawn shapes (text turned into outlines), so pictures are cleared and shapes inside the lines are removed too
    removeLines(page, lines, hard) {
      const m = this.m;
      for (const line of lines) { const bb = line.bbox, pad = hard ? -1 : bb.h * 0.2, an = page.createAnnotation('Redact'); an.setRect([bb.x - 0.5, bb.y + pad, bb.x + bb.w + 0.5, bb.y + bb.h - pad]); }
      page.applyRedactions(false, hard ? m.PDFPage.REDACT_IMAGE_PIXELS : m.PDFPage.REDACT_IMAGE_NONE, hard ? m.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED : m.PDFPage.REDACT_LINE_ART_NONE, m.PDFPage.REDACT_TEXT_REMOVE);
    }
    // paints a flat rectangle (device points): the paper colour under text that was cleared out of a picture
    fillRect(page, bb, color) {
      const T = this.toPdf(page), [x0, y0] = T.pt(bb.x, bb.y), [x1, y1] = T.pt(bb.x + bb.w, bb.y + bb.h);
      this.appendContent(page, `q ${color.map(num).join(' ')} rg ${num(Math.min(x0, x1))} ${num(Math.min(y0, y1))} ${num(Math.abs(x1 - x0))} ${num(Math.abs(y1 - y0))} re f Q
`);
    }
    // the size at which `text` in a library font is `width` points wide (to match the size of text read from a picture)
    async fitSize(text, width, spec = { id: 'arimo', bold: false, italic: false }) {
      const fb = await this.fallbackFont(spec, text); let em = 0;
      for (const ch of text) { const g = fb.font.encodeCharacter(ch.codePointAt(0)); em += g ? fb.font.advanceGlyph(g) : 0.5; }
      return em > 0 ? width / em : 12;
    }

    // ---------------------------------------------------------------- the edits (each one is a single step for undo)
    op(name, fn) { const d = this.doc; d.beginOperation(name); try { return fn(); } catch (e) { d.abandonOperation(); throw e; } finally { try { d.endOperation(); } catch { } this.fontCache.clear(); this.inkCache.clear(); } }

    // the new text with a look for every letter: the untouched start and end keep theirs, new letters take the look of their neighbour
    styledChars(old, text, style) {
      const a = old.map(c => c.c), b = [...text]; let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      const at = k => old[Math.max(0, Math.min(old.length - 1, k))];
      return b.map((ch, k) => {
        const o = k < p ? at(k) : k >= b.length - s ? at(a.length - (b.length - k)) : at(p > 0 ? p - 1 : p), st = { name: o.name, size: o.size, color: o.color, bold: o.bold, italic: o.italic, mono: o.mono, serif: o.serif };
        if (style) {
          if (style.size) st.size = style.size; if (style.color) st.color = style.color;
          if (style.fontId) { st.fontId = style.fontId; st.bold = !!style.bold; st.italic = !!style.italic; }
          else { if (style.bold != null) { st.bold = style.bold; st.name = null; } if (style.italic != null) { st.italic = style.italic; st.name = null; } }
        }
        return { ch, st };
      });
    }
    // sets the paragraph's lines on the page: wraps them to the paragraph's width and aligns them
    async layout(page, pf, para, chars, { dx = 0, dy = 0, align = para.align } = {}) {
      const hard = []; let cur = [];
      for (const c of chars) { if (c.ch === '\n') { hard.push(cur); cur = []; } else cur.push(c); }
      hard.push(cur);
      const flat = hard.flat(), units = await this.plan(pf, flat), lines = []; let off = 0;
      const size = chars.length ? chars[0].st.size : para.size, lineH = para.wrap ? para.lineH * (size / para.size) : size * 1.2, left = para.x + dx, W = para.width, cx = left + W / 2, rt = left + W;
      hard.forEach((h, hi) => {
        const u = units.slice(off, off + h.length), rf = this.reflow(u, W, hi === 0 ? para.indent : 0, para.wrap || false);
        rf.forEach((r, ri) => { lines.push({ units: u, from: r.from, to: r.to, w: r.w, last: ri === rf.length - 1, first: ri === 0 && hi === 0 }); });
        off += h.length;
      });
      lines.forEach((ln, k) => {
        const ind = ln.first ? para.indent : 0; let x = left + ind, extra = 0;
        if (align === 'centre') x = cx - ln.w / 2; else if (align === 'right') x = rt - ln.w;
        else if (align === 'justify' && para.wrap && !ln.last) { const sp = ln.units.slice(ln.from, ln.to).filter(u => u.ch === ' ').length, gap = W - ind - ln.w; if (sp && gap > 0) extra = gap / sp; }
        ln.x = x; ln.y = para.oy + dy + k * lineH; ln.extra = extra;
      });
      this.emit(page, lines);
    }
    async editParagraph(i, para, text, opts = {}) {
      const page = this.page(i), d = this.doc; d.beginOperation('Edit text');
      try {
        const pf = this.pageFonts(i), chars = this.styledChars(para.chars, text, opts.style);
        this.removeLines(page, para.lines, !!para.ocr);
        if (para.ocr && para.bg) for (const l of para.lines) this.fillRect(page, { x: l.bbox.x - 1, y: l.bbox.y - 1, w: l.bbox.w + 2, h: l.bbox.h + 2 }, para.bg);
        await this.layout(page, pf, para, chars, opts);
        d.endOperation();
      } catch (e) { d.abandonOperation(); throw e; } finally { page.destroy(); this.fontCache.clear(); this.inkCache.clear(); }
    }
    deleteParagraph(i, para) { const page = this.page(i); try { this.op('Delete text', () => { this.removeLines(page, para.lines, !!para.ocr); if (para.ocr && para.bg) for (const l of para.lines) this.fillRect(page, { x: l.bbox.x - 1, y: l.bbox.y - 1, w: l.bbox.w + 2, h: l.bbox.h + 2 }, para.bg); }); } finally { page.destroy(); } }
    async addText(i, o) {
      const page = this.page(i), d = this.doc; d.beginOperation('Add text');
      try {
        const size = o.size || 12, st = { name: null, size, color: o.color || [0, 0, 0], bold: !!o.bold, italic: !!o.italic, fontId: o.fontId || 'arimo' };
        const chars = [...o.text].map(ch => ({ ch, st })), para = { x: o.x, width: 0, indent: 0, oy: o.y, size, lineH: size * 1.2, wrap: false, align: 'left' };
        await this.layout(page, new Map(), para, chars, {});
        d.endOperation();
      } catch (e) { d.abandonOperation(); throw e; } finally { page.destroy(); this.fontCache.clear(); }
    }


    // ---------------------------------------------------------------- places on the page: device points (top-left origin, y down) <-> PDF user space
    toDev(page) { const [a, b, c, d, e, f] = page.getTransform(); return (x, y) => [a * x + c * y + e, b * x + d * y + f]; }
    rectToPdf(page, r) { const T = this.toPdf(page), q = [T.pt(r.x, r.y), T.pt(r.x + r.w, r.y), T.pt(r.x, r.y + r.h), T.pt(r.x + r.w, r.y + r.h)], xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
    rectToDev(page, rc) { const D = this.toDev(page), q = [D(rc[0], rc[1]), D(rc[2], rc[1]), D(rc[0], rc[3]), D(rc[2], rc[3])], xs = q.map(v => v[0]), ys = q.map(v => v[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }

    // ---------------------------------------------------------------- pictures
    // the pictures MuPDF finds on a page: [{ id, bbox:{x,y,w,h}, image }]
    pictures(i) {
      const page = this.page(i), st = page.toStructuredText('preserve-images'), out = [];
      try { st.walk({ onImageBlock: (bb, matrix, image) => out.push({ id: out.length, bbox: { x: bb[0], y: bb[1], w: bb[2] - bb[0], h: bb[3] - bb[1] }, image }) }); } finally { page.destroy(); }
      return out;
    }
    // draws an image into the device rectangle r (the page keeps it as a real picture of the page)
    placeImage(page, image, r) {
      const doc = this.doc, ref = doc.addImage(image), T = this.toPdf(page), [ex, ey] = T.pt(r.x, r.y + r.h), [bx, by] = T.pt(r.x + r.w, r.y + r.h), [tx, ty] = T.pt(r.x, r.y);
      const name = 'TBI' + Date.now().toString(36) + (this.imgN = (this.imgN || 0) + 1); this.resDict(page, 'XObject').put(name, ref);
      this.appendContent(page, `q ${[bx - ex, by - ey, tx - ex, ty - ey, ex, ey].map(num).join(' ')} cm /${name} Do Q\n`);
    }
    removePicture(page, bb) {
      const m = this.m, ix = Math.min(bb.w, bb.h) * 0.12, an = page.createAnnotation('Redact'); an.setRect([bb.x + ix, bb.y + ix, bb.x + bb.w - ix, bb.y + bb.h - ix]);
      page.applyRedactions(false, m.PDFPage.REDACT_IMAGE_REMOVE, m.PDFPage.REDACT_LINE_ART_NONE, m.PDFPage.REDACT_TEXT_NONE);
    }
    addPicture(i, bytes, rect) { const page = this.page(i); try { this.op('Add picture', () => this.placeImage(page, new this.m.Image(bytes), rect)); } finally { page.destroy(); } }
    movePicture(i, pic, rect) { const page = this.page(i); try { this.op('Move picture', () => { this.removePicture(page, pic.bbox); this.placeImage(page, pic.image, rect); }); } finally { page.destroy(); } }
    deletePicture(i, pic) { const page = this.page(i); try { this.op('Delete picture', () => this.removePicture(page, pic.bbox)); } finally { page.destroy(); } }

    // ---------------------------------------------------------------- annotations (real PDF annotations: any PDF reader shows them and can change them)
    // MuPDF's annotation calls work in page space (top-left origin, y down, rotation applied): the same device points as everything else here
    devRect(r) { return [r.x, r.y, r.x + r.w, r.y + r.h]; }
    // the quads (one per line piece) of the text between two points of the page: what a text selection covers
    textQuads(i, p, q) {
      const page = this.page(i); try { return page.toStructuredText('preserve-whitespace').highlight(p, q).map(v => Array.from(v)).filter(v => v.length === 8); } finally { page.destroy(); }
    }
    annots(i) {
      const page = this.page(i), out = [], KIND = new Set(['Highlight', 'Underline', 'StrikeOut', 'Square', 'Circle', 'Line', 'Ink', 'Text', 'Stamp']);
      try {
        page.getAnnotations().forEach((a, idx) => {
          const type = a.getType(); if (!KIND.has(type)) return;
          out.push({ id: idx, idx, type, rect: (bb => ({ x: bb[0], y: bb[1], w: bb[2] - bb[0], h: bb[3] - bb[1] }))(a.getBounds()), color: a.getColor(), fill: a.hasInteriorColor() ? a.getInteriorColor() : [], width: a.hasBorder() ? a.getBorderWidth() : 0, contents: a.getContents() || '', opacity: a.getOpacity() });
        });
      } finally { page.destroy(); }
      return out;
    }
    // kind: highlight | underline | strike (o.quads: device quads), rect | ellipse (o.rect), line | arrow (o.p1, o.p2), ink (o.points), note (o.x, o.y, o.text), stamp (o.rect, o.bytes: a PNG or JPEG)
    addAnnot(i, o) {
      const page = this.page(i), col = o.color || [1, 0, 0], w = o.width || 2;
      try {
        this.op('Add ' + o.kind, () => {
          const type = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut', rect: 'Square', ellipse: 'Circle', line: 'Line', arrow: 'Line', ink: 'Ink', note: 'Text', stamp: 'Stamp' }[o.kind], an = page.createAnnotation(type);
          if (o.kind === 'highlight' || o.kind === 'underline' || o.kind === 'strike') { an.setQuadPoints(o.quads); an.setColor(col); if (o.opacity != null) an.setOpacity(o.opacity); }
          else if (o.kind === 'rect' || o.kind === 'ellipse') { an.setRect(this.devRect(o.rect)); an.setColor(col); an.setBorderWidth(w); if (o.fill && o.fill.length) an.setInteriorColor(o.fill); if (o.opacity != null) an.setOpacity(o.opacity); }
          else if (o.kind === 'line' || o.kind === 'arrow') { an.setLine(o.p1, o.p2); an.setColor(col); an.setBorderWidth(w); if (o.kind === 'arrow') an.setLineEndingStyles('None', 'ClosedArrow'); }
          else if (o.kind === 'ink') { an.setInkList([o.points]); an.setColor(col); an.setBorderWidth(w); }
          else if (o.kind === 'stamp') { an.setRect(this.devRect(o.rect)); an.setStampImage(new this.m.Image(o.bytes)); }   // a picture that lies ON the page (nothing under it is touched): it can be moved, resized and removed at any time
          else if (o.kind === 'note') { an.setRect(this.devRect({ x: o.x, y: o.y, w: 22, h: 22 })); an.setContents(o.text || ''); an.setColor([1, 0.82, 0.1]); an.setIcon('Comment'); }
          an.update();
        });
      } finally { page.destroy(); }
    }
    annotAt(page, idx) { const a = page.getAnnotations()[idx]; if (!a) throw new Error('That mark is gone.'); return a; }
    moveAnnot(i, idx, dx, dy) {
      const page = this.page(i);
      try {
        this.op('Move mark', () => {
          const a = this.annotAt(page, idx), vx = dx, vy = dy, t = a.getType();
          if (t === 'Highlight' || t === 'Underline' || t === 'StrikeOut') a.setQuadPoints(a.getQuadPoints().map(q => q.map((v, k) => v + (k % 2 ? vy : vx))));
          else if (t === 'Ink') a.setInkList(a.getInkList().map(st => st.map(pt => [pt[0] + vx, pt[1] + vy])));
          else if (t === 'Line') { const [p, q] = a.getLine(); a.setLine([p[0] + vx, p[1] + vy], [q[0] + vx, q[1] + vy]); }
          else { const r = a.getRect(); a.setRect([r[0] + vx, r[1] + vy, r[2] + vx, r[3] + vy]); }
          a.update();
        });
      } finally { page.destroy(); }
    }
    resizeAnnot(i, idx, rect) { const page = this.page(i); try { this.op('Resize mark', () => { const a = this.annotAt(page, idx); a.setRect(this.devRect(rect)); a.update(); }); } finally { page.destroy(); } }
    styleAnnot(i, idx, st) {
      const page = this.page(i);
      try {
        this.op('Change mark', () => {
          const a = this.annotAt(page, idx);
          if (st.color) a.setColor(st.color); if (st.width != null && a.hasBorder()) a.setBorderWidth(st.width);
          if (st.fill && a.hasInteriorColor()) a.setInteriorColor(st.fill.length ? st.fill : []); if (st.opacity != null) a.setOpacity(st.opacity); if (st.contents != null) a.setContents(st.contents);
          a.update();
        });
      } finally { page.destroy(); }
    }
    deleteAnnot(i, idx) { const page = this.page(i); try { this.op('Delete mark', () => page.deleteAnnotation(this.annotAt(page, idx))); } finally { page.destroy(); } }

    canUndo() { return this.doc.canUndo(); }
    canRedo() { return this.doc.canRedo(); }
    undo() { this.doc.undo(); this.refresh(); }
    redo() { this.doc.redo(); this.refresh(); }
    refresh() { this.count = this.doc.countPages(); this.fontCache.clear(); this.inkCache.clear(); }

    // ---------------------------------------------------------------- the pages
    rotatePage(i, deg) { this.op('Rotate page', () => { const pg = this.doc.findPage(i), cur = pg.getInheritable('Rotate').valueOf() || 0; pg.put('Rotate', (((cur + deg) % 360) + 360) % 360); }); }
    deletePage(i) { if (this.count < 2) throw new Error('Keep at least one page.'); this.op('Delete page', () => this.doc.deletePage(i)); this.refresh(); }
    addBlankPage(after) { const [w, h] = this.size(Math.max(0, Math.min(this.count - 1, after))); this.op('Add page', () => this.doc.insertPage(after + 1, this.doc.addPage([0, 0, w, h], 0, {}, ''))); this.refresh(); }
    movePage(i, to) { if (to < 0 || to >= this.count || to === i) return; const order = [...Array(this.count).keys()]; order.splice(to, 0, order.splice(i, 1)[0]); this.op('Move page', () => this.doc.rearrangePages(order)); this.refresh(); }
    // the file to download. Fonts are subset on a copy, so the open document (and its undo history) stays as it is
    save() {
      const m = this.m, raw = this.doc.saveToBuffer('').asUint8Array().slice();   // plain save of the open document: garbage collection or compression would renumber its objects and break undo
      try {
        const copy = m.Document.openDocument(raw, 'application/pdf').asPDF(); copy.subsetFonts();
        return new Blob([copy.saveToBuffer({ garbage: 3, compress: 'yes' }).asUint8Array().slice()], { type: 'application/pdf' });
      } catch { return new Blob([raw], { type: 'application/pdf' }); }
    }
  }

  HT.pdfLive = {
    guessFont,
    async open(file) {
      const m = await mu(); let doc;
      try { doc = m.Document.openDocument(file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer()), 'application/pdf').asPDF(); } catch { throw new Error('This is not a valid PDF.'); }
      if (!doc) throw new Error('This is not a valid PDF.');
      if (doc.needsPassword()) throw new Error('This PDF is password protected. Remove the password first with the "Unlock PDF" tool.');
      doc.enableJournal(); return new Live(m, doc);
    },
  };
})();
