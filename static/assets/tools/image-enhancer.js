// Image Enhancer: one click works out what each photo needs (exposure, contrast, white balance, shadows, highlights, vibrance,
// noise, sharpness); a look (preset) shapes it; every slider can be fine-tuned; the result is compared with a drag slider and
// saved in the format, size and file size you want. Optional AI detail restore (Real-ESRGAN). Engine: /assets/engine/enhance.js.
HT.register('image-enhancer', root => {
  const el = HT.el, E = () => HT.enhance;
  const PREVIEW = 1100;   // longest side of the live preview (the download is done at full size)
  const GROUPS = [
    ['Light', [['exposure', 'Exposure'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks']]],
    ['Colour', [['temperature', 'Temperature'], ['tint', 'Tint'], ['vibrance', 'Vibrance'], ['saturation', 'Saturation']]],
    ['Detail', [['clarity', 'Clarity'], ['dehaze', 'Dehaze'], ['sharpen', 'Sharpen'], ['denoise', 'Noise reduction']]],
    ['Effects and repair', [['vignette', 'Vignette'], ['repair', 'Repair faded colours'], ['flatten', 'Document cleanup']]],
  ];
  const LOOKS = [['auto', 'Auto'], ['natural', 'Natural'], ['portrait', 'Portrait'], ['landscape', 'Landscape'], ['lowlight', 'Low light'], ['product', 'Product'], ['food', 'Food'], ['oldphoto', 'Old photo'], ['document', 'Document'], ['bw', 'Black & white']];
  const pre = (HT.pageMeta && HT.pageMeta.preset) || {};
  let look = LOOKS.some(l => l[0] === pre.look) ? pre.look : 'auto';
  let deltas = {}, base = null, orig = null, origData = null, aiBase = null, aiFor = null, busy = false, again = false, cur = null;

  // ---- left: files, look, sliders, AI and saving
  const prog = HT.progress();
  const list = HT.fileList({ onChange: fs => { show(fs.length > 0); if (fs[0] !== cur) open(fs[0]); } });
  const dz = HT.dropzone({ accept: 'image/*,.heic,.heif,.avif,.tif,.tiff', multiple: true, label: (HT.pageMeta && HT.pageMeta.dropLabel) || null,
    hint: 'JPG, PNG, WebP, HEIC... several at once. Runs in your browser: nothing is uploaded.', onFiles: fs => list.add(fs, true) });
  const lookBar = el('div', { class: 'enh-looks', role: 'group', 'aria-label': 'Look' });
  const paintLooks = () => { lookBar.textContent = ''; for (const [k, t] of LOOKS) lookBar.append(el('button', { type: 'button', class: 'segb' + (k === look ? ' on' : ''), text: t, onclick: () => { look = k; deltas = {}; paintLooks(); fill(); render(); } })); };
  const forms = {};
  const groupEls = GROUPS.map(([title, keys], gi) => {
    const f = HT.form(keys.map(([k, label]) => { const [lo, hi] = ['denoise', 'sharpen', 'repair', 'flatten'].includes(k) ? [0, 100] : [-100, 100]; return { name: k, label, type: 'range', min: lo, max: hi, value: 0 }; }), () => onSlide());
    keys.forEach(([k]) => (forms[k] = f));
    return el('details', { class: 'enh-group', open: gi < 2 ? 'open' : null }, el('summary', { text: title }), f.el);
  });
  const reset = el('button', { type: 'button', class: 'btn sec sm', text: 'Reset to the look', onclick: () => { deltas = {}; fill(); render(); } });
  const save = HT.form([
    { name: 'ai', label: 'AI detail restore', type: 'select', options: [['off', 'Off'], ['restore', 'On: remove blur, noise and JPEG blocks (same size)'], ['2x', 'On, and enlarge 2x']], help: 'Uses the AI model of the Image Upscaler (5 MB, downloaded once). Best for small, soft or old photos.' },
    { name: 'format', label: 'Save as', type: 'select', options: [['same', 'Same as original'], ['jpg', 'JPG'], ['webp', 'WebP (smaller)'], ['avif', 'AVIF (smallest)'], ['png', 'PNG']] },
    { name: 'quality', label: 'Quality', type: 'range', min: 50, max: 100, value: 90, unit: '%', showIf: v => v.format !== 'png' },
    { name: 'maxSide', label: 'Maximum size', type: 'select', options: [[0, 'Keep the size'], [4096, '4096 px'], [2560, '2560 px'], [1920, '1920 px (web, social)'], [1280, '1280 px'], [1080, '1080 px (Instagram)']] },
    { name: 'targetKB', label: 'Target file size (KB, optional)', type: 'number', min: 0, placeholder: 'e.g. 200', showIf: v => v.format !== 'png', help: 'The best quality that fits under this size.' },
  ], v => { if (v.ai !== 'off' && cur && aiFor !== cur) runAIPreview(); else render(); });
  const go = el('button', { class: 'btn', type: 'button', text: 'Enhance and download', onclick: download });
  const lookCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Choose a look'), lookBar,
    el('p', { class: 'help', text: 'Auto reads each photo and corrects it on its own. A look shapes the result; the sliders below show exactly what was done.' }));
  const adjCard = el('div', { class: 'card hidden' }, HT.stepTitle(3, 'Fine-tune'), ...groupEls, el('div', { class: 'actions' }, reset));
  const saveCard = el('div', { class: 'card hidden' }, HT.stepTitle(4, 'Save'), save.el, el('div', { class: 'actions' }, go));

  // ---- right: the comparison (drag the line), a histogram and what changed
  const after = HT.canvas(10, 10), before = HT.canvas(10, 10), hist = HT.canvas(256, 70);
  const split = el('input', { type: 'range', min: 0, max: 100, value: 50, class: 'enh-split', 'aria-label': 'Compare before and after' });
  const line = el('div', { class: 'enh-line' }), beforeWrap = el('div', { class: 'enh-before' }, before);
  const stage = el('div', { class: 'enh-stage' }, after, beforeWrap, line, split, el('span', { class: 'enh-tag l', text: 'Original' }), el('span', { class: 'enh-tag r', text: 'Enhanced' }));
  const placeSplit = () => { const p = +split.value; beforeWrap.style.clipPath = `inset(0 ${100 - p}% 0 0)`; line.style.left = p + '%'; };
  split.addEventListener('input', placeSplit); placeSplit();
  const info = el('div', { class: 'help', 'data-notr': '' }), pick = el('select', { 'aria-label': 'Photo to preview', class: 'hidden', onchange: e => open(list.files[+e.target.value]) });
  const main = el('div', { class: 'card tmain hidden' },
    el('div', { class: 'tbar' }, el('div', { class: 'tinfo' }, pick, info)), stage,
    el('div', { class: 'enh-foot' }, hist, el('p', { class: 'help', text: 'Drag the line to compare. The download is made at full size, so fine detail may look even better than here.' })));
  const bench = HT.bench([dz, list.el, lookCard, adjCard, saveCard, prog.el], main);
  root.append(bench);
  function show(on) { [lookCard, adjCard, saveCard, main].forEach(c => c.classList.toggle('hidden', !on)); bench.set(on); }

  // ---- the preview
  async function open(f) {
    cur = f || null; aiBase = null; aiFor = null; base = null;
    pick.textContent = ''; pick.classList.toggle('hidden', list.files.length < 2);
    list.files.forEach((x, i) => pick.append(el('option', { value: i, text: x.name, selected: x === f ? 'selected' : null })));
    if (!f) return;
    try {
      prog.set(2, 'Reading the photo...');
      await HT.loadScript('/assets/engine/enhance.js'); await HT.loadScript('/assets/engine/image.js');
      const full = await HT.img.load(f), k = Math.min(1, PREVIEW / Math.max(full.width, full.height));
      orig = k < 1 ? HT.resample(full, full.width * k, full.height * k) : full; orig.scaleToFull = k; orig.fullW = full.width; orig.fullH = full.height;
      origData = orig.getContext('2d').getImageData(0, 0, orig.width, orig.height);
      for (const c of [after, before]) { c.width = orig.width; c.height = orig.height; }
      before.getContext('2d').drawImage(orig, 0, 0);
      base = E().analyze(origData, orig.scaleToFull);
      prog.clear(); fill();
      if (save.values().ai !== 'off') runAIPreview(); else render();
    } catch (e) { prog.error(e.message); }
  }
  async function runAIPreview() {
    if (!cur || !orig) return;
    const f = cur;
    try {
      prog.set(2, 'AI is restoring detail (the slow part, up to a minute on a phone)...');
      await HT.loadScript('/assets/engine/ai.js');
      const ctx = { progress: p => prog.set(Math.max(3, p * 100), 'AI is restoring detail...'), status: m => m && prog.set(5, m), opts: {} };
      const restored = await E().aiRestore(ctx, orig, 'restore', '');
      if (cur !== f) return;
      aiBase = restored.getContext('2d').getImageData(0, 0, orig.width, orig.height); aiFor = f;
      prog.clear(); render();
    } catch (e) { prog.error(e.message); }
  }
  // the sliders show what will be applied: the photo's own needs + the look + your changes
  const settings = () => E().combine(base, look, deltas);
  function fill() { if (!base) return; const s = E().combine(base, look, {}); for (const k of E().KEYS) forms[k].set(k, Math.round(s[k] + (deltas[k] || 0))); }
  function onSlide() {
    if (!base) return;
    const s0 = E().combine(base, look, {});
    for (const k of E().KEYS) { const v = forms[k].values()[k]; deltas[k] = v - s0[k]; }
    render();
  }
  function render() {
    if (!base || !origData) return;
    if (busy) { again = true; return; }
    busy = true;
    HT.tick().then(() => {   // (not requestAnimationFrame: that pauses while the window is not being drawn)
      try {
        const src = save.values().ai !== 'off' && aiBase && aiFor === cur ? aiBase : origData;
        const copy = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), s = settings();
        const out = E().apply(copy, s, orig.scaleToFull);
        after.getContext('2d').putImageData(out, 0, 0);
        drawHist(out);
        const changed = E().KEYS.filter(k => s[k]).map(k => `${k} ${s[k] > 0 && !['sharpen', 'denoise', 'repair', 'flatten'].includes(k) ? '+' : ''}${s[k]}`);
        info.textContent = `${orig.fullW} × ${orig.fullH} px · ${changed.length ? changed.join(', ') : 'no changes'}`;
      } catch (e) { prog.error(e.message); }
      busy = false;
      if (again) { again = false; render(); }
    });
  }
  function drawHist(img) {
    const H = E().histogram(img, 64), x = hist.getContext('2d'), w = hist.width, h = hist.height, max = Math.max(1, ...H.flatMap(a => Array.from(a)));
    x.clearRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
    ['rgba(255,70,70,.75)', 'rgba(60,200,90,.75)', 'rgba(70,120,255,.75)'].forEach((col, c) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
      H[c].forEach((v, i) => x.lineTo(i / 63 * w, h - Math.sqrt(v / max) * h)); x.lineTo(w, h); x.closePath(); x.fill();
    });
    x.globalCompositeOperation = 'source-over';
  }

  // ---- download: every photo is analysed on its own, with the same look and the same changes on top
  async function download() {
    const files = list.files.slice(); if (!files.length) return;
    const v = save.values(); go.disabled = true;
    try {
      prog.set(1, 'Starting...');
      const { id } = await HT.upload('image-enhancer', files, { preset: look, deltas, ai: v.ai, format: v.format, quality: v.quality, maxSide: +v.maxSide, targetKB: +v.targetKB || 0 });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Enhancing...'));
      prog.clear();
      HT.download(job.url, job.filename);
      HT.toast((job.info && job.info.summary) || 'Done');
    } catch (e) { prog.error(e.message); }
    go.disabled = false;
  }
  // a page made for one job opens with its settings chosen, e.g. /image-optimizer -> WebP, 1920 px
  for (const [k, v] of Object.entries(pre)) if (k !== 'look' && save.ctl[k]) save.set(k, v);
  paintLooks();
});
