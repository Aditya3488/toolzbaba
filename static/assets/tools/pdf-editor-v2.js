// PDF Editor v2 (the page /pdf-editor?v2). Nothing is drawn on top of the PDF: the file is opened in MuPDF (engine/pdf-live.js), every edit changes the PDF
// itself, and the page you see is that PDF drawn again. While you type in a paragraph a text box sits over it; the moment you finish, the real page replaces it.
// The editor fills the whole screen once a PDF is open: a slim bar on top (undo, zoom, pages, download), the tools in a column on the left, the properties of the
// tool or of what is selected in a strip under the bar, and the pages on the left of the page. The unit of editing is a paragraph (lines that belong together, see paragraphs() in the engine): it re-wraps to its own width and keeps its alignment.
HT.pdfEditorV2 = root => {
  const el = HT.el, ready = Promise.all([HT.loadScript('/assets/tools/fonts-helpers.js'), HT.loadScript('/assets/engine/pdf-live.js')]);
  let F = null, live = null, file = null, armed = null, saveOpts = {}, findOpen = false, findStale = false, hits = [], hi = -1, redactCount = 0, redactRev = -1, cur = 0, zoom = 1, tool = 'edit', sel = null, selObj = null, editing = null, view = null, rev = 0, hist = 0, thumbToken = 0, queue = Promise.resolve();
  const parasCache = new Map(), objsCache = new Map(), ocrCache = new Map(), prog = HT.progress(), defaults = { fontId: 'arimo', size: 14, bold: false, italic: false, color: '#111111' };
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''), rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const TOOLS = [['edit', 'Edit text', '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'], ['text', 'Add text', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'], ['select', 'Select', '<path d="M5 3l14 8-6 2-3 6z"/>'],
    ['image', 'Picture', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'], ['sticker', 'Sticker', '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.500 2.200 2 3.500 2s2.500-.5 3.500-2M9 9.500h.01M15 9.500h.01"/>'], ['highlight', 'Highlight', '<path d="M9 17l-4 1 1-4 8-8 3 3z"/><path d="M4 21h16" stroke-width="3" opacity=".4"/>'],
    ['underline', 'Underline', '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'], ['strike', 'Strike', '<path d="M5 12h14M16 7c-1-2-3-3-5-3-3 0-5 1.5-5 4M8 17c1 2 3 3 5 3 3 0 5-1.500 5-4"/>'],
    ['rect', 'Rectangle', '<rect x="4" y="6" width="16" height="12" rx="1.5"/>'], ['ellipse', 'Ellipse', '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>'], ['line', 'Line', '<path d="M5 19L19 5"/>'], ['arrow', 'Arrow', '<path d="M5 19L19 5M10 5h9v9"/>'],
    ['pen', 'Draw', '<path d="M3 17c3-8 5-8 6-3s3 5 5-1 4-5 7-1"/>'], ['note', 'Note', '<path d="M5 4h14v12H9l-4 4z"/>'],
    ['redact', 'Redact', '<rect x="3" y="8" width="18" height="8" rx="1.5" fill="currentColor"/>'], ['crop', 'Crop', '<path d="M6 2v14h14M2 6h14v14"/>'], ['sign', 'Sign', '<path d="M3 18c3-1 4-9 6-9s0 8 2 8 2-5 4-5 2 3 6 2M3 21h18"/>'],
    ['link', 'Link', '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>'], ['form', 'Fill form', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>']];
  const HINT = {
    edit: "Click a paragraph and type: it re-wraps as you type and keeps its alignment. A click elsewhere or Enter applies it, Esc cancels, Shift+Enter starts a new line. Letters the PDF's own font does not have use the closest font.",
    text: 'Click on the page and type your text. Choose the font, size and colour first.',
    select: 'Click a paragraph, picture or mark to select it: drag to move it, drag a corner to resize, change its look, or press Delete to remove it.',
    sticker: 'Pick an emoji or a stamp, then click on the page where it goes. It is put on the page as a picture: drag it, or drag a corner to resize.',
    redact: 'Drag over what must disappear for good (text, pictures, drawings). The marks are only marks until you press Apply redactions.', crop: 'Drag the part of the page you want to keep, then choose which pages to crop.', sign: 'Draw, type or choose your signature, then click where it goes.', link: 'Drag a rectangle, then give it a web address or a page number.', form: 'Click a field of the form and fill it in. The form stays a real form.',
    image: 'Choose a picture, it is put on the page. Then drag it, or drag a corner to resize.', highlight: 'Drag over text to highlight it.', underline: 'Drag over text to underline it.', strike: 'Drag over text to strike it out.',
    rect: 'Drag on the page to draw a rectangle.', ellipse: 'Drag on the page to draw an ellipse.', line: 'Drag on the page to draw a line.', arrow: 'Drag on the page to draw an arrow.', pen: 'Draw with the mouse or your finger.', note: 'Click where the note goes, then type it. It is a real note: PDF readers show it as a small icon.',
  };
  const ANN_TOOLS = new Set(['highlight', 'underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'pen']), ANN_COLOUR = { highlight: '#fff200', pen: '#111111' };

  // ------------------------------------------------------------------ the sidebar
  const list = HT.fileList({ onChange: fs => { if (!fs.length) reset(); } });
  const dz = HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Up to 200 MB. The PDF is edited in your browser and never uploaded.', onFiles: fs => { list.add(fs.slice(0, 1), false); open(fs[0]); } });
  // the tools are grouped by what they are for, and every one has a key (shown on the button and in its tip)
  const GROUPS = [['Edit', ['edit', 'text', 'select']], ['Insert', ['image', 'sticker', 'sign', 'link', 'note']], ['Mark up', ['highlight', 'underline', 'strike', 'pen', 'rect', 'ellipse', 'line', 'arrow']], ['Prepare', ['redact', 'crop', 'form']]];
  const KEYS = { edit: 'E', text: 'T', select: 'V', image: 'I', sticker: 'S', sign: 'G', link: 'K', note: 'N', highlight: 'H', underline: 'U', strike: 'X', pen: 'P', rect: 'R', ellipse: 'O', line: 'L', arrow: 'A', redact: 'D', crop: 'C', form: 'F' };
  const toolBtns = TOOLS.map(([id, label, glyph]) => el('button', { type: 'button', class: 'v2tool', 'data-t': id, title: label + ' (' + KEYS[id] + ')', 'aria-label': label + ', key ' + KEYS[id], onclick: () => setTool(id) }, HT.svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`), el('span', { text: label }), el('kbd', { text: KEYS[id] })));
  const hint = el('span', { class: 'v2hint' }), note = el('span', { class: 'v2note hidden' });
  const rail = el('div', { class: 'v2rail' }, GROUPS.map(([name, ids]) => el('div', { class: 'v2tg' }, el('div', { class: 'v2gh', text: name }), el('div', { class: 'v2tgrid' }, ids.map(id => toolBtns.find(bn => bn.dataset.t === id))))));
  // text properties: for the text you are about to add, or the paragraph that is selected
  const fontSel = el('select', { 'aria-label': 'Font', onchange: () => changed('font') }), sizeIn = el('input', { type: 'number', min: 4, max: 400, step: 0.5, 'aria-label': 'Size in points', onchange: () => changed('size') });
  const colorIn = el('input', { type: 'color', 'aria-label': 'Colour', onchange: () => changed('color') });
  const bBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'B', title: 'Bold', style: { fontWeight: 800 }, onclick: () => { bBtn.classList.toggle('on'); changed('bold'); } });
  const iBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'I', title: 'Italic', style: { fontStyle: 'italic' }, onclick: () => { iBtn.classList.toggle('on'); changed('italic'); } });
  const ALIGN = [['left', 'Align left', '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'], ['centre', 'Centre', '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'], ['right', 'Align right', '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'], ['justify', 'Justify', '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>']];
  const alignBtns = ALIGN.map(([id, t, g]) => el('button', { type: 'button', class: 'btn sec sm', 'data-a': id, title: t, 'aria-label': t, onclick: () => changed('align:' + id) }, HT.svg(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${g}</svg>`)));
  const alignRow = el('div', { class: 'v2row' }, alignBtns);
  const delBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'Delete text', onclick: () => deleteSel() });
  const propsTitle = el('span', { class: 'v2lab' }, 'Text');
  const propsCard = el('div', { class: 'v2grp hidden' }, propsTitle, el('div', { class: 'form' }, el('label', {}, 'Font', fontSel), el('div', { style: { display: 'flex', gap: '8px', alignItems: 'end' } }, el('label', { style: { flex: 1 } }, 'Size', sizeIn), el('label', {}, 'Colour', colorIn), bBtn, iBtn)), alignRow, delBtn);
  // properties of the marks you draw (highlight, shapes, lines ...) or of the mark that is selected; for a selected picture only Delete
  const acolor = el('input', { type: 'color', value: '#e5334a', 'aria-label': 'Colour', onchange: () => annChanged() }), awidth = el('input', { type: 'number', min: 1, max: 40, step: 1, value: 3, 'aria-label': 'Line width', onchange: () => annChanged() });
  const afillOn = el('input', { type: 'checkbox', 'aria-label': 'Fill the shape', onchange: () => annChanged() }), afill = el('input', { type: 'color', value: '#cfe3ff', 'aria-label': 'Fill colour', onchange: () => { afillOn.checked = true; annChanged(); } });
  const afillRow = el('div', { class: 'v2fill' }, afillOn, el('span', { text: 'Fill' }), afill);
  const aDel = el('button', { type: 'button', class: 'btn sec sm', text: 'Delete', onclick: () => deleteSel() });
  const annForm = el('div', { class: 'form' }, el('div', { style: { display: 'flex', gap: '8px', alignItems: 'end' } }, el('label', {}, 'Colour', acolor), el('label', { style: { flex: 1 } }, 'Line width', awidth)), afillRow);
  const annTitle = el('span', { class: 'v2lab' }, 'Mark'), annCard = el('div', { class: 'v2grp hidden' }, annTitle, annForm, aDel);
  const stickerCard = el('div', { class: 'v2pop hidden' });   // filled further down (emoji and stamps)
  const pb = (t, title, fn) => el('button', { class: 'btn sec sm', type: 'button', text: t, title, onclick: fn });
  const pageNote = el('span', { class: 'v2note' });
  const pagesCard = el('div', { class: 'v2pages' },
    pb('⟲', 'Rotate this page left', () => pageOp(() => live.rotatePage(cur, -90))), pb('⟳', 'Rotate this page right', () => pageOp(() => live.rotatePage(cur, 90))), pb('↑', 'Move this page up', () => pageOp(() => { live.movePage(cur, cur - 1); cur = Math.max(0, cur - 1); })),
    pb('↓', 'Move this page down', () => pageOp(() => { live.movePage(cur, cur + 1); cur = Math.min(live.count - 1, cur + 1); })), pb('＋', 'Add a blank page after this one', () => pageOp(() => { live.addBlankPage(cur); cur++; })),
    pb('🗑', 'Delete this page', () => pageOp(() => { live.deletePage(cur); cur = Math.min(cur, live.count - 1); })));

  // ------------------------------------------------------------------ the page area
  const ib = (t, title, fn) => el('button', { class: 'btn sec sm', type: 'button', text: t, title, 'aria-label': title, onclick: fn });
  const undoB = ib('↶ Undo', 'Undo (Ctrl+Z)', () => step(-1)), redoB = ib('↷ Redo', 'Redo (Ctrl+Y)', () => step(1)), zl = el('span', { class: 'help', style: { minWidth: '44px', textAlign: 'center' }, text: '100%' });
  const pl = el('span', { class: 'help', style: { minWidth: '92px', textAlign: 'center' } });
  const dlTop = el('button', { class: 'btn sm eddl', type: 'button', title: 'Download your edited PDF', text: 'Download PDF', onclick: () => download() });
  const dlBtn = dlTop;
  const closeB = el('button', { class: 'btn sec sm', type: 'button', text: '✕', title: 'Close this PDF', 'aria-label': 'Close this PDF', onclick: () => closeEditor() }), nameEl = el('span', { class: 'v2name' });
  const stage = el('div', { class: 'edstage' }), scroller = el('div', { class: 'edscroll v2scroll' }, stage), thumbs = el('div', { class: 'edthumbs' }), thumbsPanel = el('div', { class: 'v2thumbs' }, pagesCard, thumbs);
  const thumbsB = el('button', { class: 'btn sec sm', type: 'button', text: '▤', title: 'Show or hide the pages', 'aria-label': 'Show or hide the pages', onclick: () => thumbsPanel.classList.toggle('hidden') });
  const findB = el('button', { class: 'btn sec sm', type: 'button', text: '🔍 Find', title: 'Find and replace (Ctrl+F)', onclick: () => toggleFind() }), moreB = el('button', { class: 'btn sec sm', type: 'button', text: 'Tools ▾', title: 'Watermark, header and footer, crop, pages, properties, protect, export', onclick: ev => openMenu(ev.currentTarget) });
  const top = el('div', { class: 'v2top' }, closeB, nameEl, el('span', { class: 'edsep' }), undoB, redoB, el('span', { class: 'edsep' }), ib('−', 'Zoom out', () => setZoom(zoom / 1.25)), zl, ib('+', 'Zoom in', () => setZoom(zoom * 1.25)), ib('Fit', 'Fit the page to the width', () => setZoom(1)),
    el('span', { class: 'edsep' }), ib('‹', 'Previous page', () => go(cur - 1)), pl, ib('›', 'Next page', () => go(cur + 1)), findB, moreB, el('span', { class: 'v2sp' }), thumbsB, dlTop);
  const findPanel = el('div', { class: 'v2find hidden' }), redactGrp = el('div', { class: 'v2grp hidden' });
  const ctx = el('div', { class: 'v2ctx' }, propsCard, annCard, redactGrp, pageNote, note, hint, prog.el);
  const body = el('div', { class: 'v2body' }, rail, thumbsPanel, scroller, findPanel, stickerCard);
  const app = el('div', { class: 'v2app hidden', role: 'dialog', 'aria-label': 'PDF editor' }, top, ctx, body); document.body.append(app);
  // a page without real text (a scan, or letters turned into outlines): OCR (tesseract, in the browser) reads the picture of the page, and each line it finds
  // becomes a paragraph that can be changed like real text (what is under it is cleared and the new text is written in its place)
  const TESS = '/assets/vendor/tesseract/'; let ocrWorker = null, ocrLang = '', ocrLog = null;
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };
  async function getOcr(lang) {
    if (ocrWorker && ocrLang === lang) return ocrWorker; if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
    await HT.loadScript(TESS + 'tesseract.min.js');
    ocrWorker = await Tesseract.createWorker(lang, 1, { workerPath: TESS + 'worker.min.js', corePath: TESS + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'), langPath: TESS + 'lang', gzip: false, logger: m => ocrLog && ocrLog(m) });
    ocrLang = lang; return ocrWorker;
  }
  const ocrSel = el('select', { 'aria-label': 'Language of the text' }, [['eng+hin', 'English + Hindi'], ['eng', 'English'], ['hin', 'Hindi']].map(([v, t]) => el('option', { value: v, text: t })));
  const ocrMsg = el('p', { class: 'help', style: { margin: '6px 0 10px' } }), ocrBtn = el('button', { class: 'btn', type: 'button', text: 'Click here: make the text editable (OCR)', onclick: () => runOcr() });
  const ocrCard = el('div', { class: 'v2ocr hidden' }, el('b', { text: 'This page has no text you can edit yet' }), ocrMsg, el('div', { class: 'v2ocrrow' }, ocrSel, ocrBtn));
  const showOcr = on => { ocrCard.classList.toggle('hidden', !on); if (on && !ocrBtn.disabled) ocrMsg.textContent = 'It is a scan (a picture of text), or its letters were turned into outlines. Click the button to read it with OCR, then every line can be edited.'; };
  const isBlank = c => { try { const x = c.getContext('2d'), n = 40; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = x.getImageData(Math.floor((i + 0.5) * c.width / n), Math.floor((j + 0.5) * c.height / n), 1, 1).data; if (d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11 < 235) return false; } return true; } catch { return false; } };
  function sampleBox(b) {   // the colour of the letters and of the paper behind them, taken from the picture of the page
    const c = view.canvas, k = view.z * view.dpr, x0 = Math.max(0, Math.floor(b.x * k)), y0 = Math.max(0, Math.floor(b.y * k)), w = Math.min(c.width - x0, Math.ceil(b.w * k)), h = Math.min(c.height - y0, Math.ceil(b.h * k));
    if (w < 2 || h < 2) return { fg: [0.07, 0.07, 0.07], bg: [1, 1, 1] };
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data, n = d.length / 4, px = []; for (let i = 0; i < n; i++) px.push([d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11, i]);
    px.sort((a, b2) => a[0] - b2[0]); const take = Math.max(1, Math.floor(n * 0.04)); let r = 0, g = 0, bl = 0; for (let i = 0; i < take; i++) { const j = px[i][1] * 4; r += d[j]; g += d[j + 1]; bl += d[j + 2]; }
    const m = px[Math.floor(n * 0.9)][1] * 4; return { fg: [r / take / 255, g / take / 255, bl / take / 255], bg: [d[m] / 255, d[m + 1] / 255, d[m + 2] / 255] };
  }
  async function runOcr() {
    const page = cur; ocrBtn.disabled = ocrSel.disabled = true; ocrMsg.textContent = 'Starting the reader (the first time it loads about 15 MB)...';
    try {
      ocrLog = m => { if (m.status === 'recognizing text') ocrMsg.textContent = 'Reading the page... ' + Math.round((m.progress || 0) * 100) + '%'; else if (/loading/.test(m.status)) ocrMsg.textContent = 'Loading the reader... ' + Math.round((m.progress || 0) * 100) + '%'; };
      const w = await getOcr(ocrSel.value), [pw] = live.size(page), id = live.render(page, Math.min(3, 1800 / pw)), c = document.createElement('canvas'); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0);
      const res = await w.recognize(c, {}, { blocks: true }), data = res.data || {}; let lines = data.lines; if (!lines && data.blocks) lines = data.blocks.flatMap(bk => (bk.paragraphs || []).flatMap(q => q.lines || []));
      const k = pw / c.width, list = [], segs = [];
      // tesseract returns a whole row across the page as one line: cut it where the words are far apart (a different column or a label and its value)
      for (const ln of lines || []) {
        if (!ln.bbox || (ln.confidence != null && ln.confidence < 35)) continue;
        const words = (ln.words || []).filter(w => w.bbox && String(w.text || '').trim()), lh = ln.bbox.y1 - ln.bbox.y0;
        if (!words.length) { segs.push({ text: String(ln.text || '').replace(/\s+/g, ' ').trim(), x0: ln.bbox.x0, y0: ln.bbox.y0, x1: ln.bbox.x1, y1: ln.bbox.y1 }); continue; }
        let cur = null;
        for (const w of words) {
          if (cur && w.bbox.x0 - cur.x1 <= 1.2 * lh) { cur.text += ' ' + w.text.trim(); cur.x1 = w.bbox.x1; cur.y0 = Math.min(cur.y0, w.bbox.y0); cur.y1 = Math.max(cur.y1, w.bbox.y1); }
          else { cur = { text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }; segs.push(cur); }
        }
      }
      for (const sg of segs) {
        const text = sg.text.replace(/\s+/g, ' ').trim(); if (!text) continue;
        const x = sg.x0 * k, y = sg.y0 * k, w2 = (sg.x1 - sg.x0) * k, h2 = (sg.y1 - sg.y0) * k; if (w2 < 6 || h2 < 4) continue;
        let size = await live.fitSize(text, w2).catch(() => h2 / 1.25); size = Math.max(5, Math.min(90, h2 * 1.3, size)); list.push({ text, x, y, w: w2, h: h2, size, goneAt: undefined });
      }
      ocrCache.set(page, list); parasCache.clear(); ocrBtn.disabled = ocrSel.disabled = false;
      if (!list.length) { ocrMsg.textContent = 'No text was recognised on this page. Use Add text instead.'; return; }
      if (page === cur) { draw(); pageNote.textContent = list.length + ' lines were read from this page. Click one to change it (check the result: OCR is not always perfect).'; }
    } catch (e) { ocrMsg.textContent = 'Could not read this page: ' + (e && e.message || e); ocrBtn.disabled = ocrSel.disabled = false; }
  }
  function ocrParas(i) {
    return (ocrCache.get(i) || []).filter(r => r.goneAt == null || hist < r.goneAt).map((r, n) => {
      const sm = view && i === cur ? sampleBox({ x: r.x, y: r.y, w: r.w, h: r.h }) : { fg: [0.07, 0.07, 0.07], bg: [1, 1, 1] }, oy = r.y + r.h * 0.82, chars = [...r.text].map(c => ({ c, name: null, size: r.size, color: sm.fg, bold: false, italic: false, mono: false, serif: false })), runs = [{ text: r.text, name: null, size: r.size, color: sm.fg, bold: false, italic: false }];
      const line = { bbox: { x: r.x, y: r.y, w: r.w, h: r.h }, ox: r.x, oy, size: r.size, text: r.text, chars, runs, horizontal: true, editable: true };
      return { id: 'o' + n, ocr: true, raw: r, bg: sm.bg, lines: [line], text: r.text, x: r.x, right: r.x + r.w, width: r.w, indent: 0, lineH: r.size * 1.2, oy, size: r.size, chars, runs, align: 'left', wrap: false, bbox: { x: r.x, y: r.y, w: r.w, h: r.h } };
    });
  }
  const intro = el('div', { class: 'v2intro' }, dz, list.el); root.append(intro);
  const showApp = on => { app.classList.toggle('hidden', !on); document.documentElement.classList.toggle('v2-open', on); };
  function closeEditor() { finishEditNow(); if (live && rev > 0 && !confirm('Close this PDF? The changes you did not download are lost.')) return; list.clear(); }

  // ------------------------------------------------------------------ opening
  function reset() {
    editing = null; sel = null; view = null; live = file = null; parasCache.clear(); objsCache.clear(); ocrCache.clear(); rev = 0; hist = 0; selObj = null; thumbToken++; stickerCard.classList.add('hidden'); propsCard.classList.add('hidden'); annCard.classList.add('hidden'); showApp(false); stage.textContent = ''; thumbs.textContent = ''; prog.clear();
  }
  async function open(f, pw) {
    prog.clear();
    try { await ready; F = HT.fonts; await F.ready(); live = await HT.pdfLive.open(f, pw); }
    catch (e) { if (e && (e.message === 'PASSWORD' || e.message === 'WRONGPASSWORD')) return askPassword(f, e.message === 'WRONGPASSWORD'); return HT.toast(e.message || 'Could not open this PDF.'); }
    file = f; cur = 0; zoom = 1; rev = 0; hist = 0; ocrCache.clear(); objsCache.clear(); sel = selObj = editing = null; parasCache.clear();
    if (!fontSel.options.length) for (const ft of F.list) fontSel.append(el('option', { value: ft.id, text: ft.name }));
    fontSel.value = defaults.fontId; sizeIn.value = defaults.size; colorIn.value = defaults.color;
    live.extraParas = i => ocrParas(i); live.styleHook = async (p, i, region) => { if (i !== cur || !view) return null; let m; if (region) { const key = 'r|' + cur + '|' + Math.round(region.x) + '|' + Math.round(region.y) + '|' + region.text; if (!matchCache.has(key)) { let r = null; try { r = await matchStyle({ bbox: { x: region.x, y: region.y, w: region.w, h: region.h }, text: region.text }); } catch { } matchCache.set(key, r); } m = matchCache.get(key); } else { await ensureMatch(p); m = p.match; } return m ? { fontId: m.fontId, bold: m.bold, italic: m.italic, ...(p.ocr ? { size: m.size } : {}) } : null; }; nameEl.textContent = f.name; thumbsPanel.classList.toggle('hidden', innerWidth < 900); showApp(true); setTool('edit'); try { if (live.widgets(0).some(w => !w.readOnly)) { setTool('form'); } } catch { } draw(); buildThumbs();
  }
  const fitWidth = () => Math.max(260, Math.min(1400, (scroller.clientWidth || 800) - 56));

  // a PDF with a password asks for it (the password only opens the file here, in this browser)
  function askPassword(f, wrong) {
    const pw = el('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Password' }); let ok = false;
    const d = dialog({ title: 'This PDF has a password', body: el('div', { class: 'v2form' }, el('label', { class: 'v2f wide' }, el('span', { text: wrong ? 'That was not the password. Try again.' : 'Type the password to open it.' }), pw)), apply: 'Open', onApply: async () => { if (!pw.value) throw new Error('Type the password.'); ok = true; setTimeout(() => open(f, pw.value), 0); } });
    setTimeout(() => pw.focus(), 50); pw.addEventListener('keydown', ev => { if (ev.key === 'Enter') document.querySelector('.v2dact .btn:not(.sec)').click(); }); void d; void ok;
  }

  // ------------------------------------------------------------------ drawing the page from the PDF
  function parasOf(i) { const k = rev + ':' + i; if (!parasCache.has(k)) parasCache.set(k, [...live.paragraphs(i), ...ocrParas(i)]); return parasCache.get(k); }
  // the pictures and the marks (real annotations) of a page
  const objsOf = i => { const k = rev + ':' + i; if (!objsCache.has(k)) objsCache.set(k, { pics: live.pictures(i), anns: live.annots(i), forms: live.widgets(i) }); return objsCache.get(k); };
  function draw() {
    if (!live) return; finishEditNow();
    const [w, h] = live.size(cur), z = (fitWidth() / w) * zoom, dpr = Math.min(2, window.devicePixelRatio || 1), id = live.render(cur, z * dpr);
    const canvas = el('canvas', { class: 'edpage' }); canvas.width = id.width; canvas.height = id.height; canvas.style.width = w * z + 'px'; canvas.style.height = h * z + 'px'; canvas.getContext('2d').putImageData(id, 0, 0);
    const layer = el('div', { class: 'edlayer t-' + tool }); layer.addEventListener('pointerdown', onLayerDown);
    stage.textContent = ''; stage.style.width = w * z + 'px'; stage.style.height = h * z + 'px'; stage.append(canvas, layer, ocrCard); view = { z, w, h, dpr, canvas, layer, blank: isBlank(canvas) };
    zl.textContent = Math.round(zoom * 100) + '%'; updateBar(); drawBlocks(); if (findOpen) { if (findStale) { findStale = false; runFind(true); } else paintHits(); }
  }
  function drawBlocks() {
    const z = view.z, ps = parasOf(cur), L = objsOf(cur), mkBox = (r, cls, title) => { const d = el('div', { class: cls, title }); Object.assign(d.style, { left: r.x * z - 2 + 'px', top: r.y * z - 1 + 'px', width: Math.max(8, r.w * z + 4) + 'px', height: Math.max(8, r.h * z + 2) + 'px' }); return d; };
    pageNote.textContent = ''; showOcr(!ps.length && !view.blank);
    if (tool === 'select') for (const pc of L.pics) { const d = mkBox(pc.bbox, 'edblock hov edobj', 'Picture'); d.addEventListener('pointerdown', e => onObjDown(e, 'pic', pc)); view.layer.append(d); }
    if (tool === 'edit' || tool === 'select') for (const p of ps) {
      const b = mkBox(p.bbox, 'edblock hov', p.text.slice(0, 60)); b.dataset.id = p.id; b.addEventListener('pointerdown', e => onBlockDown(e, p)); view.layer.append(b);
    }
    if (tool === 'form') drawForm(L.forms);
    if (tool === 'select') for (const a of L.anns) { const d = mkBox(a.rect, 'edblock hov edobj', a.type); d.addEventListener('pointerdown', e => onObjDown(e, 'ann', a)); view.layer.append(d); }
    drawSel();
  }
  const rectOf = (kind, o) => kind === 'pic' ? o.bbox : o.rect, resizable = so => so.kind === 'pic' || so.o.type === 'Square' || so.o.type === 'Circle' || so.o.type === 'Stamp';
  function drawSel() {
    if (!view) return; view.layer.querySelectorAll('.edsel').forEach(n => n.remove());
    const z = view.z, mk = r => { const b = el('div', { class: 'edsel' }); Object.assign(b.style, { left: r.x * z - 2 + 'px', top: r.y * z - 1 + 'px', width: r.w * z + 4 + 'px', height: r.h * z + 2 + 'px' }); view.layer.append(b); return b; };
    if (sel && tool === 'select') mk(sel.bbox);
    if (selObj && tool === 'select') {
      const b = mk(rectOf(selObj.kind, selObj.o));
      if (resizable(selObj)) for (const c of ['nw', 'ne', 'sw', 'se']) { const h = el('div', { class: 'edh2 ' + c }); h.addEventListener('pointerdown', e => startResize(e, c)); b.append(h); }
    }
    renderProps();
  }
  function updateBar() {
    if (live && redactRev !== rev) { redactRev = rev; redactCount = live.countRedactions(); } redactGrp.classList.toggle('hidden', !redactCount); if (redactCount) { redactGrp.textContent = ''; redactGrp.append(el('span', { class: 'v2lab', text: redactCount + ' mark' + (redactCount > 1 ? 's' : '') + ' for redaction' }), el('button', { class: 'btn sm', type: 'button', text: 'Apply redactions', onclick: () => applyRedactionsDialog() })); }
    undoB.disabled = !live || !live.canUndo(); redoB.disabled = !live || !live.canRedo(); pl.textContent = live ? 'Page ' + (cur + 1) + ' / ' + live.count : '';
    thumbs.querySelectorAll('.edth').forEach((t, i) => t.classList.toggle('on', i === cur));
  }
  const go = n => { if (!live || n < 0 || n >= live.count || n === cur) return; cur = n; sel = null; draw(); };
  const setZoom = z => { zoom = Math.max(0.4, Math.min(4, z)); if (live) draw(); };
  function setTool(t) {
    finishEditNow(); tool = t; sel = null; selObj = null; toolBtns.forEach(b => b.classList.toggle('on', b.dataset.t === t)); hint.textContent = HINT[t]; hint.title = HINT[t];
    if (ANN_TOOLS.has(t)) { acolor.value = ANN_COLOUR[t] || '#e5334a'; awidth.value = t === 'pen' ? 2 : t === 'highlight' ? 1 : 3; afillRow.classList.toggle('hidden', !(t === 'rect' || t === 'ellipse')); annForm.classList.remove('hidden'); }
    stickerCard.classList.toggle('hidden', t !== 'sticker' || !live); if (t !== 'sticker') armed = null; else stNow.textContent = armed ? stNow.textContent : 'Nothing chosen yet.';
    if (view) view.layer.className = 'edlayer t-' + t;
    if (live && view) { view.layer.querySelectorAll('.edblock,.edsel,.edobj').forEach(n => n.remove()); drawBlocks(); }
    if (t === 'image') picIn.click(); else if (t === 'sign') { if (!armed || armed.kind !== 'sig') signDialog(); }
  }

  // ------------------------------------------------------------------ the pages strip
  function buildThumbs() {
    const my = ++thumbToken; thumbs.textContent = ''; if (!live) return;
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting && e.target._stale) { e.target._stale = false; paint(e.target); } }, { root: thumbs, rootMargin: '200px' });
    for (let i = 0; i < live.count; i++) {
      const [w, h] = live.size(i), c = el('canvas'); c.width = 96; c.height = Math.max(40, Math.round(96 * h / w)); c._i = i; c._stale = true; c.style.width = '72px';
      const box = el('button', { type: 'button', class: 'edth' + (i === cur ? ' on' : ''), title: 'Page ' + (i + 1), onclick: () => go(i) }, c, el('span', { text: String(i + 1) })); thumbs.append(box); io.observe(c);
    }
    function paint(c) { if (my !== thumbToken || !live || c._i >= live.count) return; try { const [w] = live.size(c._i), id = live.render(c._i, 96 / w); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); } catch { } }
  }
  function refreshThumbs() {
    const t = thumbs.getBoundingClientRect();
    thumbs.querySelectorAll('canvas').forEach(c => {
      const r = c.getBoundingClientRect(), vis = r.bottom > t.top - 200 && r.top < t.bottom + 200;
      if (!vis) { c._stale = true; return; } c._stale = false;
      try { const [w] = live.size(c._i), id = live.render(c._i, 96 / w); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); } catch { }
    });
  }

  // ------------------------------------------------------------------ doing things to the PDF, one at a time
  const toast = HT.toast;
  function fail(e) {
    if (e && e.message === 'INDIC') { note.classList.remove('hidden'); note.textContent = ''; note.append('Hindi and other Indian scripts can not be written in this new editor yet. ', el('a', { href: '#', text: 'Use the classic editor for them.', onclick: ev => { ev.preventDefault(); openClassic(); } })); return toast('Indian scripts are not supported here yet.'); }
    if (e && e.message === 'SCRIPT') return toast('Arabic, Hebrew and Thai text can not be written in this editor yet (the letters change shape and order).');
    toast((e && e.message) || 'Something went wrong.');
  }
  function mutate(fn, ocrP) {
    queue = queue.then(async () => {
      try {
        await fn(); rev++; hist++; findStale = true; parasCache.clear(); objsCache.clear();
        for (const list of ocrCache.values()) for (const r of list) if (r.goneAt != null && r.goneAt >= hist) r.goneAt = undefined;   // lines whose edit was undone and then replaced by another edit
        if (ocrP && ocrP.raw) ocrP.raw.goneAt = hist; draw(); refreshThumbs();
      } catch (e) { fail(e); draw(); }
    }); return queue;
  }
  function pageOp(fn) { return mutate(async () => { fn(); }).then(() => { buildThumbs(); }); }
  const step = d => { finishEditNow(); queue = queue.then(() => { if (d < 0 ? live.canUndo() : live.canRedo()) { d < 0 ? live.undo() : live.redo(); hist += d < 0 ? -1 : 1; rev++; findStale = true; parasCache.clear(); objsCache.clear(); cur = Math.min(cur, live.count - 1); sel = null; draw(); buildThumbs(); } }); };

  // ------------------------------------------------------------------ the look of text whose font can not be reused
  // Text that was turned into outlines, a scan, or a Type 3 font has no usable font. So the look is found by comparing: the line is drawn in the fonts of the
  // library (regular and bold) at the width of the original, and the one that looks most like the picture of the page wins. New letters then match the old ones.
  const matchCache = new Map(), CANDS = ['arimo', 'inter', 'roboto', 'open-sans', 'poppins', 'tinos', 'cousine'];
  const inkBox = (ink, w, h, thr) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }; };
  const gridOf = (ink, w, b, gw, gh) => { const g = new Float32Array(gw * gh), n = new Float32Array(gw * gh), bw = b.x1 - b.x0, bh = b.y1 - b.y0; for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const k = Math.min(gh - 1, Math.floor((y - b.y0) * gh / bh)) * gw + Math.min(gw - 1, Math.floor((x - b.x0) * gw / bw)); g[k] += ink[y * w + x]; n[k]++; } for (let k = 0; k < g.length; k++) g[k] = n[k] ? g[k] / n[k] : 0; return g; };
  async function matchStyle(l) {
    const s2 = view.z * view.dpr, bb = l.bbox, c = view.canvas, text = l.text.trim(); if (!text) return null;
    const x0 = Math.max(0, Math.floor(bb.x * s2) - 2), y0 = Math.max(0, Math.floor(bb.y * s2) - 2), cw = Math.min(c.width - x0, Math.ceil(bb.w * s2) + 4), ch = Math.min(c.height - y0, Math.ceil(bb.h * s2) + 4); if (cw < 8 || ch < 6) return null;
    const src = c.getContext('2d').getImageData(x0, y0, cw, ch).data, lum = i => src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11, border = [];
    for (let x = 0; x < cw; x++) { border.push(lum(x * 4)); border.push(lum(((ch - 1) * cw + x) * 4)); } for (let y = 0; y < ch; y++) { border.push(lum(y * cw * 4)); border.push(lum((y * cw + cw - 1) * 4)); }
    border.sort((a, b) => a - b); const bg = border[border.length >> 1], ink = new Float32Array(cw * ch); let md = 1; for (let k = 0; k < ink.length; k++) { ink[k] = Math.abs(lum(k * 4) - bg); if (ink[k] > md) md = ink[k]; } for (let k = 0; k < ink.length; k++) ink[k] /= md;
    const kb = inkBox(ink, cw, ch, 0.4); if (!kb) return null; const kw = kb.x1 - kb.x0, kh = kb.y1 - kb.y0, gw = 48, gh = Math.max(6, Math.min(24, Math.round(gw * kh / kw))), kg = gridOf(ink, cw, kb, gw, gh);
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }); let best = null;
    for (const id of CANDS) for (const bold of [false, true]) {
      if (!F.map[id] || (bold && !F.has(id, 'bold'))) continue; try { await F.load(id, bold, false); } catch { continue; }
      const fam = `"${F.family(id)}"`, wt = bold ? 700 : 400; cx.font = `${wt} 100px ${fam}`; const w100 = cx.measureText(text).width; if (!w100) continue;
      const px = bb.w * s2 * 100 / w100; cv.width = Math.ceil(bb.w * s2) + 24; cv.height = Math.ceil(px * 2) + 12; cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.fillStyle = '#000'; cx.font = `${wt} ${px}px ${fam}`; cx.textBaseline = 'alphabetic'; cx.fillText(text, 4, px * 1.3);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data, ci = new Float32Array(cv.width * cv.height); for (let k = 0; k < ci.length; k++) ci[k] = (255 - (d[k * 4] * 0.3 + d[k * 4 + 1] * 0.59 + d[k * 4 + 2] * 0.11)) / 255;
      const cb = inkBox(ci, cv.width, cv.height, 0.4); if (!cb) continue; const cwid = cb.x1 - cb.x0, chei = cb.y1 - cb.y0, g2 = gridOf(ci, cv.width, cb, gw, gh); let mae = 0; for (let k = 0; k < g2.length; k++) mae += Math.abs(g2[k] - kg[k]); mae /= g2.length;
      const score = mae + 0.8 * Math.abs(Math.log((cwid / chei) / (kw / kh))) + (id === 'tinos' || id === 'cousine' ? 0.05 : 0); if (window.__v2dbg) (window.__v2dbg.rows = window.__v2dbg.rows || []).push([text.slice(0, 20), id, bold, +mae.toFixed(3), +score.toFixed(3)]); if (!best || score < best.score) best = { score, fontId: id, bold, italic: false, size: px / s2 };
    }
    return best;
  }
  async function ensureMatch(p) {
    if (p.reuse || p.match) return; const l = p.lines[0], key = cur + '|' + l.text.slice(0, 40) + '|' + Math.round(l.bbox.x) + '|' + Math.round(l.bbox.y);
    if (!matchCache.has(key)) { let m = null; try { m = await matchStyle(l); } catch { } matchCache.set(key, m); } p.match = matchCache.get(key);
  }
  // what a paragraph looks like now (for the box you type in and the text properties)
  const look = p => { if (p.match) return { fontId: p.match.fontId, bold: p.match.bold, italic: p.match.italic }; const r0 = p.runs[0], g = HT.pdfLive.guessFont(r0.name, r0); return { fontId: g.id, bold: !!(r0.bold || g.bold), italic: !!(r0.italic || g.italic) }; };
  // the style that keeps the matched look when a paragraph is written again
  const keep = (p, opts = {}) => { if (p.reuse || !p.match) return opts; return { ...opts, style: { fontId: p.match.fontId, bold: p.match.bold, italic: p.match.italic, ...(p.ocr ? { size: p.match.size } : {}), ...(opts.style || {}) } }; };

  // ------------------------------------------------------------------ typing into a paragraph
  const pageColour = (x, y) => { try { const d = view.canvas.getContext('2d').getImageData(Math.max(0, Math.round(x * view.dpr)), Math.max(0, Math.round(y * view.dpr)), 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; } catch { return '#fff'; } };
  function box(css, text, font) {
    const b = el('div', { class: 'v2in', contenteditable: 'plaintext-only', spellcheck: 'false', role: 'textbox', 'aria-label': 'Text' }); b.textContent = text;
    F.load(font.id, font.bold, font.italic).then(() => { b.style.fontFamily = `"${F.family(font.id)}", sans-serif`; }).catch(() => { });
    b.style.fontFamily = `"${F.family(font.id)}", sans-serif`; b.style.fontWeight = font.bold ? 700 : 400; b.style.fontStyle = font.italic ? 'italic' : 'normal'; Object.assign(b.style, css);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); } else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); } e.stopPropagation(); });
    b.addEventListener('blur', () => setTimeout(() => editing && editing.b === b && finishEdit(true), 60)); b.addEventListener('pointerdown', e => e.stopPropagation());
    return b;
  }
  const CSSALIGN = { left: 'left', centre: 'center', right: 'right', justify: 'justify' };
  async function startEdit(p) {
    finishEditNow(); await ensureMatch(p); if (editing) return; const z = view.z, r0 = p.runs[0], g0 = look(p), g = { id: g0.fontId, bold: g0.bold, italic: g0.italic }, first = p.lines[0], wrap = p.wrap, sz = p.ocr && p.match ? p.match.size : p.size;
    const b = box({ left: (wrap ? p.x : p.bbox.x) * z - 3 + 'px', top: p.bbox.y * z + 'px', minHeight: first.bbox.h * z + 'px', width: wrap ? p.width * z + 6 + 'px' : 'auto', minWidth: p.bbox.w * z + 6 + 'px', fontSize: sz * z + 'px', lineHeight: p.lineH * z + 'px',
      color: hex(r0.color), background: pageColour(p.bbox.x * z - 4, p.bbox.y * z + first.bbox.h * z / 2), whiteSpace: wrap ? 'pre-wrap' : 'pre', textAlign: CSSALIGN[p.align] || 'left', textIndent: wrap ? p.indent * z + 'px' : '0' }, p.text, g);
    view.layer.append(b); editing = { kind: 'para', p, b }; sel = null; focusEnd(b);
  }
  function startAdd(x, y) {
    finishEditNow(); const z = view.z, st = readProps(), b = box({ left: x * z - 3 + 'px', top: y * z + 'px', minWidth: '40px', fontSize: st.size * z + 'px', lineHeight: st.size * z * 1.2 + 'px', color: st.color, background: 'rgba(255,255,255,.55)', whiteSpace: 'pre' }, '', { id: st.fontId, bold: st.bold, italic: st.italic });
    view.layer.append(b); editing = { kind: 'add', x, y, b }; focusEnd(b);
  }
  function focusEnd(b) { b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  const textOf = b => b.innerText.replace(/\r\n/g, '\n').replace(/\n+$/g, '');
  function finishEditNow() { if (editing) finishEdit(true); }
  function finishEdit(apply) {
    const e = editing; if (!e) return; editing = null; const text = textOf(e.b); e.b.remove();
    if (!apply) return;
    if (e.kind === 'para') { if (text !== e.p.text && text.trim()) mutate(() => live.editParagraph(cur, e.p, text, keep(e.p)), e.p); else if (!text.trim() && e.p.text.trim()) mutate(() => live.deleteParagraph(cur, e.p), e.p); }
    else if (e.kind === 'note') { if (text.trim()) mutate(() => live.addAnnot(cur, { kind: 'note', x: e.x, y: e.y, text })); }
    else if (text.trim()) { const st = readProps(); mutate(() => live.addText(cur, { x: e.x, y: e.y + st.size * 0.9, size: st.size, color: rgb(st.color), text, fontId: st.fontId, bold: st.bold, italic: st.italic })); }
  }

  // ------------------------------------------------------------------ pointer: click to edit, click to select, drag to move
  function ptOf(e) { const r = view.layer.getBoundingClientRect(); return { x: (e.clientX - r.left) / view.z, y: (e.clientY - r.top) / view.z }; }
  function onBlockDown(e, p) {
    if (e.button) return; e.preventDefault(); e.stopPropagation();
    if (tool === 'edit') return startEdit(p);
    if (tool !== 'select') return;
    sel = p; selObj = null; drawSel(); if (!p.reuse && !p.match) ensureMatch(p).then(() => { if (sel === p) renderProps(); }); const start = ptOf(e); let moved = false, dx = 0, dy = 0; const sb = view.layer.querySelector('.edsel');
    const mv = ev => { const q = ptOf(ev); dx = q.x - start.x; dy = q.y - start.y; if (!moved && Math.hypot(dx, dy) * view.z < 4) return; moved = true; if (sb) sb.style.transform = `translate(${dx * view.z}px,${dy * view.z}px)`; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (moved) moveSel(dx, dy); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function onLayerDown(e) {
    if (e.button || e.target !== view.layer) return;
    if (tool === 'text') { e.preventDefault(); const q = ptOf(e); startAdd(q.x, q.y); }
    else if (tool === 'note') { e.preventDefault(); const q = ptOf(e); startNote(q.x, q.y); }
    else if (tool === 'sticker') { e.preventDefault(); const q = ptOf(e); placeSticker(q.x, q.y); }
    else if (tool === 'highlight' || tool === 'underline' || tool === 'strike') { e.preventDefault(); beginTextMark(e); }
    else if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') { e.preventDefault(); beginShape(e); }
    else if (tool === 'pen') { e.preventDefault(); beginPen(e); }
    else if (tool === 'sign') { e.preventDefault(); if (armed && armed.kind === 'sig') { const q = ptOf(e); placeSignature(q.x, q.y); } else signDialog(); }
    else if (tool === 'redact' || tool === 'crop' || tool === 'link') { e.preventDefault(); beginArea(e); }
    else if (tool === 'select' && (sel || selObj)) { sel = null; selObj = null; drawSel(); }
  }
  // ---- pointer drags
  function drag(mv, up) { const m = ev => mv(ptOf(ev)), u = ev => { removeEventListener('pointermove', m); removeEventListener('pointerup', u); removeEventListener('pointercancel', u); up(ptOf(ev)); }; addEventListener('pointermove', m); addEventListener('pointerup', u); addEventListener('pointercancel', u); }
  const SVGNS = 'http://www.w3.org/2000/svg', sv = (tag, a = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  const annStyle = () => ({ color: rgb(acolor.value), width: +awidth.value || 2, fill: afillOn.checked && !afillRow.classList.contains('hidden') ? rgb(afill.value) : [] });
  const previewSvg = () => { const v = sv('svg', { width: view.w * view.z, height: view.h * view.z, style: 'position:absolute;left:0;top:0;pointer-events:none' }); view.layer.append(v); return v; };
  function beginTextMark(e) {
    const a = ptOf(e), z = view.z, st = annStyle(), svg = previewSvg(), kind = tool; let quads = [], raf = 0;
    const paint = () => { svg.textContent = ''; for (const q of quads) svg.append(sv('polygon', { points: [0, 1, 3, 2].map(k => q[k * 2] * z + ',' + q[k * 2 + 1] * z).join(' '), fill: hex(st.color), 'fill-opacity': kind === 'highlight' ? 0.45 : 0.25 })); };
    drag(q => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { quads = live.textQuads(cur, [a.x, a.y], [q.x, q.y]); paint(); }); },
      q => { cancelAnimationFrame(raf); quads = live.textQuads(cur, [a.x, a.y], [q.x, q.y]); svg.remove(); if (quads.length) mutate(() => live.addAnnot(cur, { kind, quads, color: st.color, opacity: kind === 'highlight' ? 0.45 : undefined })); });
  }
  function beginShape(e) {
    const a = ptOf(e), z = view.z, st = annStyle(), svg = previewSvg(), kind = tool; let b = a;
    const paint = () => {
      svg.textContent = ''; const x = Math.min(a.x, b.x) * z, y = Math.min(a.y, b.y) * z, w = Math.abs(b.x - a.x) * z, h = Math.abs(b.y - a.y) * z, c = { stroke: hex(st.color), 'stroke-width': st.width * z, fill: st.fill.length ? hex(st.fill) : 'none' };
      svg.append(kind === 'rect' ? sv('rect', { x, y, width: w, height: h, ...c }) : kind === 'ellipse' ? sv('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...c }) : sv('line', { x1: a.x * z, y1: a.y * z, x2: b.x * z, y2: b.y * z, stroke: hex(st.color), 'stroke-width': st.width * z }));
    };
    drag(q => { b = q; paint(); }, q => {
      b = q; svg.remove(); const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (kind === 'rect' || kind === 'ellipse') { if (w < 3 || h < 3) return; mutate(() => live.addAnnot(cur, { kind, rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h }, ...st })); }
      else { if (Math.hypot(w, h) < 4) return; mutate(() => live.addAnnot(cur, { kind, p1: [a.x, a.y], p2: [b.x, b.y], ...st })); }
    });
  }
  function beginPen(e) {
    const a = ptOf(e), z = view.z, st = annStyle(), svg = previewSvg(), pts = [[a.x, a.y]], pl2 = sv('polyline', { fill: 'none', stroke: hex(st.color), 'stroke-width': st.width * z, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); svg.append(pl2);
    const add = q => { const l = pts[pts.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) < 0.8) return; pts.push([q.x, q.y]); pl2.setAttribute('points', pts.map(v => v[0] * z + ',' + v[1] * z).join(' ')); };
    drag(add, q => { add(q); svg.remove(); if (pts.length > 1) mutate(() => live.addAnnot(cur, { kind: 'ink', points: pts, ...st })); });
  }
  function startNote(x, y) {
    finishEditNow(); const z = view.z, b = box({ left: x * z - 3 + 'px', top: y * z + 'px', minWidth: '140px', fontSize: 13 * z + 'px', lineHeight: 13 * z * 1.3 + 'px', color: '#111', background: '#fff6b8', whiteSpace: 'pre-wrap' }, '', { id: 'arimo', bold: false, italic: false });
    view.layer.append(b); editing = { kind: 'note', x, y, b }; focusEnd(b);
  }
  // ---- stickers: emoji and stamps. They are drawn to a picture with a transparent background and put on the page like any other picture.
  const EMOJI = {
    'Faces': '😀 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 😉 🙂 😇 🤗 🤔 😐 🙄 😴 😮 😱 😢 😭 😡 🥺 😅 🤯 😜 🤪 🥰 😏'.split(' '),
    'Hands': '👍 👎 👏 🙌 🙏 👌 ✌️ 🤞 🤝 💪 👋 ☝️ 👈 👉 👆 👇 ✍️ 🫶'.split(' '),
    'Symbols': '✅ ❌ ✔️ ✖️ ⭐ 🌟 ✨ 🔥 ⚠️ ❓ ❗ ➡️ ⬅️ ⬆️ ⬇️ 💯 🆗 🆕 🔴 🟢 🔵 🟡 ⛔ 🚫 ➕ ➖ ©️ ®️ ™️ ☑️'.split(' '),
    'Hearts': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💖 💕 💘 💝'.split(' '),
    'Things': '📌 📎 ✏️ 📝 📅 📞 📧 💰 💳 🏠 🚗 ✈️ 🎁 🏆 🔔 💡 🔒 🔑 📷 🎓 📚 🛒 ⏰ 🎉 🎈 🏷️ 📦 🖊️ 📍'.split(' '),
    'Nature': '☀️ 🌙 ⭐ 🌈 ☁️ ⚡ ❄️ 🌸 🌹 🌳 🍀 🍎 🍕 🍔 ☕ 🎂 🐶 🐱 🦋 🐝'.split(' '),
  };
  const STAMPS = [['APPROVED', '#16a34a'], ['REJECTED', '#dc2626'], ['PAID', '#16a34a'], ['DRAFT', '#2563eb'], ['CONFIDENTIAL', '#dc2626'], ['URGENT', '#dc2626'], ['COPY', '#2563eb'], ['ORIGINAL', '#16a34a'], ['REVIEWED', '#7c3aed'], ['VOID', '#dc2626']];
  const toPng = c => new Promise(r => c.toBlob(async b => r(new Uint8Array(await b.arrayBuffer())), 'image/png'));
  async function emojiPng(ch) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '200px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif'; x.fillText(ch, S / 2, S / 2 + 12);
    return { bytes: await toPng(c), ratio: 1 };
  }
  async function stampPng(text, colour) {
    const W = 760, H = 260, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.strokeStyle = colour; x.fillStyle = colour; x.lineWidth = 14; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 130px "Arial Black","Arial",sans-serif';
    let size = 130; while (x.measureText(text).width > W - 110 && size > 40) { size -= 6; x.font = `800 ${size}px "Arial Black","Arial",sans-serif`; }
    const r = 36; x.beginPath(); x.moveTo(14 + r, 14); x.arcTo(W - 14, 14, W - 14, H - 14, r); x.arcTo(W - 14, H - 14, 14, H - 14, r); x.arcTo(14, H - 14, 14, 14, r); x.arcTo(14, 14, W - 14, 14, r); x.closePath(); x.stroke(); x.fillText(text, W / 2, H / 2 + 6);
    return { bytes: await toPng(c), ratio: W / H };
  }
  let emojiCat = 'Faces';
  const stGrid = el('div', { class: 'v2emo' }), stCats = el('div', { class: 'v2cats' });
  const stStamps = el('div', { class: 'v2stamps' }, STAMPS.map(([t, col]) => el('button', { type: 'button', class: 'v2stamp', style: { color: col, borderColor: col }, text: t, onclick: ev => arm({ kind: 'stamp', text: t, colour: col }, ev.currentTarget) })));
  const stNow = el('div', { class: 'help', style: { marginTop: '8px' }, text: 'Nothing chosen yet.' });
  function fillEmoji() {
    stGrid.textContent = ''; stCats.textContent = '';
    for (const k of Object.keys(EMOJI)) stCats.append(el('button', { type: 'button', class: 'btn sec sm' + (k === emojiCat ? ' on' : ''), text: k, onclick: () => { emojiCat = k; fillEmoji(); } }));
    for (const ch of EMOJI[emojiCat]) stGrid.append(el('button', { type: 'button', class: 'v2e', text: ch, title: ch, onclick: ev => arm({ kind: 'emoji', ch }, ev.currentTarget) }));
  }
  function arm(a, btn) { armed = a; setTimeout(() => { stickerCard.classList.add('hidden'); hint.textContent = (a.kind === 'emoji' ? a.ch : a.text) + ' is ready: click on the page where it goes.'; }, 0); stickerCard.querySelectorAll('.armed').forEach(n => n.classList.remove('armed')); btn.classList.add('armed'); stNow.textContent = (a.kind === 'emoji' ? a.ch : a.text) + ' is ready: click on the page to place it.'; }
  stickerCard.append(el('b', { text: 'Stickers' }), stCats, stGrid, el('div', { class: 'help', style: { margin: '10px 0 6px' }, text: 'Stamps' }), stStamps, stNow); fillEmoji();
  function selectNewStamp(r) { const L = objsOf(cur), best = L.anns.filter(a => a.type === 'Stamp').map(o => ({ o, d: Math.hypot(o.rect.x - r.x, o.rect.y - r.y) })).sort((p1, p2) => p1.d - p2.d)[0]; if (best && best.d < 8) { selObj = { kind: 'ann', o: best.o }; drawSel(); } }
  async function placeSticker(x, y) {
    if (!armed) return toast('Choose a sticker first.');
    const a = armed, img = a.kind === 'emoji' ? await emojiPng(a.ch) : await stampPng(a.text, a.colour), w = a.kind === 'emoji' ? 56 : 170, h = w / img.ratio, [pw, ph] = live.size(cur);
    const r = { x: Math.max(0, Math.min(pw - w, x - w / 2)), y: Math.max(0, Math.min(ph - h, y - h / 2)), w, h };
    await mutate(() => live.addAnnot(cur, { kind: 'stamp', rect: r, bytes: img.bytes })); setTool('select'); selectNewStamp(r);
  }
  // ================================================================== more of what Acrobat does
  // dialogs, find and replace, watermark, header and footer, page numbers, crop, redaction, signature, links, forms, pages, properties, protect, export
  const parseRange = (txt, count) => {
    const t = String(txt || '').trim().toLowerCase(); if (!t || t === 'all') return [...Array(count).keys()]; if (t === 'current') return [cur]; const out = new Set();
    for (const part of t.split(/[,\s]+/).filter(Boolean)) { const m = /^(\d+)(?:-(\d*))?$/.exec(part); if (!m) throw new Error('"' + part + '" is not a page number or a range like 2-5.'); const a = +m[1], b = m[2] === undefined ? a : m[2] === '' ? count : +m[2]; if (a < 1 || b < a || b > count) throw new Error('Pages go from 1 to ' + count + '.'); for (let k = a; k <= b; k++) out.add(k - 1); }
    return [...out].sort((x, y) => x - y);
  };
  function mutateThrow(fn, after) { const run = queue.then(async () => { await fn(); rev++; hist++; findStale = true; parasCache.clear(); objsCache.clear(); if (after) after(); cur = Math.min(cur, live.count - 1); draw(); refreshThumbs(); }); queue = run.catch(() => { }); return run; }
  function dialog({ title, body, apply = 'Apply', onApply, wide = false }) {
    const back = el('div', { class: 'v2back' }), msg = el('div', { class: 'v2dmsg' }), applyB = el('button', { class: 'btn', type: 'button', text: apply }), cancelB = el('button', { class: 'btn sec', type: 'button', text: 'Cancel' });
    back.append(el('div', { class: 'v2dlg' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title }, el('h3', { text: title }), body, msg, el('div', { class: 'v2dact' }, cancelB, onApply ? applyB : null))); document.body.append(back);
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }, close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
    document.addEventListener('keydown', onKey, true); back.addEventListener('pointerdown', e => { if (e.target === back) close(); }); cancelB.onclick = close;
    applyB.onclick = async () => { applyB.disabled = true; msg.textContent = ''; try { if ((await onApply(msg)) !== false) close(); } catch (e) { msg.textContent = (e && e.message) || 'Something went wrong.'; } applyB.disabled = false; };
    return { close, msg };
  }
  const fld = (label, input, wide) => el('label', { class: 'v2f' + (wide ? ' wide' : '') }, el('span', { text: label }), input);
  const num = (v, min, max, step = 1) => el('input', { type: 'number', value: v, min, max, step });
  const colourOf = h => rgb(h);
  const latinFonts = () => F.list.filter(f => f.scripts.includes('latin') && f.category !== 'indic');
  const fontPick = id => { const sel2 = el('select'); for (const f of latinFonts()) sel2.append(el('option', { value: f.id, text: f.name })); sel2.value = id; return sel2; };
  const pagesField = (def = 'all') => { const i = el('input', { type: 'text', value: def, placeholder: 'all, current, 1-3,5' }); return [fld('Pages', i), i]; };

  // ---- the Tools menu
  function openMenu(anchor) {
    document.querySelectorAll('.v2menu').forEach(n => n.remove()); if (!live) return;
    const items = [['Watermark…', watermarkDialog], ['Header & footer…', () => headerDialog()], ['Page numbers…', () => headerDialog(true)], ['Crop pages…', cropDialog], null, ['Insert pages from a PDF…', () => pdfIn.click()], ['Extract pages…', extractDialog], ['Duplicate this page', duplicateNow], null,
      ['Document properties…', propsDialog], ['Protect & optimize…', protectDialog], null, ['Export page pictures (ZIP)…', exportImagesDialog], ['Export text (.txt)', exportText], null, ['Classic editor (Hindi text, save as Word)…', openClassic]];
    const menu = el('div', { class: 'v2menu' }); const r = anchor.getBoundingClientRect(); Object.assign(menu.style, { left: Math.max(8, Math.min(innerWidth - 250, r.left)) + 'px', top: r.bottom + 4 + 'px' });
    for (const it of items) menu.append(it ? el('button', { type: 'button', text: it[0], onclick: () => { menu.remove(); it[1](); } }) : el('hr'));
    document.body.append(menu); const off = ev => { if (!menu.contains(ev.target) && ev.target !== anchor) { menu.remove(); removeEventListener('pointerdown', off, true); } }; setTimeout(() => addEventListener('pointerdown', off, true), 0);
  }

  // ---- find and replace
  const findIn = el('input', { type: 'search', placeholder: 'Find', 'aria-label': 'Find' }), replIn = el('input', { type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' });
  const caseChk = el('input', { type: 'checkbox' }), wordChk = el('input', { type: 'checkbox' }), scopeSel = el('select', { 'aria-label': 'Where to look' }, [['all', 'All pages'], ['page', 'This page']].map(([v, t]) => el('option', { value: v, text: t })));
  const findCount = el('div', { class: 'help', style: { margin: '6px 0' } }), findList = el('div', { class: 'v2hits' });
  const fbtn = (t, title, fn, cls = 'btn sec sm') => el('button', { type: 'button', class: cls, text: t, title, onclick: fn });
  findPanel.append(el('div', { class: 'v2fh' }, el('b', { text: 'Find & replace' }), fbtn('✕', 'Close', () => closeFind())), findIn, replIn,
    el('div', { class: 'v2opts' }, el('label', {}, caseChk, ' Match case'), el('label', {}, wordChk, ' Whole word'), scopeSel),
    el('div', { class: 'v2row' }, fbtn('‹', 'Previous', () => stepHit(-1)), fbtn('›', 'Next', () => stepHit(1)), fbtn('Replace', 'Replace this one', () => replaceThis()), fbtn('Replace all', 'Replace everywhere', () => replaceEverywhere(), 'btn sm')),
    el('div', { class: 'v2row', style: { marginTop: '6px' } }, fbtn('Mark all for redaction', 'Mark every match so it can be removed for good', () => redactMatches())), findCount, findList);
  const fopts = () => ({ matchCase: caseChk.checked, wholeWord: wordChk.checked });
  const fpages = () => scopeSel.value === 'page' ? [cur] : null;
  function openFind() { findOpen = true; findPanel.classList.remove('hidden'); findIn.focus(); findIn.select(); if (findIn.value) runFind(true); else draw(); }
  function closeFind() { findOpen = false; findPanel.classList.add('hidden'); hits = []; hi = -1; if (view) view.layer.querySelectorAll('.v2hit').forEach(n => n.remove()); }
  function toggleFind() { findOpen ? closeFind() : openFind(); }
  function runFind(keep) {
    if (!live) return; const keepAt = hi; hits = findIn.value ? live.findAll(findIn.value, fopts(), fpages()) : []; hi = hits.length ? (keep && keepAt >= 0 ? Math.min(keepAt, hits.length - 1) : Math.max(0, hits.findIndex(h => h.page >= cur))) : -1;
    const needsOcr = !ocrCard.classList.contains('hidden');
    findCount.textContent = !findIn.value ? '' : !hits.length && needsOcr ? 'Nothing found: this page has no real text (it is a scan or has its letters as outlines). Click the OCR button on the page first, then search again.' : hits.length ? hits.length + ' found' + (new Set(hits.map(h => h.page)).size > 1 ? ' on ' + new Set(hits.map(h => h.page)).size + ' pages' : '') : 'Nothing found';
    findList.textContent = ''; hits.slice(0, 300).forEach((h, k) => { const [a, m, z2] = h.context.split('\u0001'); findList.append(el('button', { type: 'button', class: 'v2hitrow' + (k === hi ? ' on' : ''), onclick: () => gotoHit(k) }, el('small', { text: 'p.' + (h.page + 1) }), el('span', {}, a, el('mark', { text: m }), z2))); });
    paintHits();
  }
  function paintHits() {
    if (!view) return; view.layer.querySelectorAll('.v2hit').forEach(n => n.remove()); const z = view.z;
    hits.forEach((h, k) => { if (h.page !== cur) return; for (const r of h.rects) { const d = el('div', { class: 'v2hit' + (k === hi ? ' cur' : '') }); Object.assign(d.style, { left: r.x * z - 1 + 'px', top: r.y * z + 'px', width: r.w * z + 2 + 'px', height: r.h * z + 'px' }); view.layer.append(d); } });
    findList.querySelectorAll('.v2hitrow').forEach((n, k) => n.classList.toggle('on', k === hi));
  }
  function gotoHit(k) {
    if (k < 0 || k >= hits.length) return; hi = k; const h = hits[k]; if (h.page !== cur) { cur = h.page; sel = selObj = null; draw(); } else paintHits();
    const r = h.rects[0]; if (r && view) { const y = r.y * view.z, top = scroller.scrollTop; if (y < top + 40 || y > top + scroller.clientHeight - 80) scroller.scrollTo({ top: Math.max(0, y - scroller.clientHeight / 3), behavior: 'smooth' }); }
  }
  const stepHit = d => { if (!hits.length) return runFind(); gotoHit((hi + d + hits.length) % hits.length); };
  findIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (hits.length && e.target.dataset.last === findIn.value) stepHit(e.shiftKey ? -1 : 1); else { runFind(); findIn.dataset.last = findIn.value; } } else if (e.key === 'Escape') closeFind(); e.stopPropagation(); });
  for (const n of [caseChk, wordChk, scopeSel]) n.addEventListener('change', () => runFind()); replIn.addEventListener('keydown', e => e.stopPropagation());
  async function replaceThis() {
    if (hi < 0) return HT.toast('Find something first.'); const h = hits[hi], needle = findIn.value, repl = replIn.value, keep = hi;
    try { await mutateThrow(() => live.replaceOne(h, needle, repl, fopts()), () => { if (h.raw) h.raw.goneAt = hist; }); hi = keep; runFind(true); } catch (e) { fail(e); }
  }
  async function replaceEverywhere() {
    if (!hits.length) return HT.toast('Find something first.'); const n = hits.length, needle = findIn.value, repl = replIn.value, pages = fpages();
    const touched = [];
    try { findCount.textContent = 'Replacing…'; await mutateThrow(() => live.replaceAll(needle, repl, fopts(), pages, (a, b) => { findCount.textContent = 'Replacing… page ' + a + ' of ' + b; }, q => { if (q.raw) touched.push(q.raw); }), () => touched.forEach(r => { r.goneAt = hist; })); HT.toast(n + ' replaced'); runFind(); } catch (e) { fail(e); runFind(); }
  }
  function redactMatches() {
    if (!hits.length) return HT.toast('Find something first.'); const list = hits.flatMap(h => h.rects.map(r => ({ page: h.page, rect: r })));
    mutateThrow(() => live.markRedactions(list)).then(() => { HT.toast(list.length + ' marks added: press Apply redactions to remove them for good'); }).catch(fail);
  }
  function applyRedactionsDialog() {
    dialog({ title: 'Apply redactions', body: el('p', { text: 'The text, pictures and drawings under every redaction mark are removed from the file for good and covered with a black box. This can be undone here, but not in the downloaded file.' }), apply: 'Remove for good', onApply: async () => { await mutateThrow(() => live.applyRedactions()); HT.toast('Redactions applied'); } });
  }

  // ---- watermark
  function watermarkDialog() {
    const kind = el('select', {}, [['text', 'Text'], ['image', 'Picture']].map(([v, t]) => el('option', { value: v, text: t }))), text = el('input', { type: 'text', value: 'CONFIDENTIAL' }), font = fontPick('arimo'), size = num(72, 8, 400), colour = el('input', { type: 'color', value: '#cc2222' });
    const opacity = el('input', { type: 'range', min: 5, max: 100, value: 30 }), angle = num(45, -180, 180, 5), layout = el('select', {}, [['center', 'One in the middle'], ['tile', 'Repeated all over the page']].map(([v, t]) => el('option', { value: v, text: t })));
    const where = el('select', {}, [['front', 'In front of the page'], ['behind', 'Behind the page']].map(([v, t]) => el('option', { value: v, text: t }))), bold = el('input', { type: 'checkbox', checked: true }), img = el('input', { type: 'file', accept: 'image/*' }), scale = el('input', { type: 'range', min: 10, max: 100, value: 50 });
    const [pagesRow, pagesIn] = pagesField(); const txtRows = [fld('Text', text, true), fld('Font', font), fld('Size', size), fld('Colour', colour), el('label', { class: 'v2f' }, el('span', { text: 'Bold' }), bold)], imgRows = [fld('Picture', img, true), fld('Size (% of the page width)', scale)];
    const sync = () => { txtRows.forEach(n => n.classList.toggle('hidden', kind.value !== 'text')); imgRows.forEach(n => n.classList.toggle('hidden', kind.value !== 'image')); }; kind.onchange = sync;
    const body = el('div', { class: 'v2form' }, fld('Watermark', kind), ...txtRows, ...imgRows, fld('Opacity', opacity), fld('Angle (degrees)', angle), fld('Layout', layout), fld('Layer', where), pagesRow); sync();
    dialog({ title: 'Add a watermark', body, apply: 'Add watermark', onApply: async () => {
      const pages = parseRange(pagesIn.value, live.count), o = { kind: kind.value, size: +size.value || 72, color: colourOf(colour.value), opacity: opacity.value / 100, angle: +angle.value || 0, layout: layout.value, behind: where.value === 'behind', pages, fontId: font.value, bold: bold.checked, scale: scale.value / 100 };
      if (o.kind === 'text') { o.text = text.value; if (!o.text.trim()) throw new Error('Type the watermark text.'); } else { const f = img.files[0]; if (!f) throw new Error('Choose a picture.'); o.bytes = await imageBytes(f); }
      await mutateThrow(() => live.addWatermark(o)); HT.toast('Watermark added to ' + pages.length + ' page' + (pages.length > 1 ? 's' : ''));
    } });
  }
  async function imageBytes(f) {
    const bmp = await createImageBitmap(f); if (/^image\/(png|jpeg)$/.test(f.type)) return new Uint8Array(await f.arrayBuffer());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  }

  // ---- header, footer and page numbers
  function headerDialog(numbers) {
    const mk = (pos, v = '') => el('input', { type: 'text', value: v, 'data-pos': pos, placeholder: pos[0] === 't' ? 'top' : 'bottom' }), ins = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'].map(pos => mk(pos, numbers && pos === 'bc' ? 'Page {page} of {pages}' : ''));
    const size = num(10, 6, 48), colour = el('input', { type: 'color', value: '#333333' }), font = fontPick('arimo'), margin = num(30, 8, 120), start = num(1, 0, 99999), [pagesRow, pagesIn] = pagesField();
    const grid = el('div', { class: 'v2hf' }, ...['Top left', 'Top centre', 'Top right', 'Bottom left', 'Bottom centre', 'Bottom right'].map((t, k) => el('label', {}, el('small', { text: t }), ins[k])));
    const body = el('div', { class: 'v2form' }, grid, el('p', { class: 'help', style: { gridColumn: '1/-1' }, text: 'Use {page} for the page number ({page:5} gives 00001, good for Bates numbers), {pages} for the number of pages, {date} for today and {name} for the file name.' }), fld('Size', size), fld('Colour', colour), fld('Font', font), fld('Distance from the edge', margin), fld('First page number', start), pagesRow);
    dialog({ title: numbers ? 'Page numbers' : 'Header & footer', body, wide: true, apply: 'Add', onApply: async () => {
      const items = ins.filter(i => i.value.trim()).map(i => ({ pos: i.dataset.pos, text: i.value })); if (!items.length) throw new Error('Type something in at least one box.'); const pages = parseRange(pagesIn.value, live.count);
      await mutateThrow(() => live.addHeaderFooter({ pages, items, size: +size.value || 10, color: colourOf(colour.value), fontId: font.value, margin: +margin.value, startAt: +start.value, name: HT.stem(file.name) })); HT.toast('Added to ' + pages.length + ' page' + (pages.length > 1 ? 's' : ''));
    } });
  }

  // ---- drag an area: redact, crop, link
  function beginArea(e) {
    const a = ptOf(e), z = view.z, kind = tool, box = el('div', { class: 'v2area ' + kind }); view.layer.append(box); let b = a;
    const paint = () => Object.assign(box.style, { left: Math.min(a.x, b.x) * z + 'px', top: Math.min(a.y, b.y) * z + 'px', width: Math.abs(b.x - a.x) * z + 'px', height: Math.abs(b.y - a.y) * z + 'px' });
    drag(q => { b = q; paint(); }, q => {
      b = q; box.remove(); const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; if (r.w < 4 || r.h < 4) return;
      if (kind === 'redact') mutate(() => live.markRedactions([{ page: cur, rect: r }]));
      else if (kind === 'crop') cropDialog(r); else linkDialog(r);
    });
  }
  function cropDialog(rect) {
    const [pw, ph] = live.size(cur), t = num(0, 0, ph, 1), rt = num(0, 0, pw, 1), bt = num(0, 0, ph, 1), l = num(0, 0, pw, 1), [pagesRow, pagesIn] = pagesField(rect ? 'current' : 'all');
    const body = el('div', { class: 'v2form' }, rect ? el('p', { style: { gridColumn: '1/-1' }, text: 'Keep the part you dragged (' + Math.round(rect.w) + ' × ' + Math.round(rect.h) + ' points).' }) : null, ...(rect ? [] : [fld('Top (points)', t), fld('Right', rt), fld('Bottom', bt), fld('Left', l)]), pagesRow);
    dialog({ title: 'Crop pages', body, apply: 'Crop', onApply: async () => { const pages = parseRange(pagesIn.value, live.count); await mutateThrow(() => live.cropPages(pages, rect ? { rect } : { margins: { top: +t.value, right: +rt.value, bottom: +bt.value, left: +l.value } })); HT.toast('Cropped ' + pages.length + ' page' + (pages.length > 1 ? 's' : '')); } });
  }
  function linkDialog(rect) {
    const kind = el('select', {}, [['url', 'A web address'], ['page', 'A page of this PDF']].map(([v, t]) => el('option', { value: v, text: t }))), value = el('input', { type: 'text', value: 'https://', 'aria-label': 'Where the link goes' }); kind.onchange = () => { value.value = kind.value === 'url' ? 'https://' : '1'; };
    dialog({ title: 'Add a link', body: el('div', { class: 'v2form' }, fld('Link to', kind), fld('Address or page number', value)), apply: 'Add link', onApply: async () => {
      let uri = value.value.trim(); if (kind.value === 'page') { const n = +uri; if (!(n >= 1 && n <= live.count)) throw new Error('Pages go from 1 to ' + live.count + '.'); uri = '#page=' + n; } else if (!/^(https?:\/\/|mailto:)\S+$/i.test(uri)) throw new Error('Type a web address that starts with https://');
      await mutateThrow(() => live.addLink(cur, rect, uri)); HT.toast('Link added');
    } });
  }

  // ---- signature
  function signDialog() {
    const W = 460, H = 170, cv = el('canvas', { width: W * 2, height: H * 2, class: 'v2sigc', style: { width: W + 'px', height: H + 'px' } }), cx = cv.getContext('2d'); cx.scale(2, 2); cx.lineWidth = 2.6; cx.lineCap = cx.lineJoin = 'round'; cx.strokeStyle = '#111';
    let drawing = false, ink = false; const at = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
    cv.addEventListener('pointerdown', ev => { drawing = true; ink = true; cv.setPointerCapture(ev.pointerId); const [x, y] = at(ev); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 0.01, y); cx.stroke(); }); cv.addEventListener('pointermove', ev => { if (!drawing) return; const [x, y] = at(ev); cx.lineTo(x, y); cx.stroke(); }); cv.addEventListener('pointerup', () => { drawing = false; });
    const typed = el('input', { type: 'text', placeholder: 'Type your name', style: { fontSize: '1.4rem' } }), styles = ['dancing-script', 'great-vibes', 'caveat', 'satisfy', 'pacifico'].filter(id => F.map[id]), styleSel = el('select', {}, styles.map(id => el('option', { value: id, text: F.get(id).name }))), upl = el('input', { type: 'file', accept: 'image/*' });
    const saved = (() => { try { return localStorage.getItem('tz_sig'); } catch { return null; } })(), tabs = ['Draw', 'Type', 'Picture'], panes = [el('div', {}, cv, el('div', { class: 'v2row', style: { marginTop: '6px' } }, fbtn('Clear', 'Clear', () => { cx.clearRect(0, 0, W, H); ink = false; }))), el('div', { class: 'v2form' }, fld('Your name', typed, true), fld('Style', styleSel)), el('div', { class: 'v2form' }, fld('Picture of your signature', upl, true))];
    let tab = 0; const tabBar = el('div', { class: 'v2row', style: { marginBottom: '8px' } }), show = k => { tab = k; panes.forEach((p2, j) => p2.classList.toggle('hidden', j !== k)); [...tabBar.children].forEach((b2, j) => b2.classList.toggle('on', j === k)); };
    tabs.forEach((t, k) => tabBar.append(fbtn(t, t, () => show(k)))); const body = el('div', {}, tabBar, ...panes, saved ? el('p', { class: 'help' }, fbtn('Use my saved signature', 'Use the signature saved in this browser', () => { armSig(saved); dlg.close(); })) : null); show(0);
    const dlg = dialog({ title: 'Your signature', body, apply: 'Use this signature', onApply: async () => {
      let url;
      if (tab === 0) { if (!ink) throw new Error('Draw your signature first.'); url = trimCanvas(cv); }
      else if (tab === 1) { if (!typed.value.trim()) throw new Error('Type your name.'); await F.load(styleSel.value, false, false); const c = document.createElement('canvas'); c.width = 900; c.height = 260; const x2 = c.getContext('2d'); x2.font = `140px "${F.family(styleSel.value)}"`; x2.fillStyle = '#111'; x2.textBaseline = 'middle'; x2.fillText(typed.value, 20, 130); url = trimCanvas(c); }
      else { const f = upl.files[0]; if (!f) throw new Error('Choose a picture.'); const bmp = await createImageBitmap(f), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x2 = c.getContext('2d'); x2.drawImage(bmp, 0, 0); const d2 = x2.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d2.data.length; i += 4) { const lum = d2.data[i] * 0.3 + d2.data[i + 1] * 0.59 + d2.data[i + 2] * 0.11; if (lum > 235) d2.data[i + 3] = 0; else if (lum > 180) d2.data[i + 3] = Math.round((235 - lum) / 55 * 255); } x2.putImageData(d2, 0, 0); url = trimCanvas(c); }
      try { localStorage.setItem('tz_sig', url); } catch { } armSig(url);
    } });
  }
  function trimCanvas(c) {
    const x = c.getContext('2d'), w = c.width, h = c.height, d = x.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 20) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    if (x1 < 0) throw new Error('There is nothing to use.'); const pad = 6, o = document.createElement('canvas'); o.width = x1 - x0 + 1 + pad * 2; o.height = y1 - y0 + 1 + pad * 2; o.getContext('2d').drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1); return o.toDataURL('image/png');
  }
  async function armSig(url) { const bmp = await createImageBitmap(await (await fetch(url)).blob()), bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()); armed = { kind: 'sig', bytes, ratio: bmp.width / bmp.height }; hint.textContent = 'Your signature is ready: click on the page where it goes.'; }
  async function placeSignature(x, y) {
    const a = armed; if (!a || a.kind !== 'sig') return; const w = 150, h = w / a.ratio, [pw, ph] = live.size(cur), r = { x: Math.max(0, Math.min(pw - w, x - w / 2)), y: Math.max(0, Math.min(ph - h, y - h / 2)), w, h };
    await mutate(() => live.addAnnot(cur, { kind: 'stamp', rect: r, bytes: a.bytes })); setTool('select'); selectNewStamp(r);
  }

  // ---- forms
  function drawForm(forms) {
    const z = view.z; if (!forms.length) { pageNote.textContent = 'This page has no form fields.'; return; }
    for (const w of forms) {
      if (w.readOnly) continue; const r = w.rect, st = { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px', fontSize: Math.max(9, Math.min(r.h * z * 0.62, 22)) + 'px' };
      let n;
      if (w.type === 'text') { n = w.multiline ? el('textarea') : el('input', { type: 'text' }); n.value = w.value || ''; n.addEventListener('change', () => mutate(() => live.setWidget(cur, w.idx, n.value))); n.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter' && !w.multiline) n.blur(); }); }
      else if (w.type === 'checkbox' || w.type === 'radiobutton') { n = el('button', { type: 'button', title: w.name }); n.addEventListener('click', ev => { ev.preventDefault(); mutate(() => live.setWidget(cur, w.idx, true)); }); }
      else if (/combo|list|choice/.test(w.type)) { n = el('select'); const opts = (w.options || []).map(o => Array.isArray(o) ? o : [o, o]); for (const [v, t] of opts) n.append(el('option', { value: v, text: t })); n.value = w.value; n.addEventListener('change', () => mutate(() => live.setWidget(cur, w.idx, n.value))); }
      else continue;
      n.classList.add('v2fld'); Object.assign(n.style, st); n.addEventListener('pointerdown', ev => ev.stopPropagation()); view.layer.append(n);
    }
  }

  // ---- pages
  const pdfIn = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true, onchange: async () => { const f = pdfIn.files[0]; pdfIn.value = ''; if (!f) return; try { const bytes = new Uint8Array(await f.arrayBuffer()); let n = 0; await mutateThrow(() => { n = live.insertPagesFrom(bytes, cur + 1); }); buildThumbs(); HT.toast(n + ' page' + (n > 1 ? 's' : '') + ' inserted after page ' + (cur + 1)); } catch (e) { fail(e); } } }); root.append(pdfIn);
  function duplicateNow() { mutateThrow(() => live.duplicatePage(cur)).then(() => { cur++; draw(); buildThumbs(); HT.toast('Page duplicated'); }).catch(fail); }
  function extractDialog() {
    const [row, inp] = pagesField('current');
    dialog({ title: 'Extract pages', body: el('div', { class: 'v2form' }, row, el('p', { class: 'help', style: { gridColumn: '1/-1' }, text: 'The pages are saved as a new PDF. Your open document does not change.' })), apply: 'Extract', onApply: async () => { const list = parseRange(inp.value, live.count); HT.download(live.extractPages(list), HT.stem(file.name) + '_pages.pdf'); HT.toast(list.length + ' page' + (list.length > 1 ? 's' : '') + ' extracted'); } });
  }

  function openClassic() { if (rev > 0 && !confirm('The changes you made here are not carried over to the classic editor. Open it anyway?')) return; try { sessionStorage.setItem('tz_classic', '1'); } catch { } rev = 0; location.reload(); }   // the address stays /pdf-editor
  // ---- properties, protect and optimize, export
  function propsDialog() {
    const m = live.getMeta(), t = el('input', { type: 'text', value: m.title }), a = el('input', { type: 'text', value: m.author }), su = el('input', { type: 'text', value: m.subject }), k = el('input', { type: 'text', value: m.keywords });
    dialog({ title: 'Document properties', body: el('div', { class: 'v2form' }, fld('Title', t, true), fld('Author', a), fld('Subject', su), fld('Keywords', k, true)), apply: 'Save', onApply: async () => { await mutateThrow(() => live.setMeta({ title: t.value, author: a.value, subject: su.value, keywords: k.value })); } });
  }
  function protectDialog() {
    const user = el('input', { type: 'password', value: saveOpts.userPassword || '', autocomplete: 'new-password' }), owner = el('input', { type: 'password', value: saveOpts.ownerPassword || '', autocomplete: 'new-password' }), noPrint = el('input', { type: 'checkbox', checked: !!saveOpts.noPrint }), noCopy = el('input', { type: 'checkbox', checked: !!saveOpts.noCopy }), noEdit = el('input', { type: 'checkbox', checked: !!saveOpts.noEdit });
    const opt = el('input', { type: 'checkbox', checked: !!saveOpts.optimize }), san = el('input', { type: 'checkbox', checked: !!saveOpts.sanitize });
    const chk = (c, t) => el('label', { class: 'v2f wide' }, c, el('span', { text: ' ' + t }));
    dialog({ title: 'Protect & optimize', body: el('div', { class: 'v2form' }, fld('Password to open the PDF', user, true), fld('Password to change the permissions', owner, true), chk(noPrint, 'Do not allow printing'), chk(noCopy, 'Do not allow copying text'), chk(noEdit, 'Do not allow editing'), chk(opt, 'Make the file smaller'), chk(san, 'Remove the title, author and other details'), el('p', { class: 'help', style: { gridColumn: '1/-1' }, text: 'This is used when you press Download PDF. Leave the passwords empty for no protection. Do not use commas or = in a password.' })),
      apply: 'Use these settings', onApply: async () => { for (const v of [user.value, owner.value]) if (/[,=]/.test(v)) throw new Error('A password can not have a comma or an = sign.'); saveOpts = { userPassword: user.value, ownerPassword: owner.value, noPrint: noPrint.checked, noCopy: noCopy.checked, noEdit: noEdit.checked, optimize: opt.checked, sanitize: san.checked }; dlTop.textContent = user.value || owner.value ? 'Download PDF 🔒' : 'Download PDF'; HT.toast('Saved: they are used when you download'); } });
  }
  function exportText() { const t = live.allText(); HT.download(new Blob([t + '\n'], { type: 'text/plain;charset=utf-8' }), HT.stem(file.name) + '.txt'); HT.toast('Text exported'); }
  function exportImagesDialog() {
    const dpi = el('select', {}, [[72, 'Small (72 dpi)'], [150, 'Normal (150 dpi)'], [220, 'Sharp (220 dpi)']].map(([v, t]) => el('option', { value: v, text: t, selected: v === 150 || null }))), [row, inp] = pagesField();
    dialog({ title: 'Export page pictures', body: el('div', { class: 'v2form' }, fld('Quality', dpi), row), apply: 'Export', onApply: async msg => {
      const list = parseRange(inp.value, live.count); await HT.loadScript('/assets/vendor/jszip.min.js'); const zip = new JSZip(), k = +dpi.value / 72;
      for (let n = 0; n < list.length; n++) { msg.textContent = 'Page ' + (n + 1) + ' of ' + list.length + '…'; await HT.tick(); const id = live.render(list[n], k), c = document.createElement('canvas'); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); zip.file(HT.stem(file.name) + '_page' + String(list[n] + 1).padStart(3, '0') + '.png', blob); }
      HT.download(await zip.generateAsync({ type: 'blob' }), HT.stem(file.name) + '_pictures.zip'); HT.toast('Pictures exported');
    } });
  }
  // ---- pictures
  const picIn = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const f = picIn.files[0]; picIn.value = ''; if (f) await addPictureFile(f); } }); root.append(picIn);
  async function addPictureFile(f) {
    let bmp, bytes; try { bmp = await createImageBitmap(f); bytes = new Uint8Array(await f.arrayBuffer()); } catch { return HT.toast('This picture could not be opened.'); }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); }
    const [pw, ph] = live.size(cur), k = Math.min(1, pw * 0.4 / bmp.width, ph * 0.4 / bmp.height), w = Math.max(40, bmp.width * k), h = w * bmp.height / bmp.width, r = { x: (pw - w) / 2, y: (ph - h) / 2, w, h };
    await mutate(() => live.addAnnot(cur, { kind: 'stamp', rect: r, bytes })); setTool('select'); selectNewStamp(r);
  }
  // ---- selecting, moving and resizing pictures and marks
  function onObjDown(e, kind, o) {
    if (e.button) return; e.preventDefault(); e.stopPropagation(); sel = null; selObj = { kind, o }; drawSel(); const start = ptOf(e), sb = view.layer.querySelector('.edsel'); let moved = false, dx = 0, dy = 0;
    drag(q => { dx = q.x - start.x; dy = q.y - start.y; if (!moved && Math.hypot(dx, dy) * view.z < 4) return; moved = true; if (sb) sb.style.transform = `translate(${dx * view.z}px,${dy * view.z}px)`; }, () => { if (moved) moveObj(dx, dy); });
  }
  function reselect(so, nr) {
    const L = objsOf(cur), list = so.kind === 'pic' ? L.pics : L.anns.filter(a => a.type === so.o.type), best = list.map(o => { const r = rectOf(so.kind, o); return { o, d: Math.hypot(r.x - nr.x, r.y - nr.y) + Math.hypot(r.w - nr.w, r.h - nr.h) }; }).sort((a, b2) => a.d - b2.d)[0];
    selObj = best && best.d < 8 ? { kind: so.kind, o: best.o } : null; drawSel();
  }
  function moveObj(dx, dy) {
    const so = selObj; if (!so) return; const r = rectOf(so.kind, so.o), nr = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
    mutate(() => so.kind === 'pic' ? live.movePicture(cur, so.o, nr) : live.moveAnnot(cur, so.o.idx, dx, dy)).then(() => reselect(so, nr));
  }
  function startResize(e, corner) {
    e.preventDefault(); e.stopPropagation(); const so = selObj, r0 = { ...rectOf(so.kind, so.o) }, z = view.z, aspect = so.kind === 'pic' || so.o.type === 'Stamp' ? r0.w / r0.h : 0, sb = view.layer.querySelector('.edsel'), left = corner.includes('w'), top = corner.includes('n'); let nr = r0;
    drag(q => {
      let x0 = left ? Math.min(q.x, r0.x + r0.w - 6) : r0.x, y0 = top ? Math.min(q.y, r0.y + r0.h - 6) : r0.y, x1 = left ? r0.x + r0.w : Math.max(q.x, r0.x + 6), y1 = top ? r0.y + r0.h : Math.max(q.y, r0.y + 6), w = x1 - x0, h = y1 - y0;
      if (aspect) { h = w / aspect; if (top) y0 = y1 - h; }
      nr = { x: x0, y: y0, w, h }; Object.assign(sb.style, { left: x0 * z - 2 + 'px', top: y0 * z - 1 + 'px', width: w * z + 4 + 'px', height: h * z + 2 + 'px' });
    }, () => { mutate(() => so.kind === 'pic' ? live.movePicture(cur, so.o, nr) : live.resizeAnnot(cur, so.o.idx, nr)).then(() => reselect(so, nr)); });
  }
  // ---- the look of marks
  function renderAnnProps() {
    const so = selObj && selObj.kind === 'ann' ? selObj : null, pic = selObj && selObj.kind === 'pic', show = live && ((tool === 'select' && selObj) || ANN_TOOLS.has(tool)); annCard.classList.toggle('hidden', !show); if (!show) return;
    const stamp = !!(so && so.o.type === 'Stamp'); annTitle.lastChild.textContent = pic || stamp ? 'Picture or sticker' : so ? 'Selected mark' : 'Mark'; annForm.classList.toggle('hidden', !!pic || stamp); aDel.classList.toggle('hidden', !selObj);
    if (so) { const a = so.o; acolor.value = a.color && a.color.length >= 3 ? hex(a.color) : '#000000'; awidth.value = a.width || 1; afillOn.checked = !!(a.fill && a.fill.length); if (a.fill && a.fill.length >= 3) afill.value = hex(a.fill); afillRow.classList.toggle('hidden', !(a.type === 'Square' || a.type === 'Circle')); }
  }
  function annChanged() {
    const so = selObj; if (!so || so.kind !== 'ann') return; const st = annStyle(), a = so.o, r = a.rect;
    mutate(() => live.styleAnnot(cur, a.idx, { color: st.color, width: st.width, fill: st.fill })).then(() => reselect(so, r));
  }
  // after an edit the paragraph is a new object: find it again by its place and its first words
  const refind = (p, x, y) => parasOf(cur).find(n => n.text.slice(0, 20) === p.text.slice(0, 20) && Math.abs(n.bbox.x - x) < 4 && Math.abs(n.bbox.y - y) < 4) || null;
  function moveSel(dx, dy) { const p = sel; if (!p) return; const x = p.bbox.x + dx, y = p.bbox.y + dy; mutate(() => live.editParagraph(cur, p, p.text, keep(p, { dx, dy })), p).then(() => { sel = refind(p, x, y); drawSel(); }); }
  function deleteSel() {
    if (selObj) { const so = selObj; selObj = null; mutate(() => so.kind === 'pic' ? live.deletePicture(cur, so.o) : live.deleteAnnot(cur, so.o.idx)); return; }
    const p = sel; if (!p) return; sel = null; mutate(() => live.deleteParagraph(cur, p), p);
  }

  // ------------------------------------------------------------------ the text properties
  function readProps() { return { fontId: fontSel.value || defaults.fontId, size: +sizeIn.value || defaults.size, color: colorIn.value || defaults.color, bold: bBtn.classList.contains('on'), italic: iBtn.classList.contains('on') }; }
  function renderProps() {
    renderAnnProps();
    const show = (tool === 'text') || (tool === 'select' && sel); propsCard.classList.toggle('hidden', !show || !live); if (!show) return;
    delBtn.classList.toggle('hidden', !sel); alignRow.classList.toggle('hidden', !sel); propsTitle.lastChild.textContent = sel ? 'Selected text' : 'New text';
    if (sel) {
      const r0 = sel.runs[0], g = look(sel), sz = sel.ocr && sel.match ? sel.match.size : sel.size; fontSel.value = g.fontId; sizeIn.value = Math.round(sz * 10) / 10; colorIn.value = hex(r0.color); bBtn.classList.toggle('on', g.bold); iBtn.classList.toggle('on', g.italic);
      alignBtns.forEach(b => b.classList.toggle('on', b.dataset.a === sel.align));
    }
  }
  function changed(what = '') {
    if (!sel || tool !== 'select') { if (editing && editing.kind === 'add') { const st = readProps(); Object.assign(editing.b.style, { fontSize: st.size * view.z + 'px', lineHeight: st.size * view.z * 1.2 + 'px', color: st.color, fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', fontFamily: `"${F.family(st.fontId)}", sans-serif` }); F.load(st.fontId, st.bold, st.italic).catch(() => { }); } return; }
    const p = sel, st = readProps(), r0 = p.runs[0], g = look(p), psz = p.ocr && p.match ? p.match.size : p.size, style = {}, opts = {};
    if (what.startsWith('align:')) { const a = what.slice(6); if (a === p.align) return; opts.align = a; }
    else {
      if (Math.abs(st.size - psz) > 0.01) style.size = st.size; if (st.color !== hex(r0.color)) style.color = rgb(st.color);
      if (fontSel.value !== g.fontId || what === 'bold' || what === 'italic' || what === 'font') { style.fontId = fontSel.value; style.bold = st.bold; style.italic = st.italic; }
      if (!Object.keys(style).length) return; opts.style = style;
    }
    sel = null; const x = p.bbox.x, y = p.bbox.y; mutate(() => live.editParagraph(cur, p, p.text, keep(p, opts)), p).then(() => { sel = refind(p, x, y) || parasOf(cur).find(n => Math.abs(n.bbox.y - y) < 6 && n.text.slice(0, 20) === p.text.slice(0, 20)) || null; drawSel(); });
  }

  // ------------------------------------------------------------------ saving
  async function download() {
    if (!live) return; finishEditNow(); await queue; dlBtn.disabled = dlTop.disabled = true;
    try { prog.set(30, 'Preparing your PDF...'); await HT.tick(); const blob = live.save(saveOpts); HT.download(blob, HT.stem(file.name) + (saveOpts.userPassword || saveOpts.ownerPassword ? '_protected' : '_edited') + '.pdf'); HT.toast('Your PDF is ready'); prog.clear(); }
    catch (e) { prog.error(e.message || 'Something went wrong.'); }
    dlBtn.disabled = dlTop.disabled = false;
  }
  addEventListener('keydown', e => {
    if (live && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !app.classList.contains('hidden')) { e.preventDefault(); openFind(); return; }
    if (!live || !document.contains(root)) return; const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); if (typing) return;
    const k = e.key.toLowerCase();
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('.v2back') && !editing) { const hit = Object.entries(KEYS).find(([, v]) => v.toLowerCase() === k); if (hit && TOOLS.some(t => t[0] === hit[0])) { e.preventDefault(); setTool(hit[0]); return; } }
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); step(e.shiftKey ? 1 : -1); } else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); step(1); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && (sel || selObj)) { e.preventDefault(); deleteSel(); } else if (e.key === 'Enter' && sel && tool === 'select') { e.preventDefault(); const p = sel; setTool('edit'); startEdit(p); }
    else if (e.key === 'Escape') { sel = null; selObj = null; drawSel(); } else if ((sel || selObj) && tool === 'select' && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0; if (selObj) moveObj(dx, dy); else moveSel(dx, dy); }
  });
  addEventListener('beforeunload', e => { if (live && rev > 0) { e.preventDefault(); e.returnValue = ''; } });
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => live && !editing && draw(), 200); });
};
