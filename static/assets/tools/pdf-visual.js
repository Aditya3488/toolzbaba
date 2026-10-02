// Organize PDF (visual reorder / rotate / delete) and Sign PDF (draw or type a signature, drag it onto pages).
// The pages are previewed with pdf.js in the browser; the file is only uploaded when you press the final button.

const helpersReady = HT.loadScript('/assets/tools/pdf-helpers.js'); // defines HT.pdf

// ------------------------------------------------------------------ Organize PDF
HT.register('organize-pdf', root => {
  const el = HT.el;
  let file = null, pdf = null, pages = [], dragFrom = -1;
  const grid = el('div', { class: 'pgrid' }), prog = HT.progress(), resultBox = el('div'), summary = el('div', { class: 'help', style: { margin: '10px 0 0' } });
  const save = el('button', { class: 'btn', type: 'button', text: 'Save new PDF', onclick: go });
  const bar = el('div', { class: 'actions', style: { marginTop: 0, marginBottom: '14px' } },
    btn('↻ Rotate all', () => { pages.forEach(p => p.r = (p.r + 90) % 360); pages.forEach(paint); }),
    btn('⇅ Reverse order', () => { pages.reverse(); order(); }),
    btn('Restore deleted', () => { pages.forEach(p => { p.del = false; paint(p); }); count(); }),
    btn('Start over', () => { file = null; pages = []; pdf = null; card.classList.add('hidden'); resultBox.textContent = ''; }));
  const card = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Arrange your pages'), el('p', { class: 'help', style: { marginTop: '-6px' }, text: 'Drag pages to reorder. Use the buttons on a page to rotate or delete it.' }), bar, grid, summary, el('div', { class: 'actions' }, save), prog.el);
  function btn(t, fn) { return el('button', { class: 'btn sec sm', type: 'button', text: t, onclick: fn }); }
  root.append(HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Pages are previewed in your browser. Up to 200 MB.', onFiles: fs => load(fs[0]) }), card, resultBox);

  const BOX = { w: 150, h: 200 };
  function paint(p) {
    const c = p.canvas; if (!c) return;
    const swap = p.r % 180 !== 0, s = swap ? Math.min(BOX.w / c.height, BOX.h / c.width) : Math.min(BOX.w / c.width, BOX.h / c.height);
    c.style.width = c.width * s + 'px'; c.style.height = c.height * s + 'px'; c.style.transform = `rotate(${p.r}deg)`;
    p.el.classList.toggle('deleted', p.del); p.delBtn.textContent = p.del ? 'Restore' : 'Delete'; count();
  }
  function count() { const kept = pages.filter(p => !p.del).length; summary.textContent = `${kept} of ${pages.length} pages will be saved.`; save.disabled = kept === 0; }
  function order() { grid.append(...pages.map(p => p.el)); pages.forEach((p, i) => { p.el.querySelector('.pnum').textContent = 'Page ' + p.p + (p.p !== i + 1 ? ' → ' + (i + 1) : ''); }); }
  function move(p, d) { const i = pages.indexOf(p), j = i + d; if (j < 0 || j >= pages.length) return; pages.splice(i, 1); pages.splice(j, 0, p); order(); }
  function make(n) {
    const p = { p: n, r: 0, del: false, canvas: null };
    const thumb = el('div', { class: 'pthumb' }, el('span', { class: 'help', text: '...' }));
    p.delBtn = el('button', { type: 'button', class: 'linkbtn', onclick: () => { p.del = !p.del; paint(p); } });
    p.el = el('div', { class: 'pcard', draggable: 'true' }, thumb, el('div', { class: 'pnum', text: 'Page ' + n }),
      el('div', { class: 'pbtns' }, el('button', { type: 'button', title: 'Move earlier', onclick: () => move(p, -1), text: '◀' }), el('button', { type: 'button', title: 'Rotate left', onclick: () => { p.r = (p.r + 270) % 360; paint(p); }, text: '↺' }),
        el('button', { type: 'button', title: 'Rotate right', onclick: () => { p.r = (p.r + 90) % 360; paint(p); }, text: '↻' }), el('button', { type: 'button', title: 'Move later', onclick: () => move(p, 1), text: '▶' })), p.delBtn);
    p.thumb = thumb;
    p.el.addEventListener('dragstart', e => { dragFrom = pages.indexOf(p); p.el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(n)); } catch { } });
    p.el.addEventListener('dragend', () => { p.el.classList.remove('dragging'); grid.querySelectorAll('.over').forEach(x => x.classList.remove('over')); });
    p.el.addEventListener('dragover', e => { e.preventDefault(); p.el.classList.add('over'); });
    p.el.addEventListener('dragleave', () => p.el.classList.remove('over'));
    p.el.addEventListener('drop', e => { e.preventDefault(); p.el.classList.remove('over'); const to = pages.indexOf(p); if (dragFrom < 0 || dragFrom === to) return; const [m] = pages.splice(dragFrom, 1); pages.splice(to, 0, m); dragFrom = -1; order(); });
    return p;
  }
  async function load(f) {
    resultBox.textContent = ''; prog.clear(); await helpersReady;
    try { pdf = await HT.pdf.open(f); } catch (e) { return prog.error(e.message); }
    file = f; pages = []; grid.textContent = ''; card.classList.remove('hidden');
    for (let n = 1; n <= pdf.numPages; n++) { const p = make(n); pages.push(p); grid.append(p.el); }
    count();
    for (const p of pages.slice()) { // draw thumbnails one by one so the page stays responsive
      if (pdf === null) return;
      try { const { canvas } = await HT.pdf.render(pdf, p.p, BOX.w); p.canvas = canvas; p.thumb.textContent = ''; p.thumb.append(canvas); paint(p); } catch { p.thumb.textContent = '(preview failed)'; }
    }
  }
  async function go() {
    const plan = pages.filter(p => !p.del).map(p => ({ p: p.p, r: p.r }));
    if (!plan.length) return prog.error('Keep at least one page.');
    save.disabled = true; resultBox.textContent = '';
    try {
      prog.set(0, 'Uploading...');
      const { id } = await HT.upload('organize-pdf', [file], { pages: plan });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Building your PDF...'));
      prog.clear(); resultBox.append(HT.showResult(job, id, [], { compare: false })); resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { prog.error(e.message); }
    save.disabled = false; count();
  }
});

// ------------------------------------------------------------------ Sign PDF
HT.register('sign-pdf', root => {
  const el = HT.el;
  let file = null, pdf = null, sig = null /* {url, w, h} */, pageNo = 1, view = null /* {ratio} */, placements = [], draft = { x: .55, y: .8, w: .25 };
  const prog = HT.progress(), resultBox = el('div');

  // ---- step 2: create the signature
  const tabs = ['Draw', 'Type', 'Upload'], panes = {};
  const tabBar = el('div', { class: 'tabs' }, tabs.map(t => el('button', { class: 'tab' + (t === 'Draw' ? ' on' : ''), type: 'button', text: t, onclick: () => showTab(t) })));
  const showTab = t => { [...tabBar.children].forEach(b => b.classList.toggle('on', b.textContent === t)); tabs.forEach(n => panes[n].classList.toggle('hidden', n !== t)); };
  const penColors = ['#111111', '#0a3cd6', '#c0182b'];
  let pen = penColors[0], drawing = false, last = null;
  const pad = el('canvas', { width: 900, height: 280, class: 'sigpad' }), px = pad.getContext('2d');
  const at = e => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height }; };
  pad.addEventListener('pointerdown', e => { drawing = true; last = at(e); try { pad.setPointerCapture(e.pointerId); } catch { } px.fillStyle = pen; px.beginPath(); px.arc(last.x, last.y, 3, 0, 7); px.fill(); });
  pad.addEventListener('pointermove', e => { if (!drawing) return; const p = at(e); px.strokeStyle = pen; px.lineWidth = 6; px.lineCap = px.lineJoin = 'round'; px.beginPath(); px.moveTo(last.x, last.y); px.lineTo(p.x, p.y); px.stroke(); last = p; });
  ['pointerup', 'pointercancel'].forEach(t => pad.addEventListener(t, () => { drawing = false; }));
  const swatches = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, penColors.map(c => el('button', { type: 'button', 'aria-label': 'Pen colour', style: { width: '26px', height: '26px', borderRadius: '50%', border: '2px solid var(--border2)', background: c, cursor: 'pointer' }, onclick: () => { pen = c; } })));
  panes.Draw = el('div', {}, el('div', { class: 'help', text: 'Draw your signature with the mouse, finger or a pen.' }), el('div', { class: 'pv plain', style: { margin: '8px 0', background: '#fff' } }, pad),
    el('div', { class: 'actions', style: { marginTop: 0 } }, swatches, el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => px.clearRect(0, 0, pad.width, pad.height) }), el('button', { class: 'btn sm', type: 'button', text: 'Use this signature', onclick: () => useCanvas(pad) })));

  const FONTS = [['"Brush Script MT","Segoe Script","Snell Roundhand",cursive', 'Script'], ['"Segoe Script","Lucida Handwriting","Bradley Hand",cursive', 'Handwriting'], ['"Lucida Handwriting","Apple Chancery","URW Chancery L",cursive', 'Elegant'], ['Georgia,"Times New Roman",serif', 'Serif italic']];
  const nameIn = el('input', { type: 'text', placeholder: 'Type your name', oninput: () => typed() }), fontSel = el('select', { onchange: () => typed() }, FONTS.map(([v, t]) => el('option', { value: v, text: t }))), typeCol = el('input', { type: 'color', value: '#0a3cd6', oninput: () => typed() });
  const tcv = HT.canvas(900, 260);
  function typed() { const x = tcv.getContext('2d'); x.clearRect(0, 0, tcv.width, tcv.height); if (!nameIn.value.trim()) return; x.font = `italic 120px ${fontSel.value}`; x.fillStyle = typeCol.value; x.textBaseline = 'middle'; let s = 120; while (x.measureText(nameIn.value).width > 860 && s > 30) { s -= 6; x.font = `italic ${s}px ${fontSel.value}`; } x.fillText(nameIn.value, 20, 130); }
  panes.Type = el('div', { class: 'hidden' }, el('div', { class: 'fields' }, el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Your name' }), nameIn), el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Style' }), fontSel), el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Colour' }), typeCol)),
    el('div', { class: 'pv plain', style: { margin: '12px 0', background: '#fff' } }, tcv), el('button', { class: 'btn sm', type: 'button', text: 'Use this signature', onclick: () => { if (!nameIn.value.trim()) return HT.toast('Type your name first'); useCanvas(tcv); } }));

  const upIn = el('input', { type: 'file', accept: 'image/*' }), keep = el('input', { type: 'checkbox', checked: true });
  panes.Upload = el('div', { class: 'hidden' }, el('div', { class: 'help', text: 'Upload a photo or scan of your signature on white paper.' }), el('div', { style: { margin: '10px 0' } }, upIn),
    el('label', { class: 'chk' }, keep, 'Make the white background transparent'), el('button', { class: 'btn sm', type: 'button', style: { marginTop: '12px' }, text: 'Use this signature', onclick: async () => {
      const f = upIn.files[0]; if (!f) return HT.toast('Choose an image first');
      try { const b = await HT.loadBitmap(f), c = HT.canvas(Math.min(b.width, 1200), Math.min(b.width, 1200) * b.height / b.width), x = c.getContext('2d'); x.drawImage(b, 0, 0, c.width, c.height);
        if (keep.checked) { const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const lum = (a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114); if (lum > 225) a[i + 3] = 0; else if (lum > 150) a[i + 3] = Math.round(255 * (225 - lum) / 75); } x.putImageData(d, 0, 0); }
        useCanvas(c); } catch (e) { HT.toast(e.message); } } }));

  const sigPreview = el('div', { class: 'pv', style: { marginTop: '12px', minHeight: '60px', padding: '8px' } }, el('span', { class: 'help', text: 'Your signature will appear here.' }));
  const sigCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Create your signature'), tabBar, panes.Draw, panes.Type, panes.Upload, sigPreview);
  function useCanvas(c) { // crop to the ink, keep transparency
    const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return HT.toast('Nothing to use yet: draw or type first.');
    const pad = 8, out = HT.canvas(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad); out.getContext('2d').drawImage(c, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
    out.toBlob(b => { sig = { blob: b, url: URL.createObjectURL(b), w: out.width, h: out.height }; sigPreview.textContent = ''; sigPreview.append(el('img', { src: sig.url, alt: 'Your signature', style: { maxHeight: '90px' } })); placeCard.classList.remove('hidden'); showStage(); }, 'image/png');
  }

  // ---- step 3: place it on the pages
  const stage = el('div', { class: 'sigstage' }), pageInfo = el('span', { class: 'help' }), list = el('div', { class: 'help', style: { marginTop: '8px' } });
  const go = el('button', { class: 'btn', type: 'button', text: 'Sign and save PDF', onclick: sign });
  const nav = el('div', { class: 'actions', style: { marginTop: 0, marginBottom: '10px' } }, el('button', { class: 'btn sec sm', type: 'button', text: '◀ Previous', onclick: () => { if (pageNo > 1) { pageNo--; showStage(); } } }), pageInfo,
    el('button', { class: 'btn sec sm', type: 'button', text: 'Next ▶', onclick: () => { if (pdf && pageNo < pdf.numPages) { pageNo++; showStage(); } } }));
  const placeCard = el('div', { class: 'card hidden' }, HT.stepTitle(3, 'Place it on the page'), el('p', { class: 'help', style: { marginTop: '-6px' }, text: 'Drag the signature to the right spot and use the corner to resize. Then add it to this page (or all pages).' }), nav, el('div', { style: { textAlign: 'center' } }, stage),
    el('div', { class: 'actions' }, el('button', { class: 'btn sec', type: 'button', text: 'Add to this page', onclick: () => commit([pageNo]) }), el('button', { class: 'btn sec', type: 'button', text: 'Add to all pages', onclick: () => commit(Array.from({ length: pdf.numPages }, (_, i) => i + 1)) }), el('button', { class: 'btn ghost', type: 'button', text: 'Remove all', onclick: () => { placements = []; showStage(); } })), list,
    el('div', { class: 'actions' }, go), prog.el);
  root.append(HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Your PDF is previewed in your browser. Up to 200 MB.', onFiles: fs => open(fs[0]) }), sigCard, placeCard, resultBox);

  async function open(f) {
    resultBox.textContent = ''; prog.clear(); await helpersReady;
    try { pdf = await HT.pdf.open(f); } catch (e) { return prog.error(e.message); }
    file = f; pageNo = 1; placements = []; sigCard.classList.remove('hidden'); if (sig) placeCard.classList.remove('hidden'); showStage();
  }
  function commit(pages) { pages.forEach(p => placements.push({ page: p, x: draft.x, y: draft.y, w: draft.w, h: hOf(draft.w) })); HT.toast(`Added on ${pages.length} page${pages.length > 1 ? 's' : ''}`); showStage(); }
  const hOf = w => (w * view.pageWidth * sig.h) / (sig.w * view.pageHeight);
  async function showStage() {
    if (!pdf || !sig) return;
    pageInfo.textContent = `Page ${pageNo} of ${pdf.numPages}`;
    const r = await HT.pdf.render(pdf, pageNo, Math.min(680, Math.max(260, root.clientWidth - 60))); view = r;
    stage.textContent = ''; r.canvas.style.width = '100%'; r.canvas.style.height = 'auto'; stage.style.width = Math.min(680, Math.max(260, root.clientWidth - 60)) + 'px'; stage.append(r.canvas);
    placements.forEach((p, i) => { if (p.page !== pageNo) return; const b = box(p, false); b.append(el('button', { type: 'button', class: 'sigx', title: 'Remove', text: '×', onclick: () => { placements.splice(i, 1); showStage(); } })); stage.append(b); });
    const d = box(draft, true); stage.append(d);
    const pgs = [...new Set(placements.map(p => p.page))].sort((a, b) => a - b);
    list.textContent = pgs.length ? 'Signature added on page' + (pgs.length > 1 ? 's' : '') + ': ' + pgs.join(', ') : 'Nothing added yet. Position the signature and press "Add to this page".';
    go.disabled = !placements.length;
  }
  function box(p, live) {
    const b = el('div', { class: 'sigbox' + (live ? ' live' : '') }, el('img', { src: sig.url, alt: '', draggable: 'false' }));
    const place = () => { b.style.left = p.x * 100 + '%'; b.style.top = p.y * 100 + '%'; b.style.width = p.w * 100 + '%'; b.style.height = (live ? hOf(p.w) : p.h) * 100 + '%'; };
    place();
    if (!live) return b;
    const h = el('div', { class: 'sighandle', title: 'Resize' }); b.append(h);
    const rect = () => stage.getBoundingClientRect();
    b.addEventListener('pointerdown', e => { if (e.target === h) return; const r0 = rect(), sx = e.clientX, sy = e.clientY, ox = p.x, oy = p.y; try { b.setPointerCapture(e.pointerId); } catch { }
      const mv = ev => { p.x = Math.max(0, Math.min(1 - p.w, ox + (ev.clientX - sx) / r0.width)); p.y = Math.max(0, Math.min(1 - hOf(p.w), oy + (ev.clientY - sy) / r0.height)); place(); }; const up = () => { b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', up); }; b.addEventListener('pointermove', mv); b.addEventListener('pointerup', up); });
    h.addEventListener('pointerdown', e => { e.stopPropagation(); const r0 = rect(), sx = e.clientX, w0 = p.w; try { h.setPointerCapture(e.pointerId); } catch { }
      const mv = ev => { p.w = Math.max(.05, Math.min(1 - p.x, w0 + (ev.clientX - sx) / r0.width)); if (p.y + hOf(p.w) > 1) p.w = w0; place(); }; const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); }; h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); });
    return b;
  }
  async function sign() {
    if (!placements.length) return prog.error('Add the signature to at least one page first.');
    go.disabled = true; resultBox.textContent = '';
    try {
      prog.set(0, 'Uploading...');
      const sigFile = new File([sig.blob], 'signature.png', { type: 'image/png' });
      const { id } = await HT.upload('sign-pdf', [file, sigFile], { placements });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Signing...'));
      prog.clear(); resultBox.append(HT.showResult(job, id, [], { compare: false })); resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { prog.error(e.message); }
    go.disabled = !placements.length;
  }
});
