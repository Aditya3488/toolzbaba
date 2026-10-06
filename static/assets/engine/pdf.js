// PDF engine (runs in the browser with MuPDF, the same library the server version used through PyMuPDF):
// image -> PDF, PDF -> image, merge, split, compress, organize, sign, page numbers, protect, unlock,
// PDF -> Word and Word -> PDF.
(() => {
  const V = '/assets/vendor/';
  let M = null;
  const mu = async () => M || (M = await import(V + 'mupdf-1.28.1/mupdf.js'));
  const imgEngine = () => HT.loadScript('/assets/engine/image.js');
  const tick = HT.tick;
  const kb = n => n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const pdfBlob = buf => new Blob([buf.asUint8Array().slice()], { type: 'application/pdf' });
  const save = (doc, extra) => pdfBlob(doc.saveToBuffer({ garbage: 3, compress: 'yes', ...extra }));
  const num = v => (Math.round(v * 1000) / 1000).toString();
  const MAX_PAGES = 3000;

  async function open(file, { allowLocked = false } = {}) {
    const m = await mu();
    let doc;
    try { doc = m.Document.openDocument(new Uint8Array(await file.arrayBuffer()), 'application/pdf'); }
    catch { throw new Error(`'${file.name}' is not a valid PDF.`); }
    if (!allowLocked && doc.needsPassword()) throw new Error('This PDF is password protected. Remove the password first with the "Unlock PDF" tool.');
    return doc.asPDF();
  }

  // '1-3,5,8-' -> zero-based page indexes (order kept, duplicates kept)
  function parsePages(spec, count) {
    spec = String(spec || 'all').trim().toLowerCase();
    if (spec === '' || spec === 'all') return [...Array(count).keys()];
    const pages = [];
    for (const part of spec.replace(/\s+/g, '').split(',')) {
      const m = /^(\d*)-?(\d*)$/.exec(part);
      if (!part || !m) throw new Error(`Can't read page range '${part}'. Use something like 1-3,5,8-10.`);
      let a, b;
      if (part.includes('-')) { a = +(m[1] || 1); b = +(m[2] || count); } else a = b = +m[1];
      if (a < 1 || b < a || b > count) throw new Error(`Page range '${part}' is outside this PDF (it has ${count} pages).`);
      for (let p = a - 1; p < b; p++) pages.push(p);
    }
    return pages;
  }

  // Draw on a page as it is shown (rotation applied): adds `res` ({ XObject: {name: ref} } or { Font: ... }) to the
  // page resources and appends `ops`, keeping the original content's graphics state isolated.
  function addToPage(doc, pageIndex, res, ops) {
    const obj = doc.findPage(pageIndex);
    let resources = obj.get('Resources');
    if (resources.isNull()) {
      resources = obj.getInheritable('Resources');
      if (resources.isNull()) resources = doc.newDictionary();
      obj.put('Resources', resources);
    }
    for (const [cat, items] of Object.entries(res)) {
      let dict = resources.get(cat);
      if (dict.isNull()) { dict = doc.newDictionary(); resources.put(cat, dict); }
      for (const [name, ref] of Object.entries(items)) dict.put(name, ref);
    }
    const contents = obj.get('Contents'), arr = doc.newArray();
    arr.push(doc.addStream('q\n', {}));
    if (contents.isArray()) contents.forEach(c => arr.push(c)); else if (!contents.isNull()) arr.push(contents);
    arr.push(doc.addStream('Q\n' + ops + '\n', {}));
    obj.put('Contents', arr);
  }
  // matrix that maps a box given in the page's visible space (top-left origin, rotation applied) to PDF space
  const visibleToPdf = (m, page, mat) => m.Matrix.concat(mat, m.Matrix.invert(page.getTransform()));

  // ---------------------------------------------------------------- image -> pdf
  const SIZES = { a4: [595, 842], letter: [612, 792], a5: [420, 595] };
  HT.engine('image-to-pdf', imageToPdf);
  HT.engines['jpg-to-pdf'] = HT.engines['png-to-pdf'] = imageToPdf;
  async function imageToPdf(ctx) {
    const m = await mu(); await imgEngine();
    const page = ctx.opts.page || 'a4', orient = ctx.opts.orientation || 'auto';
    const margin = Math.max(0, +(ctx.opts.margin ?? 10)) * 72 / 25.4;
    const doc = new m.PDFDocument();
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Adding image ${i + 1} of ${ctx.files.length}...`); await tick();
      const c = await HT.img.load(f), alpha = HT.img.hasAlpha(c);
      const bytes = new Uint8Array(await (await HT.img.encode(c, alpha ? 'png' : 'jpg', { quality: 92 })).arrayBuffer());
      const ref = doc.addImage(new m.Image(bytes));
      let pw, ph, mg = margin;
      if (page === 'fit') { pw = c.width * 0.75; ph = c.height * 0.75; mg = 0; }
      else {
        [pw, ph] = SIZES[page] || SIZES.a4;
        if (orient === 'landscape' || (orient === 'auto' && c.width > c.height)) [pw, ph] = [ph, pw];
      }
      const bw = Math.max(1, pw - 2 * mg), bh = Math.max(1, ph - 2 * mg), s = Math.min(bw / c.width, bh / c.height);
      const w = c.width * s, h = c.height * s, x = (pw - w) / 2, y = (ph - h) / 2;
      doc.insertPage(-1, doc.addPage([0, 0, pw, ph], 0, { XObject: { Im0: ref } }, `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im0 Do Q`));
      ctx.progress((i + 1) / ctx.files.length);
    }
    const blob = save(doc);
    ctx.info = { summary: `${ctx.files.length} image(s) → PDF (${kb(blob.size)})` };
    return [{ name: ctx.files.length === 1 ? HT.stem(ctx.files[0].name) + '.pdf' : 'images.pdf', blob }];
  }

  // ---------------------------------------------------------------- pdf -> image
  async function pixmapToBlob(pix, fmt) {
    if (fmt === 'png') return new Blob([pix.asPNG().slice()], { type: 'image/png' });
    if (fmt === 'jpg') return new Blob([pix.asJPEG(90).slice()], { type: 'image/jpeg' });
    const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents() + pix.getAlpha(), src = pix.getPixels();
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += n) { rgba[i] = src[j]; rgba[i + 1] = src[j + 1]; rgba[i + 2] = src[j + 2]; rgba[i + 3] = 255; }
    const c = HT.canvas(w, h); c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    await imgEngine();
    return HT.img.encode(c, 'webp', { quality: 90 });
  }
  HT.engine('pdf-to-image', async ctx => {
    const m = await mu();
    const dpi = Math.max(50, Math.min(400, +ctx.opts.dpi || 150)), fmt = ctx.opts.format || 'png';
    if (!['png', 'jpg', 'webp'].includes(fmt)) throw new Error('Unsupported image format.');
    const doc = await open(ctx.files[0]), pages = parsePages(ctx.opts.pages, doc.countPages());
    if (pages.length > 300) throw new Error('Too many pages at once (max 300). Use the page range box.');
    const base = HT.stem(ctx.files[0].name), outs = [];
    for (const [n, p] of pages.entries()) {
      ctx.status(`Rendering page ${p + 1}...`); await tick();
      const page = doc.loadPage(p), pix = page.toPixmap(m.Matrix.scale(dpi / 72, dpi / 72), m.ColorSpace.DeviceRGB, false, true);
      outs.push({ name: `${base}_page${String(p + 1).padStart(3, '0')}.${fmt}`, blob: await pixmapToBlob(pix, fmt) });
      pix.destroy(); page.destroy();
      ctx.progress((n + 1) / pages.length);
    }
    ctx.info = { summary: `${outs.length} page(s) rendered at ${dpi} DPI` };
    return outs;
  });

  // ---------------------------------------------------------------- merge / split
  HT.engine('merge-pdf', async ctx => {
    const m = await mu(), out = new m.PDFDocument();
    let total = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Adding ${f.name}...`); await tick();
      const src = await open(f), map = out.newGraftMap(), n = src.countPages();
      for (let p = 0; p < n; p++) map.graftPage(-1, src, p);
      total += n;
      ctx.progress((i + 1) / ctx.files.length * 0.9);
    }
    const blob = save(out);
    ctx.info = { summary: `Merged ${ctx.files.length} PDFs into ${total} pages (${kb(blob.size)})` };
    return [{ name: 'merged.pdf', blob }];
  });

  HT.engine('split-pdf', async ctx => {
    const m = await mu(), mode = ctx.opts.mode || 'each';
    const doc = await open(ctx.files[0]), n = doc.countPages(), base = HT.stem(ctx.files[0].name);
    let groups = [];
    if (mode === 'each') groups = [...Array(n).keys()].map(i => [i]);
    else if (mode === 'every_n') { const step = Math.max(1, +ctx.opts.every || 2); for (let i = 0; i < n; i += step) groups.push([...Array(Math.min(step, n - i)).keys()].map(k => i + k)); }
    else if (mode === 'ranges') String(ctx.opts.pages || '').split(',').forEach(part => { if (part.trim()) groups.push(parsePages(part, n)); });
    else if (mode === 'extract') groups = [parsePages(ctx.opts.pages || '', n)];
    else throw new Error('Unknown split mode.');
    if (!groups.length || !groups[0].length) throw new Error('Tell me which pages to use.');
    if (groups.length > 300) throw new Error('That would create too many files (max 300).');
    const outs = [];
    for (const [i, pages] of groups.entries()) {
      if (i % 10 === 0) await tick();
      const part = new m.PDFDocument(), map = part.newGraftMap();
      pages.forEach(p => map.graftPage(-1, doc, p));
      const label = pages.length === 1 ? `page${pages[0] + 1}` : `pages${pages[0] + 1}-${pages[pages.length - 1] + 1}`;
      outs.push({ name: mode === 'extract' ? `${base}_extract.pdf` : `${base}_${String(i + 1).padStart(2, '0')}_${label}.pdf`, blob: save(part) });
      ctx.progress((i + 1) / groups.length);
    }
    ctx.info = { summary: `Created ${outs.length} PDF file(s) from ${n} pages` };
    return outs;
  });

  // ---------------------------------------------------------------- compress
  const LEVELS = { low: [200, 150, 80], medium: [150, 110, 60], high: [110, 72, 40] }; // threshold dpi, target dpi, jpeg quality
  // how sharply each image is shown: pixels per inch at its largest placement, keyed by its size in pixels
  function imageDpis(m, doc) {
    const dpi = new Map();
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      const dev = new m.Device({
        fillImage(image, ctm) {
          const w = image.getWidth(), h = image.getHeight(), pw = Math.hypot(ctm[0], ctm[1]) / 72, ph = Math.hypot(ctm[2], ctm[3]) / 72;
          if (pw <= 0 || ph <= 0) return;
          const d = Math.min(w / pw, h / ph), key = w + 'x' + h;
          dpi.set(key, Math.min(dpi.get(key) ?? Infinity, d)); // the largest placement decides (lowest dpi)
        },
      });
      try { page.run(dev, m.Matrix.identity); } catch { /* unreadable page content: skip */ }
      dev.close(); dev.destroy(); page.destroy();
    }
    return dpi;
  }
  // every image XObject used by the pages (and by forms inside them), once each
  function imageRefs(doc) {
    const seen = new Set(), refs = [];
    const walk = (res, depth) => {
      if (res.isNull() || depth > 3) return;
      const xo = res.get('XObject');
      if (!xo.isDictionary()) return;
      xo.forEach(ref => {
        if (!ref.isIndirect() || seen.has(ref.asIndirect())) return;
        seen.add(ref.asIndirect());
        const sub = ref.get('Subtype').valueOf();
        if (sub === 'Image') refs.push(ref); else if (sub === 'Form') walk(ref.get('Resources'), depth + 1);
      });
    };
    for (let i = 0; i < doc.countPages(); i++) walk(doc.findPage(i).getInheritable('Resources'), 0);
    return refs;
  }
  async function shrinkImage(m, doc, ref, scale, quality) {
    if (ref.get('ImageMask').valueOf() === true || ref.get('Mask').isArray()) return false;
    const bpc = ref.get('BitsPerComponent').valueOf();
    if (bpc !== null && bpc < 8) return false;
    let pix = doc.loadImage(ref).toPixmap();
    const cs = pix.getColorSpace();
    if (!cs || !(cs.isRGB() || cs.isGray())) { const rgb = pix.convertToColorSpace(m.ColorSpace.DeviceRGB, false); pix.destroy(); pix = rgb; }
    const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents() + pix.getAlpha(), src = pix.getPixels();
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += n) {
      const g = n < 3; rgba[i] = src[j]; rgba[i + 1] = g ? src[j] : src[j + 1]; rgba[i + 2] = g ? src[j] : src[j + 2]; rgba[i + 3] = 255;
    }
    pix.destroy();
    const c = HT.canvas(w, h); c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
    const jpg = new Uint8Array(await (await HT.img.toBlob(HT.resample(c, nw, nh), 'image/jpeg', quality / 100)).arrayBuffer());
    if (jpg.length >= ref.readRawStream().getLength()) return false;
    ref.writeRawStream(jpg);
    ['DecodeParms', 'Decode', 'Intent'].forEach(k => ref.delete(k));
    ref.put('Filter', doc.newName('DCTDecode')); ref.put('ColorSpace', doc.newName('DeviceRGB'));
    ref.put('Width', nw); ref.put('Height', nh); ref.put('BitsPerComponent', 8);
    return true;
  }
  // "make it fit under N KB": try stronger and stronger settings until the file is small enough. [threshold dpi, target dpi, jpeg quality]
  const LADDER = [LEVELS.medium, LEVELS.high, [90, 60, 35], [72, 48, 30], [60, 40, 24], [48, 32, 18]];
  HT.engine('compress-pdf', async ctx => {
    const m = await mu(); await imgEngine();
    const targetBytes = Math.max(0, parseFloat(ctx.opts.target_kb) || 0) * 1024, fixed = LEVELS[ctx.opts.level || 'medium'] || LEVELS.medium;
    const n = ctx.files.length;
    // one pass over one file with the given settings; returns the new PDF as a Blob
    async function pass(f, [thr, target, q], base, span, label) {
      const doc = await open(f), dpis = imageDpis(m, doc), refs = imageRefs(doc);
      for (const [k, ref] of refs.entries()) {
        const key = ref.get('Width').valueOf() + 'x' + ref.get('Height').valueOf(), d = dpis.get(key);
        if (d && d > thr) {
          ctx.status(`${label} (image ${k + 1} of ${refs.length})...`); await tick();
          try { await shrinkImage(m, doc, ref, target / d, q); } catch (e) { console.warn('image skipped', e); }
        }
        ctx.progress(base + span * (k + 1) / refs.length * 0.95);
      }
      return save(doc, { garbage: 4, clean: 'yes', objstms: 'yes' });
    }
    const outs = [], rows = []; let missed = 0, already = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Analysing ${f.name}...`); await tick();
      let blob;
      if (!targetBytes) blob = await pass(f, fixed, i / n, 1 / n, `Compressing ${f.name}`);
      else if (f.size <= targetBytes) { blob = f; already++; }
      else {
        for (const [step, level] of LADDER.entries()) {
          const b = await pass(f, level, (i + step / LADDER.length) / n, 1 / (n * LADDER.length), `Compressing ${f.name}: setting ${step + 1} of ${LADDER.length}`);
          if (!blob || b.size < blob.size) blob = b;
          if (blob.size <= targetBytes) break;
        }
        if (blob.size > targetBytes) missed++;
      }
      if (blob.size >= f.size) blob = f;
      outs.push({ name: HT.stem(f.name) + '_compressed.pdf', blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
      ctx.progress((i + 1) / n);
    }
    const tb = rows.reduce((a, r) => a + r.before, 0), ta = rows.reduce((a, r) => a + r.after, 0);
    let summary = `${kb(tb)} \u2192 ${kb(ta)}  (${tb ? Math.max(0, Math.round((1 - ta / tb) * 100)) : 0}% smaller)`;
    if (targetBytes) {
      summary = missed ? `${missed} of ${n} file(s) could not get under ${kb(targetBytes)}: ${summary}. Only the pictures inside a PDF can be shrunk, so a PDF that is mostly text or already small stops here.`
        : (already === n ? `Already under ${kb(targetBytes)}: nothing to do (${kb(tb)}).` : `\u2713 Under ${kb(targetBytes)}: ${summary}`);
    }
    ctx.info = { summary, files: rows, reached: missed === 0, target: targetBytes || null };
    return outs;
  });

  // ---------------------------------------------------------------- organize (reorder / delete / rotate)
  const pageList = (v, what = 'page list') => {
    if (!Array.isArray(v) || !v.length) throw new Error(`Nothing to do: the ${what} is empty.`);
    if (v.length > MAX_PAGES) throw new Error(`Too many pages (max ${MAX_PAGES}).`);
    return v;
  };
  HT.engine('organize-pdf', async ctx => {
    const m = await mu(), src = await open(ctx.files[0]), n = src.countPages(), plan = pageList(ctx.opts.pages);
    const out = new m.PDFDocument(), map = out.newGraftMap();
    for (const [i, item] of plan.entries()) {
      const p = parseInt(item && item.p, 10), r = parseInt((item && item.r) || 0, 10);
      if (!(p >= 1 && p <= n)) throw new Error(`Page ${item && item.p} doesn't exist: this PDF has ${n} pages.`);
      if (Number.isNaN(r) || r % 90) throw new Error('Rotation must be a multiple of 90 degrees.');
      map.graftPage(-1, src, p - 1);
      if (r % 360) {
        const obj = out.findPage(out.countPages() - 1), cur = obj.getInheritable('Rotate').valueOf() || 0;
        obj.put('Rotate', (((cur + r) % 360) + 360) % 360);
      }
      if (i % 50 === 0) { ctx.progress((i + 1) / plan.length * 0.9); await tick(); }
    }
    const blob = save(out);
    ctx.info = { summary: `New PDF with ${plan.length} of ${n} pages (${kb(blob.size)})` };
    return [{ name: HT.stem(ctx.files[0].name) + '_organized.pdf', blob }];
  });

  // ---------------------------------------------------------------- sign
  HT.engine('esign-pdf', async ctx => {
    const m = await mu();
    const pdf = ctx.files.find(f => HT.ext(f.name) === 'pdf' || f.type === 'application/pdf'), sig = ctx.files.find(f => f !== pdf);
    if (!pdf || !sig) throw new Error('Add a PDF and a signature image.');
    const doc = await open(pdf), placements = pageList(ctx.opts.placements, 'signature list');
    const ref = doc.addImage(new m.Image(new Uint8Array(await sig.arrayBuffer())));
    for (const [i, pl] of placements.entries()) {
      const pn = parseInt(pl.page, 10), [x, y, w, h] = ['x', 'y', 'w', 'h'].map(k => parseFloat(pl[k]));
      if (!(pn >= 1 && pn <= doc.countPages())) throw new Error(`Page ${pl.page} doesn't exist.`);
      if (!(x >= 0 && x < 1 && y >= 0 && y < 1 && w > 0 && w <= 1 && h > 0 && h <= 1)) throw new Error('A signature is outside the page.');
      const page = doc.loadPage(pn - 1), [x0, y0, x1, y1] = page.getBounds(), W = x1 - x0, H = y1 - y0;
      const rx = x0 + x * W, ry = y0 + y * H, rw = (Math.min(1, x + w) - x) * W, rh = (Math.min(1, y + h) - y) * H;
      const mat = visibleToPdf(m, page, [rw, 0, 0, -rh, rx, ry + rh]);
      addToPage(doc, pn - 1, { XObject: { TzSig: ref } }, `q ${mat.map(num).join(' ')} cm /TzSig Do Q`);
      ctx.progress((i + 1) / placements.length * 0.9);
    }
    const blob = save(doc);
    ctx.info = { summary: `Signature added in ${placements.length} place(s)` };
    return [{ name: HT.stem(pdf.name) + '_signed.pdf', blob }];
  });

  // ---------------------------------------------------------------- page numbers
  const FORMATS = { n: '{n}', page_n: 'Page {n}', page_n_of_total: 'Page {n} of {total}', n_of_total: '{n} / {total}', dash: '- {n} -' };
  HT.engine('add-page-numbers-to-pdf', async ctx => {
    const m = await mu(), o = ctx.opts, pos = o.position || 'bc', fmt = FORMATS[o.format || 'n'];
    if (!['bl', 'bc', 'br', 'tl', 'tc', 'tr'].includes(pos) || !fmt) throw new Error('Unknown position or format.');
    const start = parseInt(o.start ?? 1, 10) || 0, first = Math.max(1, parseInt(o.first_page ?? 1, 10) || 1);
    const size = Math.max(6, Math.min(48, +o.font_size || 11)), margin = Math.max(4, +o.margin || 12) * 72 / 25.4;
    const hex = (/^#?([0-9a-f]{6})$/i.exec(o.color || '#333333') || [, '333333'])[1];
    const rgb = [0, 2, 4].map(i => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
    const doc = await open(ctx.files[0]), n = doc.countPages();
    if (first > n) throw new Error(`The PDF only has ${n} pages.`);
    const font = new m.Font('Helvetica'), fontRef = doc.addSimpleFont(font);
    const width = t => [...t].reduce((a, ch) => a + font.advanceGlyph(font.encodeCharacter(ch)), 0) * size;
    const total = start + (n - first);
    for (let i = first - 1; i < n; i++) {
      const text = fmt.replace('{n}', start + (i + 1 - first)).replace('{total}', total), tw = width(text);
      const page = doc.loadPage(i), [x0, y0, x1, y1] = page.getBounds(), W = x1 - x0, H = y1 - y0;
      const x = x0 + (pos[1] === 'l' ? margin : pos[1] === 'r' ? W - margin - tw : (W - tw) / 2);
      const y = y0 + (pos[0] === 't' ? margin + size * 0.8 : H - margin);
      const tm = visibleToPdf(m, page, [1, 0, 0, -1, x, y]); // upright on the page as viewed, even if the page is rotated
      addToPage(doc, i, { Font: { TzNum: fontRef } }, `BT /TzNum ${num(size)} Tf ${rgb} rg ${tm.map(num).join(' ')} Tm (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`);
      if (i % 50 === 0) { ctx.progress((i + 1) / n * 0.9); await tick(); }
    }
    const blob = save(doc);
    ctx.info = { summary: `Numbered ${n - first + 1} page(s) (${kb(blob.size)})` };
    return [{ name: HT.stem(ctx.files[0].name) + '_numbered.pdf', blob }];
  });

  // ---------------------------------------------------------------- protect / unlock
  const yes = v => v === true || v === 'true' || v === 1 || v === '1';
  HT.engine('protect-pdf', async ctx => {
    const pw = String(ctx.opts.password || '');
    if (pw.length < 4) throw new Error('Choose a password of at least 4 characters.');
    // PDF permission bits; the reserved bits must be 1
    let perm = 1 << 9; // accessibility
    if (ctx.opts.allow_print === undefined || yes(ctx.opts.allow_print)) perm |= (1 << 2) | (1 << 11);
    if (yes(ctx.opts.allow_copy)) perm |= 1 << 4;
    if (yes(ctx.opts.allow_edit)) perm |= (1 << 3) | (1 << 5) | (1 << 8) | (1 << 10);
    const doc = await open(ctx.files[0]);
    // the owner password is random and never shown: the restrictions can't be lifted by guessing it
    const owner = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/[+/=]/g, '');
    const blob = save(doc, { encrypt: 'aes-256', 'user-password': pw, 'owner-password': owner, permissions: (0xfffff0c0 | perm) | 0 });
    ctx.info = { summary: 'PDF locked with AES-256 encryption. Keep the password safe: it can\'t be recovered.' };
    return [{ name: HT.stem(ctx.files[0].name) + '_protected.pdf', blob }];
  });

  HT.engine('unlock-pdf', async ctx => {
    const doc = await open(ctx.files[0], { allowLocked: true });
    if (!doc.needsPassword()) {
      if (doc.getTrailer().get('Encrypt').isNull()) throw new Error('This PDF is not password protected.');
      throw new Error('This PDF opens without a password; it only has usage restrictions (printing, copying). '
        + 'This tool removes a password that you know, so nothing was changed.');
    }
    const pw = String(ctx.opts.password || '');
    if (!pw) throw new Error("Enter the PDF's password.");
    if (!doc.authenticatePassword(pw)) throw new Error('That password is not correct.');
    const blob = save(doc, { encrypt: 'none' });
    ctx.info = { summary: 'Password removed: the PDF now opens without one.' };
    return [{ name: HT.stem(ctx.files[0].name) + '_unlocked.pdf', blob }];
  });

  // ---------------------------------------------------------------- Word / text / spreadsheet -> PDF
  // The document becomes HTML (mammoth for Word, SheetJS for spreadsheets), then MuPDF lays it out into pages.
  const SCRIPTS = { Devanagari: [0x900, 0x97f], Bengali: [0x980, 0x9ff], Gurmukhi: [0xa00, 0xa7f], Gujarati: [0xa80, 0xaff], Oriya: [0xb00, 0xb7f],
    Tamil: [0xb80, 0xbff], Telugu: [0xc00, 0xc7f], Kannada: [0xc80, 0xcff], Malayalam: [0xd00, 0xd7f] };
  const fonts = {};
  let fontHook = false;
  async function loadScriptFonts(m, text) { // MuPDF's browser build has no Indian-script fonts: fetch the ones this text needs
    for (const [script, [a, b]] of Object.entries(SCRIPTS)) {
      if (fonts[script] || !new RegExp(`[\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}]`).test(text)) continue;
      const r = await fetch(`${V}noto-fonts/NotoSans${script}-Regular.ttf`);
      if (r.ok) fonts[script] = new m.Font('NotoSans' + script, new Uint8Array(await r.arrayBuffer()));
    }
    if (!fontHook) { m.installLoadFontFunction((name, script) => fonts[script] || null); fontHook = true; }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const DOC_CSS = `@page{margin:2cm} body{font-family:serif;font-size:11pt;line-height:1.35} h1{font-size:20pt} h2{font-size:16pt} h3{font-size:13pt}
    table{border-collapse:collapse;margin:6pt 0} td,th{border:0.5pt solid #999;padding:2pt 4pt;vertical-align:top} img{max-width:100%}`;
  async function toHtml(f) {
    const ext = HT.ext(f.name), buf = await f.arrayBuffer();
    if (ext === 'docx') {
      await HT.loadScript(V + 'mammoth-1.13.0/mammoth.browser.min.js');
      return { html: (await mammoth.convertToHtml({ arrayBuffer: buf })).value };
    }
    if (ext === 'txt') return { html: `<div style="white-space:pre-wrap;font-family:sans-serif;font-size:10.5pt">${esc(new TextDecoder().decode(buf).replace(/^\ufeff/, ''))}</div>` };
    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
      await HT.loadScript(V + 'sheetjs-0.20.3/xlsx.full.min.js');
      // CSV is text: read it as UTF-8 (SheetJS would guess an old Windows code page and garble Hindi and other scripts)
      const wb = ext === 'csv' ? XLSX.read(new TextDecoder().decode(buf).replace(/^\ufeff/, ''), { type: 'string', cellDates: true }) : XLSX.read(buf, { cellDates: true });
      const parts = wb.SheetNames.map(name => {
        const table = (XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' }).match(/<table[\s\S]*<\/table>/) || [''])[0];
        return (wb.SheetNames.length > 1 ? `<h2>${esc(name)}</h2>` : '') + table;
      });
      return { html: `<div style="font-family:sans-serif;font-size:9pt">${parts.join('')}</div>`, landscape: true };
    }
    throw new Error(`'${f.name}': old .doc, RTF, ODT and PowerPoint files can't be converted in the browser. `
      + 'Open the file in Word, Google Docs or LibreOffice and save it as DOCX first.');
  }
  // HTML text -> PDF. MuPDF lays the HTML out (basic CSS, tables, pictures as data: addresses; no scripts, nothing is fetched from the web) and writes the pages.
  // A full document (<html>...) is used as it is, a fragment is wrapped. The Indian-script fonts are loaded when the text needs them.
  async function htmlToPdf(html, { css = DOC_CSS, w = 595, h = 842, em = 11, onPage } = {}) {
    const m = await mu(); await loadScriptFonts(m, html);
    html = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
    const full = /<html[\s>]|<!doctype/i.test(html), style = `<style>${css}</style>`;
    const page = full ? (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + '<meta charset="utf-8">' + style) : html.replace(/<html[^>]*>/i, x => x + '<head><meta charset="utf-8">' + style + '</head>'))
      : `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
    const src = m.Document.openDocument(new TextEncoder().encode(page), 'text/html'); src.layout(w, h, em);
    const buf = new m.Buffer(), wr = new m.DocumentWriter(buf, 'pdf', ''), n = src.countPages();
    for (let p = 0; p < n; p++) {
      const pg = src.loadPage(p), dev = wr.beginPage(pg.getBounds());
      pg.run(dev, m.Matrix.identity); wr.endPage(); pg.destroy();
      if (onPage) await onPage(p, n);
    }
    wr.close();
    const pdf = m.Document.openDocument(buf.asUint8Array(), 'application/pdf').asPDF();
    pdf.subsetFonts(); // embed only the characters used (whole fonts can be megabytes)
    return { blob: save(pdf, { garbage: 4, objstms: 'yes' }), pages: n };
  }
  HT.engine('word-to-pdf', async ctx => {
    const outs = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Converting ${f.name}...`); await tick();
      const { html, landscape } = await toHtml(f);
      const { blob } = await htmlToPdf(html, { w: landscape ? 842 : 595, h: landscape ? 595 : 842, onPage: async (p, n) => { if (p % 10 === 0) { ctx.progress((i + (p + 1) / n * 0.9) / ctx.files.length); await tick(); } } });
      outs.push({ name: HT.stem(f.name) + '.pdf', blob });
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Converted ${outs.length} document(s) to PDF. Complex layouts (columns, text boxes) may look simpler than in Word.` };
    return outs;
  });

  // ---------------------------------------------------------------- PDF -> Word
  // Text blocks become paragraphs (font, size, bold/italic and centring kept) and pictures are placed inline,
  // in reading order. Good for text documents; scanned pages are pictures and come out as images.
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const FONT_MAP = [[/times/i, 'Times New Roman'], [/helvetica|arial|nimbus ?sans/i, 'Arial'], [/courier/i, 'Courier New'], [/nimbus ?roman/i, 'Times New Roman']];
  const fontName = f => { const n = String((f && (f.family || f.name)) || 'Calibri').replace(/^[A-Z]{6}\+/, ''); return (FONT_MAP.find(([re]) => re.test(n)) || [, n.replace(/[-,].*$/, '')])[1]; };
  function pageImages(m, page) {
    const found = [];
    const dev = new m.Device({
      fillImage(image, ctm) {
        const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]], ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
        const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
        if (w < 12 || h < 12) return; // decorations and spacer images
        let pix = image.toPixmap();
        const cs = pix.getColorSpace();
        if (!cs || !(cs.isRGB() || cs.isGray())) { const rgb = pix.convertToColorSpace(m.ColorSpace.DeviceRGB, true); pix.destroy(); pix = rgb; }
        const png = pix.getAlpha() > 0, data = (png ? pix.asPNG() : pix.asJPEG(85)).slice();
        pix.destroy();
        found.push({ type: 'image', x, y, w, h, data, ext: png ? 'png' : 'jpeg' });
      },
    });
    try { page.run(dev, m.Matrix.identity); } catch { /* unreadable content: keep the text */ }
    dev.close(); dev.destroy();
    return found;
  }
  function runXml(text, font) {
    const sz = Math.max(2, Math.round(((font && font.size) || 11) * 2)), name = xml(fontName(font));
    const bold = font && /bold|black|heavy|semibold/i.test((font.weight || '') + ' ' + (font.name || ''));
    const italic = font && /italic|oblique/i.test((font.style || '') + ' ' + (font.name || ''));
    return `<w:r><w:rPr><w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:cs="${name}"/>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
  }
  HT.engine('pdf-to-word', async ctx => {
    const m = await mu(); await HT.loadScript('/assets/vendor/jszip.min.js');
    const f = ctx.files[0], doc = await open(f), n = doc.countPages();
    if (n > 500) throw new Error('This PDF has more than 500 pages. Split it first with the Split PDF tool.');
    const media = [], body = [];
    let pageW = 595, pageH = 842, words = 0;
    for (let i = 0; i < n; i++) {
      ctx.status(`Reading page ${i + 1} of ${n}...`); await tick();
      const page = doc.loadPage(i), [x0, y0, x1, y1] = page.getBounds(), W = x1 - x0;
      if (i === 0) { pageW = W; pageH = y1 - y0; }
      const items = [];
      for (const b of JSON.parse(page.toStructuredText('preserve-whitespace').asJSON()).blocks || []) {
        if (b.type !== 'text' || !b.lines || !b.lines.length) continue;
        items.push({ type: 'text', x: b.bbox.x, y: b.bbox.y, w: b.bbox.w, lines: b.lines });
      }
      items.push(...pageImages(m, page));
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      if (i > 0) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      for (const it of items) {
        if (it.type === 'image') {
          const id = media.length + 1, rel = 'rIdImg' + id, cx = Math.round(Math.min(it.w, W - 72) * 12700), cy = Math.round(it.h * Math.min(1, (W - 72) / it.w) * 12700);
          media.push({ name: `image${id}.${it.ext}`, data: it.data, rel });
          body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/>`
            + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
            + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}"/><pic:cNvPicPr/></pic:nvPicPr>`
            + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
            + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
          continue;
        }
        // one paragraph per block: lines joined into flowing text, a new run whenever the font changes
        const runs = [];
        it.lines.forEach((l, k) => {
          let t = l.text.replace(/\s+$/, '');
          if (!t) return;
          words += t.split(/\s+/).length;
          const prev = runs[runs.length - 1];
          const sep = k && prev && !/-$/.test(prev.text) ? ' ' : '';
          if (prev && JSON.stringify(prev.font) === JSON.stringify(l.font)) prev.text += sep + t; else runs.push({ text: sep + t, font: l.font });
        });
        if (!runs.length) continue;
        const centred = Math.abs((it.x - x0) + it.w / 2 - W / 2) < W * 0.04 && it.w < W * 0.7;
        const ind = Math.max(0, Math.round((it.x - x0 - 72) * 20));
        body.push(`<w:p><w:pPr><w:spacing w:after="120"/>${centred ? '<w:jc w:val="center"/>' : ind > 100 ? `<w:ind w:left="${ind}"/>` : ''}</w:pPr>${runs.map(r => runXml(r.text, r.font)).join('')}</w:p>`);
      }
      page.destroy();
      ctx.progress((i + 1) / n * 0.9);
    }
    const tw = v => Math.round(v * 20);
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + media.map(mm => `<Relationship Id="${mm.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mm.name}"/>`).join('') + '</Relationships>');
    media.forEach(mm => z.file('word/media/' + mm.name, mm.data));
    z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}`
      + `<w:sectPr><w:pgSz w:w="${tw(pageW)}" w:h="${tw(pageH)}"${pageW > pageH ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    ctx.info = { summary: words ? `Converted ${n} page(s) to Word. Scanned PDFs (photos of pages) come out as pictures, not editable text.`
      : 'No text was found: this looks like a scanned PDF, so the pages were added as pictures. Use the Image to Text (OCR) tool to get the words.' };
    return [{ name: HT.stem(f.name) + '.docx', blob }];
  });

  // ---------------------------------------------------------------- watermark (text or logo, on every page or a range)
  // The watermark is drawn as one picture (rotation and opacity already applied, so it works with any language and any font the
  // browser has), added to the PDF once, and placed on each page.
  async function watermarkImage(m, ctx, o) {
    let src;
    if (o.type === 'image') {
      const logo = ctx.files[1]; if (!logo) throw new Error('Add a logo image first.');
      src = HT.toCanvas(await HT.loadBitmap(logo));
      if (src.width > 1400) src = HT.resample(src, 1400, Math.round(src.height * 1400 / src.width));
    } else {
      const text = String(o.text || '').trim(); if (!text) throw new Error('Type the watermark text first.');
      const px = 160, font = `${o.bold === false || o.bold === 'false' ? 400 : 700} ${px}px ${/serif-only/.test(o.font) ? 'serif' : 'system-ui, "Segoe UI", Arial, sans-serif'}`;
      const lines = text.split('\n').slice(0, 4), mc = HT.canvas(10, 10).getContext('2d'); mc.font = font;
      const w = Math.ceil(Math.max(...lines.map(l => mc.measureText(l).width))) + px * 0.5;
      src = HT.canvas(w, Math.ceil(px * 1.3 * lines.length + px * 0.3));
      const x = src.getContext('2d'); x.font = font; x.textBaseline = 'top'; x.fillStyle = o.color || '#888888';
      lines.forEach((l, i) => x.fillText(l, px * 0.25, px * 0.1 + i * px * 1.3));
    }
    const a = (+o.rotate || 0) * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const out = HT.canvas(Math.ceil(src.width * cos + src.height * sin), Math.ceil(src.width * sin + src.height * cos)), x = out.getContext('2d');
    x.globalAlpha = Math.max(0.03, Math.min(1, (+o.opacity || 30) / 100)); x.translate(out.width / 2, out.height / 2); x.rotate(a); x.drawImage(src, -src.width / 2, -src.height / 2);
    return { ref: null, bytes: new Uint8Array(await (await HT.encode(out, 'image/png')).arrayBuffer()), w: out.width, h: out.height };
  }
  HT.engine('add-watermark-to-pdf', async ctx => {
    const m = await mu(), o = ctx.opts, doc = await open(ctx.files[0]), n = doc.countPages(), pages = parsePages(o.pages, n);
    const wm = await watermarkImage(m, ctx, o), ref = doc.addImage(new m.Image(wm.bytes)), pos = o.position || 'center';
    const share = Math.max(5, Math.min(100, +o.size || 50)) / 100, margin = Math.max(0, +o.margin || 10) * 72 / 25.4;
    for (const [k, i] of pages.entries()) {
      const page = doc.loadPage(i), [x0, y0, x1, y1] = page.getBounds(), W = x1 - x0, H = y1 - y0;
      const rw = W * share, rh = rw * wm.h / wm.w, spots = [];
      if (pos === 'tile') { const sx = rw * 1.25, sy = rh * 1.6; for (let r = 0, y = -rh / 2; y < H; r++, y += sy) for (let x = (r % 2 ? -sx / 2 : 0) - rw / 4; x < W; x += sx) spots.push([x, y]); }
      else {
        const cx = { l: margin, c: (W - rw) / 2, r: W - rw - margin }[pos === 'center' ? 'c' : pos[1]], cy = { t: margin, c: (H - rh) / 2, b: H - rh - margin }[pos === 'center' ? 'c' : pos[0]];
        if (cx === undefined || cy === undefined) throw new Error('Unknown position.');
        spots.push([cx, cy]);
      }
      const ops = spots.map(([x, y]) => `q ${visibleToPdf(m, page, [rw, 0, 0, -rh, x0 + x, y0 + y + rh]).map(num).join(' ')} cm /TzWm Do Q`).join('\n');
      addToPage(doc, i, { XObject: { TzWm: ref } }, ops);
      if (k % 20 === 0) { ctx.progress((k + 1) / pages.length * 0.9); await tick(); }
    }
    const blob = save(doc);
    ctx.info = { summary: `Watermark added on ${pages.length} of ${n} page(s) (${kb(blob.size)})` };
    return [{ name: HT.stem(ctx.files[0].name) + '_watermarked.pdf', blob }];
  });

  // ---------------------------------------------------------------- redact / blur parts of a PDF
  // Black box and white box really remove the text, pictures and drawing underneath (MuPDF redaction), so nothing can be copied out
  // later. Blur and pixelate also remove what is underneath first, then put a blurred picture of it back.
  const blurPiece = (png, mode, strength) => new Promise((res, rej) => {
    const img = new Image(); img.onerror = () => rej(new Error('Could not blur that area.'));
    img.onload = () => {
      const c = HT.canvas(img.width, img.height), x = c.getContext('2d');
      if (mode === 'pixelate') { const k = Math.max(4, Math.round(Math.min(img.width, img.height) / (4 + (11 - strength) * 1.2))), t = HT.canvas(Math.max(1, Math.round(img.width / k)), Math.max(1, Math.round(img.height / k))); t.getContext('2d').drawImage(img, 0, 0, t.width, t.height); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, c.width, c.height); }
      else { x.filter = `blur(${Math.max(2, strength * 2.2)}px)`; x.drawImage(img, -4, -4, img.width + 8, img.height + 8); }
      c.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), 'image/png');
    };
    img.src = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  });
  HT.engine('blur-redact-pdf', async ctx => {
    const m = await mu(), o = ctx.opts, mode = o.mode || 'black', strength = Math.max(1, Math.min(10, +o.strength || 6));
    if (!['black', 'white', 'blur', 'pixelate'].includes(mode)) throw new Error('Unknown mode.');
    const doc = await open(ctx.files[0]), areas = pageList(o.areas, 'area list'), n = doc.countPages(), byPage = new Map();
    for (const a of areas) {
      const pg = parseInt(a.page, 10), [x, y, w, h] = ['x', 'y', 'w', 'h'].map(k => parseFloat(a[k]));
      if (!(pg >= 1 && pg <= n)) throw new Error(`Page ${a.page} doesn't exist.`);
      if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001)) throw new Error('An area is outside the page.');
      if (!byPage.has(pg)) byPage.set(pg, []); byPage.get(pg).push({ x, y, w, h });
    }
    let done = 0;
    for (const [pg, list] of byPage) {
      const page = doc.loadPage(pg - 1), [x0, y0, x1, y1] = page.getBounds(), W = x1 - x0, H = y1 - y0, pieces = [];
      if (mode === 'blur' || mode === 'pixelate') {  // take a picture of each area before it is removed
        const s = Math.min(150 / 72, 2600 / W), pix = page.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true), png = pix.asPNG().slice();
        const full = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read the page.')); im.src = URL.createObjectURL(new Blob([png], { type: 'image/png' })); });
        for (const a of list) {
          const cw = Math.max(2, Math.round(a.w * full.width)), ch = Math.max(2, Math.round(a.h * full.height)), c = HT.canvas(cw, ch);
          c.getContext('2d').drawImage(full, a.x * full.width, a.y * full.height, cw, ch, 0, 0, cw, ch);
          pieces.push(await blurPiece(new Uint8Array(await (await HT.encode(c, 'image/png')).arrayBuffer()), mode, strength));
        }
      }
      for (const a of list) {  // MuPDF takes the rectangle in page space (top-left origin, as shown), which is what the boxes are drawn in
        const an = page.createAnnotation('Redact'); an.setRect([x0 + a.x * W, y0 + a.y * H, x0 + (a.x + a.w) * W, y0 + (a.y + a.h) * H]);
      }
      page.applyRedactions(mode === 'black', m.PDFPage.REDACT_IMAGE_PIXELS, m.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, m.PDFPage.REDACT_TEXT_REMOVE);
      if (pieces.length) {
        const res = {}, ops = [];
        list.forEach((a, k) => { res['TzRd' + k] = doc.addImage(new m.Image(pieces[k])); ops.push(`q ${visibleToPdf(m, page, [a.w * W, 0, 0, -a.h * H, x0 + a.x * W, y0 + (a.y + a.h) * H]).map(num).join(' ')} cm /TzRd${k} Do Q`); });
        addToPage(doc, pg - 1, { XObject: res }, ops.join('\n'));
      }
      ctx.progress(++done / byPage.size * 0.9); await tick();
    }
    const blob = save(doc);
    ctx.info = { summary: `${areas.length} area(s) on ${byPage.size} page(s) ${mode === 'black' ? 'blacked out' : mode === 'white' ? 'whited out' : mode === 'blur' ? 'blurred' : 'pixelated'}. The text and images under them were removed from the file (${kb(blob.size)}).` };
    return [{ name: HT.stem(ctx.files[0].name) + '_redacted.pdf', blob }];
  });

  HT.pdfEngine = { mu, open, save, parsePages, kb, tick, addToPage, visibleToPdf, num, htmlToPdf, DOC_CSS };
})();
