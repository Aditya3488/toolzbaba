const FONTS = [['system-ui, "Segoe UI", Arial, sans-serif', 'Sans-serif'], ['Georgia, "Times New Roman", serif', 'Serif'], ['ui-monospace, Consolas, monospace', 'Monospace'], ['Impact, "Arial Black", sans-serif', 'Impact (bold)'], ['"Brush Script MT", "Segoe Script", cursive', 'Script']];
const POS = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Centre'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];
const place = (pos, W, H, w, h, m) => ({ x: pos[1] === 'l' ? m : pos[1] === 'r' ? W - w - m : (W - w) / 2, y: pos[0] === 't' ? m : pos[0] === 'b' ? H - h - m : (H - h) / 2 });

// wraps text to lines that fit maxW using the ctx's current font
function wrapLines(x, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + word : word; if (x.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }
    out.push(line);
  }
  return out;
}

// ------------------------------------------------------------------ Watermark
HT.register('add-watermark-to-image', root => {
  let logo = null;
  const logoInput = HT.el('input', { type: 'file', accept: 'image/*', onchange: async e => { const f = e.target.files[0]; if (f) { try { logo = await HT.loadBitmap(f); } catch (err) { HT.toast(err.message); } tool.preview(); } } });
  const tool = HT.canvasTool(root, {
    suffix: '_watermarked', zipName: 'watermarked-images',
    fields: [
      { name: 'kind', label: 'Watermark type', type: 'select', options: [['text', 'Text'], ['image', 'Logo / image']] },
      { name: 'text', label: 'Text', type: 'text', value: '© Your Name', showIf: v => v.kind === 'text' },
      { name: 'font', label: 'Font', type: 'select', options: FONTS, showIf: v => v.kind === 'text' },
      { name: 'color', label: 'Colour', type: 'color', value: '#ffffff', showIf: v => v.kind === 'text' },
      { name: 'size', label: 'Size (% of image width)', type: 'range', min: 3, max: 80, value: 22, unit: '%' },
      { name: 'opacity', label: 'Opacity', type: 'range', min: 5, max: 100, value: 60, unit: '%' },
      { name: 'angle', label: 'Rotation', type: 'range', min: -90, max: 90, value: 0, unit: '°' },
      { name: 'pos', label: 'Position', type: 'select', value: 'br', options: POS.concat([['tile', 'Tile across whole image']]) },
      { name: 'margin', label: 'Margin from edge (%)', type: 'range', min: 0, max: 15, value: 3, unit: '%', showIf: v => v.pos !== 'tile' },
      { name: 'gap', label: 'Tile spacing (%)', type: 'range', min: 0, max: 200, value: 60, unit: '%', showIf: v => v.pos === 'tile' },
      { name: 'shadow', label: 'Soft shadow (easier to read)', type: 'checkbox', value: true, showIf: v => v.kind === 'text' },
    ],
    process: async (bmp, v) => {
      const W = bmp.width, H = bmp.height, c = HT.canvas(W, H), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      let st;
      if (v.kind === 'image') {
        if (!logo) throw new Error('Choose a logo image below the options.');
        const w = W * v.size / 100, h = w * logo.height / logo.width; st = HT.canvas(w, h); const sx = st.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(logo, 0, 0, w, h);
      } else {
        if (!v.text.trim()) throw new Error('Type the watermark text.');
        const fs = Math.max(8, W * v.size / 100 / Math.max(3, v.text.length * .55)), m = document.createElement('canvas').getContext('2d');
        m.font = `700 ${fs}px ${v.font}`; const tw = m.measureText(v.text).width, pad = fs * .4;
        st = HT.canvas(tw + pad * 2, fs * 1.4 + pad); const sx = st.getContext('2d'); sx.font = m.font; sx.textBaseline = 'middle'; sx.textAlign = 'center';
        if (v.shadow) { sx.shadowColor = 'rgba(0,0,0,.6)'; sx.shadowBlur = fs * .18; sx.shadowOffsetY = fs * .05; }
        sx.fillStyle = v.color; sx.fillText(v.text, st.width / 2, st.height / 2);
      }
      x.globalAlpha = v.opacity / 100; const th = v.angle * Math.PI / 180;
      if (v.pos === 'tile') {
        const gx = st.width * (1 + v.gap / 100), gy = st.height * (1 + v.gap / 100), p = HT.canvas(gx, gy);
        p.getContext('2d').drawImage(st, (gx - st.width) / 2, (gy - st.height) / 2);
        x.save(); x.translate(W / 2, H / 2); x.rotate(th || -Math.PI / 6); x.fillStyle = x.createPattern(p, 'repeat'); const R = Math.hypot(W, H); x.translate(-R / 2, -R / 2); x.fillRect(0, 0, R, R); x.restore();
      } else {
        const bw = Math.abs(st.width * Math.cos(th)) + Math.abs(st.height * Math.sin(th)), bh = Math.abs(st.width * Math.sin(th)) + Math.abs(st.height * Math.cos(th));
        const { x: px, y: py } = place(v.pos, W, H, bw, bh, W * v.margin / 100);
        x.save(); x.translate(px + bw / 2, py + bh / 2); x.rotate(th); x.drawImage(st, -st.width / 2, -st.height / 2); x.restore();
      }
      return c;
    },
    onReady: ({ form }) => { const box = HT.el('div', { class: 'field', style: { marginTop: '14px' } }, HT.el('label', { class: 'lbl', text: 'Logo image (for "Logo / image" type)' }), logoInput); form.el.after(box); },
  });
});

// ------------------------------------------------------------------ Pixelate
HT.register('pixelate-image', root => {
  let sel = null, host = null; // sel = {x,y,w,h} as fractions of the image
  const tool = HT.canvasTool(root, {
    suffix: '_pixelated', zipName: 'pixelated-images',
    fields: [
      { name: 'mode', label: 'Where', type: 'select', options: [['all', 'Whole image'], ['area', 'Only the area I select'], ['outside', 'Everything except my area']] },
      { name: 'pct', label: 'Pixel size', type: 'range', min: 0.5, max: 12, step: 0.5, value: 3, unit: '%', help: 'Bigger = blockier. Measured relative to image size.' },
    ],
    process: async (bmp, v, f, i, isPreview) => {
      const W = bmp.width, H = bmp.height, block = Math.max(2, Math.round(Math.max(W, H) * v.pct / 100));
      const c = HT.canvas(W, H), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const pix = (rx, ry, rw, rh) => {
        rx = Math.max(0, Math.floor(rx)); ry = Math.max(0, Math.floor(ry)); rw = Math.min(W - rx, Math.ceil(rw)); rh = Math.min(H - ry, Math.ceil(rh)); if (rw < 1 || rh < 1) return;
        const sw = Math.max(1, Math.round(rw / block)), sh = Math.max(1, Math.round(rh / block)), t = HT.canvas(sw, sh), tx = t.getContext('2d'); tx.imageSmoothingQuality = 'medium'; tx.drawImage(bmp, rx, ry, rw, rh, 0, 0, sw, sh);
        x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, sw, sh, rx, ry, rw, rh); x.imageSmoothingEnabled = true;
      };
      if (v.mode === 'all') pix(0, 0, W, H);
      else if (sel) {
        const r = { x: sel.x * W, y: sel.y * H, w: sel.w * W, h: sel.h * H };
        if (v.mode === 'area') pix(r.x, r.y, r.w, r.h);
        else { pix(0, 0, W, r.y); pix(0, r.y + r.h, W, H - r.y - r.h); pix(0, r.y, r.x, r.h); pix(r.x + r.w, r.y, W - r.x - r.w, r.h); }
      } else if (isPreview) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = `${Math.max(14, W / 28)}px system-ui`; x.textAlign = 'center'; x.fillText('Drag on this preview to select an area', W / 2, H / 2); }
      if (isPreview && sel && v.mode !== 'all') { x.strokeStyle = '#4f46e5'; x.lineWidth = Math.max(2, W / 400); x.setLineDash([W / 100, W / 100]); x.strokeRect(sel.x * W, sel.y * H, sel.w * W, sel.h * H); }
      return c;
    },
    onReady: ({ pv, preview, form }) => {
      host = pv; let start = null;
      const frac = e => { const cv = pv.querySelector('canvas'); const b = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }; };
      pv.style.cursor = 'crosshair'; pv.style.touchAction = 'none';
      pv.addEventListener('pointerdown', e => { if (!pv.querySelector('canvas')) return; try { pv.setPointerCapture(e.pointerId); } catch { } start = frac(e); if (form.values().mode === 'all') form.set('mode', 'area'); });
      pv.addEventListener('pointermove', e => { if (!start) return; const p = frac(e); sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; preview(); });
      pv.addEventListener('pointerup', () => { start = null; if (sel && (sel.w < .01 || sel.h < .01)) { sel = null; preview(); } });
      form.el.after(HT.el('div', { class: 'actions', style: { marginTop: '10px' } }, HT.el('button', { class: 'btn sec sm', type: 'button', text: 'Clear selected area', onclick: () => { sel = null; preview(); } })));
    },
  });
});

// ------------------------------------------------------------------ Meme generator
HT.register('meme-generator', root => HT.canvasTool(root, {
  multiple: false, suffix: '_meme', defaultFormat: 'jpg', hint: 'Add any image: photos, screenshots, reaction pics. Runs in your browser.',
  fields: [
    { name: 'style', label: 'Style', type: 'select', options: [['classic', 'Classic (text on image)'], ['bar', 'Caption bar on top']] },
    { name: 'top', label: 'Top text', type: 'text', value: 'WHEN THE CODE WORKS', showIf: v => v.style === 'classic' },
    { name: 'bottom', label: 'Bottom text', type: 'text', value: 'BUT YOU DON\'T KNOW WHY', showIf: v => v.style === 'classic' },
    { name: 'caption', label: 'Caption', type: 'textarea', value: 'Me explaining my weekend plans to my sleep schedule', showIf: v => v.style === 'bar' },
    { name: 'size', label: 'Text size', type: 'range', min: 4, max: 20, value: 9, unit: '%' },
    { name: 'upper', label: 'UPPERCASE', type: 'checkbox', value: true, showIf: v => v.style === 'classic' },
    { name: 'color', label: 'Text colour', type: 'color', value: '#ffffff', showIf: v => v.style === 'classic' },
    { name: 'stroke', label: 'Outline colour', type: 'color', value: '#000000', showIf: v => v.style === 'classic' },
  ],
  process: async (bmp, v) => {
    let W = bmp.width, H = bmp.height; const k = Math.min(1, 1600 / Math.max(W, H)); W = Math.round(W * k); H = Math.round(H * k);
    const fs = Math.max(12, W * v.size / 100), font = `900 ${fs}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
    const m = document.createElement('canvas').getContext('2d'); m.font = font;
    if (v.style === 'bar') {
      const bf = fs * .95; m.font = `700 ${bf}px system-ui, "Segoe UI", Arial, sans-serif`;
      const lines = wrapLines(m, v.caption || '', W * .92), lh = bf * 1.25, bar = lines.length * lh + bf, c = HT.canvas(W, H + bar), x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height); x.fillStyle = '#000'; x.font = m.font; x.textAlign = 'left'; x.textBaseline = 'top';
      lines.forEach((l, i) => x.fillText(l, W * .04, bf / 2 + i * lh)); x.drawImage(bmp, 0, bar, W, H); return c;
    }
    const c = HT.canvas(W, H), x = c.getContext('2d'); x.drawImage(bmp, 0, 0, W, H);
    const draw = (text, atTop) => {
      text = v.upper ? text.toUpperCase() : text; if (!text.trim()) return;
      let size = fs, lines; do { x.font = `900 ${size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`; lines = wrapLines(x, text, W * .94); size *= .93; } while (lines.length > 3 && size > 12);
      size /= .93; const lh = size * 1.08, total = lines.length * lh, pad = W * .02;
      x.textAlign = 'center'; x.textBaseline = 'top'; x.lineJoin = 'round'; x.lineWidth = size / 7; x.strokeStyle = v.stroke; x.fillStyle = v.color;
      const y0 = atTop ? pad : H - total - pad;
      lines.forEach((l, i) => { x.strokeText(l, W / 2, y0 + i * lh); x.fillText(l, W / 2, y0 + i * lh); });
    };
    draw(v.top || '', true); draw(v.bottom || '', false); return c;
  },
}));

// ------------------------------------------------------------------ Collage maker
HT.register('photo-collage-maker', root => {
  const el = HT.el;
  const bmps = new Map(); let files = [];
  const list = HT.fileList({ reorder: true, onChange: fs => { files = fs; formCard.classList.toggle('hidden', fs.length < 1); pvCard.classList.toggle('hidden', fs.length < 1); bench.set(fs.length >= 1); updateLayouts(); draw(); } });
  const form = HT.form([
    { name: 'layout', label: 'Layout', type: 'select', options: [['0', 'Grid']] },
    { name: 'size', label: 'Canvas size', type: 'select', options: [['1080x1080', 'Square 1080×1080'], ['1080x1350', 'Portrait 1080×1350 (4:5)'], ['1080x1920', 'Story 1080×1920'], ['1920x1080', 'Landscape 1920×1080'], ['2400x2400', 'Large square 2400×2400']] },
    { name: 'gap', label: 'Space between photos', type: 'range', min: 0, max: 60, value: 12, unit: 'px' },
    { name: 'pad', label: 'Outer border', type: 'range', min: 0, max: 120, value: 24, unit: 'px' },
    { name: 'radius', label: 'Rounded corners', type: 'range', min: 0, max: 100, value: 16, unit: 'px' },
    { name: 'bg', label: 'Background', type: 'color', value: '#ffffff' },
    { name: 'fmt', label: 'Save as', type: 'select', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']] },
  ], () => draw());
  const pv = el('div', { class: 'pv' }), prog = HT.progress();
  const dl = el('button', { class: 'btn', type: 'button', text: 'Download collage', onclick: save });
  const formCard = el('div', { class: 'card hidden' }, form.el);
  const pvCard = el('div', { class: 'card tmain hidden' }, el('div', { class: 'tbar' }, el('div', { class: 'tinfo' }), el('div', { class: 'actions' }, dl)), pv);
  const bench = HT.bench([HT.dropzone({ accept: 'image/*', multiple: true, label: 'Add 2–9 photos', hint: 'Use the arrows to change the order. Runs in your browser.', onFiles: fs => list.add(fs.slice(0, 9 - list.files.length), true) }), list.el, formCard, prog.el], pvCard);
  root.append(bench);

  const grid = n => { const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), out = []; for (let r = 0; r < rows; r++) { const inRow = r < rows - 1 ? cols : n - cols * (rows - 1); for (let c = 0; c < inRow; c++) out.push([c / inRow, r / rows, 1 / inRow, 1 / rows]); } return out; };
  const layoutsFor = n => {
    const L = [['Grid', grid(n)]];
    if (n > 1) { L.push(['Rows', Array.from({ length: n }, (_, i) => [0, i / n, 1, 1 / n])]); L.push(['Columns', Array.from({ length: n }, (_, i) => [i / n, 0, 1 / n, 1])]); }
    if (n >= 3) {
      L.push(['Featured left', [[0, 0, .6, 1]].concat(Array.from({ length: n - 1 }, (_, j) => [.6, j / (n - 1), .4, 1 / (n - 1)]))]);
      L.push(['Featured right', [[.4, 0, .6, 1]].concat(Array.from({ length: n - 1 }, (_, j) => [0, j / (n - 1), .4, 1 / (n - 1)]))]);
      L.push(['Featured top', [[0, 0, 1, .6]].concat(Array.from({ length: n - 1 }, (_, j) => [j / (n - 1), .6, 1 / (n - 1), .4]))]);
      L.push(['Featured bottom', [[0, .4, 1, .6]].concat(Array.from({ length: n - 1 }, (_, j) => [j / (n - 1), 0, 1 / (n - 1), .4]))]);
    }
    return L;
  };
  // the layouts are shown as little drawings of the shape they make (the drop-down stays underneath, hidden, and holds the value)
  const layField = form.ctl.layout.closest('.field'), layPick = el('div', { class: 'laypick', role: 'radiogroup', 'aria-label': 'Layout' });
  form.ctl.layout.style.display = 'none'; layField.append(layPick);
  const NS = 'http://www.w3.org/2000/svg';
  const layIcon = rects => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('aria-hidden', 'true');
    for (const [x, y, w, h] of rects) { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', x * 100 + 2); r.setAttribute('y', y * 100 + 2); r.setAttribute('width', Math.max(2, w * 100 - 4)); r.setAttribute('height', Math.max(2, h * 100 - 4)); r.setAttribute('rx', 4); s.append(r); } return s; };
  function updateLayouts() {
    const n = Math.max(1, files.length), sel = form.ctl.layout, prev = sel.value, L = layoutsFor(n); sel.textContent = '';
    L.forEach(([name], i) => sel.append(el('option', { value: i, text: name }))); sel.value = L[prev] ? prev : 0;
    layPick.textContent = '';
    L.forEach(([name, rects], i) => layPick.append(el('button', { type: 'button', role: 'radio', class: 'layopt' + (String(i) === sel.value ? ' on' : ''), 'aria-checked': String(i) === sel.value ? 'true' : 'false', title: name, onclick: () => { form.set('layout', i); [...layPick.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-checked', k === i ? 'true' : 'false'); }); } }, layIcon(rects), el('span', { text: name }))));
  }
  const bmp = async f => { if (!bmps.has(f)) bmps.set(f, await HT.loadBitmap(f)); return bmps.get(f); };
  async function render() {
    const v = form.values(), [W, H] = v.size.split('x').map(Number), c = HT.canvas(W, H), x = c.getContext('2d');
    x.fillStyle = v.bg; x.fillRect(0, 0, W, H);
    const rects = layoutsFor(files.length)[Number(v.layout)][1], g = v.gap, p = v.pad;
    const ax = p - g / 2, ay = p - g / 2, aw = W - 2 * p + g, ah = H - 2 * p + g;
    for (let i = 0; i < files.length; i++) {
      const [rx, ry, rw, rh] = rects[i], cx = ax + rx * aw + g / 2, cy = ay + ry * ah + g / 2, cw = rw * aw - g, ch = rh * ah - g;
      x.save(); HT.roundRect(x, cx, cy, cw, ch, v.radius); x.clip(); x.imageSmoothingQuality = 'high'; HT.cover(x, await bmp(files[i]), cx, cy, cw, ch); x.restore();
    }
    return c;
  }
  let tok = 0;
  async function draw() { const my = ++tok; if (!files.length) return; try { const c = await render(); if (my !== tok) return; pv.textContent = ''; pv.append(c); prog.clear(); } catch (e) { prog.error(e.message); } }
  async function save() { const v = form.values(), [mime, ext] = HT.mimeFor(v.fmt); try { HT.download(await HT.encode(await render(), mime, .93), 'collage.' + ext); } catch (e) { prog.error(e.message); } }
  updateLayouts();
});

// ------------------------------------------------------------------ Screenshot beautifier
const GRADS = { indigo: ['Indigo dream', '#4f46e5', '#ec4899'], ocean: ['Ocean', '#2193b0', '#6dd5ed'], sunset: ['Sunset', '#ff512f', '#f09819'], mint: ['Mint', '#11998e', '#38ef7d'], peach: ['Peach', '#ffecd2', '#fcb69f'], night: ['Night', '#0f2027', '#2c5364'], lavender: ['Lavender', '#c471f5', '#fa71cd'], slate: ['Slate', '#232526', '#414345'], sky: ['Sky', '#a1c4fd', '#c2e9fb'], fire: ['Fire', '#f12711', '#f5af19'] };
HT.register('screenshot-beautifier', root => HT.canvasTool(root, {
  suffix: '_beautified', defaultFormat: 'png', zipName: 'beautified',
  hint: 'Drop a screenshot (or paste with Ctrl+V). Runs in your browser.',
  fields: [
    { name: 'bgtype', label: 'Background', type: 'select', options: [['preset', 'Gradient preset'], ['custom', 'Custom gradient'], ['solid', 'Solid colour'], ['none', 'Transparent']] },
    { name: 'preset', label: 'Gradient', type: 'select', options: Object.entries(GRADS).map(([k, g]) => [k, g[0]]), showIf: v => v.bgtype === 'preset' },
    { name: 'c1', label: 'Colour 1', type: 'color', value: '#4f46e5', showIf: v => ['custom', 'solid'].includes(v.bgtype) },
    { name: 'c2', label: 'Colour 2', type: 'color', value: '#ec4899', showIf: v => v.bgtype === 'custom' },
    { name: 'angle', label: 'Gradient angle', type: 'range', min: 0, max: 360, value: 135, unit: '°', showIf: v => v.bgtype === 'preset' || v.bgtype === 'custom' },
    { name: 'frame', label: 'Window frame', type: 'select', options: [['none', 'None'], ['mac', 'macOS (light)'], ['macdark', 'macOS (dark)'], ['browser', 'Browser']] },
    { name: 'url', label: 'Address bar text', type: 'text', value: 'example.com', showIf: v => v.frame === 'browser' },
    { name: 'pad', label: 'Padding', type: 'range', min: 0, max: 25, value: 8, unit: '%' },
    { name: 'radius', label: 'Rounded corners', type: 'range', min: 0, max: 60, value: 14, unit: 'px' },
    { name: 'shadow', label: 'Shadow', type: 'select', value: 'medium', options: [['none', 'None'], ['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']] },
    { name: 'aspect', label: 'Canvas shape', type: 'select', options: [['auto', 'Fit around screenshot'], ['1.7778', '16:9'], ['1.3333', '4:3'], ['1', 'Square'], ['0.8', '4:5 portrait']] },
  ],
  process: async (bmp, v) => {
    const iw = bmp.width, ih = bmp.height, bar = v.frame === 'none' ? 0 : Math.round(Math.max(30, Math.min(56, iw * .035)));
    const P = Math.round(Math.max(iw, 300) * v.pad / 100), cw = iw, ch = ih + bar;
    let W = cw + P * 2, H = ch + P * 2; const r = v.aspect === 'auto' ? 0 : Number(v.aspect);
    if (r) { if (W / H < r) W = Math.round(H * r); else H = Math.round(W / r); }
    if (W * H > 100e6) throw new Error('That would be too large. Use a smaller screenshot or less padding.');
    const c = HT.canvas(W, H), x = c.getContext('2d');
    if (v.bgtype === 'solid') { x.fillStyle = v.c1; x.fillRect(0, 0, W, H); }
    else if (v.bgtype !== 'none') {
      const [c1, c2] = v.bgtype === 'preset' ? [GRADS[v.preset][1], GRADS[v.preset][2]] : [v.c1, v.c2], th = v.angle * Math.PI / 180, len = Math.abs(W * Math.sin(th)) + Math.abs(H * Math.cos(th)), dx = Math.sin(th) * len / 2, dy = -Math.cos(th) * len / 2;
      const g = x.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    const ox = Math.round((W - cw) / 2), oy = Math.round((H - ch) / 2), R = v.radius * Math.max(1, iw / 900), dark = v.frame === 'macdark';
    const sh = { none: [0, 0, 0], soft: [.2, .04, .03], medium: [.35, .06, .04], strong: [.55, .09, .06] }[v.shadow];
    if (sh[0]) { x.save(); x.shadowColor = `rgba(0,0,0,${sh[0]})`; x.shadowBlur = Math.min(W, H) * sh[1]; x.shadowOffsetY = Math.min(W, H) * sh[2]; x.fillStyle = dark ? '#2b2b2b' : '#fff'; HT.roundRect(x, ox, oy, cw, ch, R); x.fill(); x.restore(); }
    x.save(); HT.roundRect(x, ox, oy, cw, ch, R); x.clip();
    if (bar) {
      x.fillStyle = v.frame === 'browser' ? '#e6e8ee' : dark ? '#2b2b2b' : '#ececec'; x.fillRect(ox, oy, cw, bar);
      const rad = bar * .17, cy = oy + bar / 2;
      ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(ox + bar * .55 + i * bar * .48, cy, rad, 0, 7); x.fill(); });
      if (v.frame === 'browser') {
        const px = ox + bar * 2.3, pw = cw - bar * 2.3 - bar * .6, ph = bar * .58; x.fillStyle = '#fff'; HT.roundRect(x, px, cy - ph / 2, Math.max(40, pw), ph, ph / 2); x.fill();
        x.fillStyle = '#6b7280'; x.font = `${ph * .55}px system-ui, sans-serif`; x.textBaseline = 'middle'; x.fillText(v.url || '', px + ph * .6, cy + 1);
      }
    }
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, ox, oy + bar); x.restore();
    return c;
  },
}));
