// Resize a photo or signature to an exact size AND a file-size range in KB (for exam / job / visa forms). Runs in the browser.
HT.register('resize-image-to-kb', root => {
  const el = HT.el;
  const PRESETS = {
    'photo-35x45': { unit: 'cm', w: 3.5, h: 4.5, min: 20, max: 100, dpi: 300 },
    'photo-200x230': { unit: 'px', w: 200, h: 230, min: 20, max: 50, dpi: 200 },
    'sign-140x60': { unit: 'px', w: 140, h: 60, min: 10, max: 20, dpi: 200 },
    'sign-4x2': { unit: 'cm', w: 4, h: 2, min: 0, max: 50, dpi: 300 },
    'photo-2x2in': { unit: 'inch', w: 2, h: 2, min: 0, max: 200, dpi: 300 },
  };
  const bitmaps = new Map();
  const list = HT.fileList({ onChange: fs => { for (const k of bitmaps.keys()) if (!fs.includes(k)) bitmaps.delete(k); card.classList.toggle('hidden', !fs.length); pvCard.classList.toggle('hidden', !fs.length); update(); } });
  const form = HT.form([
    { name: 'preset', label: 'Quick size', type: 'select', value: 'custom', options: [['custom', 'Custom size'], ['photo-35x45', 'Photo 3.5 × 4.5 cm, up to 100 KB'], ['photo-200x230', 'Photo 200 × 230 px, 20–50 KB'], ['sign-140x60', 'Signature 140 × 60 px, 10–20 KB'], ['sign-4x2', 'Signature 4 × 2 cm, up to 50 KB'], ['photo-2x2in', 'Photo 2 × 2 inch, up to 200 KB']], help: 'Common sizes. Always follow the instructions on your own form.' },
    { name: 'unit', label: 'Unit', type: 'select', value: 'px', options: [['px', 'Pixels'], ['cm', 'Centimetres'], ['mm', 'Millimetres'], ['inch', 'Inches']] },
    { name: 'w', label: 'Width', type: 'number', value: 200, min: 0.1, step: 0.1 },
    { name: 'h', label: 'Height', type: 'number', value: 230, min: 0.1, step: 0.1 },
    { name: 'dpi', label: 'DPI (print resolution)', type: 'number', value: 300, min: 72, max: 1200, showIf: v => v.unit !== 'px' },
    { name: 'fit', label: 'If the shape is different', type: 'select', options: [['cover', 'Crop to fill'], ['contain', 'Fit inside (white bars)'], ['stretch', 'Stretch to the exact size']] },
    { name: 'min', label: 'Minimum file size (KB, optional)', type: 'number', value: '', min: 0, placeholder: 'e.g. 20' },
    { name: 'max', label: 'Maximum file size (KB)', type: 'number', value: 50, min: 1, placeholder: 'e.g. 50' },
    { name: 'setdpi', label: 'Save the DPI in the file', type: 'checkbox', value: true, help: 'Some forms check for 200 or 300 DPI.' },
  ], v => { if (v.preset !== 'custom' && PRESETS[v.preset] && form._last !== v.preset) { form._last = v.preset; const p = PRESETS[v.preset]; form.set('unit', p.unit); form.set('w', p.w); form.set('h', p.h); form.set('dpi', p.dpi); form.set('min', p.min || ''); form.set('max', p.max); } update(); });
  const pv = el('div', { class: 'pv' }), info = el('div', { class: 'sum', style: { marginTop: '10px' } }), warn = el('div', { class: 'help' }), prog = HT.progress();
  const dl = el('button', { class: 'btn', type: 'button', text: 'Download', disabled: true, onclick: downloadAll });
  const card = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Size and file size'), form.el);
  const pvCard = el('div', { class: 'card hidden' }, HT.stepTitle(3, 'Result'), pv, info, warn, el('div', { class: 'actions' }, dl), prog.el);
  root.append(HT.dropzone({ accept: 'image/*', multiple: true, hint: 'JPG, PNG, WebP, GIF... Runs in your browser: your photo is not uploaded.', onFiles: fs => list.add(fs, true) }), list.el, card, pvCard);

  const bmp = async f => { if (!bitmaps.has(f)) bitmaps.set(f, await HT.loadBitmap(f)); return bitmaps.get(f); };
  function targetPx(v) {
    const k = { px: 1, cm: v.dpi / 2.54, mm: v.dpi / 25.4, inch: v.dpi }[v.unit];
    const W = Math.round(v.w * k), H = Math.round(v.h * k);
    if (!(W >= 8 && H >= 8)) throw new Error('The size is too small.');
    if (W * H > 60e6) throw new Error('That size is too large.');
    return [W, H];
  }
  function draw(b, W, H, fit) {
    const c = HT.canvas(W, H), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    if (fit === 'stretch') x.drawImage(HT.resample(b, W, H), 0, 0);
    else if (fit === 'contain') { const s = Math.min(W / b.width, H / b.height), w = Math.max(1, Math.round(b.width * s)), h = Math.max(1, Math.round(b.height * s)); x.drawImage(HT.resample(b, w, h), (W - w) / 2, (H - h) / 2); }
    else { const s = Math.max(W / b.width, H / b.height), w = Math.max(W, Math.round(b.width * s)), h = Math.max(H, Math.round(b.height * s)); x.drawImage(HT.resample(b, w, h), (W - w) / 2, (H - h) / 2); }
    return c;
  }
  // JPEG bytes: write the DPI into the JFIF header, and pad with comment segments if the file must be at least minBytes
  function finish(buf, dpi, minBytes) {
    let u = new Uint8Array(buf);
    if (dpi) {
      const jfif = u[2] === 0xFF && u[3] === 0xE0 && u[6] === 0x4A && u[7] === 0x46 && u[8] === 0x49 && u[9] === 0x46;
      if (jfif) { u[13] = 1; u[14] = dpi >> 8; u[15] = dpi & 255; u[16] = dpi >> 8; u[17] = dpi & 255; }
      else { const h = new Uint8Array([0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]); const n = new Uint8Array(u.length + h.length); n.set(u.slice(0, 2)); n.set(h, 2); n.set(u.slice(2), 2 + h.length); u = n; }
    }
    if (minBytes && u.length < minBytes) {
      let need = minBytes - u.length + 4; const segs = [];
      while (need > 0) { const n = Math.min(65000, Math.max(1, need - 4)); const s = new Uint8Array(n + 4); s[0] = 0xFF; s[1] = 0xFE; s[2] = (n + 2) >> 8; s[3] = (n + 2) & 255; s.fill(0x20, 4); segs.push(s); need -= n + 4; }
      const extra = segs.reduce((a, s) => a + s.length, 0), out = new Uint8Array(u.length + extra), cut = u[2] === 0xFF && u[3] === 0xE0 ? 4 + ((u[4] << 8) | u[5]) - 2 + 2 : 2;
      out.set(u.slice(0, cut)); let o = cut; segs.forEach(s => { out.set(s, o); o += s.length; }); out.set(u.slice(cut), o); u = out;
    }
    return u;
  }
  async function make(file, v) {
    const W0 = targetPx(v)[0], H0 = targetPx(v)[1], maxB = v.max * 1024, minB = (v.min || 0) * 1024;
    if (!(maxB > 0)) throw new Error('Enter the maximum file size in KB.');
    if (minB && minB > maxB) throw new Error('The minimum size cannot be bigger than the maximum.');
    const b = await bmp(file); let W = W0, H = H0, canvas = draw(b, W, H, v.fit), q = .95, reduced = false, blob;
    const enc = (c, qq) => HT.encode(c, 'image/jpeg', qq);
    for (let guard = 0; guard < 14; guard++) {
      if ((await enc(canvas, .05)).size > maxB) { W = Math.max(16, Math.round(W * .88)); H = Math.max(16, Math.round(H * .88)); canvas = draw(b, W, H, v.fit); reduced = true; continue; }
      let lo = .05, hi = .98; blob = await enc(canvas, hi);
      if (blob.size <= maxB) { q = hi; break; }
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2, t = await enc(canvas, mid); if (t.size <= maxB) { lo = mid; blob = t; } else hi = mid; }
      q = lo; if (blob.size > maxB) blob = await enc(canvas, lo); break;
    }
    const bytes = finish(await blob.arrayBuffer(), v.setdpi ? (v.unit === 'px' ? Math.round(v.dpi || 200) : Math.round(v.dpi)) : 0, minB);
    return { blob: new Blob([bytes], { type: 'image/jpeg' }), W, H, q, reduced, W0, H0, padded: bytes.length > blob.size + 8 && minB > 0 };
  }
  let token = 0;
  const update = HT.debounce(async () => {
    const my = ++token, f = list.files[0]; dl.disabled = !list.files.length; if (!f) return;
    try {
      const v = form.values(), r = await make(f, v); if (my !== token) return;
      const url = URL.createObjectURL(r.blob); pv.textContent = ''; pv.append(el('img', { src: url, alt: 'Result', onload: () => URL.revokeObjectURL(url) }));
      const kb = r.blob.size / 1024, ok = kb <= v.max + .05 && (!v.min || kb >= v.min - .05);
      info.textContent = `${r.W} × ${r.H} px · ${kb.toFixed(1)} KB` + (v.min ? ` (target ${v.min}–${v.max} KB)` : ` (limit ${v.max} KB)`) + (ok ? '  ✓' : '');
      warn.textContent = (r.reduced ? `To fit under ${v.max} KB the picture had to be made smaller than ${r.W0} × ${r.H0} px. Raise the limit if the size must stay exact. ` : '') + (r.padded ? 'The file was padded with harmless empty data to reach the minimum size. ' : '') + (list.files.length > 1 ? `Preview of the first of ${list.files.length} pictures.` : '');
      prog.clear();
    } catch (e) { prog.error(e.message); }
  }, 150);
  async function downloadAll() {
    const files = list.files.slice(), v = form.values(), outs = []; dl.disabled = true;
    try {
      for (let i = 0; i < files.length; i++) { prog.set(i / files.length * 100, `Processing ${i + 1}/${files.length}...`); const r = await make(files[i], v); outs.push({ name: HT.stem(files[i].name) + '_resized.jpg', blob: r.blob }); }
      prog.clear(); if (outs.length === 1) HT.download(outs[0].blob, outs[0].name); else HT.download(await HT.zip(outs), 'resized-photos.zip');
      HT.toast('Saved ' + (outs.length === 1 ? (outs[0].blob.size / 1024).toFixed(1) + ' KB' : outs.length + ' files'));
    } catch (e) { prog.error(e.message); }
    dl.disabled = false;
  }
});
