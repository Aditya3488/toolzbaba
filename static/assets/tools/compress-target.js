// "Compress to a size you choose", with a live preview.
//   target-jpg: the JPG pages (/compress-jpg, /compress-jpeg, /compress-jpg-under-100kb ...). Everything runs in the browser.
//   target-pdf: the PDF size pages (/compress-pdf-under-100kb ...). Uses the PDF engine, which tries stronger settings until it fits.
const $e = HT.el;
const fmtSize = b => b < 1048576 ? (b < 10240 ? (b / 1024).toFixed(1) : Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(2) + ' MB';

// ------------------------------------------------------------------ the size control: number + KB/MB + slider + presets
const KB_MIN = 5, KB_MAX = 5120;  // the slider runs 5 KB .. 5 MB on a log scale, so small sizes are easy to hit
const posOf = kb => Math.round(1000 * Math.log(Math.min(KB_MAX, Math.max(KB_MIN, kb)) / KB_MIN) / Math.log(KB_MAX / KB_MIN));
const kbOf = pos => KB_MIN * Math.pow(KB_MAX / KB_MIN, pos / 1000);
const snap = kb => (kb < 100 ? Math.round(kb) : kb < 1024 ? Math.round(kb / 10) * 10 : Math.round(kb / 128) * 128);
const PRESETS = [[10, '10 KB'], [20, '20 KB'], [50, '50 KB'], [100, '100 KB'], [200, '200 KB'], [500, '500 KB'], [1024, '1 MB'], [2048, '2 MB']];

function sizeControl(startKb, onChange) {
  let kb = startKb;
  const num = $e('input', { type: 'number', min: 1, step: 'any', 'aria-label': 'Target size' });
  const unit = $e('select', { 'aria-label': 'Unit', style: { width: 'auto' } }, [['KB', 'KB'], ['MB', 'MB']].map(([v, t]) => $e('option', { value: v, text: t })));
  const range = $e('input', { type: 'range', min: 0, max: 1000, 'aria-label': 'Target size slider' });
  const chips = $e('div', { class: 'sizechips' }, PRESETS.map(([v, t]) => $e('button', { type: 'button', class: 'schip', 'data-kb': v, text: t, onclick: () => set(v, true) })));
  const ticks = $e('div', { class: 'sizeticks' }, [[10, '10 KB'], [100, '100 KB'], [1024, '1 MB']].map(([v, t]) => $e('span', { style: { left: posOf(v) / 10 + '%' }, text: t })));
  function show() {
    unit.value = kb >= 1024 ? 'MB' : 'KB'; num.value = kb >= 1024 ? +(kb / 1024).toFixed(2) : Math.round(kb * 10) / 10;
    range.value = posOf(kb); chips.querySelectorAll('.schip').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.kb - kb) < 0.5));
  }
  function set(v, fire) { kb = Math.max(1, Math.min(102400, v)); show(); if (fire) onChange(kb); }
  num.addEventListener('input', () => { const v = parseFloat(num.value); if (v > 0) { kb = Math.min(102400, v * (unit.value === 'MB' ? 1024 : 1)); range.value = posOf(kb); chips.querySelectorAll('.schip').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.kb - kb) < 0.5)); onChange(kb); } });
  unit.addEventListener('change', () => { const v = parseFloat(num.value); if (v > 0) set(v * (unit.value === 'MB' ? 1024 : 1), true); });
  range.addEventListener('input', () => set(snap(kbOf(+range.value)), true));
  show();
  return {
    el: $e('div', { class: 'sizebox' },
      $e('div', { class: 'sizerow' }, $e('label', { class: 'lbl', text: 'Make it smaller than' }), num, unit),
      $e('div', { class: 'sizeslide' }, range, ticks), chips),
    get kb() { return kb; }, set,
  };
}

// ------------------------------------------------------------------ JPG, PNG and "any image" (same screen; PNG shrinks by reducing colours, then pixels)
const srcFmt = f => { const x = (f.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase(), t = f.type || ''; return /jpe?g|jfif/.test(x) || t === 'image/jpeg' ? 'jpg' : x === 'png' || t === 'image/png' ? 'png' : x === 'webp' || t === 'image/webp' ? 'webp' : x === 'gif' || t === 'image/gif' ? 'gif' : 'other'; };
const targetImage = kind => (root, meta) => {
  const PNG = kind === 'png', ANY = kind === 'any', ACCEPT = ANY ? 'image/*,.heic,.heif,.avif,.tif,.tiff' : PNG ? 'image/png,.png' : 'image/jpeg,.jpg,.jpeg,.jfif';
  let mode = ANY ? 'quality' : 'target', sel = 0, token = 0, quality = 75, colors = 256, maxW = 0, outFmt = 'keep', urlA = null, urlB = null;
  // the format a file is written in: fixed on the JPG / PNG pages, "same as the original" (or your choice) on the all-formats page
  const fmtOf = f => (PNG ? 'png' : !ANY ? 'jpg' : outFmt !== 'keep' ? outFmt : ({ jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' })[srcFmt(f)] || 'jpg');
  const bitmaps = new Map(), size = sizeControl(meta.target_kb || 200, () => update());
  const list = HT.fileList({ onChange: files => { for (const k of bitmaps.keys()) if (!files.includes(k)) bitmaps.delete(k); if (sel >= files.length) sel = 0; draw(); update(); } });
  const dz = HT.dropzone({ accept: ACCEPT, multiple: true, hint: (ANY ? 'JPG, PNG, WebP, GIF, AVIF, HEIC...' : PNG ? 'PNG pictures (transparency is kept)' : 'JPG / JPEG pictures') + ', up to 40 at once. Runs in your browser: nothing is uploaded.', onFiles: fs => list.add(fs, true) });

  // ---- settings card
  const modeBtn = (m, t) => $e('button', { type: 'button', class: 'tab' + (m === mode ? ' on' : ''), 'data-m': m, text: t, onclick: () => { mode = m; draw(); update(); } });
  const modes = $e('div', { class: 'tabs', style: { marginBottom: '14px' } }, modeBtn('target', 'Set a target size'), modeBtn('quality', PNG ? 'Choose colours' : 'Choose quality'));
  if (ANY) modes.prepend(modes.lastChild);  // here the quality slider comes first
  const qRange = $e('input', { type: 'range', min: 10, max: 100, value: quality, 'aria-label': 'Quality' }), qVal = $e('span', { class: 'rangeval', text: quality + '%' });
  qRange.addEventListener('input', () => { quality = +qRange.value; qVal.textContent = quality + '%'; update(); });
  const cSel = $e('select', { 'aria-label': 'Colours', style: { width: 'auto' }, onchange: () => { colors = +cSel.value; update(); } }, [[256, '256 (best quality)'], [128, '128'], [64, '64 (smaller)'], [32, '32'], [16, '16 (smallest, flat look)']].map(([v, t]) => $e('option', { value: v, text: t })));
  const cField = $e('div', { class: 'field' }, $e('label', { class: 'lbl', text: 'Colours' }), cSel, $e('div', { class: 'help', text: 'Fewer colours = smaller file. Most graphics look the same at 128 or 64.' }));
  const qField = $e('div', { class: 'field' }, $e('label', { class: 'lbl' }, 'Quality', qVal), qRange, $e('div', { class: 'help', text: 'Lower = smaller file. 70–80% is usually invisible.' }));
  const qBox = $e('div', {}, qField, cField);  // which one shows depends on the format of the picture being previewed
  const fSel = $e('select', { 'aria-label': 'Output format', onchange: () => { outFmt = fSel.value; draw(); update(); } }, [['keep', 'Same as the original'], ['jpg', 'JPG'], ['webp', 'WebP (smaller)'], ['png', 'PNG']].map(([v, t]) => $e('option', { value: v, text: t })));
  const fBox = $e('div', { class: 'field', style: { marginBottom: '14px' } }, $e('label', { class: 'lbl', text: 'Save as' }), fSel);
  const wIn = $e('input', { type: 'number', min: 0, placeholder: 'e.g. 1920', 'aria-label': 'Max width' });
  wIn.addEventListener('input', () => { maxW = Math.max(0, parseInt(wIn.value, 10) || 0); update(); });
  const wBox = $e('div', { class: 'field', style: { marginTop: '14px', maxWidth: '260px' } }, $e('label', { class: 'lbl', text: 'Max width in px (optional)' }), wIn);
  const setCard = $e('div', { class: 'card hidden' }, HT.stepTitle(2, ANY ? 'Compress' : 'Choose the size'), ANY ? fBox : null, modes, size.el, qBox, wBox);

  // ---- preview (right): download on top, then Result / Original / Side by side
  const pick = $e('select', { 'aria-label': 'Which picture to preview', style: { width: 'auto', maxWidth: '100%' }, onchange: () => { sel = +pick.value; update(); } });
  const pvA = $e('div', { class: 'pv' }), pvB = $e('div', { class: 'pv' }), figA = $e('figcaption', { text: 'Original' }), figB = $e('figcaption', { text: 'Result' });
  const verdict = $e('div', { class: 'verdict' }), detail = $e('div', { class: 'help', style: { marginTop: '4px' } }), prog = HT.progress();
  const dlOne = $e('button', { class: 'btn', type: 'button', text: 'Download', disabled: true, onclick: () => saveOne() });
  const dlAll = $e('button', { class: 'btn sec', type: 'button', text: 'Download all (ZIP)', onclick: () => saveAll() });
  let viewMode = innerWidth < 700 ? 'result' : 'both';
  const seg = $e('div', { class: 'seg', role: 'group', 'aria-label': 'What to show' }, [['result', 'Result'], ['original', 'Original'], ['both', 'Side by side']].map(([v, t]) =>
    $e('button', { type: 'button', class: 'segb' + (v === viewMode ? ' on' : ''), 'data-v': v, text: t, onclick: () => { viewMode = v; paintView(); } })));
  const tview = $e('div', { class: 'compare tview v-' + viewMode }, $e('figure', {}, figA, pvA), $e('figure', {}, figB, pvB));
  const paintView = () => { tview.className = 'compare tview v-' + viewMode; seg.querySelectorAll('.segb').forEach(b => b.classList.toggle('on', b.dataset.v === viewMode)); };
  const pvCard = $e('div', { class: 'card tmain hidden' },
    $e('div', { class: 'tbar' }, $e('div', { class: 'tinfo' }, verdict, detail), $e('div', { class: 'actions' }, dlOne, dlAll)),
    $e('div', { class: 'tctl' }, seg, $e('div', { class: 'pickrow' }, pick), $e('button', { class: 'btn sec sm', type: 'button', text: 'Full screen', onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else if (tview.requestFullscreen) tview.requestFullscreen(); } })), tview, prog.el);
  // everything you can change lives in the left sidebar (file, size, mode); the right side is only the preview
  const bench = $e('div', { class: 'tbench pf' }, $e('div', { class: 'tside' }, dz, list.el, setCard), pvCard);
  root.append(bench);
  let shown = false;

  function draw() {
    const n = list.files.length;
    setCard.classList.toggle('hidden', !n); pvCard.classList.toggle('hidden', !n); bench.classList.toggle('on', n > 0);
    if (n && !shown) setTimeout(() => bench.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);  // bring settings + preview into view on the first file
    shown = n > 0;
    modes.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    size.el.classList.toggle('hidden', mode !== 'target'); qBox.classList.toggle('hidden', mode !== 'quality');
    const cur = list.files[sel] ? fmtOf(list.files[sel]) : 'jpg'; qField.classList.toggle('hidden', cur === 'png' || cur === 'gif'); cField.classList.toggle('hidden', cur !== 'png');
    pick.textContent = ''; list.files.forEach((f, i) => pick.append($e('option', { value: i, text: f.name })));
    pick.value = sel; pick.parentElement.classList.toggle('hidden', n < 2);
    dlAll.classList.toggle('hidden', n < 2); dlOne.textContent = n < 2 ? 'Download' : 'Download this one';
  }

  const bmpOf = async f => { if (!bitmaps.has(f)) bitmaps.set(f, await HT.loadBitmap(f)); return bitmaps.get(f); };
  const encOf = fmt => (c, q) => HT.encode(c, fmt === 'webp' ? 'image/webp' : 'image/jpeg', q);
  const encPng = async (c, n) => { await HT.loadScript('/assets/engine/image.js'); return HT.img.encode(c, 'png', { pngColors: n }); };

  // PNG: first fewer colours at full size; if that is not enough, shrink the pixels (sizes are estimated from the last try),
  // then see whether a better palette still fits at the final size.
  async function makePng(f, bmp) {
    let w = bmp.width, h = bmp.height; const w0 = w, h0 = h;
    if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const canvas = (cw, ch) => (cw === bmp.width && ch === bmp.height ? HT.toCanvas(bmp) : HT.resample(bmp, cw, ch));
    if (mode === 'quality') { const blob = await encPng(canvas(w, h), colors); return { blob, w, h, colors, reached: true, scaled: w !== w0, w0, h0 }; }
    const limit = size.kb * 1024;
    if (f.size <= limit && !maxW && srcFmt(f) === 'png') return { blob: f, w: w0, h: h0, reached: true, kept: true, w0, h0 };
    let c = canvas(w, h), last = null;
    for (const n of [256, 128, 64, 32]) { const b = await encPng(c, n); last = { blob: b, colors: n }; if (b.size <= limit) return { ...last, w, h, reached: true, scaled: w !== w0, w0, h0 }; }
    let cur = await encPng(c, 64);
    for (let tries = 0; tries < 8; tries++) {
      const s = Math.max(0.3, Math.min(0.92, Math.sqrt(limit / cur.size) * 0.94));
      w = Math.max(16, Math.round(w * s)); h = Math.max(16, Math.round(h * s)); c = canvas(w, h); cur = await encPng(c, 64);
      if (cur.size <= limit) {
        let best = { blob: cur, colors: 64 };
        for (const n of [256, 128]) { const b = await encPng(c, n); if (b.size <= limit) { best = { blob: b, colors: n }; break; } }
        return { ...best, w, h, reached: true, scaled: true, w0, h0 };
      }
      if (w <= 16 && h <= 16) break;
    }
    return { blob: cur, w, h, colors: 64, reached: false, scaled: true, w0, h0 };
  }

  // The picture at the best quality that still fits. JPEG size depends mostly on the pixel count, so: measure once at a
  // good quality, shrink the picture by the amount needed, then search the highest quality that fits.
  async function make(f, bmp) {
    const fmt = fmtOf(f);
    if (fmt === 'gif') return { blob: f, gif: true, ext: 'gif', w: bmp.width, h: bmp.height, w0: bmp.width, h0: bmp.height, reached: true };  // animations are not touched here
    if (fmt === 'png') return { ...await makePng(f, bmp), ext: 'png' };
    return { ...await makeLossy(f, bmp, fmt), ext: fmt === 'webp' ? 'webp' : 'jpg' };
  }
  async function makeLossy(f, bmp, fmt) {
    const enc = encOf(fmt);
    let w = bmp.width, h = bmp.height; const w0 = w, h0 = h;
    if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const canvas = (cw, ch) => (cw === bmp.width && ch === bmp.height ? HT.toCanvas(bmp) : HT.resample(bmp, cw, ch));
    if (mode === 'quality') { const blob = await enc(canvas(w, h), quality / 100); return { blob, w, h, q: quality / 100, reached: true, scaled: w !== w0, w0, h0 }; }
    const limit = size.kb * 1024;
    if (f.size <= limit && srcFmt(f) === fmt && !maxW) return { blob: f, w: w0, h: h0, q: null, reached: true, kept: true, w0, h0 };
    let c = canvas(w, h), top = await enc(c, 0.92);
    if (top.size <= limit) return { blob: top, w, h, q: 0.92, reached: true, scaled: w !== w0, w0, h0 };
    const mid = await enc(c, 0.6);
    if (mid.size > limit) { const s = Math.sqrt(limit / mid.size) * 0.97; w = Math.max(24, Math.round(w * s)); h = Math.max(24, Math.round(h * s)); c = canvas(w, h); }
    let tiny = null;
    for (let tries = 0; tries < 10; tries++) {
      const low = await enc(c, 0.3); tiny = low;
      if (low.size <= limit) {
        let lo = 0.3, hi = 0.92, best = { blob: low, q: 0.3 };
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2, r = await enc(c, m); if (r.size <= limit) { lo = m; best = { blob: r, q: m }; } else hi = m; }
        return { ...best, w, h, reached: true, scaled: w !== w0 || h !== h0, w0, h0 };
      }
      if (w <= 24 && h <= 24) break;
      w = Math.max(24, Math.round(w * 0.88)); h = Math.max(24, Math.round(h * 0.88)); c = canvas(w, h);
    }
    return { blob: tiny, w, h, q: 0.3, reached: false, scaled: true, w0, h0 };
  }

  const busy = () => { token++; verdict.className = 'verdict'; verdict.textContent = 'Working...'; dlOne.disabled = true; };
  const update = () => { if (list.files[sel]) busy(); render(); };
  const render = HT.debounce(async () => {
    const f = list.files[sel]; if (!f) return; const my = ++token;
    try {
      const bmp = await bmpOf(f), r = await make(f, bmp); if (my !== token) return;
      lastResult = r;
      if (urlA) URL.revokeObjectURL(urlA); if (urlB) URL.revokeObjectURL(urlB);
      urlA = URL.createObjectURL(f); urlB = URL.createObjectURL(r.blob);
      pvA.textContent = ''; pvA.append($e('img', { src: urlA, alt: 'Original' })); pvB.textContent = ''; pvB.append($e('img', { src: urlB, alt: 'Result' }));
      figA.textContent = `Original · ${fmtSize(f.size)}`; figB.textContent = `Result · ${fmtSize(r.blob.size)}`;
      const pct = f.size ? Math.round((1 - r.blob.size / f.size) * 100) : 0, limit = size.kb * 1024;
      if (r.gif) { verdict.className = 'verdict warn'; verdict.textContent = 'GIF files keep their animation, so this one is left as it is. Use the GIF tab to make it smaller.'; }
      else if (mode === 'target') {
        verdict.className = 'verdict ' + (r.reached ? 'ok' : 'warn');
        verdict.textContent = r.kept ? `✓ Already under ${fmtSize(limit)}: this file is kept as it is (${fmtSize(f.size)})`
          : r.reached ? `✓ ${fmtSize(r.blob.size)}: under ${fmtSize(limit)}` : `⚠ Smallest possible is ${fmtSize(r.blob.size)}: could not get under ${fmtSize(limit)}. Try a bigger size.`;
      } else { verdict.className = 'verdict ok'; verdict.textContent = `${fmtSize(f.size)} → ${fmtSize(r.blob.size)} (${pct > 0 ? pct + '% smaller' : 'not smaller: try ' + (fmtOf(f) === 'png' ? 'fewer colours' : 'a lower quality')})`; }
      detail.textContent = `${r.w} × ${r.h} px` + (r.q ? ` · quality ${Math.round(r.q * 100)}%` : '') + (r.colors ? ` · ${r.colors} colours` : '') + (r.scaled ? ` · made smaller to fit (was ${r.w0} × ${r.h0} px)` : '') + (pct > 0 && mode === 'target' ? ` · ${pct}% smaller than the original` : '');
      dlOne.disabled = false; prog.clear();
    } catch (e) { if (my === token) { verdict.className = 'verdict warn'; verdict.textContent = ''; prog.error(e.message); } }
  }, 180);
  let lastResult = null;

  const tag = () => (mode === 'target' ? 'under-' + (size.kb >= 1024 ? +(size.kb / 1024).toFixed(2) + 'mb' : Math.round(size.kb) + 'kb') : 'compressed');
  const saveOne = () => { const f = list.files[sel]; if (lastResult) HT.download(lastResult.blob, `${HT.stem(f.name)}_${tag()}.${lastResult.ext}`); };
  async function saveAll() {
    const outs = []; dlAll.disabled = dlOne.disabled = true;
    try {
      for (const [i, f] of list.files.entries()) { prog.set(i / list.files.length * 100, `Compressing ${i + 1} of ${list.files.length}...`); const r = await make(f, await bmpOf(f)); outs.push({ name: `${HT.stem(f.name)}_${tag()}.${r.ext}`, blob: r.blob }); }
      prog.clear(); HT.download(await HT.zip(outs), `compressed-${tag()}.zip`); HT.toast(`Saved ${outs.length} pictures`);
    } catch (e) { prog.error(e.message); }
    dlAll.disabled = false; dlOne.disabled = false;
  }
  draw();
  return { list, accept: ACCEPT };
};
HT.register('target-jpg', targetImage('jpg'));
HT.register('target-png', targetImage('png'));
HT.register('target-any', targetImage('any'));

// ------------------------------------------------------------------ PDF
HT.register('target-pdf', (root, meta) => {
  const pdfHelpers = HT.loadScript('/assets/tools/pdf-helpers.js');
  const list = HT.fileList({ onChange: files => { card.classList.toggle('hidden', !files.length); main.classList.toggle('hidden', !files.length); bench.classList.toggle('on', files.length > 0); if (files.length && !shown) setTimeout(() => bench.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320); shown = files.length > 0; run.disabled = !files.length; } });
  let shown = false;
  const dz = HT.dropzone({ accept: '.pdf,application/pdf', multiple: true, hint: 'PDFs up to 200 MB. They stay on your device. Up to 10 at once.', onFiles: fs => list.add(fs.slice(0, 10 - list.files.length), true) });
  const size = sizeControl(meta.target_kb || 100, kb => { run.textContent = 'Compress to under ' + fmtSize(kb * 1024); });
  const prog = HT.progress(), resultBox = $e('div');
  const run = $e('button', { class: 'btn', type: 'button', disabled: true, text: 'Compress to under ' + fmtSize(size.kb * 1024), onclick: go });
  const card = $e('div', { class: 'card hidden' }, HT.stepTitle(2, 'Choose the size'), size.el,
    $e('p', { class: 'help', style: { marginTop: '12px' }, text: 'It shrinks the pictures inside the PDF, trying stronger settings until the file fits. A PDF that is mostly text cannot get much smaller.' }),
    $e('div', { class: 'actions' }, run), prog.el);
  const hint = $e('div', { class: 'card tmain empty' }, $e('b', { text: 'Your compressed PDF appears here' }), $e('p', { class: 'help', text: 'Choose the size on the left and click Compress. You get the new size, a download button and a preview of the first page.' }));
  const main = $e('div', { class: 'hidden' }, hint, resultBox);
  const bench = $e('div', { class: 'tbench' }, $e('div', { class: 'tside' }, dz, list.el, card), main);  // options on the left, result on the right
  root.append(bench);
  async function go() {
    const files = list.files.slice(), kb = size.kb; resultBox.textContent = ''; hint.classList.remove('hidden'); run.disabled = true;
    try {
      prog.set(0, 'Starting...');
      const { id } = await HT.upload('compress-pdf', files, { target_kb: kb }, () => { });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Compressing...'));
      prog.clear();
      const box = HT.showResult(job, id, [], { compare: false });
      if (files.length === 1 && !/\.zip$/i.test(job.filename)) {  // first page of the result, so you can see it still looks right
        try {
          await pdfHelpers; const blob = await (await fetch(job.url)).blob(), doc = await HT.pdf.open(new File([blob], 'r.pdf')), pg = await HT.pdf.render(doc, 1, 420);
          pg.canvas.style.cssText = 'width:100%;max-width:420px;height:auto;border:1px solid var(--border);border-radius:8px;background:#fff';
          box.querySelector('.actions').before($e('div', { style: { marginBottom: '14px' } }, $e('div', { class: 'help', text: 'First page of the result' }), pg.canvas));
        } catch { /* the preview is a bonus */ }
      }
      box.querySelector('h2').after(box.querySelector('.actions'));  // download button on top
      hint.classList.add('hidden'); resultBox.append(box);
    } catch (e) { prog.error(e.message); }
    run.disabled = !list.files.length;
  }
  return { list, accept: '.pdf,application/pdf' };
});
