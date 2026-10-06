// PDF Editor export (runs in the browser). It builds the new PDF from the page plan (which pages, in which order, rotated, plus blank pages) and the
// objects the editor placed on them: text, pictures, shapes, highlights, drawings, white-outs and edited text. Uses MuPDF, like the other PDF tools.
// opts: { pages: [{ src: page index | -1 for a blank page, w, h, rotate }], objects: [{ page: index in `pages`, type, ... }], images: { id: index into files } }
// ctx.files[0] is the PDF, the other files are pictures. All sizes are in PDF points as seen on the page (top-left origin).
(() => {
  const WIN1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  // the line as Windows-1252 bytes (what a "Latin" simple font expects), or null if it holds letters that need the picture route (Indian scripts, Cyrillic ...)
  const toWin1252 = str => { const out = []; for (const ch of str) { const c = ch.codePointAt(0); if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) out.push(c); else if (WIN1252[c]) out.push(WIN1252[c]); else return null; } return out; };
  const pdfString = bytes => '(' + bytes.map(b => (b < 32 || b > 126 || b === 40 || b === 41 || b === 92) ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b)).join('') + ')';
  const rgb = (c, num) => { const h = (/^#?([0-9a-f]{6})$/i.exec(c || '') || [, '000000'])[1]; return [0, 2, 4].map(i => num(parseInt(h.slice(i, i + 2), 16) / 255)).join(' '); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, +v || 0));

  HT.engine('pdf-editor', async ctx => {
    await HT.loadScript('/assets/engine/pdf.js'); await HT.loadScript('/assets/tools/fonts-helpers.js'); await HT.fonts.ready();
    const P = HT.pdfEngine, F = HT.fonts, m = await P.mu(), o = ctx.opts, num = P.num, plan = o.pages, objects = o.objects || [];
    if (!Array.isArray(plan) || !plan.length) throw new Error('Keep at least one page.');
    const src = await P.open(ctx.files[0]), n = src.countPages();

    // 1. the page plan: original pages (copied with everything on them), blank pages, extra rotation
    const doc = new m.PDFDocument(), map = doc.newGraftMap();
    plan.forEach((sl, i) => {
      if (sl.src >= 0) { if (sl.src >= n) throw new Error(`Page ${sl.src + 1} does not exist in this PDF.`); map.graftPage(-1, src, sl.src); }
      else doc.insertPage(-1, doc.addPage([0, 0, clamp(sl.w, 50, 5000) || 595, clamp(sl.h, 50, 5000) || 842], 0, {}, ''));
      if (sl.rotate) { const ob = doc.findPage(i), cur = ob.getInheritable('Rotate').valueOf() || 0; ob.put('Rotate', (((cur + sl.rotate) % 360) + 360) % 360); }
    });
    ctx.progress(0.1);

    // 2. what has to be removed from the page for good: the text that was edited, and white-outs that are set to remove what is under them
    const cut = new Map();
    for (const ob of objects) {
      if (!((ob.type === 'whiteout' && ob.remove) || ob.type === 'textedit' || (ob.type === 'origpic' && ob.remove !== false))) continue;
      if (!(ob.page >= 0 && ob.page < plan.length)) continue;
      const e = cut.get(ob.page) || { rects: [], hard: false }; e.rects.push(ob.cut || ob);   // an edited text block removes the area of the ORIGINAL text, wherever the new text box was moved to
      if (ob.type === 'whiteout' || ob.type === 'origpic' || ob.hard) e.hard = true;   // pictures and scanned text are pixels: they are cleared too
      cut.set(ob.page, e);
    }
    for (const [i, e] of cut) {
      const page = doc.loadPage(i), [x0, y0] = page.getBounds();
      for (const r of e.rects) { const an = page.createAnnotation('Redact'); an.setRect([x0 + r.x, y0 + r.y, x0 + r.x + r.w, y0 + r.y + r.h]); }
      page.applyRedactions(false, e.hard ? m.PDFPage.REDACT_IMAGE_PIXELS : m.PDFPage.REDACT_IMAGE_NONE, e.hard ? m.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED : m.PDFPage.REDACT_LINE_ART_NONE, m.PDFPage.REDACT_TEXT_REMOVE);
    }
    ctx.progress(0.25);

    // 3. draw the objects, page by page, in the order they were placed
    const fontRefs = new Map(), imageRefs = new Map();
    const pdfFont = async (id, bold, italic) => {
      const r = F.resolve(id, bold, italic);
      if (!fontRefs.has(r.url)) { const b = await F.bytes(id, bold, italic), font = new m.Font(F.get(id).name.replace(/\s+/g, '') + '-' + r.style, new Uint8Array(b.data)); fontRefs.set(r.url, { font, ref: doc.addSimpleFont(font, 'Latin') }); }
      return fontRefs.get(r.url);
    };
    const imageRef = async idx => {
      if (!imageRefs.has(idx)) { const f = ctx.files[idx]; if (!f) throw new Error('A picture is missing.'); imageRefs.set(idx, doc.addImage(new m.Image(new Uint8Array(await f.arrayBuffer())))); }
      return imageRefs.get(idx);
    };
    const byPage = new Map();
    for (const ob of objects) { if (!(ob.page >= 0 && ob.page < plan.length)) continue; (byPage.get(ob.page) || byPage.set(ob.page, []).get(ob.page)).push(ob); }
    let done = 0;
    for (const [i, list] of byPage) {
      const page = doc.loadPage(i), [x0, y0] = page.getBounds(), res = { Font: {}, XObject: {}, ExtGState: {} }, ops = [], gs = new Map();
      let nf = 0, nx = 0;
      const alpha = (a, multiply) => {  // the "gs" operator for a see-through draw
        a = clamp(a === undefined ? 1 : a, 0.02, 1); if (a >= 0.999 && !multiply) return '';
        const key = a + (multiply ? 'm' : '');
        if (!gs.has(key)) { const d = doc.newDictionary(); d.put('Type', doc.newName('ExtGState')); d.put('ca', a); d.put('CA', a); if (multiply) d.put('BM', doc.newName('Multiply')); const name = 'TzG' + gs.size; res.ExtGState[name] = doc.addObject(d); gs.set(key, name); }
        return '/' + gs.get(key) + ' gs\n';
      };
      const place = async (ref, x, y, w, h, a) => { const name = 'TzX' + nx++; res.XObject[name] = ref; ops.push(`q ${alpha(a)}${[w, 0, 0, -h, x, y + h].map(num).join(' ')} cm /${name} Do Q`); };
      for (const ob of list) {
        const sw = clamp(ob.sw, 0.25, 60) || 2, stroke = rgb(ob.stroke, num), fill = ob.fill ? rgb(ob.fill, num) : '';
        const x = +ob.x || 0, y = +ob.y || 0, w = +ob.w || 0, h = +ob.h || 0;
        if (ob.type === 'textedit' && ob.fill && ob.cut) ops.push(`q ${rgb(ob.fill, num)} rg ${[ob.cut.x, ob.cut.y, ob.cut.w, ob.cut.h].map(num).join(' ')} re f Q`);
        switch (ob.type) {
          case 'origpic': case 'whiteout': ops.push(`q ${rgb(ob.color || '#ffffff', num)} rg ${[x, y, w, h].map(num).join(' ')} re f Q`); break;
          case 'highlight': ops.push(`q ${alpha(ob.opacity === undefined ? 0.45 : ob.opacity, true)}${rgb(ob.color || '#fff200', num)} rg ${[x, y, w, h].map(num).join(' ')} re f Q`); break;
          case 'rect': ops.push(`q ${alpha(ob.opacity)}${fill ? fill + ' rg ' : ''}${ob.stroke ? stroke + ' RG ' + num(sw) + ' w ' : ''}${[x, y, w, h].map(num).join(' ')} re ${fill && ob.stroke ? 'B' : fill ? 'f' : 'S'} Q`); break;
          case 'ellipse': {
            const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = 0.5522847498 * rx, ky = 0.5522847498 * ry, p = a => a.map(num).join(' ');
            ops.push(`q ${alpha(ob.opacity)}${fill ? fill + ' rg ' : ''}${ob.stroke ? stroke + ' RG ' + num(sw) + ' w ' : ''}${p([cx + rx, cy])} m ${p([cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry])} c ${p([cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy])} c ${p([cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry])} c ${p([cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy])} c h ${fill && ob.stroke ? 'B' : fill ? 'f' : 'S'} Q`);
            break;
          }
          case 'line': case 'arrow': {
            const a = Math.atan2(ob.y2 - ob.y1, ob.x2 - ob.x1), L = Math.max(10, sw * 4.5), p = (px, py) => `${num(px)} ${num(py)}`;
            let line = `${p(ob.x1, ob.y1)} m ${p(ob.x2, ob.y2)} l S`;
            const stem = ob.type === 'arrow' ? `${p(ob.x1, ob.y1)} m ${p(ob.x2 - Math.cos(a) * L * 0.6, ob.y2 - Math.sin(a) * L * 0.6)} l S` : line;
            let head = ''; if (ob.type === 'arrow') head = ` ${stroke} rg ${p(ob.x2, ob.y2)} m ${p(ob.x2 - L * Math.cos(a - 0.42), ob.y2 - L * Math.sin(a - 0.42))} l ${p(ob.x2 - L * Math.cos(a + 0.42), ob.y2 - L * Math.sin(a + 0.42))} l h f`;
            ops.push(`q ${alpha(ob.opacity)}${stroke} RG ${num(sw)} w 1 J 1 j ${stem}${head} Q`);
            break;
          }
          case 'pen': {
            const pts = (ob.pts || []).filter(q => q.length === 2); if (pts.length < 2) break;
            ops.push(`q ${alpha(ob.opacity)}${stroke} RG ${num(sw)} w 1 J 1 j ${pts.map((q, k) => `${num(q[0])} ${num(q[1])} ${k ? 'l' : 'm'}`).join(' ')} S Q`);
            break;
          }
          case 'image': { await place(await imageRef(o.images[ob.img]), x, y, w, h, ob.opacity); break; }
          case 'text': case 'textedit': {
            const text = String(ob.text || ''), size = clamp(ob.size, 2, 500) || 14, lh = clamp(ob.lh, 0.8, 3) || 1.25, asc = ob.asc || 0.95, desc = ob.desc || 0.25;
            const lines = (Array.isArray(ob.lines) && ob.lines.length ? ob.lines : text.split('\n')).map(String);
            if (!lines.some(l => l.trim())) break;
            const base = k => y + k * lh * size + (lh * size - (asc + desc) * size) / 2 + asc * size, bytes = lines.map(toWin1252);
            if (bytes.every(Boolean)) {   // real, selectable text with the font embedded
              const { font, ref } = await pdfFont(ob.font, ob.bold, ob.italic), name = 'TzF' + nf++; res.Font[name] = ref;
              const adv = ch => font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0)));
              const body = lines.map((l, k) => { const lw = [...l].reduce((a, ch) => a + adv(ch), 0) * size, ox = x + (ob.align === 'center' ? (w - lw) / 2 : ob.align === 'right' ? w - lw : 0); return `BT /${name} ${num(size)} Tf 1 0 0 -1 ${num(ox)} ${num(base(k))} Tm ${pdfString(bytes[k])} Tj ET`; }).join('\n');
              ops.push(`q ${alpha(ob.opacity)}${rgb(ob.color, num)} rg\n${body}\nQ`);
            } else {   // letters the simple font cannot hold (Hindi and other scripts): drawn by the browser, which shapes them correctly, and placed as a picture
              await F.load(ob.font, ob.bold, ob.italic).catch(() => { });
              const s = Math.min(4, 3500 / Math.max(w, lines.length * lh * size, 1)), hh = Math.max(h, lines.length * lh * size), c = HT.canvas(Math.ceil(w * s), Math.ceil(hh * s)), cx = c.getContext('2d');
              cx.font = `${ob.italic ? 'italic ' : ''}${ob.bold ? 700 : 400} ${size * s}px "${F.family(ob.font)}", sans-serif`; cx.fillStyle = ob.color || '#000000'; cx.textBaseline = 'alphabetic';
              lines.forEach((l, k) => { const lw = cx.measureText(l).width / s, ox = ob.align === 'center' ? (w - lw) / 2 : ob.align === 'right' ? w - lw : 0; cx.fillText(l, ox * s, (base(k) - y) * s); });
              await place(doc.addImage(new m.Image(new Uint8Array(await (await HT.encode(c, 'image/png')).arrayBuffer()))), x, y, c.width / s, c.height / s, ob.opacity);
            }
            break;
          }
          default: break;
        }
      }
      for (const k of Object.keys(res)) if (!Object.keys(res[k]).length) delete res[k];
      const cm = P.visibleToPdf(m, page, [1, 0, 0, 1, x0, y0]).map(num).join(' ');
      P.addToPage(doc, i, res, `q ${cm} cm\n${ops.join('\n')}\nQ`);
      ctx.progress(0.25 + 0.7 * (++done / byPage.size)); await P.tick();
    }
    const blob = P.save(doc);
    ctx.info = { summary: `${plan.length} page(s), ${objects.length} change(s) (${P.kb(blob.size)})` };
    return [{ name: HT.stem(ctx.files[0].name) + '_edited.pdf', blob }];
  });
})();
