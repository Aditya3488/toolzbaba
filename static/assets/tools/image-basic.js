// ------------------------------------------------------------------ Resize
HT.register('resize-image', root => HT.canvasTool(root, {
  suffix: '_resized', zipName: 'resized-images',
  fields: [
    { name: 'mode', label: 'Resize by', type: 'select', options: [['width', 'Width (keep proportions)'], ['height', 'Height (keep proportions)'], ['percent', 'Percentage'], ['fit', 'Fit inside a box'], ['exact', 'Exact size (may stretch)']] },
    { name: 'w', label: 'Width (px)', type: 'number', value: 1080, min: 1, max: 16000, showIf: v => ['width', 'exact', 'fit'].includes(v.mode) },
    { name: 'h', label: 'Height (px)', type: 'number', value: 1080, min: 1, max: 16000, showIf: v => ['height', 'exact', 'fit'].includes(v.mode) },
    { name: 'pct', label: 'Scale', type: 'range', min: 5, max: 300, value: 50, unit: '%', showIf: v => v.mode === 'percent' },
  ],
  process: async (bmp, v) => {
    const bw = bmp.width, bh = bmp.height; let w, h;
    if (v.mode === 'width') { w = v.w; h = bh * v.w / bw; }
    else if (v.mode === 'height') { h = v.h; w = bw * v.h / bh; }
    else if (v.mode === 'percent') { w = bw * v.pct / 100; h = bh * v.pct / 100; }
    else if (v.mode === 'fit') { const s = Math.min(v.w / bw, v.h / bh); w = bw * s; h = bh * s; }
    else { w = v.w; h = v.h; }
    w = Math.round(w); h = Math.round(h);
    if (!(w >= 1 && h >= 1)) throw new Error('Enter a width/height of at least 1 px.');
    if (w * h > 120e6) throw new Error('That size is too large for the browser (max ~120 megapixels).');
    return HT.resample(bmp, w, h);
  },
}));

// ------------------------------------------------------------------ Rotate & flip
HT.register('rotate-flip', root => HT.canvasTool(root, {
  suffix: '_rotated', zipName: 'rotated-images',
  fields: [
    { name: 'rot', label: 'Rotate', type: 'select', options: [[0, 'None'], [90, '90° clockwise'], [180, '180°'], [270, '90° counter-clockwise']] },
    { name: 'angle', label: 'Straighten / fine angle', type: 'range', min: -45, max: 45, step: 0.5, value: 0, unit: '°', help: 'Tilt by a few degrees, e.g. to level a horizon.' },
    { name: 'flipH', label: 'Flip horizontally (mirror)', type: 'checkbox' },
    { name: 'flipV', label: 'Flip vertically', type: 'checkbox' },
    { name: 'bg', label: 'Corners after tilting', type: 'select', options: [['transparent', 'Transparent (PNG/WebP)'], ['#ffffff', 'White'], ['#000000', 'Black']], showIf: v => v.angle !== 0 },
  ],
  process: async (bmp, v) => {
    const th = (Number(v.rot) + v.angle) * Math.PI / 180, cos = Math.abs(Math.cos(th)), sin = Math.abs(Math.sin(th));
    const w = bmp.width, h = bmp.height;
    const c = HT.canvas(Math.round(w * cos + h * sin), Math.round(w * sin + h * cos)), x = c.getContext('2d');
    if (v.angle !== 0 && v.bg !== 'transparent') { x.fillStyle = v.bg; x.fillRect(0, 0, c.width, c.height); }
    x.translate(c.width / 2, c.height / 2); x.rotate(th); x.scale(v.flipH ? -1 : 1, v.flipV ? -1 : 1);
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, -w / 2, -h / 2);
    return c;
  },
  onReady: ({ root, form }) => {
    const b = (t, fn) => HT.el('button', { class: 'btn sec sm', type: 'button', text: t, onclick: fn });
    const rotBy = d => form.set('rot', (Number(form.values().rot) + d + 360) % 360);
    form.el.before(HT.el('div', { class: 'actions', style: { marginTop: 0, marginBottom: '14px' } },
      b('↺ 90° left', () => rotBy(-90)), b('↻ 90° right', () => rotBy(90)),
      b('⇋ Flip horizontal', () => form.set('flipH', !form.values().flipH)), b('⇅ Flip vertical', () => form.set('flipV', !form.values().flipV)),
      b('Reset', () => { form.set('rot', 0); form.set('angle', 0); form.set('flipH', false); form.set('flipV', false); })));
  },
}));

// ------------------------------------------------------------------ Crop
HT.register('crop-image', root => {
  const el = HT.el;
  let bmp = null, file = null, scale = 1, rect = { x: 0, y: 0, w: 1, h: 1 }, ratio = null, drag = null;
  const view = HT.canvas(10, 10), vx = view.getContext('2d');
  const stage = el('div', { class: 'stage' }, view);
  const readout = el('div', { class: 'help', style: { marginTop: '8px' } });
  const num = n => el('input', { type: 'number', min: 0, oninput: () => fromInputs(), 'data-n': n });
  const nums = { x: num('x'), y: num('y'), w: num('w'), h: num('h') };
  const presets = [['Free', null], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:5', 4 / 5], ['3:4', 3 / 4]];
  const chips = el('div', { class: 'tabs' }, presets.map(([t, r], i) => el('button', { class: 'tab' + (i === 0 ? ' on' : ''), type: 'button', text: t, onclick: e => { ratio = r; [...chips.children].forEach(c => c.classList.toggle('on', c === e.target)); if (r) fitRatio(); draw(); } })));
  const fmt = HT.form([{ name: 'fmt', label: 'Save as', type: 'select', options: [['keep', 'Same as original'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']] }, { name: 'q', label: 'Quality', type: 'range', min: 40, max: 100, value: 92, unit: '%', showIf: v => v.fmt !== 'png' }]);
  const prog = HT.progress();
  const dl = el('button', { class: 'btn', type: 'button', text: 'Crop & download', onclick: save });
  const resetBtn = el('button', { class: 'btn ghost', type: 'button', text: 'Reset', onclick: () => { rect = { x: 0, y: 0, w: bmp.width, h: bmp.height }; if (ratio) fitRatio(); draw(); } });
  // everything you can change is in the left sidebar; the picture with the crop box and the download button are on the right
  const setCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Crop'), chips,
    el('div', { class: 'fields', style: { marginTop: '12px' } }, ...['x', 'y', 'w', 'h'].map(k => el('div', { class: 'field' }, el('label', { class: 'lbl', text: { x: 'X (px)', y: 'Y (px)', w: 'Width (px)', h: 'Height (px)' }[k] }), nums[k]))),
    el('div', { style: { marginTop: '14px' } }, fmt.el), el('div', { class: 'actions' }, resetBtn), prog.el);
  const editor = el('div', { class: 'card tmain hidden' }, el('div', { class: 'tbar' }, el('div', { class: 'tinfo' }, readout), el('div', { class: 'actions' }, dl)), el('div', { style: { textAlign: 'center' } }, stage));
  const bench = HT.bench([HT.dropzone({ accept: 'image/*', hint: 'Runs in your browser: nothing is uploaded.', onFiles: fs => load(fs[0]) }), setCard], editor);
  root.append(bench);

  async function load(f) {
    try { bmp = await HT.loadBitmap(f); } catch (e) { return prog.error(e.message); }
    file = f; prog.clear(); editor.classList.remove('hidden'); setCard.classList.remove('hidden'); bench.set(true);
    rect = { x: 0, y: 0, w: bmp.width, h: bmp.height };
    const maxW = Math.min(900, (editor.clientWidth || root.clientWidth - 380) - 40); scale = Math.min(1, maxW / bmp.width, 520 / bmp.height);
    view.width = Math.round(bmp.width * scale); view.height = Math.round(bmp.height * scale);
    if (ratio) fitRatio(); draw();
  }
  function fitRatio() { // biggest centred rect with the wanted ratio
    const W = bmp.width, H = bmp.height; let w = W, h = w / ratio; if (h > H) { h = H; w = h * ratio; }
    rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function draw() {
    vx.clearRect(0, 0, view.width, view.height); vx.drawImage(bmp, 0, 0, view.width, view.height);
    const r = { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
    vx.fillStyle = 'rgba(0,0,0,.55)'; vx.beginPath(); vx.rect(0, 0, view.width, view.height); vx.rect(r.x, r.y, r.w, r.h); vx.fill('evenodd');
    vx.strokeStyle = '#fff'; vx.lineWidth = 2; vx.strokeRect(r.x, r.y, r.w, r.h);
    vx.lineWidth = 1; vx.strokeStyle = 'rgba(255,255,255,.45)'; vx.beginPath();
    for (let i = 1; i < 3; i++) { vx.moveTo(r.x + r.w * i / 3, r.y); vx.lineTo(r.x + r.w * i / 3, r.y + r.h); vx.moveTo(r.x, r.y + r.h * i / 3); vx.lineTo(r.x + r.w, r.y + r.h * i / 3); } vx.stroke();
    vx.fillStyle = '#fff'; vx.strokeStyle = '#4f46e5'; vx.lineWidth = 2;
    for (const [hx, hy] of handles(r)) { vx.beginPath(); vx.rect(hx - 6, hy - 6, 12, 12); vx.fill(); vx.stroke(); }
    const R = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    for (const k of Object.keys(nums)) if (document.activeElement !== nums[k]) nums[k].value = R[k];
    readout.textContent = `Selection: ${R.w} × ${R.h} px (image is ${bmp.width} × ${bmp.height})`;
  }
  const handles = r => [[r.x, r.y, 'nw'], [r.x + r.w / 2, r.y, 'n'], [r.x + r.w, r.y, 'ne'], [r.x + r.w, r.y + r.h / 2, 'e'], [r.x + r.w, r.y + r.h, 'se'], [r.x + r.w / 2, r.y + r.h, 's'], [r.x, r.y + r.h, 'sw'], [r.x, r.y + r.h / 2, 'w']];
  function fromInputs() {
    const g = k => Math.max(0, Number(nums[k].value) || 0); let { x, y, w, h } = { x: g('x'), y: g('y'), w: g('w'), h: g('h') };
    w = Math.max(1, Math.min(w, bmp.width)); h = Math.max(1, Math.min(h, bmp.height)); x = Math.min(x, bmp.width - w); y = Math.min(y, bmp.height - h);
    rect = { x, y, w, h }; draw();
  }
  const pos = e => { const b = view.getBoundingClientRect(); return { x: (e.clientX - b.left) * view.width / b.width, y: (e.clientY - b.top) * view.height / b.height }; };
  function hit(p) {
    const r = { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
    for (const [hx, hy, n] of handles(r)) if (Math.abs(p.x - hx) < 12 && Math.abs(p.y - hy) < 12) return n;
    return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h ? 'move' : 'new';
  }
  const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', new: 'crosshair' };
  view.addEventListener('pointermove', e => { if (!drag) view.style.cursor = cursors[hit(pos(e))]; });
  view.addEventListener('pointerdown', e => {
    const p = pos(e), h = hit(p); try { view.setPointerCapture(e.pointerId); } catch { }
    drag = { h, sx: p.x / scale, sy: p.y / scale, r: { ...rect } };
    if (h === 'new') { rect = { x: drag.sx, y: drag.sy, w: 1, h: 1 }; drag.r = { ...rect }; drag.h = 'se'; }
  });
  view.addEventListener('pointerup', () => { drag = null; });
  view.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = pos(e), dx = p.x / scale - drag.sx, dy = p.y / scale - drag.sy, W = bmp.width, H = bmp.height, o = drag.r, hd = drag.h;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (hd === 'move') { rect = { ...o, x: clamp(o.x + dx, 0, W - o.w), y: clamp(o.y + dy, 0, H - o.h) }; return draw(); }
    if (!ratio) { // free-form: move the touched edges
      let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
      if (hd.includes('w')) l += dx; if (hd.includes('e')) r += dx; if (hd.includes('n')) t += dy; if (hd.includes('s')) b += dy;
      l = clamp(l, 0, r - 8); r = clamp(r, l + 8, W); t = clamp(t, 0, b - 8); b = clamp(b, t + 8, H);
      rect = { x: l, y: t, w: r - l, h: b - t }; return draw();
    }
    // locked ratio: the opposite side/corner stays put
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2; let w, h, l, t;
    if (hd.length === 2) {
      const west = hd.includes('w'), north = hd.includes('n');
      const ax = west ? o.x + o.w : o.x, ay = north ? o.y + o.h : o.y;
      const px = clamp((west ? o.x : o.x + o.w) + dx, 0, W), py = clamp((north ? o.y : o.y + o.h) + dy, 0, H);
      w = Math.abs(px - ax); h = Math.abs(py - ay);
      if (w / ratio > h) h = w / ratio; else w = h * ratio;
      const k = Math.min(1, (west ? ax : W - ax) / w, (north ? ay : H - ay) / h); w = Math.max(8 * ratio, w * k); h = w / ratio;
      l = west ? ax - w : ax; t = north ? ay - h : ay;
    } else if (hd === 'e' || hd === 'w') {
      const ax = hd === 'e' ? o.x : o.x + o.w, px = clamp((hd === 'e' ? o.x + o.w : o.x) + dx, 0, W);
      w = Math.max(8, Math.abs(px - ax)); h = w / ratio;
      const k = Math.min(1, (hd === 'e' ? W - ax : ax) / w, 2 * Math.min(cy, H - cy) / h); w *= k; h = w / ratio;
      l = hd === 'e' ? ax : ax - w; t = cy - h / 2;
    } else {
      const ay = hd === 's' ? o.y : o.y + o.h, py = clamp((hd === 's' ? o.y + o.h : o.y) + dy, 0, H);
      h = Math.max(8, Math.abs(py - ay)); w = h * ratio;
      const k = Math.min(1, (hd === 's' ? H - ay : ay) / h, 2 * Math.min(cx, W - cx) / w); h *= k; w = h * ratio;
      t = hd === 's' ? ay : ay - h; l = cx - w / 2;
    }
    rect = { x: clamp(l, 0, W - w), y: clamp(t, 0, H - h), w, h }; draw();
  });
  async function save() {
    const v = fmt.values(), [mime, ext] = HT.mimeFor(v.fmt, file);
    const c = HT.canvas(rect.w, rect.h); c.getContext('2d').drawImage(bmp, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    try { HT.download(await HT.encode(c, mime, v.q / 100), HT.stem(file.name) + '_cropped.' + ext); HT.toast(`Saved ${c.width} × ${c.height}`); } catch (e) { prog.error(e.message); }
  }
});
