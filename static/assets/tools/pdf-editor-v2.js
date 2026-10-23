// PDF Editor v2 (the page /pdf-editor?v2). Nothing is drawn on top of the PDF: the file is opened in MuPDF (engine/pdf-live.js), every edit changes the PDF
// itself, and the page you see is that PDF drawn again. While you type in a paragraph a text box sits over it; the moment you finish, the real page replaces it.
// The unit of editing is a paragraph (lines that belong together, see paragraphs() in the engine): it re-wraps to its own width and keeps its alignment.
HT.pdfEditorV2 = root => {
  const el = HT.el, ready = Promise.all([HT.loadScript('/assets/tools/fonts-helpers.js'), HT.loadScript('/assets/engine/pdf-live.js')]);
  let F = null, live = null, file = null, armed = null, cur = 0, zoom = 1, tool = 'edit', sel = null, selObj = null, editing = null, view = null, rev = 0, hist = 0, thumbToken = 0, queue = Promise.resolve();
  const parasCache = new Map(), objsCache = new Map(), ocrCache = new Map(), prog = HT.progress(), defaults = { fontId: 'arimo', size: 14, bold: false, italic: false, color: '#111111' };
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''), rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const TOOLS = [['edit', 'Edit text', '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'], ['text', 'Add text', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'], ['select', 'Select & move', '<path d="M5 3l14 8-6 2-3 6z"/>'],
    ['image', 'Picture', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'], ['sticker', 'Sticker', '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.500 2.200 2 3.500 2s2.500-.5 3.500-2M9 9.500h.01M15 9.500h.01"/>'], ['highlight', 'Highlight', '<path d="M9 17l-4 1 1-4 8-8 3 3z"/><path d="M4 21h16" stroke-width="3" opacity=".4"/>'],
    ['underline', 'Underline', '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'], ['strike', 'Strike out', '<path d="M5 12h14M16 7c-1-2-3-3-5-3-3 0-5 1.5-5 4M8 17c1 2 3 3 5 3 3 0 5-1.500 5-4"/>'],
    ['rect', 'Rectangle', '<rect x="4" y="6" width="16" height="12" rx="1.5"/>'], ['ellipse', 'Ellipse', '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>'], ['line', 'Line', '<path d="M5 19L19 5"/>'], ['arrow', 'Arrow', '<path d="M5 19L19 5M10 5h9v9"/>'],
    ['pen', 'Draw', '<path d="M3 17c3-8 5-8 6-3s3 5 5-1 4-5 7-1"/>'], ['note', 'Note', '<path d="M5 4h14v12H9l-4 4z"/>']];
  const HINT = {
    edit: "Click a paragraph and type: it re-wraps as you type and keeps its alignment. A click elsewhere or Enter applies it, Esc cancels, Shift+Enter starts a new line. Letters the PDF's own font does not have use the closest font.",
    text: 'Click on the page and type your text. Choose the font, size and colour first.',
    select: 'Click a paragraph, picture or mark to select it: drag to move it, drag a corner to resize, change its look, or press Delete to remove it.',
    sticker: 'Pick an emoji or a stamp, then click on the page where it goes. It is put on the page as a picture: drag it, or drag a corner to resize.',
    image: 'Choose a picture, it is put on the page. Then drag it, or drag a corner to resize.', highlight: 'Drag over text to highlight it.', underline: 'Drag over text to underline it.', strike: 'Drag over text to strike it out.',
    rect: 'Drag on the page to draw a rectangle.', ellipse: 'Drag on the page to draw an ellipse.', line: 'Drag on the page to draw a line.', arrow: 'Drag on the page to draw an arrow.', pen: 'Draw with the mouse or your finger.', note: 'Click where the note goes, then type it. It is a real note: PDF readers show it as a small icon.',
  };
  const ANN_TOOLS = new Set(['highlight', 'underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'pen']), ANN_COLOUR = { highlight: '#fff200', pen: '#111111' };

  // ------------------------------------------------------------------ the sidebar
  const list = HT.fileList({ onChange: fs => { if (!fs.length) reset(); } });
  const dz = HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Up to 200 MB. The PDF is edited in your browser and never uploaded.', onFiles: fs => { list.add(fs.slice(0, 1), false); open(fs[0]); } });
  const toolBtns = TOOLS.map(([id, label, glyph]) => el('button', { type: 'button', class: 'edtool', 'data-t': id, title: label, onclick: () => setTool(id) }, HT.svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`), el('span', { text: label })));
  const hint = el('div', { class: 'help', style: { marginTop: '10px' } }), note = el('div', { class: 'help hidden', style: { marginTop: '8px', color: 'var(--warn, #b45309)' } });
  const toolsCard = el('div', { class: 'card hidden' }, HT.stepTitle(3, 'Tools'), el('div', { class: 'edtools' }, toolBtns), hint, note);
  // text properties: for the text you are about to add, or the paragraph that is selected
  const fontSel = el('select', { 'aria-label': 'Font', onchange: () => changed('font') }), sizeIn = el('input', { type: 'number', min: 4, max: 400, step: 0.5, 'aria-label': 'Size in points', onchange: () => changed('size') });
  const colorIn = el('input', { type: 'color', 'aria-label': 'Colour', onchange: () => changed('color') });
  const bBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'B', title: 'Bold', style: { fontWeight: 800 }, onclick: () => { bBtn.classList.toggle('on'); changed('bold'); } });
  const iBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'I', title: 'Italic', style: { fontStyle: 'italic' }, onclick: () => { iBtn.classList.toggle('on'); changed('italic'); } });
  const ALIGN = [['left', 'Align left', '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'], ['centre', 'Centre', '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'], ['right', 'Align right', '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'], ['justify', 'Justify', '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>']];
  const alignBtns = ALIGN.map(([id, t, g]) => el('button', { type: 'button', class: 'btn sec sm', 'data-a': id, title: t, 'aria-label': t, onclick: () => changed('align:' + id) }, HT.svg(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${g}</svg>`)));
  const alignRow = el('div', { class: 'actions', style: { marginTop: '10px' } }, alignBtns);
  const delBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'Delete text', onclick: () => deleteSel() });
  const propsTitle = el('h2', { class: 'ct' }, el('span', { class: 'n', text: '4' }), 'Text');
  const propsCard = el('div', { class: 'card hidden' }, propsTitle, el('div', { class: 'form' }, el('label', {}, 'Font', fontSel), el('div', { style: { display: 'flex', gap: '8px', alignItems: 'end' } }, el('label', { style: { flex: 1 } }, 'Size', sizeIn), el('label', {}, 'Colour', colorIn), bBtn, iBtn)), alignRow, el('div', { class: 'actions', style: { marginTop: '10px' } }, delBtn));
  // properties of the marks you draw (highlight, shapes, lines ...) or of the mark that is selected; for a selected picture only Delete
  const acolor = el('input', { type: 'color', value: '#e5334a', 'aria-label': 'Colour', onchange: () => annChanged() }), awidth = el('input', { type: 'number', min: 1, max: 40, step: 1, value: 3, 'aria-label': 'Line width', onchange: () => annChanged() });
  const afillOn = el('input', { type: 'checkbox', 'aria-label': 'Fill the shape', onchange: () => annChanged() }), afill = el('input', { type: 'color', value: '#cfe3ff', 'aria-label': 'Fill colour', onchange: () => { afillOn.checked = true; annChanged(); } });
  const afillRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } }, afillOn, el('span', { text: 'Fill' }), afill);
  const aDel = el('button', { type: 'button', class: 'btn sec sm', text: 'Delete', onclick: () => deleteSel() });
  const annForm = el('div', { class: 'form' }, el('div', { style: { display: 'flex', gap: '8px', alignItems: 'end' } }, el('label', {}, 'Colour', acolor), el('label', { style: { flex: 1 } }, 'Line width', awidth)), afillRow);
  const annTitle = el('h2', { class: 'ct' }, el('span', { class: 'n', text: '4' }), 'Mark'), annCard = el('div', { class: 'card hidden' }, annTitle, annForm, el('div', { class: 'actions', style: { marginTop: '10px' } }, aDel));
  const stickerCard = el('div', { class: 'card hidden' });   // filled further down (emoji and stamps)
  const pb = (t, title, fn) => el('button', { class: 'btn sec sm', type: 'button', text: t, title, onclick: fn });
  const pageNote = el('div', { class: 'help', style: { marginTop: '8px' } });
  const pagesCard = el('div', { class: 'card hidden' }, HT.stepTitle(5, 'This page'), el('div', { class: 'actions', style: { marginTop: 0 } },
    pb('⟲', 'Rotate left', () => pageOp(() => live.rotatePage(cur, -90))), pb('⟳', 'Rotate right', () => pageOp(() => live.rotatePage(cur, 90))), pb('↑', 'Move up', () => pageOp(() => { live.movePage(cur, cur - 1); cur = Math.max(0, cur - 1); })),
    pb('↓', 'Move down', () => pageOp(() => { live.movePage(cur, cur + 1); cur = Math.min(live.count - 1, cur + 1); })), pb('+ Blank page', 'Add a blank page after this one', () => pageOp(() => { live.addBlankPage(cur); cur++; })),
    pb('Delete page', 'Delete this page', () => pageOp(() => { live.deletePage(cur); cur = Math.min(cur, live.count - 1); }))), pageNote);
  const dlBtn = el('button', { class: 'btn', type: 'button', text: 'Download PDF', onclick: () => download() });
  const exportCard = el('div', { class: 'card hidden ed-export' }, HT.stepTitle(2, 'Download'), el('div', { class: 'edexp' }, dlBtn), prog.el);

  // ------------------------------------------------------------------ the page area
  const ib = (t, title, fn) => el('button', { class: 'btn sec sm', type: 'button', text: t, title, 'aria-label': title, onclick: fn });
  const undoB = ib('↶ Undo', 'Undo (Ctrl+Z)', () => step(-1)), redoB = ib('↷ Redo', 'Redo (Ctrl+Y)', () => step(1)), zl = el('span', { class: 'help', style: { minWidth: '44px', textAlign: 'center' }, text: '100%' });
  const pl = el('span', { class: 'help', style: { minWidth: '92px', textAlign: 'center' } });
  const dlTop = el('button', { class: 'btn sm eddl', type: 'button', title: 'Download your edited PDF', text: 'Download PDF', onclick: () => download() });
  const bar = el('div', { class: 'edbar' }, undoB, redoB, el('span', { class: 'edsep' }), ib('−', 'Zoom out', () => setZoom(zoom / 1.25)), zl, ib('+', 'Zoom in', () => setZoom(zoom * 1.25)), ib('Fit', 'Fit the page to the width', () => setZoom(1)),
    el('span', { class: 'edsep' }), ib('‹', 'Previous page', () => go(cur - 1)), pl, ib('›', 'Next page', () => go(cur + 1)), dlTop);
  const stage = el('div', { class: 'edstage' }), scroller = el('div', { class: 'edscroll' }, stage), thumbs = el('div', { class: 'edthumbs' });
  const main = el('div', { class: 'card tmain hidden' }, bar, scroller, thumbs);
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
    if (!view) return []; return (ocrCache.get(i) || []).filter(r => r.goneAt == null || hist < r.goneAt).map((r, n) => {
      const sm = sampleBox({ x: r.x, y: r.y, w: r.w, h: r.h }), oy = r.y + r.h * 0.82, chars = [...r.text].map(c => ({ c, name: null, size: r.size, color: sm.fg, bold: false, italic: false, mono: false, serif: false })), runs = [{ text: r.text, name: null, size: r.size, color: sm.fg, bold: false, italic: false }];
      const line = { bbox: { x: r.x, y: r.y, w: r.w, h: r.h }, ox: r.x, oy, size: r.size, text: r.text, chars, runs, horizontal: true, editable: true };
      return { id: 'o' + n, ocr: true, raw: r, bg: sm.bg, lines: [line], text: r.text, x: r.x, right: r.x + r.w, width: r.w, indent: 0, lineH: r.size * 1.2, oy, size: r.size, chars, runs, align: 'left', wrap: false, bbox: { x: r.x, y: r.y, w: r.w, h: r.h } };
    });
  }
  const bench = HT.bench([dz, list.el, exportCard, toolsCard, stickerCard, propsCard, annCard, pagesCard], main, { keep: true }); bench.classList.add('ed'); toolsCard.classList.add('ed-tools'); propsCard.classList.add('ed-props'); annCard.classList.add('ed-props'); root.append(bench);

  // ------------------------------------------------------------------ opening
  function reset() {
    editing = null; sel = null; view = null; live = file = null; parasCache.clear(); objsCache.clear(); ocrCache.clear(); rev = 0; hist = 0; selObj = null; thumbToken++; [toolsCard, stickerCard, propsCard, annCard, pagesCard, exportCard, main].forEach(c => c.classList.add('hidden')); bench.set(false); stage.textContent = ''; thumbs.textContent = ''; prog.clear();
  }
  async function open(f) {
    prog.clear();
    try { await ready; F = HT.fonts; await F.ready(); live = await HT.pdfLive.open(f); } catch (e) { return HT.toast(e.message || 'Could not open this PDF.'); }
    file = f; cur = 0; zoom = 1; rev = 0; hist = 0; ocrCache.clear(); objsCache.clear(); sel = selObj = editing = null; parasCache.clear();
    if (!fontSel.options.length) for (const ft of F.list) fontSel.append(el('option', { value: ft.id, text: ft.name }));
    fontSel.value = defaults.fontId; sizeIn.value = defaults.size; colorIn.value = defaults.color;
    [toolsCard, pagesCard, exportCard, main].forEach(c => c.classList.remove('hidden')); bench.set(true); setTool('edit'); draw(); buildThumbs();
  }
  const fitWidth = () => Math.max(260, Math.min(1100, (main.clientWidth || 800) - 48));

  // ------------------------------------------------------------------ drawing the page from the PDF
  function parasOf(i) { const k = rev + ':' + i; if (!parasCache.has(k)) parasCache.set(k, [...live.paragraphs(i), ...ocrParas(i)]); return parasCache.get(k); }
  // the pictures and the marks (real annotations) of a page
  const objsOf = i => { const k = rev + ':' + i; if (!objsCache.has(k)) objsCache.set(k, { pics: live.pictures(i), anns: live.annots(i) }); return objsCache.get(k); };
  function draw() {
    if (!live) return; finishEditNow();
    const [w, h] = live.size(cur), z = (fitWidth() / w) * zoom, dpr = Math.min(2, window.devicePixelRatio || 1), id = live.render(cur, z * dpr);
    const canvas = el('canvas', { class: 'edpage' }); canvas.width = id.width; canvas.height = id.height; canvas.style.width = w * z + 'px'; canvas.style.height = h * z + 'px'; canvas.getContext('2d').putImageData(id, 0, 0);
    const layer = el('div', { class: 'edlayer t-' + tool }); layer.addEventListener('pointerdown', onLayerDown);
    stage.textContent = ''; stage.style.width = w * z + 'px'; stage.style.height = h * z + 'px'; stage.append(canvas, layer, ocrCard); view = { z, w, h, dpr, canvas, layer, blank: isBlank(canvas) };
    zl.textContent = Math.round(zoom * 100) + '%'; updateBar(); drawBlocks();
  }
  function drawBlocks() {
    const z = view.z, ps = parasOf(cur), L = objsOf(cur), mkBox = (r, cls, title) => { const d = el('div', { class: cls, title }); Object.assign(d.style, { left: r.x * z - 2 + 'px', top: r.y * z - 1 + 'px', width: Math.max(8, r.w * z + 4) + 'px', height: Math.max(8, r.h * z + 2) + 'px' }); return d; };
    pageNote.textContent = ''; showOcr(!ps.length && !view.blank);
    if (tool === 'select') for (const pc of L.pics) { const d = mkBox(pc.bbox, 'edblock hov edobj', 'Picture'); d.addEventListener('pointerdown', e => onObjDown(e, 'pic', pc)); view.layer.append(d); }
    if (tool === 'edit' || tool === 'select') for (const p of ps) {
      const b = mkBox(p.bbox, 'edblock hov', p.text.slice(0, 60)); b.dataset.id = p.id; b.addEventListener('pointerdown', e => onBlockDown(e, p)); view.layer.append(b);
    }
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
    undoB.disabled = !live || !live.canUndo(); redoB.disabled = !live || !live.canRedo(); pl.textContent = live ? 'Page ' + (cur + 1) + ' / ' + live.count : '';
    thumbs.querySelectorAll('.edth').forEach((t, i) => t.classList.toggle('on', i === cur));
  }
  const go = n => { if (!live || n < 0 || n >= live.count || n === cur) return; cur = n; sel = null; draw(); };
  const setZoom = z => { zoom = Math.max(0.4, Math.min(4, z)); if (live) draw(); };
  function setTool(t) {
    finishEditNow(); tool = t; sel = null; selObj = null; toolBtns.forEach(b => b.classList.toggle('on', b.dataset.t === t)); hint.textContent = HINT[t];
    if (ANN_TOOLS.has(t)) { acolor.value = ANN_COLOUR[t] || '#e5334a'; awidth.value = t === 'pen' ? 2 : t === 'highlight' ? 1 : 3; afillRow.classList.toggle('hidden', !(t === 'rect' || t === 'ellipse')); annForm.classList.remove('hidden'); }
    stickerCard.classList.toggle('hidden', t !== 'sticker' || !live); if (t !== 'sticker') armed = null; else stNow.textContent = armed ? stNow.textContent : 'Nothing chosen yet.';
    if (view) view.layer.className = 'edlayer t-' + t;
    if (live && view) { view.layer.querySelectorAll('.edblock,.edsel,.edobj').forEach(n => n.remove()); drawBlocks(); }
    if (t === 'image') picIn.click();
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
      const r = c.getBoundingClientRect(), vis = r.right > t.left - 200 && r.left < t.right + 200;
      if (!vis) { c._stale = true; return; } c._stale = false;
      try { const [w] = live.size(c._i), id = live.render(c._i, 96 / w); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0); } catch { }
    });
  }

  // ------------------------------------------------------------------ doing things to the PDF, one at a time
  const toast = HT.toast;
  function fail(e) {
    if (e && e.message === 'INDIC') { note.classList.remove('hidden'); note.textContent = ''; note.append('Hindi and other Indian scripts can not be written in this new editor yet. ', el('a', { href: location.pathname, text: 'Use the classic editor for them.' })); return toast('Indian scripts are not supported here yet.'); }
    toast((e && e.message) || 'Something went wrong.');
  }
  function mutate(fn, ocrP) {
    queue = queue.then(async () => {
      try {
        await fn(); rev++; hist++; parasCache.clear(); objsCache.clear();
        for (const list of ocrCache.values()) for (const r of list) if (r.goneAt != null && r.goneAt >= hist) r.goneAt = undefined;   // lines whose edit was undone and then replaced by another edit
        if (ocrP && ocrP.raw) ocrP.raw.goneAt = hist; draw(); refreshThumbs();
      } catch (e) { fail(e); draw(); }
    }); return queue;
  }
  function pageOp(fn) { return mutate(async () => { fn(); }).then(() => { buildThumbs(); }); }
  const step = d => { finishEditNow(); queue = queue.then(() => { if (d < 0 ? live.canUndo() : live.canRedo()) { d < 0 ? live.undo() : live.redo(); hist += d < 0 ? -1 : 1; rev++; parasCache.clear(); objsCache.clear(); cur = Math.min(cur, live.count - 1); sel = null; draw(); buildThumbs(); } }); };

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
      const score = mae + 0.8 * Math.abs(Math.log((cwid / chei) / (kw / kh))); if (!best || score < best.score) best = { score, fontId: id, bold, italic: false, size: px / s2 };
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
  function arm(a, btn) { armed = a; stickerCard.querySelectorAll('.armed').forEach(n => n.classList.remove('armed')); btn.classList.add('armed'); stNow.textContent = (a.kind === 'emoji' ? a.ch : a.text) + ' is ready: click on the page to place it.'; }
  stickerCard.append(HT.stepTitle(4, 'Stickers'), stCats, stGrid, el('div', { class: 'help', style: { margin: '10px 0 6px' }, text: 'Stamps' }), stStamps, stNow); fillEmoji();
  function selectNewStamp(r) { const L = objsOf(cur), best = L.anns.filter(a => a.type === 'Stamp').map(o => ({ o, d: Math.hypot(o.rect.x - r.x, o.rect.y - r.y) })).sort((p1, p2) => p1.d - p2.d)[0]; if (best && best.d < 8) { selObj = { kind: 'ann', o: best.o }; drawSel(); } }
  async function placeSticker(x, y) {
    if (!armed) return toast('Choose a sticker first.');
    const a = armed, img = a.kind === 'emoji' ? await emojiPng(a.ch) : await stampPng(a.text, a.colour), w = a.kind === 'emoji' ? 56 : 170, h = w / img.ratio, [pw, ph] = live.size(cur);
    const r = { x: Math.max(0, Math.min(pw - w, x - w / 2)), y: Math.max(0, Math.min(ph - h, y - h / 2)), w, h };
    await mutate(() => live.addAnnot(cur, { kind: 'stamp', rect: r, bytes: img.bytes })); setTool('select'); selectNewStamp(r);
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
    try { prog.set(30, 'Preparing your PDF...'); await HT.tick(); const blob = live.save(); HT.download(blob, HT.stem(file.name) + '_edited.pdf'); HT.toast('Your PDF is ready'); prog.clear(); }
    catch (e) { prog.error(e.message || 'Something went wrong.'); }
    dlBtn.disabled = dlTop.disabled = false;
  }
  addEventListener('keydown', e => {
    if (!live || !document.contains(root)) return; const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); if (typing) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); step(e.shiftKey ? 1 : -1); } else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); step(1); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && (sel || selObj)) { e.preventDefault(); deleteSel(); } else if (e.key === 'Enter' && sel && tool === 'select') { e.preventDefault(); const p = sel; setTool('edit'); startEdit(p); }
    else if (e.key === 'Escape') { sel = null; selObj = null; drawSel(); } else if ((sel || selObj) && tool === 'select' && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0; if (selObj) moveObj(dx, dy); else moveSel(dx, dy); }
  });
  addEventListener('beforeunload', e => { if (live && rev > 0) { e.preventDefault(); e.returnValue = ''; } });
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => live && !editing && draw(), 200); });
};
