// More PDF tools (run in the browser with MuPDF, through the helpers of engine/pdf.js):
// PDF -> Excel, PDF -> PowerPoint, PowerPoint -> PDF, crop, repair, compare, flatten, PDF -> text.
(() => {
  const P = () => (HT.pdfEngine ? Promise.resolve(HT.pdfEngine) : HT.loadScript('/assets/engine/pdf.js').then(() => HT.pdfEngine));
  const V = '/assets/vendor/';
  const zip = () => HT.loadScript(V + 'jszip.min.js');
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------------------------------------------------------------- reading text with positions
  // The characters of a page grouped into pieces of text: a new piece starts at a new line or a clear gap (wider than
  // about one character), so table cells come out separately even when the PDF draws a row as one line of text.
  function pagePieces(m, page) {
    const st = page.toStructuredText(''), pieces = [];
    let cur = null, lastX = 0, lastSize = 0;
    const flush = () => { if (cur && cur.text.trim()) { cur.text = cur.text.replace(/\s+/g, ' ').trim(); pieces.push(cur); } cur = null; };
    st.walk({
      beginLine() { flush(); },
      onChar(c, origin, font, size, quad) {
        const x0 = Math.min(quad[0], quad[4]), x1 = Math.max(quad[2], quad[6]), y0 = Math.min(quad[1], quad[3]), y1 = Math.max(quad[5], quad[7]);
        if (cur && (x0 - lastX > Math.max(size, lastSize) * 0.9 || x0 < lastX - size * 2)) flush();
        if (c === ' ' && !cur) return;
        if (!cur) cur = { text: '', x0, y0, x1, y1, size };
        cur.text += c; cur.x1 = Math.max(cur.x1, x1); cur.y0 = Math.min(cur.y0, y0); cur.y1 = Math.max(cur.y1, y1);
        if (c !== ' ') lastX = x1; lastSize = size;
      },
      endLine() { flush(); },
    });
    st.destroy();
    return pieces;
  }
  // pieces -> rows (same height on the page) -> cells in columns (left edges that line up across the page)
  function toGrid(pieces) {
    if (!pieces.length) return [];
    pieces.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
    const rows = [];
    for (const p of pieces) {
      const mid = (p.y0 + p.y1) / 2, h = Math.max(4, p.y1 - p.y0), row = rows[rows.length - 1];
      if (row && Math.abs(mid - row.mid) < h * 0.55) { row.items.push(p); row.mid = (row.mid * (row.items.length - 1) + mid) / row.items.length; }
      else rows.push({ mid, items: [p] });
    }
    const lefts = pieces.map(p => p.x0).sort((a, b) => a - b), cols = [];
    for (const x of lefts) { const c = cols[cols.length - 1]; if (c && x - c.max < 9) { c.max = x; c.n++; } else cols.push({ min: x, max: x, n: 1 }); }
    const starts = cols.filter(c => c.n >= 2 || cols.length < 4).map(c => c.min);
    if (!starts.length) starts.push(lefts[0]);
    const colOf = x => { let k = 0; for (let i = 0; i < starts.length; i++) if (x >= starts[i] - 6) k = i; return k; };
    return rows.map(r => {
      const out = [];
      for (const p of r.items.sort((a, b) => a.x0 - b.x0)) { let k = colOf(p.x0); while (out[k] !== undefined) k++; out[k] = p.text; }
      for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
      return out;
    });
  }
  const NUM = /^[-+(]?(?:[$€£₹¥]\s?)?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\)?$|^[-+]?\d+(?:\.\d+)?$/;
  const asValue = (s, numbers) => {
    if (!numbers || !NUM.test(s)) return s;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s), n = parseFloat(s.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? (neg ? -n : n) : s;
  };

  // ---------------------------------------------------------------- PDF -> Excel
  HT.engine('pdf-to-excel', async ctx => {
    const E = await P(), m = await E.mu(); await HT.loadScript(V + 'sheetjs-0.20.3/xlsx.full.min.js');
    const f = ctx.files[0], doc = await E.open(f), n = doc.countPages(), pages = E.parsePages(ctx.opts.pages, n);
    if (pages.length > 300) throw new Error('Too many pages at once (max 300). Use the Pages box.');
    const numbers = ctx.opts.numbers !== false && ctx.opts.numbers !== 'false', one = ctx.opts.layout === 'one';
    const wb = XLSX.utils.book_new(), all = []; let cells = 0;
    for (const [k, p] of pages.entries()) {
      ctx.status(`Reading page ${p + 1}...`); await E.tick();
      const page = doc.loadPage(p), grid = toGrid(pagePieces(m, page)).map(r => r.map(c => asValue(c, numbers)));
      page.destroy();
      cells += grid.reduce((a, r) => a + r.filter(c => c !== '').length, 0);
      if (one) { if (all.length && grid.length) all.push([]); all.push(...grid); }
      else XLSX.utils.book_append_sheet(wb, sheet(grid.length ? grid : [['(no text on this page)']]), 'Page ' + (p + 1));
      ctx.progress((k + 1) / pages.length * 0.9);
    }
    if (one) XLSX.utils.book_append_sheet(wb, sheet(all.length ? all : [['(no text found)']]), 'PDF');
    const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    ctx.info = { summary: cells ? `${pages.length} page(s) converted: ${cells} cells. Tables with clear columns come out best; check merged cells.` : 'No text was found: this looks like a scanned PDF. Use OCR PDF first to turn the pictures into text.' };
    return [{ name: HT.stem(f.name) + '.xlsx', blob }];
  });
  function sheet(rows) {
    const ws = XLSX.utils.aoa_to_sheet(rows), width = [];
    rows.forEach(r => r.forEach((c, i) => { width[i] = Math.min(60, Math.max(width[i] || 6, String(c).length + 2)); }));
    ws['!cols'] = width.map(w => ({ wch: w }));
    return ws;
  }

  // ---------------------------------------------------------------- PDF -> text
  HT.engine('pdf-to-text', async ctx => {
    const E = await P(), f = ctx.files[0], doc = await E.open(f), n = doc.countPages(), pages = E.parsePages(ctx.opts.pages, n);
    const marks = ctx.opts.markers !== false && ctx.opts.markers !== 'false', parts = [];
    let chars = 0;
    for (const [k, p] of pages.entries()) {
      ctx.status(`Reading page ${p + 1}...`); await E.tick();
      const page = doc.loadPage(p), st = page.toStructuredText('preserve-whitespace'), t = st.asText().replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      st.destroy(); page.destroy(); chars += t.length;
      parts.push((marks ? `----- Page ${p + 1} -----\n` : '') + t);
      ctx.progress((k + 1) / pages.length);
    }
    if (!chars) throw new Error('No text was found: this looks like a scanned PDF. Use OCR PDF to read the text from the page pictures.');
    ctx.info = { summary: `${pages.length} page(s), ${chars.toLocaleString('en')} characters of text.` };
    return [{ name: HT.stem(f.name) + '.txt', blob: new Blob([parts.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' }) }];
  });

  // ---------------------------------------------------------------- PDF -> PowerPoint (each page becomes a slide picture)
  const EMU = 12700;   // per point
  const THEME = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Toolz Baba"><a:themeElements>'
    + '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
    + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
    + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
    + '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    + '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  const NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const RELS = items => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('') + '</Relationships>';
  HT.engine('pdf-to-powerpoint', async ctx => {
    const E = await P(), m = await E.mu(); await zip();
    const f = ctx.files[0], doc = await E.open(f), n = doc.countPages();
    if (n > 300) throw new Error('This PDF has more than 300 pages. Split it first with the Split PDF tool.');
    const dpi = Math.max(72, Math.min(220, +ctx.opts.dpi || 150)), z = new JSZip();
    const [bx0, by0, bx1, by1] = doc.loadPage(0).getBounds(), cx = Math.round((bx1 - bx0) * EMU), cy = Math.round((by1 - by0) * EMU);
    const slides = [];
    for (let i = 0; i < n; i++) {
      ctx.status(`Turning page ${i + 1} of ${n} into a slide...`); await E.tick();
      const page = doc.loadPage(i), [x0, y0, x1, y1] = page.getBounds(), s = Math.min(dpi / 72, 2400 / Math.max(1, x1 - x0));
      const pix = page.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceRGB, false, true);
      z.file(`ppt/media/image${i + 1}.jpeg`, pix.asJPEG(88).slice()); pix.destroy();
      // a page of another shape than the first is fitted onto the slide, centred
      const pw = (x1 - x0) * EMU, ph = (y1 - y0) * EMU, k = Math.min(cx / pw, cy / ph), w = Math.round(pw * k), h = Math.round(ph * k);
      slides.push({ w, h, x: Math.round((cx - w) / 2), y: Math.round((cy - h) / 2) });
      page.destroy(); ctx.progress((i + 1) / n * 0.85);
    }
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
      + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
      + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
      + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      + slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>');
    z.file('_rels/.rels', RELS([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
    z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS_P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
      + `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    z.file('ppt/_rels/presentation.xml.rels', RELS([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]));
    z.file('ppt/theme/theme1.xml', THEME);
    z.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:spTree></p:cSld>`
      + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
      + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>');
    z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', RELS([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
    z.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS_P} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', RELS([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
    slides.forEach((s, i) => {
      z.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS_P}><p:cSld>${EMPTY_TREE}`
        + `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
        + `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${s.x}" y="${s.y}"/><a:ext cx="${s.w}" cy="${s.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
        + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>');
      z.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, RELS([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/image${i + 1}.jpeg`]]));
    });
    ctx.status('Packing the presentation...');
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    ctx.info = { summary: `${n} page(s) → ${n} slide(s). Each slide shows the page exactly as in the PDF; add your own text boxes on top in PowerPoint.` };
    return [{ name: HT.stem(f.name) + '.pptx', blob }];
  });

  // ---------------------------------------------------------------- PowerPoint -> PDF
  // Each slide is drawn on a canvas (background, pictures, shapes, text boxes and tables, with the colours and fonts of the
  // theme), then placed on its own PDF page. Charts, SmartArt and effects are left out; simple layouts look closest.
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const kids = (n, ns, name) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && c.localName === name && (!ns || c.namespaceURI === ns)) : [];
  const kid = (n, ns, name) => kids(n, ns, name)[0] || null;
  const find = (n, ns, name) => (n ? n.getElementsByTagNameNS(ns, name)[0] || null : null);
  const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');
  const relsOf = async (z, part) => {
    const dir = part.replace(/[^/]+$/, ''), f = z.file(dir + '_rels/' + part.slice(dir.length) + '.rels'), map = {};
    if (!f) return map;
    for (const r of parseXml(await f.async('string')).getElementsByTagName('Relationship')) {
      const t = r.getAttribute('Target'), abs = r.getAttribute('TargetMode') === 'External' ? null : new URL(t, 'http://x/' + dir).pathname.slice(1);
      map[r.getAttribute('Id')] = { type: r.getAttribute('Type').split('/').pop(), path: abs };
    }
    return map;
  };
  async function deck(file) {
    await zip();
    let z; try { z = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new Error(`'${file.name}' is not a PowerPoint (PPTX) file. Old .ppt files must be saved as PPTX first.`); }
    const presF = z.file('ppt/presentation.xml'); if (!presF) throw new Error(`'${file.name}' is not a PowerPoint (PPTX) file.`);
    const pres = parseXml(await presF.async('string')), prels = await relsOf(z, 'ppt/presentation.xml');
    const sz = find(pres, PNS, 'sldSz'), W = +(sz && sz.getAttribute('cx')) || 12192000, H = +(sz && sz.getAttribute('cy')) || 6858000;
    const slideParts = [...pres.getElementsByTagNameNS(PNS, 'sldId')].map(s => prels[s.getAttributeNS(RNS, 'id')]).filter(Boolean).map(r => r.path);
    return { z, W, H, slideParts };
  }
  const PRESET = { lt1: 'FFFFFF', dk1: '000000', lt2: 'E7E6E6', dk2: '44546A', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
  const MAP = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  function colorOf(node, theme, phClr) {   // a:solidFill / a:fgClr ... -> css colour, or null
    if (!node) return null;
    const c = [...node.childNodes].find(x => x.nodeType === 1);
    if (!c) return null;
    let hex = null;
    if (c.localName === 'srgbClr') hex = c.getAttribute('val');
    else if (c.localName === 'schemeClr') { const v = c.getAttribute('val'); hex = v === 'phClr' ? phClr : theme.colors[MAP[v] || v] || PRESET[MAP[v] || v]; }
    else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
    else if (c.localName === 'prstClr') return c.getAttribute('val');
    if (!hex) return null;
    let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16), a = 1;
    for (const mod of [...c.childNodes].filter(x => x.nodeType === 1)) {
      const v = +mod.getAttribute('val') / 100000;
      if (mod.localName === 'lumMod') { r *= v; g *= v; b *= v; } else if (mod.localName === 'lumOff') { r += 255 * v; g += 255 * v; b += 255 * v; }
      else if (mod.localName === 'tint') { r = r + (255 - r) * (1 - v); g = g + (255 - g) * (1 - v); b = b + (255 - b) * (1 - v); } else if (mod.localName === 'shade') { r *= v; g *= v; b *= v; }
      else if (mod.localName === 'alpha') a = v;
    }
    const cl = x => Math.max(0, Math.min(255, Math.round(x)));
    return `rgba(${cl(r)},${cl(g)},${cl(b)},${a})`;
  }
  async function loadTheme(z, masterPart) {
    const mrels = await relsOf(z, masterPart), t = Object.values(mrels).find(r => r.type === 'theme'), colors = {}, fonts = { major: 'Calibri Light', minor: 'Calibri' };
    if (t && z.file(t.path)) {
      const d = parseXml(await z.file(t.path).async('string')), cs = find(d, A, 'clrScheme');
      if (cs) for (const c of [...cs.childNodes].filter(x => x.nodeType === 1)) { const v = [...c.childNodes].find(x => x.nodeType === 1); if (v) colors[c.localName] = v.getAttribute('val') === 'windowText' ? (v.getAttribute('lastClr') || '000000') : v.getAttribute('val') === 'window' ? (v.getAttribute('lastClr') || 'FFFFFF') : v.getAttribute('lastClr') || v.getAttribute('val'); }
      const mj = find(find(d, A, 'majorFont'), A, 'latin'), mn = find(find(d, A, 'minorFont'), A, 'latin');
      if (mj) fonts.major = mj.getAttribute('typeface') || fonts.major; if (mn) fonts.minor = mn.getAttribute('typeface') || fonts.minor;
    }
    return { colors, fonts };
  }
  const phKey = sp => { const ph = find(sp, PNS, 'ph'); return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') } : null; };
  const findPh = (tree, key) => {
    if (!tree || !key) return null;
    const all = [...tree.getElementsByTagNameNS(PNS, 'sp')].map(sp => ({ sp, k: phKey(sp) })).filter(x => x.k);
    const norm = t => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t);
    return (all.find(x => key.idx != null && x.k.idx === key.idx) || all.find(x => norm(x.k.type) === norm(key.type)) || {}).sp || null;
  };
  const xfrmOf = n => { const x = find(n, A, 'xfrm'); if (!x) return null; const off = kid(x, A, 'off'), ext = kid(x, A, 'ext'); if (!off || !ext) return null;
    return { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy'), rot: (+x.getAttribute('rot') || 0) / 60000, flipH: x.getAttribute('flipH') === '1' }; };
  async function imageFrom(z, rels, rid, cache) {
    const r = rels[rid]; if (!r || !r.path || !z.file(r.path)) return null;
    if (cache[r.path]) return cache[r.path];
    const ext = HT.ext(r.path), type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }[ext];
    if (!type) return null;   // EMF / WMF pictures can't be drawn in a browser
    try { return (cache[r.path] = await createImageBitmap(new Blob([await z.file(r.path).async('uint8array')], { type }))); } catch { return null; }
  }
  function drawGeom(g, geom, x, y, w, h) {
    g.beginPath();
    if (geom === 'ellipse') g.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    else if (geom === 'roundRect') { const r = Math.min(w, h) * 0.1667; g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
    else if (geom === 'line' || geom === 'straightConnector1') { g.moveTo(x, y); g.lineTo(x + w, y + h); }
    else g.rect(x, y, w, h);
  }
  // text of a shape, wrapped to its box; sizes in hundredths of a point (sz="1800" = 18 pt)
  function drawText(g, body, box, k, theme, inherit) {
    const bodyPr = kid(body, A, 'bodyPr'), anchor = (bodyPr && bodyPr.getAttribute('anchor')) || inherit.anchor || 't';
    const ins = n => (bodyPr && bodyPr.getAttribute(n) != null ? +bodyPr.getAttribute(n) : n === 'lIns' || n === 'rIns' ? 91440 : 45720) * k;
    const auto = bodyPr && find(bodyPr, A, 'normAutofit'), scale = auto && auto.getAttribute('fontScale') ? +auto.getAttribute('fontScale') / 100000 : 1;
    const left = box.x + ins('lIns'), width = Math.max(10, box.w - ins('lIns') - ins('rIns')), lines = [];
    for (const p of kids(body, A, 'p')) {
      const pPr = kid(p, A, 'pPr'), lvl = +(pPr && pPr.getAttribute('lvl')) || 0, algn = (pPr && pPr.getAttribute('algn')) || inherit.algn || 'l';
      const bullet = pPr && kid(pPr, A, 'buChar') ? kid(pPr, A, 'buChar').getAttribute('char') : !(pPr && kid(pPr, A, 'buNone')) && inherit.bullets ? '•' : '';
      const runs = [];
      for (const r of [...p.childNodes].filter(c => c.nodeType === 1 && (c.localName === 'r' || c.localName === 'fld' || c.localName === 'br'))) {
        if (r.localName === 'br') { runs.push({ br: true }); continue; }
        const rPr = kid(r, A, 'rPr'), t = kid(r, A, 't'); if (!t) continue;
        const szv = (rPr && rPr.getAttribute('sz')) || (inherit.sz && inherit.sz[lvl]) || (inherit.sz && inherit.sz[0]) || 1800;
        const latin = rPr && kid(rPr, A, 'latin'), face0 = latin ? latin.getAttribute('typeface') : inherit.font;
        const face = face0 === '+mj-lt' ? theme.fonts.major : face0 === '+mn-lt' || !face0 ? theme.fonts.minor : face0;
        runs.push({ text: t.textContent, size: Math.max(4, +szv / 100 * scale) * 12700 * k, bold: rPr && rPr.getAttribute('b') === '1' || (rPr == null || rPr.getAttribute('b') == null) && inherit.bold, italic: rPr && rPr.getAttribute('i') === '1',
          color: (rPr && colorOf(kid(rPr, A, 'solidFill'), theme)) || inherit.color || 'rgb(0,0,0)', face, under: rPr && rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none' });
      }
      const defSize = (+((inherit.sz && (inherit.sz[lvl] || inherit.sz[0])) || 1800) / 100 * scale) * 12700 * k;
      const indent = lvl * 0.4 * 914400 * k + (bullet && runs.length ? defSize * 0.9 : 0);
      // break runs into words and lay them out in lines
      let line = { segs: [], w: 0, h: defSize * 1.2, algn, indent, bullet: runs.length ? bullet : '', bsize: defSize };
      const push = () => { lines.push(line); line = { segs: [], w: 0, h: defSize * 1.2, algn, indent, bullet: '', bsize: defSize }; };
      if (!runs.length) { lines.push(line); continue; }
      for (const r of runs) {
        if (r.br) { push(); continue; }
        g.font = `${r.italic ? 'italic ' : ''}${r.bold ? '700 ' : ''}${r.size}px "${r.face}", Calibri, Arial, sans-serif`;
        for (const word of r.text.split(/(\s+)/)) {
          if (!word) continue;
          const ww = g.measureText(word).width;
          if (line.w + ww > width - line.indent && line.segs.length && /\S/.test(word)) push();
          if (!line.segs.length && !/\S/.test(word)) continue;
          line.segs.push({ ...r, text: word, w: ww }); line.w += ww; line.h = Math.max(line.h, r.size * 1.2);
        }
      }
      push();
    }
    const total = lines.reduce((a, l) => a + l.h, 0), top = box.y + ins('tIns'), avail = box.h - ins('tIns') - ins('bIns');
    let y = anchor === 'ctr' ? top + (avail - total) / 2 : anchor === 'b' ? top + avail - total : top;
    g.textBaseline = 'alphabetic';
    for (const l of lines) {
      let x = left + l.indent;
      if (l.algn === 'ctr') x = left + (width - l.w) / 2; else if (l.algn === 'r') x = left + width - l.w;
      const base = y + l.h * 0.8;
      if (l.bullet) { g.font = `${l.bsize}px Arial, sans-serif`; g.fillStyle = (l.segs[0] && l.segs[0].color) || 'black'; g.fillText(l.bullet, x - l.bsize * 0.9, base); }
      for (const s of l.segs) {
        g.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : ''}${s.size}px "${s.face}", Calibri, Arial, sans-serif`; g.fillStyle = s.color;
        g.fillText(s.text, x, base);
        if (s.under) g.fillRect(x, base + s.size * 0.1, s.w, Math.max(1, s.size * 0.05));
        x += s.w;
      }
      y += l.h;
    }
  }
  function inheritFor(key, layoutTree, masterTree, master, theme) {
    const out = { sz: {}, bullets: false, algn: null, anchor: null, color: null, font: null, bold: false };
    const st = master && find(master, PNS, 'txStyles'), style = key && (key.type === 'title' || key.type === 'ctrTitle') ? find(st, PNS, 'titleStyle') : key ? find(st, PNS, 'bodyStyle') : find(st, PNS, 'otherStyle');
    const take = lst => { if (!lst) return; for (let l = 0; l < 9; l++) { const p = kid(lst, A, `lvl${l + 1}pPr`); if (!p) continue; const d = kid(p, A, 'defRPr'); if (d && d.getAttribute('sz')) out.sz[l] = +d.getAttribute('sz');
      if (l === 0) { if (p.getAttribute('algn')) out.algn = p.getAttribute('algn'); if (d) { const c = colorOf(kid(d, A, 'solidFill'), theme); if (c) out.color = c; const lat = kid(d, A, 'latin'); if (lat) out.font = lat.getAttribute('typeface'); if (d.getAttribute('b') === '1') out.bold = true; } if (kid(p, A, 'buChar')) out.bullets = true; if (kid(p, A, 'buNone')) out.bullets = false; } } };
    take(style);
    if (key && key.type === 'body' || key && key.type === 'obj') out.bullets = out.bullets || !!(style && find(style, A, 'buChar'));
    for (const tree of [masterTree, layoutTree]) { const sp = findPh(tree, key); if (sp) { const body = find(sp, PNS, 'txBody'); take(body && kid(body, A, 'lstStyle')); const bp = body && kid(body, A, 'bodyPr'); if (bp && bp.getAttribute('anchor')) out.anchor = bp.getAttribute('anchor'); } }
    if (key && (key.type === 'title' || key.type === 'ctrTitle')) out.bullets = false;
    if (key && key.type === 'subTitle') out.bullets = false;
    return out;
  }
  async function drawTree(g, tree, ctx2, group) {
    const { z, rels, theme, k, cache, layoutTree, masterTree, master, skipPh } = ctx2;
    for (const n of [...tree.childNodes].filter(c => c.nodeType === 1)) {
      const name = n.localName;
      if (name === 'grpSp') {
        const gx = xfrmOf(kid(n, PNS, 'grpSpPr')), x = gx && find(kid(n, PNS, 'grpSpPr'), A, 'xfrm'), ch = x && kid(x, A, 'chOff'), ce = x && kid(x, A, 'chExt');
        const map = gx && ch && ce ? { ox: +ch.getAttribute('x'), oy: +ch.getAttribute('y'), sx: gx.w / (+ce.getAttribute('cx') || 1), sy: gx.h / (+ce.getAttribute('cy') || 1), x: gx.x, y: gx.y } : null;
        await drawTree(g, n, ctx2, map ? (b => { const m2 = { x: map.x + (b.x - map.ox) * map.sx, y: map.y + (b.y - map.oy) * map.sy, w: b.w * map.sx, h: b.h * map.sy, rot: b.rot }; return group ? group(m2) : m2; }) : group);
        continue;
      }
      if (!['sp', 'pic', 'cxnSp', 'graphicFrame'].includes(name)) continue;
      const key = name === 'sp' ? phKey(n) : null;
      if (skipPh && key) continue;   // placeholders of the layout / master are prompts ("Click to add title"), not content
      let b = name === 'graphicFrame' ? null : xfrmOf(kid(n, PNS, 'spPr'));
      if (name === 'graphicFrame') { const fx = kid(n, PNS, 'xfrm'); if (fx) { const off = kid(fx, A, 'off'), ext = kid(fx, A, 'ext'); b = { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy'), rot: 0 }; } }
      if (!b && key) for (const t of [layoutTree, masterTree]) { const sp = findPh(t, key); if (sp && (b = xfrmOf(kid(sp, PNS, 'spPr')))) break; }
      if (!b) continue;
      if (group) b = group(b);
      const box = { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k };
      g.save();
      if (b.rot) { g.translate(box.x + box.w / 2, box.y + box.h / 2); g.rotate(b.rot * Math.PI / 180); g.translate(-(box.x + box.w / 2), -(box.y + box.h / 2)); }
      if (name === 'pic') {
        const blip = find(n, A, 'blip'), img = blip && await imageFrom(z, rels, blip.getAttributeNS(RNS, 'embed'), cache);
        if (img) g.drawImage(img, box.x, box.y, box.w, box.h);
      } else if (name === 'graphicFrame') {
        const tbl = find(n, A, 'tbl');
        if (tbl) {
          const cols = [...tbl.getElementsByTagNameNS(A, 'gridCol')].map(c => +c.getAttribute('w') * k), rows = kids(tbl, A, 'tr');
          let y = box.y;
          for (const tr of rows) {
            const h = +tr.getAttribute('h') * k; let x = box.x;
            kids(tr, A, 'tc').forEach((tc, i) => {
              const w = cols[i] || 0, tcPr = kid(tc, A, 'tcPr'), fill = tcPr && colorOf(kid(tcPr, A, 'solidFill'), theme);
              if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
              g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1, 9525 * k); g.strokeRect(x, y, w, h);
              const body = kid(tc, A, 'txBody'); if (body) drawText(g, body, { x, y, w, h }, k, theme, { sz: { 0: 1400 }, anchor: 't' });
              x += w;
            });
            y += h;
          }
        }
      } else {
        const spPr = kid(n, PNS, 'spPr'), geomN = spPr && kid(spPr, A, 'prstGeom'), geom = geomN ? geomN.getAttribute('prst') : 'rect';
        const style = kid(n, PNS, 'style'), styleFill = style && colorOf(kid(style, A, 'fillRef'), theme), styleLine = style && colorOf(kid(style, A, 'lnRef'), theme);
        const fill = spPr && kid(spPr, A, 'noFill') ? null : (spPr && colorOf(kid(spPr, A, 'solidFill'), theme)) || (spPr && !kid(spPr, A, 'solidFill') && !kid(spPr, A, 'gradFill') && name !== 'cxnSp' ? styleFill : null);
        const grad = spPr && kid(spPr, A, 'gradFill'), ln = spPr && kid(spPr, A, 'ln'), lineCol = ln && kid(ln, A, 'noFill') ? null : (ln && colorOf(kid(ln, A, 'solidFill'), theme)) || (!ln || !kid(ln, A, 'noFill') ? styleLine : null);
        if (grad) { const stops = [...grad.getElementsByTagNameNS(A, 'gs')]; const gr = g.createLinearGradient(box.x, box.y, box.x, box.y + box.h); stops.forEach(s => { const c = colorOf(s, theme); if (c) gr.addColorStop(Math.min(1, +s.getAttribute('pos') / 100000), c); }); g.fillStyle = gr; drawGeom(g, geom, box.x, box.y, box.w, box.h); g.fill(); }
        else if (fill) { g.fillStyle = fill; drawGeom(g, geom, box.x, box.y, box.w, box.h); g.fill(); }
        if (lineCol) { g.strokeStyle = lineCol; g.lineWidth = Math.max(1, (ln && +ln.getAttribute('w') || 12700) * k); drawGeom(g, geom, box.x, box.y, box.w, box.h); g.stroke(); }
        const blipFill = spPr && kid(spPr, A, 'blipFill'), bimg = blipFill && await imageFrom(z, rels, find(blipFill, A, 'blip').getAttributeNS(RNS, 'embed'), cache);
        if (bimg) g.drawImage(bimg, box.x, box.y, box.w, box.h);
        const body = find(n, PNS, 'txBody');
        if (body) {
          const inh = inheritFor(key, layoutTree, masterTree, master, theme), fontCol = style && colorOf(kid(style, A, 'fontRef'), theme);
          if (!key && !inh.sz[0]) inh.sz[0] = 1800;
          if (fontCol) inh.color = fontCol;   // a shape's own text colour (white on a coloured box, for example)
          drawText(g, body, box, k, theme, inh);
        }
      }
      g.restore();
    }
  }
  async function background(g, docs, theme, W, H, z, cache) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (const { doc, rels } of docs) {
      const bg = find(doc, PNS, 'bg'); if (!bg) continue;
      const pr = kid(bg, PNS, 'bgPr'), ref = kid(bg, PNS, 'bgRef');
      if (pr) {
        const c = colorOf(kid(pr, A, 'solidFill'), theme); if (c) { g.fillStyle = c; g.fillRect(0, 0, W, H); return; }
        const bf = kid(pr, A, 'blipFill'), img = bf && await imageFrom(z, rels, find(bf, A, 'blip').getAttributeNS(RNS, 'embed'), cache); if (img) { g.drawImage(img, 0, 0, W, H); return; }
        const gf = kid(pr, A, 'gradFill'); if (gf) { const gr = g.createLinearGradient(0, 0, 0, H); [...gf.getElementsByTagNameNS(A, 'gs')].forEach(s => { const cc = colorOf(s, theme); if (cc) gr.addColorStop(Math.min(1, +s.getAttribute('pos') / 100000), cc); }); g.fillStyle = gr; g.fillRect(0, 0, W, H); return; }
      } else if (ref) { const c = colorOf(ref, theme); if (c) { g.fillStyle = c; g.fillRect(0, 0, W, H); return; } }
    }
  }
  HT.engine('powerpoint-to-pdf', async ctx => {
    const E = await P(), m = await E.mu(), outs = [];
    for (const [fi, f] of ctx.files.entries()) {
      const { z, W, H, slideParts } = await deck(f);
      if (!slideParts.length) throw new Error(`'${f.name}' has no slides.`);
      const px = 1920, k = px / W, ph = Math.round(H * k), doc = new m.PDFDocument(), cache = {};
      const pw = W / EMU, phPt = H / EMU;
      for (const [i, part] of slideParts.entries()) {
        ctx.status(`${ctx.files.length > 1 ? f.name + ': ' : ''}slide ${i + 1} of ${slideParts.length}...`); await E.tick();
        const sd = parseXml(await z.file(part).async('string')), rels = await relsOf(z, part);
        const layoutPart = (Object.values(rels).find(r => r.type === 'slideLayout') || {}).path, layout = layoutPart && z.file(layoutPart) ? parseXml(await z.file(layoutPart).async('string')) : null;
        const lrels = layoutPart ? await relsOf(z, layoutPart) : {}, masterPart = (Object.values(lrels).find(r => r.type === 'slideMaster') || {}).path;
        const master = masterPart && z.file(masterPart) ? parseXml(await z.file(masterPart).async('string')) : null, mrels = masterPart ? await relsOf(z, masterPart) : {};
        const theme = masterPart ? await loadTheme(z, masterPart) : { colors: {}, fonts: { major: 'Calibri Light', minor: 'Calibri' } };
        const c = HT.canvas(px, ph), g = c.getContext('2d');
        await background(g, [{ doc: sd, rels }, { doc: layout, rels: lrels }, { doc: master, rels: mrels }].filter(x => x.doc), theme, px, ph, z, cache);
        const tree = d => d && find(d, PNS, 'spTree');
        const base = { z, theme, k, cache, layoutTree: tree(layout), masterTree: tree(master), master };
        if (master) await drawTree(g, tree(master), { ...base, rels: mrels, skipPh: true });
        if (layout) await drawTree(g, tree(layout), { ...base, rels: lrels, skipPh: true });
        await drawTree(g, tree(sd), { ...base, rels });
        const bytes = new Uint8Array(await (await HT.encode(c, 'image/jpeg', 0.9)).arrayBuffer()), ref = doc.addImage(new m.Image(bytes));
        doc.insertPage(-1, doc.addPage([0, 0, pw, phPt], 0, { XObject: { Im0: ref } }, `q ${E.num(pw)} 0 0 ${E.num(phPt)} 0 0 cm /Im0 Do Q`));
        ctx.progress((fi + (i + 1) / slideParts.length) / ctx.files.length * 0.95);
      }
      outs.push({ name: HT.stem(f.name) + '.pdf', blob: E.save(doc) });
    }
    ctx.info = { summary: `Converted ${outs.length} presentation(s) to PDF. Pictures, shapes, text and tables are kept; charts, SmartArt and animations are not.` };
    return outs;
  });

  // ---------------------------------------------------------------- crop
  // Set each page's visible area (its CropBox): automatically to the content (white margins removed), or by margins in mm.
  HT.engine('crop-pdf', async ctx => {
    const E = await P(), m = await E.mu(), o = ctx.opts, doc = await E.open(ctx.files[0]), n = doc.countPages(), pages = E.parsePages(o.pages, n);
    const mm = v => Math.max(0, +v || 0) * 72 / 25.4, pad = mm(o.padding ?? 3);
    let done = 0;
    for (const [k, i] of pages.entries()) {
      ctx.status(`Cropping page ${i + 1}...`); await E.tick();
      const page = doc.loadPage(i), [x0, y0, x1, y1] = page.getBounds();
      let r;   // the area to keep, in the page's visible space (top-left origin)
      if ((o.mode || 'auto') === 'auto') {
        const s = 1.2, pix = page.toPixmap(m.Matrix.scale(s, s), m.ColorSpace.DeviceGray, false, true), w = pix.getWidth(), h = pix.getHeight(), px = pix.getPixels(), stride = pix.getStride();
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * stride + x] < 245) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        pix.destroy();
        if (maxX < 0) { page.destroy(); continue; }   // an empty page stays as it is
        r = [x0 + minX / s - pad, y0 + minY / s - pad, x0 + (maxX + 1) / s + pad, y0 + (maxY + 1) / s + pad];
      } else r = [x0 + mm(o.left), y0 + mm(o.top), x1 - mm(o.right), y1 - mm(o.bottom)];
      r = [Math.max(x0, r[0]), Math.max(y0, r[1]), Math.min(x1, r[2]), Math.min(y1, r[3])];
      if (r[2] - r[0] < 20 || r[3] - r[1] < 20) throw new Error(`Those margins leave nothing of page ${i + 1}. Use smaller numbers.`);
      page.setPageBox('CropBox', r); page.destroy(); done++;   // MuPDF takes the box as seen on screen and turns it into PDF space itself
      ctx.progress((k + 1) / pages.length * 0.9);
    }
    if (!done) throw new Error('Nothing to crop: the pages are empty.');
    const blob = E.save(doc);
    ctx.info = { summary: `${done} page(s) cropped. The cut-off parts are hidden, not deleted, so the file size stays about the same.` };
    return [{ name: HT.stem(ctx.files[0].name) + '_cropped.pdf', blob }];
  });

  // ---------------------------------------------------------------- repair
  HT.engine('repair-pdf', async ctx => {
    const E = await P(), m = await E.mu(), f = ctx.files[0];
    ctx.status('Reading and rebuilding the file...'); await E.tick();
    let doc;
    try { doc = m.Document.openDocument(new Uint8Array(await f.arrayBuffer()), 'application/pdf'); }
    catch { throw new Error(`'${f.name}' is too damaged to open: no readable PDF structure was found.`); }
    if (doc.needsPassword()) throw new Error('This PDF is password protected. Remove the password first with the "Unlock PDF" tool.');
    const pdf = doc.asPDF(), n = pdf.countPages();
    let bad = 0;
    for (let i = 0; i < n; i++) { try { const p = pdf.loadPage(i); p.toStructuredText('').destroy(); p.destroy(); } catch { bad++; } if (i % 20 === 0) { ctx.progress(i / n * 0.8); await E.tick(); } }
    const repaired = pdf.wasRepaired(), blob = E.save(pdf, { garbage: 4, clean: 'yes', sanitize: 'yes' });
    ctx.info = { summary: (repaired ? `The file was damaged and has been rebuilt: ${n} page(s) recovered.` : `No damage found in the file structure; it was cleaned and saved again (${n} pages).`) + (bad ? ` ${bad} page(s) still have unreadable content.` : '') };
    return [{ name: HT.stem(f.name) + '_repaired.pdf', blob }];
  });

  // ---------------------------------------------------------------- flatten
  HT.engine('flatten-pdf', async ctx => {
    const E = await P(), m = await E.mu(), f = ctx.files[0], mode = ctx.opts.mode || 'forms';
    if (mode === 'image') {
      const src = await E.open(f), n = src.countPages(), dpi = Math.max(72, Math.min(300, +ctx.opts.dpi || 150)), out = new m.PDFDocument();
      for (let i = 0; i < n; i++) {
        ctx.status(`Flattening page ${i + 1} of ${n}...`); await E.tick();
        const page = src.loadPage(i), [x0, y0, x1, y1] = page.getBounds(), pix = page.toPixmap(m.Matrix.scale(dpi / 72, dpi / 72), m.ColorSpace.DeviceRGB, false, true);
        const ref = out.addImage(new m.Image(pix.asJPEG(88).slice())); pix.destroy(); page.destroy();
        const w = x1 - x0, h = y1 - y0;
        out.insertPage(-1, out.addPage([0, 0, w, h], 0, { XObject: { Im0: ref } }, `q ${E.num(w)} 0 0 ${E.num(h)} 0 0 cm /Im0 Do Q`));
        ctx.progress((i + 1) / n * 0.95);
      }
      ctx.info = { summary: `${n} page(s) turned into pictures: nothing in the file can be edited, filled in or copied any more.` };
      return [{ name: HT.stem(f.name) + '_flat.pdf', blob: E.save(out) }];
    }
    const doc = await E.open(f);
    let widgets = 0, annots = 0;
    for (let i = 0; i < doc.countPages(); i++) { const p = doc.loadPage(i); widgets += p.getWidgets().length; annots += p.getAnnotations().length; p.destroy(); }
    ctx.status('Flattening...'); await E.tick();
    doc.bake(ctx.opts.annots !== false && ctx.opts.annots !== 'false', true);
    ctx.info = { summary: widgets || annots ? `Flattened ${widgets} form field(s) and ${annots} comment(s)/mark(s) into the pages.` : 'This PDF had no form fields or comments to flatten; it was saved unchanged.' };
    return [{ name: HT.stem(f.name) + '_flat.pdf', blob: E.save(doc) }];
  });

  // ---------------------------------------------------------------- compare
  // Words of both PDFs are compared (Myers diff); the report lists every change with a little text around it.
  function diff(a, b) {   // -> [{ op: '=' | '-' | '+', items }]
    // the same start and end are taken off first (most documents differ in a few places), then Myers' algorithm runs on the middle
    let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const A2 = a.slice(pre, a.length - suf), B2 = b.slice(pre, b.length - suf), n = A2.length, m2 = B2.length, max = n + m2, v = new Int32Array(2 * max + 2), trace = [];
    const ops = pre ? [['=', a.slice(0, pre)]] : [];
    if (max) {
      let done = false;
      for (let d = 0; d <= max && !done; d++) {
        if (d > 3000) throw new Error('The two PDFs are too different to compare word by word (more than 3,000 changes).');
        trace.push({ off: max - d - 1, arr: v.slice(Math.max(0, max - d - 1), max + d + 2) });
        for (let k = -d; k <= d; k += 2) {
          let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1, y = x - k;
          while (x < n && y < m2 && A2[x] === B2[y]) { x++; y++; }
          v[max + k] = x;
          if (x >= n && y >= m2) { done = true; break; }
        }
      }
      const back = []; let x = n, y = m2;
      for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
        const t = trace[d], at = kk => t.arr[max + kk - Math.max(0, t.off)], k = x - y;
        const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1, px = d ? at(prevK) : 0, py = px - prevK;
        while (x > px && y > py) { back.push(['=', A2[--x]]); y--; }
        if (d > 0) { if (x === px) back.push(['+', B2[--y]]); else back.push(['-', A2[--x]]); }
      }
      back.reverse();
      for (const [op, w] of back) ops.push([op, [w]]);
    }
    if (suf) ops.push(['=', a.slice(a.length - suf)]);
    const out = [];
    for (const [op, ws] of ops) { const last = out[out.length - 1]; if (last && last.op === op) last.items.push(...ws); else out.push({ op, items: ws.slice() }); }
    return out;
  }
  async function wordsOf(E, file) {
    const doc = await E.open(file), n = doc.countPages(), words = [], pageOf = [];
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i), st = page.toStructuredText(''), t = st.asText(); st.destroy(); page.destroy();
      for (const w of t.split(/\s+/)) if (w) { words.push(w); pageOf.push(i + 1); }
      if (i % 10 === 0) await E.tick();
    }
    if (words.length > 150000) throw new Error(`'${file.name}' has too much text to compare here (over 150,000 words). Compare a smaller part.`);
    return { words, pageOf, pages: n };
  }
  HT.engine('compare-pdf', async ctx => {
    const E = await P();
    if (ctx.files.length !== 2) throw new Error('Add exactly two PDFs: the old version first, then the new one.');
    const [fa, fb] = ctx.files;
    ctx.status('Reading the first PDF...'); const A1 = await wordsOf(E, fa); ctx.progress(0.25);
    ctx.status('Reading the second PDF...'); const B1 = await wordsOf(E, fb); ctx.progress(0.5);
    if (!A1.words.length || !B1.words.length) throw new Error('One of the PDFs has no text (a scan?). Use OCR PDF on it first.');
    ctx.status('Comparing...'); await E.tick();
    const parts = diff(A1.words, B1.words);
    let ia = 0, ib = 0, added = 0, removed = 0;
    const changes = [];
    parts.forEach((p, k) => {
      if (p.op === '=') { ia += p.items.length; ib += p.items.length; return; }
      const prev = parts[k - 1], next = parts[k + 1], before = prev && prev.op === '=' ? prev.items.slice(-8).join(' ') : '', after = next && next.op === '=' ? next.items.slice(0, 8).join(' ') : '';
      const last = changes[changes.length - 1], page = p.op === '-' ? `page ${A1.pageOf[ia]} (old)` : `page ${B1.pageOf[ib]} (new)`;
      if (p.op === '-') { removed += p.items.length; ia += p.items.length; } else { added += p.items.length; ib += p.items.length; }
      if (last && last.open && p.op === '+' && last.del) { last.ins = p.items.join(' '); last.after = after; last.open = false; return; }
      changes.push(p.op === '-' ? { del: p.items.join(' '), before, after, page, open: true } : { ins: p.items.join(' '), before, after, page, open: false });
    });
    const css = 'body{font-family:sans-serif;font-size:10pt;line-height:1.45} h1{font-size:17pt;margin:0 0 4pt} .meta{color:#555;margin:0 0 12pt} .c{border:0.6pt solid #ccc;border-radius:4pt;padding:5pt 7pt;margin:0 0 7pt}'
      + ' .pg{color:#777;font-size:8.5pt} del{background:#fde0e0;color:#a11;text-decoration:line-through} ins{background:#dcf5e6;color:#075;text-decoration:none} .ctx{color:#555}';
    const body = `<h1>PDF comparison</h1><p class="meta">Old: <b>${esc(fa.name)}</b> (${A1.pages} pages, ${A1.words.length.toLocaleString('en')} words)<br>New: <b>${esc(fb.name)}</b> (${B1.pages} pages, ${B1.words.length.toLocaleString('en')} words)<br>`
      + (changes.length ? `<b>${changes.length.toLocaleString('en')}</b> change(s): ${removed.toLocaleString('en')} word(s) removed, ${added.toLocaleString('en')} word(s) added. Removed text is <del>red</del>, added text is <ins>green</ins>.` : '<b>No differences in the text.</b> (Pictures and layout are not compared.)')
      + '</p>' + changes.slice(0, 3000).map(c => `<div class="c"><div class="pg">${esc(c.page)}</div><span class="ctx">…${esc(c.before)} </span>${c.del ? `<del>${esc(c.del)}</del> ` : ''}${c.ins ? `<ins>${esc(c.ins)}</ins>` : ''}<span class="ctx"> ${esc(c.after)}…</span></div>`).join('')
      + (changes.length > 3000 ? `<p>…and ${(changes.length - 3000).toLocaleString('en')} more changes.</p>` : '');
    ctx.status('Writing the report...');
    const { blob } = await E.htmlToPdf(body, { css: '@page{margin:1.6cm} ' + css });
    ctx.info = { summary: changes.length ? `${changes.length} change(s) found: ${removed} word(s) removed, ${added} added. The report lists each one with the text around it.` : 'The text of both PDFs is the same.' };
    return [{ name: 'comparison_' + HT.stem(fa.name) + '_vs_' + HT.stem(fb.name) + '.pdf', blob }];
  });
})();
