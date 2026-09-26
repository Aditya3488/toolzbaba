const PRESETS = [
  ['Instagram', [['Post (square)', 1080, 1080], ['Post (portrait 4:5)', 1080, 1350], ['Post (landscape)', 1080, 566], ['Story / Reel', 1080, 1920], ['Profile picture', 320, 320]]],
  ['Facebook', [['Post', 1200, 630], ['Cover photo', 820, 312], ['Story', 1080, 1920], ['Event cover', 1920, 1005], ['Profile picture', 320, 320]]],
  ['X (Twitter)', [['Post image', 1600, 900], ['Header', 1500, 500], ['Profile picture', 400, 400]]],
  ['LinkedIn', [['Post', 1200, 627], ['Cover banner', 1584, 396], ['Profile picture', 400, 400]]],
  ['YouTube', [['Thumbnail', 1280, 720], ['Channel banner', 2560, 1440], ['Channel icon', 800, 800]]],
  ['Pinterest', [['Pin (2:3)', 1000, 1500], ['Square pin', 1000, 1000]]],
  ['TikTok', [['Video / cover', 1080, 1920], ['Profile picture', 200, 200]]],
  ['WhatsApp', [['Status', 1080, 1920], ['Profile picture', 640, 640]]],
];

// draws `img` into a w x h canvas: cover (crop) or contain (bars / blurred backdrop)
function fitInto(img, w, h, o) {
  const c = HT.canvas(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  if (o.fit === 'contain') {
    if (o.bg === 'blur') { HT.cover(x, img, 0, 0, w, h); const t = HT.canvas(w, h), tx = t.getContext('2d'); tx.filter = 'blur(' + Math.round(Math.max(w, h) / 40) + 'px)'; tx.drawImage(c, -20, -20, w + 40, h + 40); x.drawImage(t, 0, 0); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 0, w, h); }
    else if (o.bg !== 'transparent') { x.fillStyle = o.bg; x.fillRect(0, 0, w, h); }
    const s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
    x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else HT.cover(x, img, 0, 0, w, h, o.fx, o.fy);
  return c;
}

// ------------------------------------------------------------------ Social media resizer
HT.register('social-resizer', root => {
  const el = HT.el;
  const picked = new Set(['Instagram|Post (square)', 'Facebook|Post', 'YouTube|Thumbnail']);
  let files = [], bmps = new Map();
  const list = HT.fileList({ onChange: fs => { files = fs; card.classList.toggle('hidden', !fs.length); draw(); } });
  const opts = HT.form([
    { name: 'fit', label: 'When the shape differs', type: 'select', options: [['cover', 'Crop to fill'], ['contain', 'Fit whole image (add background)']] },
    { name: 'bg', label: 'Background', type: 'select', options: [['blur', 'Blurred copy of the image'], ['#ffffff', 'White'], ['#000000', 'Black'], ['transparent', 'Transparent (PNG)']], showIf: v => v.fit === 'contain' },
    { name: 'fx', label: 'Crop focus ↔', type: 'range', min: 0, max: 100, value: 50, unit: '%', showIf: v => v.fit === 'cover' },
    { name: 'fy', label: 'Crop focus ↕', type: 'range', min: 0, max: 100, value: 50, unit: '%', showIf: v => v.fit === 'cover' },
    { name: 'fmt', label: 'Save as', type: 'select', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']] },
    { name: 'q', label: 'Quality', type: 'range', min: 50, max: 100, value: 92, unit: '%', showIf: v => v.fmt !== 'png' },
  ], () => draw());
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '12px', marginTop: '14px' } });
  const prog = HT.progress();
  const dl = el('button', { class: 'btn', type: 'button', onclick: run }), count = el('div', { class: 'help' });
  const card = el('div', { class: 'hidden' });
  const chooser = el('div', { class: 'card' }, el('h2', { text: 'Choose sizes' }));
  for (const [group, sizes] of PRESETS) {
    const boxes = sizes.map(([n, w, h]) => { const id = group + '|' + n, cb = el('input', { type: 'checkbox', checked: picked.has(id), onchange: () => { cb.checked ? picked.add(id) : picked.delete(id); draw(); } }); return { id, w, h, n, cb, el: el('label', { class: 'chk', style: { marginBottom: '4px' } }, cb, `${n} · ${w}×${h}`) }; });
    const all = el('label', { class: 'chk', style: { fontWeight: 700, margin: '10px 0 6px' } }, el('input', { type: 'checkbox', onchange: e => { boxes.forEach(b => { b.cb.checked = e.target.checked; e.target.checked ? picked.add(b.id) : picked.delete(b.id); }); draw(); } }), group);
    chooser.append(all, el('div', { style: { paddingLeft: '22px' } }, boxes.map(b => b.el)));
  }
  card.append(chooser, el('div', { class: 'card' }, opts.el, grid, count, el('div', { class: 'actions' }, dl), prog.el));
  root.append(HT.dropzone({ accept: 'image/*', multiple: true, hint: 'Add one or more images. Runs in your browser.', onFiles: fs => list.add(fs, true) }), list.el, card);

  const chosen = () => PRESETS.flatMap(([g, s]) => s.map(([n, w, h]) => ({ id: g + '|' + n, g, n, w, h }))).filter(p => picked.has(p.id));
  const bmp = async f => { if (!bmps.has(f)) bmps.set(f, await HT.loadBitmap(f)); return bmps.get(f); };
  const fo = () => { const v = opts.values(); return { fit: v.fit, bg: v.bg, fx: v.fx / 100, fy: v.fy / 100 }; };
  async function draw() {
    grid.textContent = ''; const cs = chosen();
    dl.disabled = !cs.length || !files.length; dl.textContent = !cs.length ? 'Pick at least one size' : `Download ${cs.length * files.length} image${cs.length * files.length > 1 ? 's' : ''}` + (cs.length * files.length > 1 ? ' (ZIP)' : '');
    count.textContent = files.length > 1 ? 'Previews show the first image.' : '';
    if (!files.length) return;
    let b; try { b = await bmp(files[0]); } catch (e) { return prog.error(e.message); }
    prog.clear();
    for (const p of cs.slice(0, 40)) {
      const c = fitInto(b, Math.min(p.w, 320), Math.round(Math.min(p.w, 320) * p.h / p.w), fo());
      grid.append(el('figure', { style: { margin: 0 } }, el('div', { class: 'pv' }, c), el('figcaption', { class: 'help', text: `${p.g} ${p.n} (${p.w}×${p.h})` })));
    }
  }
  async function run() {
    const cs = chosen(), v = opts.values(), [mime, ext] = HT.mimeFor(v.fmt), outs = []; dl.disabled = true;
    try {
      let i = 0;
      for (const f of files) for (const p of cs) {
        prog.set(i++ / (files.length * cs.length) * 100, `Creating ${i}/${files.length * cs.length}...`);
        const c = fitInto(await bmp(f), p.w, p.h, fo());
        const dir = files.length > 1 ? HT.stem(f.name) + '/' : '';
        outs.push({ name: `${dir}${HT.stem(f.name)}_${p.g}-${p.n}_${p.w}x${p.h}`.replace(/[^\w/\-.]+/g, '-').replace(/-+(?=[_.])/g, '') + '.' + ext, blob: await HT.encode(c, mime, v.q / 100) });
      }
      prog.clear();
      if (outs.length === 1) HT.download(outs[0].blob, outs[0].name); else HT.download(await HT.zip(outs), 'social-sizes.zip');
      HT.toast('Saved ' + outs.length + ' image(s)');
    } catch (e) { prog.error(e.message); }
    dl.disabled = false;
  }
});

// ------------------------------------------------------------------ Thumbnail generator
HT.register('thumbnail-generator', root => {
  const el = HT.el;
  let src = null, file = null, videoUrl = null; // src = drawable (ImageBitmap/canvas)
  const video = el('video', { controls: true, muted: true, playsinline: true, style: { width: '100%', maxHeight: '360px', background: '#000', borderRadius: '10px' } });
  const vcard = el('div', { class: 'card hidden' }, el('h2', { text: 'Pick a frame' }), video,
    el('div', { class: 'actions' }, el('button', { class: 'btn sec', type: 'button', text: 'Use this frame', onclick: grab }), el('span', { class: 'help', text: 'Scrub to the moment you want, then click.' })));
  const form = HT.form([
    { name: 'size', label: 'Size', type: 'select', options: [['1280x720', 'YouTube 1280×720 (16:9)'], ['1920x1080', 'Full HD 1920×1080'], ['640x360', 'Small 640×360'], ['800x600', '4:3 800×600'], ['512x512', 'Square 512×512'], ['720x1280', 'Vertical 720×1280'], ['custom', 'Custom...']] },
    { name: 'cw', label: 'Width (px)', type: 'number', value: 1280, min: 16, max: 8000, showIf: v => v.size === 'custom' },
    { name: 'ch', label: 'Height (px)', type: 'number', value: 720, min: 16, max: 8000, showIf: v => v.size === 'custom' },
    { name: 'fit', label: 'Fit', type: 'select', options: [['cover', 'Crop to fill'], ['contain', 'Show everything (blurred backdrop)']] },
    { name: 'fx', label: 'Crop focus ↔', type: 'range', min: 0, max: 100, value: 50, unit: '%', showIf: v => v.fit === 'cover' },
    { name: 'fy', label: 'Crop focus ↕', type: 'range', min: 0, max: 100, value: 50, unit: '%', showIf: v => v.fit === 'cover' },
    { name: 'text', label: 'Title text (optional)', type: 'textarea', placeholder: 'Big headline...\nSecond line' },
    { name: 'pos', label: 'Text position', type: 'select', value: 'bottom', options: [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']], showIf: v => v.text },
    { name: 'tsize', label: 'Text size', type: 'range', min: 4, max: 30, value: 12, unit: '%', showIf: v => v.text },
    { name: 'tcolor', label: 'Text colour', type: 'color', value: '#ffffff', showIf: v => v.text },
    { name: 'scolor', label: 'Outline colour', type: 'color', value: '#000000', showIf: v => v.text },
    { name: 'band', label: 'Dark band behind text', type: 'checkbox', value: true, showIf: v => v.text },
    { name: 'boost', label: 'Boost colours & contrast', type: 'checkbox', help: 'Makes small thumbnails pop.' },
    { name: 'fmt', label: 'Save as', type: 'select', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']] },
    { name: 'maxkb', label: 'Max file size (KB, optional)', type: 'number', min: 20, placeholder: 'e.g. 2000', help: 'YouTube allows up to 2 MB. Quality is lowered automatically to fit.' },
  ], () => draw());
  const pv = el('div', { class: 'pv' }), info = el('div', { class: 'help', style: { marginTop: '8px' } }), prog = HT.progress();
  const dl = el('button', { class: 'btn', type: 'button', text: 'Download thumbnail', onclick: save });
  const main = el('div', { class: 'hidden' }, el('div', { class: 'card' }, form.el), el('div', { class: 'card' }, el('h2', { text: 'Preview' }), pv, info, el('div', { class: 'actions' }, dl), prog.el));
  root.append(HT.dropzone({ accept: 'image/*,video/*', hint: 'An image or a video: runs in your browser, nothing is uploaded.', onFiles: fs => open(fs[0]) }), vcard, main);

  async function open(f) {
    file = f; prog.clear();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (f.type.startsWith('video/')) { videoUrl = URL.createObjectURL(f); video.src = videoUrl; vcard.classList.remove('hidden'); src = null; main.classList.add('hidden'); video.onloadeddata = () => { video.currentTime = Math.min(1, (video.duration || 2) / 3); }; }
    else { vcard.classList.add('hidden'); try { src = await HT.loadBitmap(f); } catch (e) { return prog.error(e.message); } main.classList.remove('hidden'); draw(); }
  }
  function grab() { const c = HT.canvas(video.videoWidth, video.videoHeight); c.getContext('2d').drawImage(video, 0, 0); src = c; main.classList.remove('hidden'); draw(); main.scrollIntoView({ behavior: 'smooth' }); }
  function dims(v) { if (v.size === 'custom') return [v.cw || 1280, v.ch || 720]; return v.size.split('x').map(Number); }
  function render(v) {
    const [w, h] = dims(v);
    const base = fitInto(src, w, h, { fit: v.fit, bg: 'blur', fx: v.fx / 100, fy: v.fy / 100 });
    const c = HT.canvas(w, h), x = c.getContext('2d');
    if (v.boost) x.filter = 'saturate(1.25) contrast(1.12) brightness(1.04)';
    x.drawImage(base, 0, 0); x.filter = 'none';
    const lines = (v.text || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length) {
      let fs = h * v.tsize / 100; x.font = `900 ${fs}px Impact, "Arial Black", system-ui, sans-serif`;
      const widest = Math.max(...lines.map(l => x.measureText(l).width)); if (widest > w * .92) { fs *= w * .92 / widest; x.font = `900 ${fs}px Impact, "Arial Black", system-ui, sans-serif`; }
      const lh = fs * 1.15, bh = lines.length * lh, pad = fs * .5;
      const top = v.pos === 'top' ? pad : v.pos === 'center' ? (h - bh) / 2 : h - bh - pad;
      if (v.band) { const g = x.createLinearGradient(0, top - pad, 0, top + bh + pad); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.25, 'rgba(0,0,0,.55)'); g.addColorStop(.75, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, top - pad, w, bh + pad * 2); }
      x.textAlign = 'center'; x.textBaseline = 'top'; x.lineJoin = 'round'; x.lineWidth = fs / 6; x.strokeStyle = v.scolor; x.fillStyle = v.tcolor;
      lines.forEach((l, i) => { x.strokeText(l, w / 2, top + i * lh); x.fillText(l, w / 2, top + i * lh); });
    }
    return c;
  }
  function draw() { if (!src) return; try { const v = form.values(), c = render(v); pv.textContent = ''; pv.append(c); info.textContent = `${c.width} × ${c.height} px`; prog.clear(); } catch (e) { prog.error(e.message); } }
  async function save() {
    const v = form.values(), [mime, ext] = HT.mimeFor(v.fmt), c = render(v); let q = .92, blob = await HT.encode(c, mime, q);
    if (v.maxkb && mime !== 'image/png') { while (blob.size > v.maxkb * 1024 && q > .3) { q -= .07; blob = await HT.encode(c, mime, q); } }
    HT.download(blob, HT.stem(file.name) + '_thumbnail.' + ext);
    HT.toast(HT.fmtBytes(blob.size) + (v.maxkb && blob.size > v.maxkb * 1024 ? ' (could not reach the size limit; try a smaller size)' : ''));
  }
});
