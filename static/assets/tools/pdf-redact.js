// Redact or blur parts of a PDF: draw boxes on the page preview, choose black box / white box / blur / pixelate, save.
// The page previews come from pdf.js; the redaction itself runs in the PDF engine (MuPDF), which really removes what is under the boxes.
HT.register('blur-redact-pdf', root => {
  const el = HT.el, helpers = HT.loadScript('/assets/tools/pdf-helpers.js');
  let pdf = null, file = null, pageNo = 1, areas = [], view = null, draft = null, token = 0;

  const list = HT.fileList({ onChange: fs => { if (!fs.length) reset(); } });
  const dz = HT.dropzone({ accept: '.pdf,application/pdf', hint: 'Up to 200 MB. The page previews and the redaction both run in your browser.', onFiles: fs => { list.add(fs, false); open(fs[0]); } });
  const form = HT.form([
    { name: 'mode', label: 'What to put over the area', type: 'select', value: 'black', options: [['black', 'Black box'], ['white', 'White box (erase)'], ['blur', 'Blur'], ['pixelate', 'Pixelate']] },
    { name: 'strength', label: 'Strength', type: 'range', min: 1, max: 10, value: 6, showIf: v => v.mode === 'blur' || v.mode === 'pixelate' },
  ], () => { });
  const count = el('div', { class: 'help', style: { marginTop: '10px' } });
  const go = el('button', { class: 'btn', type: 'button', text: 'Redact and download', disabled: true, onclick: run });
  const clearPage = el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear this page', onclick: () => { areas = areas.filter(a => a.page !== pageNo); paint(); } });
  const clearAll = el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear all', onclick: () => { areas = []; paint(); } });
  const prog = HT.progress();
  const setCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Choose how to hide it'), form.el,
    el('p', { class: 'help', style: { marginTop: '12px' }, text: 'Black and white boxes, blur and pixelate all remove the text and pictures under the area from the file, so they cannot be copied out later.' }), count,
    el('div', { class: 'actions' }, clearPage, clearAll));

  const pageInfo = el('div', { class: 'tinfo' }), stage = el('div', { class: 'rdstage' }), resultBox = el('div');
  const prev = el('button', { class: 'btn sec sm', type: 'button', text: '◀ Previous', onclick: () => { if (pageNo > 1) { pageNo--; show(); } } });
  const next = el('button', { class: 'btn sec sm', type: 'button', text: 'Next ▶', onclick: () => { if (pdf && pageNo < pdf.numPages) { pageNo++; show(); } } });
  const main = el('div', { class: 'card tmain hidden' }, el('div', { class: 'tbar' }, pageInfo, el('div', { class: 'actions' }, prev, next, go)), resultBox,
    el('p', { class: 'help', style: { margin: '0 0 10px' }, text: 'Drag on the page to mark an area to hide. Use × on a box to remove it.' }), el('div', { style: { textAlign: 'center' } }, stage), prog.el);
  const bench = HT.bench([dz, list.el, setCard], main);
  root.append(bench);

  function reset() { pdf = file = null; areas = []; setCard.classList.add('hidden'); main.classList.add('hidden'); bench.set(false); resultBox.textContent = ''; stage.textContent = ''; prog.clear(); }
  async function open(f) {
    resultBox.textContent = ''; prog.clear(); await helpers;
    try { pdf = await HT.pdf.open(f); } catch (e) { return prog.error(e.message); }
    file = f; pageNo = 1; areas = []; setCard.classList.remove('hidden'); main.classList.remove('hidden'); bench.set(true); show();
  }
  const width = () => Math.max(280, Math.min(900, (main.clientWidth || 700) - 40));
  async function show() {
    if (!pdf) return; const my = ++token;
    pageInfo.textContent = `Page ${pageNo} of ${pdf.numPages}`; prev.disabled = pageNo <= 1; next.disabled = pageNo >= pdf.numPages;
    const r = await HT.pdf.render(pdf, pageNo, width()); if (my !== token) return; view = r;
    stage.textContent = ''; r.canvas.style.cssText = 'width:100%;height:auto;display:block'; stage.style.width = width() + 'px'; stage.append(r.canvas); paint();
  }
  function paint() {
    stage.querySelectorAll('.rdbox').forEach(b => b.remove());
    const boxEl = (a, live) => { const b = el('div', { class: 'rdbox' + (live ? ' live' : '') }); Object.assign(b.style, { left: a.x * 100 + '%', top: a.y * 100 + '%', width: a.w * 100 + '%', height: a.h * 100 + '%' }); return b; };
    areas.forEach((a, i) => { if (a.page !== pageNo) return; const b = boxEl(a); b.append(el('button', { type: 'button', class: 'rdx', title: 'Remove', text: '×', onpointerdown: e => e.stopPropagation(), onclick: () => { areas.splice(i, 1); paint(); } })); stage.append(b); });
    if (draft) stage.append(boxEl(draft, true));
    const here = areas.filter(a => a.page === pageNo).length;
    count.textContent = areas.length ? `${areas.length} area${areas.length > 1 ? 's' : ''} marked (${here} on this page).` : 'Nothing marked yet.';
    go.disabled = !areas.length;
  }
  // drawing a box
  stage.addEventListener('pointerdown', e => {
    if (!view || e.button) return; const r = stage.getBoundingClientRect(), x0 = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y0 = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    try { stage.setPointerCapture(e.pointerId); } catch { }
    draft = { x: x0, y: y0, w: 0, h: 0 };
    const mv = ev => { const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)); draft = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) }; paint(); };
    const up = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); if (draft && draft.w > 0.008 && draft.h > 0.008) areas.push({ page: pageNo, ...draft }); draft = null; paint(); };
    stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); e.preventDefault();
  });
  async function run() {
    if (!areas.length) return prog.error('Mark at least one area first.');
    go.disabled = true; resultBox.textContent = '';
    try {
      prog.set(0, 'Starting...');
      const { id } = await HT.upload('blur-redact-pdf', [file], { areas: areas.map(a => ({ ...a })), ...form.values() });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Redacting...'));
      prog.clear();
      const box = HT.showResult(job, id, [], { compare: false }); resultBox.append(box);
      // show the redacted file in the viewer, so you can check the result and mark more
      try { const blob = await (await fetch(job.url)).blob(); file = new File([blob], job.filename, { type: 'application/pdf' }); pdf = await HT.pdf.open(file); areas = []; show(); } catch { /* the download still works */ }
    } catch (e) { prog.error(e.message); }
    go.disabled = !areas.length;
  }
});
