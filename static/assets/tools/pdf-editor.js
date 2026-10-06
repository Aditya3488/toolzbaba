// PDF Editor. The page is shown with pdf.js, what you add is a layer of objects on top of it (text, pictures, shapes, highlights ...), and the file is
// built when you download: engine/pdf-edit.js puts the objects into a copy of the PDF with MuPDF. Everything stays in your browser.
const $p = HT.el;
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
const TOOLS = [
  ['select', 'Select', '<path d="M5 3l14 8-6 2-3 6z"/>'], ['text', 'Add text', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'], ['edit', 'Edit text', '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'],
  ['image', 'Picture', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'], ['rect', 'Rectangle', '<rect x="4" y="6" width="16" height="12" rx="1.5"/>'],
  ['ellipse', 'Ellipse', '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>'], ['line', 'Line', '<path d="M5 19L19 5"/>'], ['arrow', 'Arrow', '<path d="M5 19L19 5M10 5h9v9"/>'],
  ['highlight', 'Highlight', '<path d="M9 17l-4 1 1-4 8-8 3 3z"/><path d="M4 21h16" stroke-width="3" opacity=".4"/>'], ['pen', 'Draw', '<path d="M3 17c3-8 5-8 6-3s3 5 5-1 4-5 7-1"/>'],
  ['whiteout', 'White-out', '<path d="M7 20h12M5.5 14.5l7-7 5 5-5.5 5.5H8.5z"/>'],
];
const HINT = { select: 'Click any text of the PDF to change it. Click something you added to move it, use the squares to resize.', text: 'Click on the page (or drag a box) and type.', edit: 'Click the text you want to change. It turns into a box you can type in.',
  image: 'Choose a picture to put on the page.', rect: 'Drag on the page to draw a rectangle.', ellipse: 'Drag on the page to draw an ellipse.', line: 'Drag on the page to draw a line.', arrow: 'Drag on the page to draw an arrow.',
  highlight: 'Drag over text to highlight it.', pen: 'Draw with the mouse or your finger.', whiteout: 'Drag over what you want to hide. It is removed from the file for good (you can turn that off).' };
const SWATCH = ['#fff200', '#7CFC00', '#ff7ac8', '#4cc9ff', '#ffb347'];

HT.register('pdf-editor', root => {
  const ready = Promise.all([HT.loadScript('/assets/tools/pdf-helpers.js'), HT.loadScript('/assets/tools/fonts-helpers.js')]);
  let F = null, file = null, pdf = null, slots = [], objs = [], cur = 0, zoom = 1, tool = 'select', sel = null, editing = null, view = null, nextId = 1, renderToken = 0, thumbToken = 0, renderTask = null;
  const imgs = new Map(), pageCache = new Map(), states = []; let sIdx = -1, measureEl = null;
  const defaults = {
    text: { font: new URLSearchParams(location.search).get('font') || 'open-sans', size: 18, bold: false, italic: false, color: '#111111', align: 'left', lh: 1.25, opacity: 1 },
    rect: { fill: '', stroke: '#e5334a', sw: 3, opacity: 1 }, ellipse: { fill: '', stroke: '#e5334a', sw: 3, opacity: 1 }, line: { stroke: '#e5334a', sw: 3, opacity: 1 }, arrow: { stroke: '#e5334a', sw: 3, opacity: 1 },
    highlight: { color: '#fff200', opacity: 0.45 }, pen: { stroke: '#111111', sw: 3, opacity: 1 }, whiteout: { color: '#ffffff', remove: true }, image: { opacity: 1 },
  };
  const D = type => defaults[type === 'textedit' ? 'text' : type];
  const slotOf = o => slots.find(s => s.id === o.pg), vis = s => (s.rotate % 180 ? [s.h, s.w] : [s.w, s.h]), here = () => objs.filter(o => o.pg === (slots[cur] || {}).id);
  const pageObjs = s => objs.filter(o => o.pg === s.id), prog = HT.progress();

  // ------------------------------------------------------------------ the sidebar
  const list = HT.fileList({ onChange: fs => { if (!fs.length) reset(); } });
  const dz = HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Up to 200 MB. The PDF is edited in your browser and never uploaded.', onFiles: fs => { list.add(fs.slice(0, 1), false); open(fs[0]); } });
  const toolBtns = TOOLS.map(([id, label, glyph]) => $p('button', { type: 'button', class: 'edtool', 'data-t': id, title: label, onclick: () => setTool(id) }, HT.svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`), $p('span', { text: label })));
  const hint = $p('div', { class: 'help', style: { marginTop: '10px' } });
  const toolsCard = $p('div', { class: 'card hidden' }, HT.stepTitle(3, 'Tools'), $p('div', { class: 'edtools' }, toolBtns), hint);
  const propsCard = $p('div', { class: 'card hidden' });
  const pageNote = $p('div', { class: 'help', style: { marginTop: '8px' } });
  const pb = (t, title, fn) => $p('button', { class: 'btn sec sm', type: 'button', text: t, title, onclick: fn });
  const pagesCard = $p('div', { class: 'card hidden' }, HT.stepTitle(5, 'This page'), $p('div', { class: 'actions', style: { marginTop: 0 } },
    pb('↻ Rotate', 'Rotate the page 90°', () => pageOp('rotate')), pb('+ Blank page after', 'Add a blank page after this one', () => pageOp('blank')), pb('◀ Move', 'Move the page earlier', () => pageOp('left')), pb('Move ▶', 'Move the page later', () => pageOp('right')), pb('Delete page', 'Delete this page', () => pageOp('delete'))), pageNote);
  const fmt = $p('select', { 'aria-label': 'Download as' }, [['pdf', 'PDF (.pdf)'], ['docx', 'Word (.docx)'], ['images', 'Page pictures (PNG, in a ZIP)'], ['txt', 'Plain text (.txt)']].map(([v, t]) => $p('option', { value: v, text: t })));
  const dlBtn = $p('button', { class: 'btn', type: 'button', text: 'Download', onclick: download });
  const exportCard = $p('div', { class: 'card hidden ed-export' }, HT.stepTitle(2, 'Download'), $p('div', { class: 'edexp' }, fmt, dlBtn), prog.el);

  // ------------------------------------------------------------------ the page area
  const ib = (t, title, fn) => $p('button', { class: 'btn sec sm', type: 'button', text: t, title, 'aria-label': title, onclick: fn });
  const undoB = ib('↶ Undo', 'Undo (Ctrl+Z)', () => step(-1)), redoB = ib('↷ Redo', 'Redo (Ctrl+Y)', () => step(1)), zl = $p('span', { class: 'help', style: { minWidth: '44px', textAlign: 'center' }, text: '100%' });
  const pl = $p('span', { class: 'help', style: { minWidth: '92px', textAlign: 'center' } });
  const fontsB = $p('button', { class: 'btn sm', type: 'button', title: 'Open the font library: search and preview all the fonts, then use one for your text', text: 'Aa Font library', onclick: () => openFonts() });
  const FMT = { pdf: 'PDF', docx: 'Word', images: 'Pictures', txt: 'Text' };
  const dlTop = $p('button', { class: 'btn sm eddl', type: 'button', title: 'Download your edited file', text: 'Download PDF', onclick: () => download() });
  fmt.addEventListener('change', () => { dlTop.textContent = 'Download ' + FMT[fmt.value]; });
  const bar = $p('div', { class: 'edbar' }, fontsB, $p('span', { class: 'edsep' }), undoB, redoB, $p('span', { class: 'edsep' }), ib('−', 'Zoom out', () => setZoom(zoom / 1.25)), zl, ib('+', 'Zoom in', () => setZoom(zoom * 1.25)), ib('Fit', 'Fit the page to the width', () => setZoom(1)),
    $p('span', { class: 'edsep' }), ib('◀', 'Previous page', () => go(cur - 1)), pl, ib('▶', 'Next page', () => go(cur + 1)), dlTop);
  const stage = $p('div', { class: 'edstage' }), scroller = $p('div', { class: 'edscroll' }, stage), thumbs = $p('div', { class: 'edthumbs' });
  let tipSeen = false; try { tipSeen = !!localStorage.getItem('tz_ed_tip'); } catch { }
  const tip = tipSeen ? null : $p('div', { class: 'edtip' }, $p('span', {}, $p('b', { text: 'Tip: ' }), 'click any text in your PDF to change it. Use the tools on the left to add new things.'), $p('button', { type: 'button', class: 'btn ghost sm', text: 'Got it', onclick: () => { tip.remove(); try { localStorage.setItem('tz_ed_tip', '1'); } catch { } } }));
  const main = $p('div', { class: 'card tmain hidden' }, bar, tip, scroller, thumbs);
  const bench = HT.bench([dz, list.el, exportCard, toolsCard, propsCard, pagesCard], main, { keep: true }); bench.classList.add('ed'); toolsCard.classList.add('ed-tools'); propsCard.classList.add('ed-props'); root.append(bench);
  let replaceTarget = null;
  const picIn = $p('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const f = picIn.files[0]; picIn.value = ''; if (f) await addPicture(f); } }); root.append(picIn);

  // ------------------------------------------------------------------ opening, rendering
  function reset() { file = pdf = null; slots = []; objs = []; sel = editing = view = null; imgs.clear(); pageCache.clear(); states.length = 0; sIdx = -1; [toolsCard, propsCard, pagesCard, exportCard, main].forEach(c => c.classList.add('hidden')); bench.set(false); stage.textContent = ''; thumbs.textContent = ''; prog.clear(); }
  async function open(f) {
    prog.clear();
    try { await ready; F = HT.fonts; await F.ready(); pdf = await HT.pdf.open(f); } catch (e) { return HT.toast(e.message || 'Could not open this PDF.'); }
    file = f; objs = []; sel = editing = null; imgs.clear(); pageCache.clear(); states.length = 0; sIdx = -1; zoom = 1; slots = [];
    for (let n = 1; n <= pdf.numPages; n++) { const pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 1 }); pageCache.set(n - 1, pg); slots.push({ id: nextId++, src: n - 1, w: vp.width, h: vp.height, rotate: 0 }); }
    cur = 0; [toolsCard, propsCard, pagesCard, exportCard, main].forEach(c => c.classList.remove('hidden')); bench.set(true);
    commit(true); setTool('select'); await renderPage(); buildThumbs();
  }
  const fitWidth = () => Math.max(260, Math.min(1100, (main.clientWidth || 800) - 48));
  async function renderPage() {
    const my = ++renderToken, slot = slots[cur]; if (!slot) return;
    if (renderTask) { try { renderTask.cancel(); } catch { } renderTask = null; }
    const [pw, ph] = vis(slot), z = fitWidth() / pw * zoom, dpr = Math.min(2, window.devicePixelRatio || 1), canvas = HT.canvas(Math.max(1, Math.round(pw * z * dpr)), Math.max(1, Math.round(ph * z * dpr)));
    const cx = canvas.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, canvas.width, canvas.height);
    if (slot.src >= 0) {
      const pg = pageCache.get(slot.src) || await pdf.getPage(slot.src + 1), vp = pg.getViewport({ scale: z * dpr, rotation: (pg.rotate + slot.rotate) % 360 });
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      renderTask = pg.render({ canvasContext: canvas.getContext('2d'), canvas, viewport: vp });
      try { await renderTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; }
    }
    if (my !== renderToken) return;
    canvas.style.cssText = `width:${pw * z}px;height:${ph * z}px;display:block`;
    view = { z, pw, ph, canvas, dpr };
    stage.style.width = pw * z + 'px'; stage.style.height = ph * z + 'px'; stage.textContent = ''; stage.append(canvas);
    const layer = $p('div', { class: 'edlayer' }); view.layer = layer; stage.append(layer); layer.addEventListener('pointerdown', onDown);
    drawObjects(); updateBar();
  }
  function drawObjects() {
    if (!view) return; const layer = view.layer; layer.textContent = ''; layer.className = 'edlayer t-' + tool;
    for (const o of here()) layer.append(mkEl(o));
    if (tool === 'edit' || tool === 'select') drawBlocks();
    if (tool === 'select') drawPictures();
    updateSel();
  }
  function updateBar() {
    pl.textContent = `Page ${cur + 1} of ${slots.length}`; zl.textContent = Math.round(zoom * 100) + '%'; undoB.disabled = sIdx <= 0; redoB.disabled = sIdx >= states.length - 1;
    pageNote.textContent = slots[cur] && slots[cur].src < 0 ? 'This is a blank page you added.' : '';
    thumbs.querySelectorAll('.edth').forEach((t, i) => t.classList.toggle('on', i === cur));
  }
  const go = n => { if (n < 0 || n >= slots.length || n === cur) return; finishEdit(); showOcr(false); cur = n; sel = null; renderPage(); renderProps(); };
  const setZoom = z => { zoom = Math.max(0.4, Math.min(4, z)); finishEdit(); renderPage(); };
  async function buildThumbs() {
    thumbs.textContent = ''; const my = ++thumbToken;
    for (const [i, s] of slots.entries()) {
      if (my !== thumbToken) return;
      const c = HT.canvas(10, 10), box = $p('button', { type: 'button', class: 'edth' + (i === cur ? ' on' : ''), title: 'Page ' + (i + 1), onclick: () => go(i) }, c, $p('span', { text: String(i + 1) })); thumbs.append(box);
      try {
        const [pw, ph] = vis(s), k = 96 / pw, pg = s.src >= 0 ? (pageCache.get(s.src) || await pdf.getPage(s.src + 1)) : null;
        c.width = 96; c.height = Math.round(ph * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        if (pg) await pg.render({ canvasContext: x, canvas: c, viewport: pg.getViewport({ scale: k, rotation: (pg.rotate + s.rotate) % 360 }) }).promise;
      } catch { }
    }
  }

  // ------------------------------------------------------------------ objects on the page
  const px = v => v * view.z;
  function mkEl(o) {
    let e;
    if (o.type === 'text' || o.type === 'textedit') { e = $p('div', { class: 'edo edtext' + (o.type === 'textedit' ? ' edit' : '') }); e.textContent = o.text; }
    else if (o.type === 'image') e = $p('img', { class: 'edo edimg', src: (imgs.get(o.img) || {}).url, alt: '', draggable: 'false' });
    else if (o.type === 'line' || o.type === 'arrow' || o.type === 'pen') e = $p('div', { class: 'edo edsvg' });
    else if (o.type === 'origpic') e = $p('div', { class: 'edo edorig', title: 'A picture of the PDF that will be removed' }, $p('span', { text: 'Picture removed' }));
    else e = $p('div', { class: 'edo edshape ' + o.type });
    e.dataset.id = o.id; if (sel && sel.id === o.id) e.classList.add('sel'); styleEl(o, e); return e;
  }
  function styleEl(o, e) {
    const z = view.z, S = e.style;
    if (o.type === 'line' || o.type === 'arrow') {
      const pad = Math.max(8, o.sw * 3), x = Math.min(o.x1, o.x2) - pad, y = Math.min(o.y1, o.y2) - pad, w = Math.abs(o.x2 - o.x1) + 2 * pad, h = Math.abs(o.y2 - o.y1) + 2 * pad, a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(10, o.sw * 4.5);
      S.left = px(x) + 'px'; S.top = px(y) + 'px'; S.width = px(w) + 'px'; S.height = px(h) + 'px'; S.opacity = o.opacity;
      const s = sv('svg', { viewBox: `${x} ${y} ${w} ${h}`, width: px(w), height: px(h), preserveAspectRatio: 'none' });
      const end = o.type === 'arrow' ? [o.x2 - Math.cos(a) * L * 0.6, o.y2 - Math.sin(a) * L * 0.6] : [o.x2, o.y2];
      s.append(sv('path', { d: `M${o.x1} ${o.y1}L${o.x2} ${o.y2}`, stroke: 'transparent', 'stroke-width': Math.max(o.sw, 10), fill: 'none', 'pointer-events': 'stroke' }), sv('path', { d: `M${o.x1} ${o.y1}L${end[0]} ${end[1]}`, stroke: o.stroke, 'stroke-width': o.sw, 'stroke-linecap': 'round', fill: 'none' }));
      if (o.type === 'arrow') s.append(sv('path', { d: `M${o.x2} ${o.y2}L${o.x2 - L * Math.cos(a - 0.42)} ${o.y2 - L * Math.sin(a - 0.42)}L${o.x2 - L * Math.cos(a + 0.42)} ${o.y2 - L * Math.sin(a + 0.42)}Z`, fill: o.stroke }));
      e.textContent = ''; e.append(s); return;
    }
    if (o.type === 'pen') {
      const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]), pad = o.sw * 2 + 4, x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - x + pad, h = Math.max(...ys) - y + pad;
      S.left = px(x) + 'px'; S.top = px(y) + 'px'; S.width = px(w) + 'px'; S.height = px(h) + 'px'; S.opacity = o.opacity;
      const s = sv('svg', { viewBox: `${x} ${y} ${w} ${h}`, width: px(w), height: px(h), preserveAspectRatio: 'none' }), d = o.pts.map((q, k) => (k ? 'L' : 'M') + q[0] + ' ' + q[1]).join('');
      s.append(sv('path', { d, stroke: 'transparent', 'stroke-width': Math.max(o.sw, 10), fill: 'none', 'pointer-events': 'stroke', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }), sv('path', { d, stroke: o.stroke, 'stroke-width': o.sw, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      e.textContent = ''; e.append(s); return;
    }
    S.left = px(o.x) + 'px'; S.top = px(o.y) + 'px'; S.width = px(o.w) + 'px';
    if (o.type === 'text' || o.type === 'textedit') {
      const r = F.resolve(o.font, o.bold, o.italic);
      Object.assign(S, { height: 'auto', minHeight: px(o.size * o.lh) + 'px', fontFamily: `"${F.family(o.font)}", system-ui, sans-serif`, fontSize: px(o.size) + 'px', lineHeight: String(o.lh), fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? 'italic' : 'normal', color: o.color, textAlign: o.align, opacity: o.opacity, background: o.type === 'textedit' ? (o.bg || '#fff') : 'transparent' });
      F.load(o.font, o.bold, o.italic).then(() => { if (e.isConnected) { o.h = e.offsetHeight / view.z; updateSel(); } }).catch(() => { }); o.h = e.offsetHeight / z || o.h; return;
    }
    S.height = px(o.h) + 'px';
    if (o.type === 'rect' || o.type === 'ellipse') Object.assign(S, { background: o.fill || 'transparent', border: o.stroke ? `${Math.max(1, px(o.sw))}px solid ${o.stroke}` : 'none', opacity: o.opacity, boxSizing: 'border-box' });
    else if (o.type === 'highlight') Object.assign(S, { background: o.color, opacity: o.opacity, mixBlendMode: 'multiply' });
    else if (o.type === 'whiteout') Object.assign(S, { background: o.color });
    else if (o.type === 'image') S.opacity = o.opacity;
    else if (o.type === 'origpic') S.background = o.color || '#ffffff';
  }
  const refresh = o => { const e = view && view.layer.querySelector(`[data-id="${o.id}"]`); if (e) { styleEl(o, e); } updateSel(); };
  const find = id => objs.find(o => String(o.id) === String(id));
  const bbox = o => {
    if (o.type === 'line' || o.type === 'arrow') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    if (o.type === 'pen') { const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  };
  const shift = (o, dx, dy) => { if (o.pts) o.pts = o.pts.map(q => [q[0] + dx, q[1] + dy]); else if (o.type === 'line' || o.type === 'arrow') { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; } else { o.x += dx; o.y += dy; } };

  // ---- the selection box with its handles
  function updateSel() {
    if (!view) return; view.layer.querySelectorAll('.edsel').forEach(x => x.remove());
    view.layer.querySelectorAll('.edo.sel').forEach(x => x.classList.remove('sel'));
    if (!sel || sel.pg !== (slots[cur] || {}).id) return;
    const el = view.layer.querySelector(`[data-id="${sel.id}"]`); if (el) el.classList.add('sel');
    if (editing) return;
    const b = bbox(sel), box = $p('div', { class: 'edsel' }); Object.assign(box.style, { left: px(b.x) + 'px', top: px(b.y) + 'px', width: px(b.w) + 'px', height: px(b.h) + 'px' });
    const hs = sel.type === 'line' || sel.type === 'arrow' || sel.type === 'origpic' ? [] : sel.type === 'pen' ? [] : sel.type === 'text' || sel.type === 'textedit' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (const h of hs) box.append($p('i', { class: 'edh h-' + h, 'data-h': h }));
    if (sel.type === 'line' || sel.type === 'arrow') { for (const [h, x, y] of [['p1', sel.x1, sel.y1], ['p2', sel.x2, sel.y2]]) { const d = $p('i', { class: 'edh h-pt', 'data-h': h }); d.style.left = px(x - b.x) + 'px'; d.style.top = px(y - b.y) + 'px'; box.append(d); } box.style.border = 'none'; }
    view.layer.append(box);
  }
  function select(o) { if (editing && (!o || editing.o !== o)) finishEdit(); sel = o; updateSel(); renderProps(); }
  const pt = e => { const r = view.layer.getBoundingClientRect(); return { x: (e.clientX - r.left) / view.z, y: (e.clientY - r.top) / view.z }; };

  // ---- pointer: select, move, resize, draw
  function onDown(e) {
    if (e.button || !view) return; const p = pt(e), h = e.target.closest('.edh'), oEl = e.target.closest('.edo');
    if (h) return beginResize(e, h.dataset.h);
    if (editing && oEl && editing.el === oEl) return;                      // the caret is inside the text
    if (!oEl && e.target.closest('.edpic') && tool === 'select') { select(null); return; }
    if (!oEl && e.target.closest('.edblock') && (tool === 'select' || tool === 'edit')) { if (tool === 'select') select(null); return; }   // its own click handler opens the text
    if (tool === 'select') { if (oEl) { select(find(oEl.dataset.id)); if (e.detail >= 2 && sel && /text/.test(sel.type)) startEdit(sel); else beginMove(e); } else select(null); return; }
    if (tool === 'edit') return;
    if (tool === 'image') { picIn.click(); return; }
    beginCreate(e, p);
  }
  function drag(e, move, up) {
    const mv = ev => move(pt(ev), ev), end = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); up && up(pt(ev), ev); };
    addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', end); e.preventDefault();
  }
  function beginMove(e) {
    const o = sel, start = pt(e); let moved = false, last = start;
    drag(e, p => { const dx = p.x - last.x, dy = p.y - last.y; if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 2 / view.z * 2) return; moved = true; shift(o, dx, dy); last = p; refresh(o); }, () => { if (moved) commit(); });
  }
  function beginResize(e, h) {
    const o = sel; if (!o) return; const b0 = { ...bbox(o) }, o0 = JSON.parse(JSON.stringify(o)), aspect = o.type === 'image' ? b0.w / b0.h : 0;
    drag(e, p => {
      if (h === 'p1' || h === 'p2') { const k = h === 'p1' ? ['x1', 'y1'] : ['x2', 'y2']; o[k[0]] = p.x; o[k[1]] = p.y; return refresh(o); }
      let { x, y, w, h: hh } = b0; const r = x + w, bt = y + hh;
      if (h.includes('e')) w = Math.max(8, p.x - x); if (h.includes('w')) { x = Math.min(p.x, r - 8); w = r - x; }
      if (h.includes('s')) hh = Math.max(8, p.y - y); if (h.includes('n')) { y = Math.min(p.y, bt - 8); hh = bt - y; }
      if (aspect && h.length === 2) { hh = w / aspect; if (h.includes('n')) y = bt - hh; }
      o.x = x; o.y = y; o.w = w; if (!/text/.test(o.type)) o.h = hh; refresh(o);
    }, () => { commit(); });
  }
  function beginCreate(e, p0) {
    const t = tool, base = { id: nextId++, pg: slots[cur].id, type: t, ...JSON.parse(JSON.stringify(D(t))) }; let o = base;
    if (t === 'pen') { o.pts = [[p0.x, p0.y]]; } else if (t === 'line' || t === 'arrow') Object.assign(o, { x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y });
    else if (t === 'text') Object.assign(o, { x: p0.x, y: p0.y, w: 10, h: 10, text: '' }); else Object.assign(o, { x: p0.x, y: p0.y, w: 0, h: 0 });
    objs.push(o); if (t !== 'text') { view.layer.append(mkEl(o)); }
    const redraw = () => { let el = view.layer.querySelector(`[data-id="${o.id}"]`); if (!el && t !== 'text') { el = mkEl(o); view.layer.append(el); } else if (el) styleEl(o, el); };
    let box = null;
    if (t === 'text') { box = $p('div', { class: 'edsel', style: { left: px(p0.x) + 'px', top: px(p0.y) + 'px', width: '0', height: '0' } }); view.layer.append(box); }
    drag(e, p => {
      if (t === 'pen') { o.pts.push([p.x, p.y]); redraw(); return; }
      if (t === 'line' || t === 'arrow') { o.x2 = p.x; o.y2 = p.y; redraw(); return; }
      o.x = Math.min(p0.x, p.x); o.y = Math.min(p0.y, p.y); o.w = Math.abs(p.x - p0.x); o.h = Math.abs(p.y - p0.y);
      if (box) Object.assign(box.style, { left: px(o.x) + 'px', top: px(o.y) + 'px', width: px(o.w) + 'px', height: px(o.h) + 'px' }); else redraw();
    }, () => {
      if (box) box.remove();
      if (t === 'pen') { if (o.pts.length < 2) { objs.splice(objs.indexOf(o), 1); drawObjects(); return; } commit(); return; }
      if (t === 'line' || t === 'arrow') { if (Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4) { o.x2 = o.x1 + 120; o.y2 = o.y1 - 40; } finish(o, t); return; }
      const tiny = o.w < 4 && o.h < 4;
      if (t === 'text') { o.w = o.w < 30 ? 220 : o.w; o.h = o.size * o.lh; }
      else if (tiny) Object.assign(o, t === 'highlight' ? { w: 160, h: 18 } : t === 'whiteout' ? { w: 140, h: 26 } : { w: 140, h: 80 });
      finish(o, t);
    });
    function finish(ob, tt) { drawObjects(); select(ob); if (tt === 'text') startEdit(ob); else if (tt !== 'highlight') setTool('select'); commit(); }
  }

  // ---- text typing
  function startEdit(o) {
    finishEdit(); const el = view.layer.querySelector(`[data-id="${o.id}"]`); if (!el) return; editing = { o, el }; el.classList.add('editing'); el.contentEditable = 'true'; el.spellcheck = false;
    el.addEventListener('input', () => { o.text = el.innerText.replace(/\n$/, ''); o.h = el.offsetHeight / view.z; });
    el.addEventListener('paste', ev => { ev.preventDefault(); document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain')); });
    el.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); finishEdit(); } ev.stopPropagation(); });
    el.addEventListener('blur', () => setTimeout(() => { if (editing && editing.el === el) finishEdit(); }, 0));
    el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); if (!o.text) { r.collapse(false); }
    updateSel(); renderProps();
  }
  function finishEdit() {
    if (!editing) return; const { o, el } = editing; editing = null; el.contentEditable = 'false'; el.classList.remove('editing'); o.text = el.innerText.replace(/\n$/, ''); o.h = el.offsetHeight / view.z;
    if (o.type === 'text' && !o.text.trim()) { objs.splice(objs.indexOf(o), 1); if (sel === o) sel = null; drawObjects(); renderProps(); return; }
    if (o.type === 'textedit' && o.sig && o.sig === sigOf(o)) { objs.splice(objs.indexOf(o), 1); if (sel === o) sel = null; states.pop(); sIdx = states.length - 1; drawObjects(); renderProps(); updateBar(); return; }
    commit(); updateSel();
  }

  // ------------------------------------------------------------------ editing the text that is already in the PDF
  const blocksCache = new Map(), LIST_MARK = /^(?:[\u2022\u25cf\u25cb\u25aa\u25a0\u25e6\u2023*\-\u2013\u2014]|\d{1,3}[.)]|\(?[a-zA-Z][.)])\s/;   // a line that starts like this begins a new list item
  function blocksOf(slot) { return (blocksCache.get(slot.id) || {}).list || []; }
  async function textBlocks(slot) {
    if (blocksCache.has(slot.id)) return blocksCache.get(slot.id).list;
    if (slot.src < 0 || slot.rotate % 360) { blocksCache.set(slot.id, { list: [] }); return []; }
    const pg = pageCache.get(slot.src) || await pdf.getPage(slot.src + 1), vp = pg.getViewport({ scale: 1 }), L = await HT.pdf.lib(), tc = await pg.getTextContent(), items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue; const t = L.Util.transform(vp.transform, it.transform); if (Math.abs(t[1]) > 0.02 || Math.abs(t[2]) > 0.02) continue;   // upright text only
      const size = Math.hypot(t[2], t[3]) || it.height; let name = ''; try { name = (pg.commonObjs.get(it.fontName) || {}).name || ''; } catch { }
      items.push({ str: it.str, x: t[4], f: t[5], w: it.width * vp.scale, size, name });
    }
    items.sort((a, b) => (Math.abs(a.f - b.f) < 2 ? a.x - b.x : a.f - b.f));
    const lines = [];
    for (const it of items) {                                              // pieces on one baseline make a line
      const ln = lines.find(l => Math.abs(l.f - it.f) < it.size * 0.35 && it.x >= l.x + l.w - it.size * 0.6 && it.x - (l.x + l.w) < it.size * 2.2);
      if (ln) { const gap = it.x - (ln.x + ln.w); ln.str += (gap > it.size * 0.12 && !/\s$/.test(ln.str) ? ' ' : '') + it.str; ln.w = it.x + it.w - ln.x; ln.size = Math.max(ln.size, it.size); }
      else lines.push({ str: it.str, x: it.x, f: it.f, w: it.w, size: it.size, name: it.name });
    }
    lines.sort((a, b) => a.f - b.f || a.x - b.x);
    const list = [];
    for (const ln of lines) {                                              // lines under each other with the same left edge and size make a paragraph
      const b = list.find(q => { const l = q.lines[q.lines.length - 1], dy = ln.f - l.f; return Math.abs(ln.x - l.x) < ln.size * 0.6 && dy > ln.size * 0.8 && dy < ln.size * 2.1 && Math.abs(ln.size - l.size) < ln.size * 0.2 && ln.name === l.name; });
      if (b) { b.lines.push(ln); b.w = Math.max(b.w, ln.w); b.parts.push(ln.str); b.bottom = ln.f; } else list.push({ id: list.length, lines: [ln], parts: [ln.str], x: ln.x, w: ln.w, text: ln.str, size: ln.size, name: ln.name, first: ln.f, bottom: ln.f });
    }
    for (const b of list) {   // a line that stops well before the right edge ends its paragraph (bullets, addresses): keep it as its own line
      b.text = b.parts.reduce((acc, t, i) => (i ? acc + (b.lines[i - 1].w >= b.w * 0.8 && !LIST_MARK.test(t) ? ' ' : '\n') + t : t), '');
      b.y = b.first - b.size * 0.95; b.h = b.bottom - b.first + b.size * 1.3; b.lead = b.lines.length > 1 ? (b.bottom - b.first) / (b.lines.length - 1) : b.size * 1.2; }
    blocksCache.set(slot.id, { list }); return list;
  }
  // the pictures of the page: where each one is drawn (pdf.js tells the picture operators and the transform they are drawn with)
  const picCache = new Map();
  async function pictureBlocks(slot) {
    if (picCache.has(slot.id)) return picCache.get(slot.id);
    const out = []; picCache.set(slot.id, out); if (slot.src < 0 || slot.rotate % 360) return out;
    try {
      const pg = pageCache.get(slot.src) || await pdf.getPage(slot.src + 1), L = await HT.pdf.lib(), vp = pg.getViewport({ scale: 1 }), list = await pg.getOperatorList(), O = L.OPS;
      const IMG = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintImageXObjectRepeat, O.paintJpegXObject].filter(v => v !== undefined));
      // 2 x 3 matrices: mul(m1, m2) applies m2 first, then m1 (done here, so it does not depend on the pdf.js version)
      const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]], at = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      let m = vp.transform.slice(); const stack = [];
      for (let i = 0; i < list.fnArray.length; i++) {
        const fn = list.fnArray[i], a = list.argsArray[i];
        if (fn === O.save) stack.push(m.slice()); else if (fn === O.restore) m = stack.pop() || m;
        else if (fn === O.transform) m = mul(m, a);
        else if (fn === O.paintFormXObjectBegin) { stack.push(m.slice()); if (a && a[0]) m = mul(m, a[0]); } else if (fn === O.paintFormXObjectEnd) m = stack.pop() || m;
        else if (IMG.has(fn)) {
          const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(q => at(m, q[0], q[1])), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
          const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
          if (w < 8 || h < 8 || (w * h) / (vp.width * vp.height) > 0.85) continue;      // dots, lines and a scan that fills the whole page are not "pictures to replace"
          if (out.some(q => Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2 && Math.abs(q.w - w) < 2)) continue;
          out.push({ id: out.length, x, y, w, h });
        }
      }
    } catch { }
    return out;
  }
  function removePicture(b) {
    if (!b) return; const o = { id: nextId++, pg: slots[cur].id, type: 'origpic', x: b.x, y: b.y, w: b.w, h: b.h, color: '#ffffff', remove: true, pic: b.id };
    objs.push(o); drawObjects(); select(o); commit();
  }

  async function drawBlocks() {
    const slot = slots[cur], my = renderToken; const list = await textBlocks(slot); if (my !== renderToken || (tool !== 'edit' && tool !== 'select') || !view) return;
    view.layer.querySelectorAll('.edblock').forEach(x => x.remove());
    const why = slot.src < 0 ? 'This page is blank: there is no text to change. Use Add text.' : slot.rotate ? 'Changing the text of the PDF works on pages that are not rotated. Rotate it back, or use Add text.' : 'No text that can be changed was found on this page (it may be a scan or a picture). Cover it with White-out and use Add text instead.';
    const scan = !list.length && slot.src >= 0 && !slot.rotate; showOcr(scan); pageNote.textContent = list.length || scan ? '' : why; if (!list.length) { if (tool === 'edit' && !scan) hint.textContent = why; return; }
    const used = new Set(here().filter(o => o.type === 'textedit').map(o => o.blk));
    for (const b of list) { if (used.has(b.id)) continue; const d = $p('div', { class: 'edblock' + (tool === 'select' ? ' hov' : ''), 'data-b': b.id, title: 'Click to change this text' }); Object.assign(d.style, { left: px(b.x - 2) + 'px', top: px(b.y) + 'px', width: px(b.w + 4) + 'px', height: px(b.h) + 'px' });
      d.addEventListener('click', () => { if (tool === 'select' || tool === 'edit') editBlock(blocksOf(slots[cur]).find(x => String(x.id) === d.dataset.b)); }); view.layer.prepend(d); }
  }
  async function drawPictures() {
    if (tool !== 'select' || !view) return; const slot = slots[cur], my = renderToken, list = await pictureBlocks(slot); if (my !== renderToken || tool !== 'select' || !view) return;
    view.layer.querySelectorAll('.edpic').forEach(x => x.remove());
    const gone = new Set(here().filter(o => o.type === 'origpic').map(o => o.pic));
    for (const b of list) { if (gone.has(b.id)) continue; const d = $p('div', { class: 'edpic', 'data-p': b.id, title: 'A picture of the PDF. Click it to remove or replace it.' }); Object.assign(d.style, { left: px(b.x) + 'px', top: px(b.y) + 'px', width: px(b.w) + 'px', height: px(b.h) + 'px' });
      d.addEventListener('click', () => { if (tool === 'select') removePicture(list.find(x => String(x.id) === d.dataset.p)); }); view.layer.prepend(d); }
  }
  // ---- a scan has no text, only a picture of it. OCR (tesseract, in the browser) reads the picture, and each line it finds becomes a block that
  // can be changed like any other text of the PDF (the picture under it is cleared and the new text is written in its place).
  const TESS = '/assets/vendor/tesseract/'; let ocrWorker = null, ocrLang = '', ocrLog = null;
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };
  async function getOcr(lang) {
    if (ocrWorker && ocrLang === lang) return ocrWorker; if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
    await HT.loadScript(TESS + 'tesseract.min.js');
    ocrWorker = await Tesseract.createWorker(lang, 1, { workerPath: TESS + 'worker.min.js', corePath: TESS + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'), langPath: TESS + 'lang', gzip: true, logger: m => ocrLog && ocrLog(m) });
    ocrLang = lang; return ocrWorker;
  }
  const ocrSel = $p('select', { 'aria-label': 'Language of the scan' }, [['eng+hin', 'English + Hindi'], ['eng', 'English'], ['hin', 'Hindi']].map(([v, t]) => $p('option', { value: v, text: t })));
  const ocrMsg = $p('span', { text: 'This page is a picture (a scan), so its text cannot be changed directly.' }), ocrBtn = $p('button', { class: 'btn sm', type: 'button', text: 'Make the text editable (OCR)', onclick: () => runOcr() });
  const ocrBar = $p('div', { class: 'edtip hidden' }, ocrMsg, ocrSel, ocrBtn); main.insertBefore(ocrBar, scroller);
  const showOcr = on => { ocrBar.classList.toggle('hidden', !on); if (on) { ocrMsg.textContent = 'This page is a picture (a scan), so its text cannot be changed directly.'; ocrBtn.disabled = false; ocrSel.disabled = false; } };
  async function runOcr() {
    const slot = slots[cur], my = renderToken; ocrBtn.disabled = ocrSel.disabled = true; ocrMsg.textContent = 'Starting the reader (the first time it loads about 15 MB)...';
    try {
      ocrLog = m => { if (m.status === 'recognizing text') ocrMsg.textContent = 'Reading the page... ' + Math.round((m.progress || 0) * 100) + '%'; else if (/loading/.test(m.status)) ocrMsg.textContent = 'Loading the reader... ' + Math.round((m.progress || 0) * 100) + '%'; };
      const w = await getOcr(ocrSel.value), r = await HT.pdf.render(pdf, slot.src + 1, 1800, { dpr: 1 }), res = await w.recognize(r.canvas, {}, { blocks: true }), data = res.data || {};
      let lines = data.lines; if (!lines && data.blocks) lines = data.blocks.flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
      const k = vis(slot)[0] / r.canvas.width, list = [];
      for (const ln of lines || []) {
        const text = String(ln.text || '').replace(/\s+/g, ' ').trim(); if (!text || (ln.confidence != null && ln.confidence < 35) || !ln.bbox) continue;
        const x = ln.bbox.x0 * k, top = ln.bbox.y0 * k, w2 = (ln.bbox.x1 - ln.bbox.x0) * k, lh = (ln.bbox.y1 - ln.bbox.y0) * k; if (w2 < 6 || lh < 4) continue;
        const size = Math.max(6, Math.min(60, lh / 1.25)), base = top + lh * 0.82;
        list.push({ id: list.length, lines: [{ str: text, x, f: base, w: w2, size, name: '' }], parts: [text], x, w: w2, text, size, name: '', first: base, bottom: base, y: top, h: lh, lead: size * 1.2, ocr: true });
      }
      blocksCache.set(slot.id, { list });
      if (my !== renderToken) return;
      if (!list.length) { ocrMsg.textContent = 'No text was recognised on this page. Cover it with White-out and use Add text instead.'; ocrBtn.disabled = ocrSel.disabled = false; return; }
      showOcr(false); pageNote.textContent = list.length + ' lines of text were read from this scan. Click one to change it (check the result: scans are not always read perfectly).'; drawObjects();
    } catch (e) { ocrMsg.textContent = 'Could not read this page: ' + (e && e.message || e); ocrBtn.disabled = ocrSel.disabled = false; }
  }

  const guessFont = (name, text) => {
    const n = (name || '').replace(/^[A-Z]{6}\+/, ''), bold = /bold|black|heavy|semibold|demi/i.test(n), italic = /italic|oblique/i.test(n);
    let id = /courier|mono|consolas|lucida console|cousine/i.test(n) ? 'cousine' : /times|serif|georgia|garamond|palatino|cambria|book|minion|tinos|baskerville|roman/i.test(n) && !/sans/i.test(n) ? 'tinos' : 'arimo';
    if (!F.covers(id, text)) { const need = [...F.scriptsOf(text)].find(s => s !== 'latin'); id = need ? (F.list.find(f => f.category === 'indic' && f.scripts.includes(need)) || F.list.find(f => f.scripts.includes(need)) || { id }).id : id; }
    return { id, bold, italic };
  };
  function sample(b) {   // the colour of the letters and of the paper behind them, taken from the picture of the page
    const c = view.canvas, k = view.z * view.dpr, x0 = Math.max(0, Math.floor(b.x * k)), y0 = Math.max(0, Math.floor(b.y * k)), w = Math.min(c.width - x0, Math.ceil(b.w * k)), h = Math.min(c.height - y0, Math.ceil(b.h * k));
    if (w < 2 || h < 2) return { fg: '#111111', bg: '#ffffff' };
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data, px = [], n = d.length / 4; let r = 0, g = 0, bl = 0;
    for (let i = 0; i < n; i++) { const L = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; px.push([L, i]); r += d[i * 4]; g += d[i * 4 + 1]; bl += d[i * 4 + 2]; }
    px.sort((a, b) => a[0] - b[0]); const take = Math.max(1, Math.floor(n * 0.04)); let fr = 0, fg = 0, fb = 0; for (let i = 0; i < take; i++) { const j = px[i][1] * 4; fr += d[j]; fg += d[j + 1]; fb += d[j + 2]; }
    const hx = v => Math.round(v).toString(16).padStart(2, '0'); const med = px[Math.floor(n * 0.9)][1] * 4;
    return { fg: '#' + hx(fr / take) + hx(fg / take) + hx(fb / take), bg: '#' + hx(d[med]) + hx(d[med + 1]) + hx(d[med + 2]) };
  }
  async function editBlock(b) {
    if (!b) return; const f = guessFont(b.name, b.text), col = sample(b); await F.load(f.id, f.bold, f.italic).catch(() => { });
    const lh = Math.max(1, Math.min(2.2, b.lead / b.size)), m = await measure({ text: 'Hg', w: 999, font: f.id, size: b.size, bold: f.bold, italic: f.italic, lh, align: 'left' });
    let boxW = b.w + 6;
    if (b.lines.length === 1) { const others = blocksOf(slots[cur]).filter(x => x !== b && x.x > b.x + b.w - 1 && x.y < b.y + b.h && x.y + x.h > b.y); boxW = Math.max(boxW, others.reduce((m, x) => Math.min(m, x.x - 8), vis(slots[cur])[0] - 30) - b.x); }
    const o = { id: nextId++, pg: slots[cur].id, type: 'textedit', blk: b.id, x: b.x - 0.5, y: b.first - ((lh * b.size - (m.asc + m.desc) * b.size) / 2 + m.asc * b.size), w: boxW, h: b.h, cut: b.ocr ? { x: b.x - 2, y: b.y - 2, w: b.w + 6, h: b.h + 4 } : { x: b.x - 1, y: b.y - 1, w: b.w + 4, h: b.h + 2 },
      text: b.text, font: f.id, size: Math.round(b.size * 10) / 10, bold: f.bold, italic: f.italic, color: col.fg, bg: col.bg, align: 'left', lh, opacity: 1, ...(b.ocr ? { hard: true, fill: col.bg } : {}) };
    o.sig = sigOf(o); objs.push(o); drawObjects(); setTool('select'); select(o); startEdit(o); commit();
  }
  // a text of the PDF that was opened but not changed goes back to being the PDF's own text (nothing is redrawn or redacted for it)
  const sigOf = o => JSON.stringify([o.x, o.y, o.w, o.font, o.size, o.bold, o.italic, o.color, o.align, o.lh, o.opacity, o.text]);

  // ------------------------------------------------------------------ pictures
  async function addPicture(f) {
    let bmp; try { bmp = await HT.loadBitmap(f); } catch (e) { return HT.toast(e.message); }
    const c = HT.toCanvas(bmp), max = 2400, k = Math.min(1, max / Math.max(c.width, c.height)), cv = k < 1 ? HT.resample(c, c.width * k, c.height * k) : c;
    const blob = await HT.encode(cv, /png|gif|webp|svg/.test(f.type) ? 'image/png' : 'image/jpeg', 0.92), id = 'i' + nextId++, ext = blob.type === 'image/png' ? 'png' : 'jpg';
    imgs.set(id, { file: new File([blob], id + '.' + ext, { type: blob.type }), url: URL.createObjectURL(blob), w: cv.width, h: cv.height });
    const [pw, ph] = vis(slots[cur]); let w = Math.min(pw * 0.3, cv.width), h = w * cv.height / cv.width, x = (pw - w) / 2, y = (ph - h) / 2;
    if (replaceTarget) { const t = replaceTarget; replaceTarget = null; const k2 = Math.min(t.w / cv.width, t.h / cv.height); w = cv.width * k2; h = cv.height * k2; x = t.x + (t.w - w) / 2; y = t.y + (t.h - h) / 2; }   // fitted into the place of the removed picture
    const o = { id: nextId++, pg: slots[cur].id, type: 'image', img: id, x, y, w, h, opacity: 1 };
    objs.push(o); setTool('select'); drawObjects(); select(o); commit();
  }

  // ------------------------------------------------------------------ the properties panel
  function setTool(t) {
    finishEdit(); tool = t; if (t !== 'select') sel = null; toolBtns.forEach(b => b.classList.toggle('on', b.dataset.t === t)); hint.textContent = HINT[t] || '';
    if (view) drawObjects(); renderProps(); if (t === 'image') picIn.click();
  }
  function renderProps() {
    propsCard.textContent = ''; const o = sel, type = o ? o.type : tool, T = o || D(type); if (!T || type === 'select' || type === 'edit' && !o || type === 'image' && !o) { propsCard.classList.add('hidden'); return; }
    propsCard.classList.remove('hidden');
    const set = (k, v) => { T[k] = v; if (o) { refresh(o); if (/text/.test(o.type)) { renderPropsSoft(); } commit(); } };
    const row = (label, ctl) => $p('div', { class: 'field', style: { marginBottom: '10px' } }, $p('label', { class: 'lbl', text: label }), ctl);
    const color = (k, label) => row(label, $p('input', { type: 'color', value: T[k] || '#000000', oninput: e => set(k, e.target.value) }));
    const range = (k, label, min, max, step, unit = '') => { const v = $p('span', { class: 'rangeval', text: Math.round(T[k] * 100) / 100 + unit }); const i = $p('input', { type: 'range', min, max, step, value: T[k], oninput: e => { v.textContent = e.target.value + unit; set(k, +e.target.value); } }); return $p('div', { class: 'field', style: { marginBottom: '10px' } }, $p('label', { class: 'lbl' }, label, v), i); };
    const title = { text: 'Text', textedit: 'Edit text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', highlight: 'Highlight', pen: 'Drawing', whiteout: 'White-out', image: 'Picture', origpic: 'Picture of the PDF' }[type];
    propsCard.append(HT.stepTitle(4, title + (o ? '' : ' (for the next one)')));
    if (type === 'text' || type === 'textedit') {
      const fp = F.picker({ value: T.font, text: T.text || '', onChange: id => { set('font', id); renderProps(); } });
      const tog = (label, key, avail) => $p('button', { type: 'button', class: 'edtog' + (T[key] ? ' on' : ''), disabled: avail ? null : 'disabled', title: avail ? label : label + ' is not available in this font', text: label[0], style: { fontWeight: key === 'bold' ? 800 : 500, fontStyle: key === 'italic' ? 'italic' : 'normal' }, onclick: () => { set(key, !T[key]); renderProps(); } });
      const al = ['left', 'center', 'right'].map(a => $p('button', { type: 'button', class: 'edtog' + (T.align === a ? ' on' : ''), title: 'Align ' + a, text: { left: '⬅', center: '⬌', right: '➡' }[a], onclick: () => { set('align', a); renderProps(); } }));
      const hasB = F.has(T.font, 'bold') || F.has(T.font, 'boldItalic'), hasI = F.has(T.font, 'italic') || F.has(T.font, 'boldItalic');
      const sz = $p('input', { type: 'number', min: 4, max: 300, step: 1, value: T.size, oninput: e => { const v = parseFloat(e.target.value); if (v >= 2) set('size', v); } });
      propsCard.append(row('Font', fp), $p('button', { class: 'btn sec sm', type: 'button', style: { margin: '-4px 0 10px' }, text: 'Browse the font library', onclick: () => openFonts() }), $p('div', { class: 'edrow' }, row('Size (pt)', sz), row('Style', $p('div', { class: 'edtogs' }, tog('Bold', 'bold', hasB), tog('Italic', 'italic', hasI))), row('Align', $p('div', { class: 'edtogs' }, al))), color('color', 'Colour'), range('lh', 'Line spacing', 0.9, 2.2, 0.05), range('opacity', 'Opacity', 0.1, 1, 0.05));
      if (o && !F.covers(T.font, T.text || '')) propsCard.append($p('div', { class: 'help', style: { color: 'var(--err)' }, text: 'This font cannot draw some of the letters you typed. Pick a font that covers your script (see Indian scripts in the list).' }));
    } else if (type === 'rect' || type === 'ellipse') {
      const fillOn = $p('input', { type: 'checkbox', checked: !!T.fill, onchange: e => { set('fill', e.target.checked ? (T._f || '#ffe08a') : ''); renderProps(); } });
      propsCard.append($p('label', { class: 'chk', style: { marginBottom: '8px' } }, fillOn, 'Fill'), T.fill ? color('fill', 'Fill colour') : '', color('stroke', 'Line colour'), range('sw', 'Line width', 0.5, 20, 0.5, ' pt'), range('opacity', 'Opacity', 0.1, 1, 0.05));
    } else if (type === 'line' || type === 'arrow' || type === 'pen') propsCard.append(color('stroke', 'Colour'), range('sw', 'Width', 0.5, 24, 0.5, ' pt'), range('opacity', 'Opacity', 0.1, 1, 0.05));
    else if (type === 'highlight') propsCard.append($p('div', { class: 'edsw' }, SWATCH.map(c => $p('button', { type: 'button', class: 'edswb' + (T.color.toLowerCase() === c.toLowerCase() ? ' on' : ''), style: { background: c }, 'aria-label': 'Colour ' + c, onclick: () => { set('color', c); renderProps(); } }))), color('color', 'Colour'), range('opacity', 'Strength', 0.15, 1, 0.05));
    else if (type === 'whiteout') propsCard.append(color('color', 'Cover colour'), $p('label', { class: 'chk' }, $p('input', { type: 'checkbox', checked: !!T.remove, onchange: e => set('remove', e.target.checked) }), 'Remove what is underneath for good'));
    else if (type === 'image') propsCard.append(range('opacity', 'Opacity', 0.1, 1, 0.05));
    else if (type === 'origpic') propsCard.append($p('div', { class: 'help', style: { marginBottom: '10px' }, text: 'This picture is removed from the file for good. Put your own picture in its place, or leave the space empty.' }),
      color('color', 'Fill the empty space with'), $p('div', { class: 'actions', style: { marginTop: '4px' } }, $p('button', { class: 'btn sm', type: 'button', text: 'Replace with my picture', onclick: () => { replaceTarget = o; picIn.click(); } }), $p('button', { class: 'btn sec sm', type: 'button', text: 'Put it back', onclick: removeSel })));
    if (o && type !== 'origpic') propsCard.append($p('div', { class: 'actions', style: { marginTop: '10px' } }, pb('Duplicate', 'Duplicate (Ctrl+D)', duplicate), pb('Bring forward', 'Bring forward', () => zOrder(1)), pb('Send back', 'Send back', () => zOrder(-1)), $p('button', { class: 'btn ghost sm', type: 'button', text: 'Delete', onclick: removeSel })));
  }
  // the whole font library in a window: applies to the selected text, or becomes the font of the next text you add
  async function openFonts() {
    await ready; F = HT.fonts; await F.ready();
    const o = sel && /text/.test(sel.type) ? sel : null, T = o || defaults.text;
    F.library({ current: T.font, text: o ? o.text : '', bold: T.bold, italic: T.italic, onPick: id => {
      T.font = id; if (o) { refresh(o); commit(); } renderProps();
      HT.toast(o ? 'Font changed to ' + F.get(id).name : 'New text will use ' + F.get(id).name);
    } });
  }
  const renderPropsSoft = () => { /* the text box keeps its focus while you change its look: nothing to rebuild */ };
  function removeSel() { if (!sel) return; editing = null; const i = objs.indexOf(sel); if (i >= 0) objs.splice(i, 1); sel = null; drawObjects(); renderProps(); commit(); }
  function duplicate() { if (!sel) return; const c = JSON.parse(JSON.stringify(sel)); c.id = nextId++; shift(c, 14, 14); delete c.blk; objs.push(c); drawObjects(); select(c); commit(); }
  function zOrder(d) { if (!sel) return; const i = objs.indexOf(sel), j = Math.max(0, Math.min(objs.length - 1, i + d)); objs.splice(i, 1); objs.splice(j, 0, sel); drawObjects(); commit(); }

  // ------------------------------------------------------------------ pages
  function pageOp(op) {
    finishEdit(); const s = slots[cur]; if (!s) return;
    if (op === 'rotate') { if (pageObjs(s).length) return HT.toast('Rotate the page before you add things to it.'); s.rotate = (s.rotate + 90) % 360; blocksCache.delete(s.id); picCache.delete(s.id); }
    else if (op === 'blank') { const [w, h] = vis(s); slots.splice(cur + 1, 0, { id: nextId++, src: -1, w, h, rotate: 0 }); cur++; }
    else if (op === 'left' || op === 'right') { const j = cur + (op === 'left' ? -1 : 1); if (j < 0 || j >= slots.length) return; [slots[cur], slots[j]] = [slots[j], slots[cur]]; cur = j; }
    else if (op === 'delete') { if (slots.length < 2) return HT.toast('A PDF needs at least one page.'); if (pageObjs(s).length && !confirm('Delete this page and what you added to it?')) return; objs = objs.filter(o => o.pg !== s.id); slots.splice(cur, 1); cur = Math.min(cur, slots.length - 1); }
    sel = null; commit(); renderPage(); buildThumbs(); renderProps();
  }

  // ------------------------------------------------------------------ undo / redo
  const snap = () => JSON.stringify({ objs, slots });
  function commit(first) { const s = snap(); if (!first && states[sIdx] === s) { updateBar(); return; } states.length = sIdx + 1; states.push(s); if (states.length > 120) states.shift(); sIdx = states.length - 1; updateBar(); }
  function step(d) {
    finishEdit(); const j = sIdx + d; if (j < 0 || j >= states.length) return; sIdx = j; const st = JSON.parse(states[sIdx]); objs = st.objs; slots = st.slots; sel = null; cur = Math.min(cur, slots.length - 1);
    renderPage(); buildThumbs(); renderProps();
  }
  addEventListener('keydown', e => {
    if (!document.body.contains(root) || !pdf) return; const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) || (document.activeElement || {}).isContentEditable;
    if ((e.ctrlKey || e.metaKey) && !typing) { const k = e.key.toLowerCase(); if (k === 'z') { e.preventDefault(); step(e.shiftKey ? 1 : -1); } else if (k === 'y') { e.preventDefault(); step(1); } else if (k === 'd') { e.preventDefault(); duplicate(); } return; }
    if (typing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
    else if (e.key.startsWith('Arrow') && sel) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; shift(sel, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); refresh(sel); commit(); }
    else if (e.key === 'Escape') { if (tool !== 'select') setTool('select'); else select(null); }
  });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (pdf && document.body.contains(root)) renderPage(); }, 250); });

  // ------------------------------------------------------------------ download
  // lines as the browser breaks them, and the font's ascent / descent: the PDF is laid out exactly like the screen
  function domLines(node0, text) {
    const node = node0.firstChild; if (!node || node.nodeType !== 3) return text.split('\n'); const t = node.data, r = document.createRange(), out = []; let line = '', lastTop = null;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]; if (ch === '\n') { out.push(line); line = ''; lastTop = null; continue; }
      r.setStart(node, i); r.setEnd(node, i + 1); const rs = r.getClientRects(), top = rs.length ? Math.round(rs[0].top) : lastTop;
      if (lastTop !== null && top !== null && top > lastTop + 2) { out.push(line); line = ''; }
      line += ch; if (top !== null) lastTop = top;
    }
    out.push(line); return out.map(l => l.replace(/\s+$/, ''));
  }
  async function measure(o) {
    if (!measureEl) { measureEl = $p('div', { 'aria-hidden': 'true' }); Object.assign(measureEl.style, { position: 'fixed', left: '-99999px', top: '0', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSynthesis: 'none', letterSpacing: '0' }); document.body.append(measureEl); }
    await F.load(o.font, o.bold, o.italic).catch(() => { }); const r = F.resolve(o.font, o.bold, o.italic);
    Object.assign(measureEl.style, { width: o.w + 'px', fontFamily: `"${F.family(o.font)}", sans-serif`, fontSize: o.size + 'px', lineHeight: String(o.lh), fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? 'italic' : 'normal', textAlign: o.align || 'left' });
    measureEl.textContent = o.text; const lines = domLines(measureEl, String(o.text)), h = measureEl.offsetHeight;
    const c = HT.canvas(10, 10).getContext('2d'); c.font = `${r.italic ? 'italic ' : ''}${r.bold ? 700 : 400} 100px "${F.family(o.font)}"`; const m = c.measureText('Hg');
    return { lines, h, asc: m.fontBoundingBoxAscent ? m.fontBoundingBoxAscent / 100 : 0.95, desc: m.fontBoundingBoxDescent ? m.fontBoundingBoxDescent / 100 : 0.25 };
  }
  async function plan() {
    finishEdit(); const files = [file], idx = { }, out = [];
    for (const o of objs) {
      const c = JSON.parse(JSON.stringify(o)); c.page = slots.findIndex(s => s.id === o.pg); delete c.id; delete c.pg; if (c.page < 0) continue;
      if (o.type === 'text' || o.type === 'textedit') { if (!String(o.text).trim()) continue; const m = await measure(o); Object.assign(c, { lines: m.lines, asc: m.asc, desc: m.desc, h: m.h }); }
      if (o.type === 'image') { if (!(c.img in idx)) { idx[c.img] = files.length; files.push(imgs.get(c.img).file); } }
      out.push(c);
    }
    return { files, opts: { pages: slots.map(s => ({ src: s.src, w: s.w, h: s.h, rotate: s.rotate })), objects: out, images: idx } };
  }
  const waitJob = async (slug, files, opts, label, from, span) => { const { id } = await HT.upload(slug, files, opts); return HT.poll(id, s => prog.set(from + (s.progress || 0) * span / 100, s.speed || label)); };
  async function download() {
    dlBtn.disabled = dlTop.disabled = true; const kind = fmt.value, stem = HT.stem(file.name);
    try {
      prog.set(2, 'Preparing...'); await HT.tick(); const p = await plan();
      const job = await waitJob('pdf-editor', p.files, p.opts, 'Building your PDF...', 5, kind === 'pdf' ? 90 : 45), blob = await (await fetch(job.url)).blob();
      if (kind === 'pdf') { HT.download(blob, stem + '_edited.pdf'); HT.toast('Your PDF is ready'); }
      else if (kind === 'docx') { const j = await waitJob('pdf-to-word', [new File([blob], stem + '_edited.pdf', { type: 'application/pdf' })], {}, 'Making the Word file...', 50, 45); HT.download(j.url, stem + '_edited.docx'); HT.toast('Your Word file is ready'); }
      else if (kind === 'images') { const j = await waitJob('pdf-to-image', [new File([blob], stem + '_edited.pdf', { type: 'application/pdf' })], { format: 'png', dpi: 150, pages: 'all' }, 'Making the pictures...', 50, 45); HT.download(j.url, j.filename); HT.toast('Your pictures are ready'); }
      else { prog.set(60, 'Reading the text...'); const doc = await HT.pdf.open(new File([blob], 'x.pdf')); let txt = ''; for (let n = 1; n <= doc.numPages; n++) { const tc = await (await doc.getPage(n)).getTextContent(); let y = null, line = ''; const ls = []; for (const it of tc.items) { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 3) { ls.push(line); line = ''; } line += it.str + (it.hasEOL ? '' : ''); y = yy; } ls.push(line); txt += (doc.numPages > 1 ? `--- Page ${n} ---\n` : '') + ls.join('\n') + '\n\n'; }
        HT.download(new Blob([txt.trim() + '\n'], { type: 'text/plain;charset=utf-8' }), stem + '_edited.txt'); HT.toast('Your text file is ready'); }
      prog.clear();
    } catch (e) { prog.error(e.message || 'Something went wrong.'); }
    dlBtn.disabled = dlTop.disabled = false;
  }
});
