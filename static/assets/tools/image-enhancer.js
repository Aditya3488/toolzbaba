// Image Enhancer. Drop a photo and the result is ready: AI HD (Real-ESRGAN, on the graphics card when the browser allows)
// sharpens and enlarges, Auto corrects light, colour and noise. A big before/after slider shows the difference; a slim panel
// holds AI HD (1x / 2x / 4x), looks shown as tiles of *your* photo, folded fine-tune sliders, and one Download button.
// Engine: /assets/engine/enhance.js (+ engine/sr-worker.js for AI HD).
HT.register('image-enhancer', root => {
  const el = HT.el, E = () => HT.enhance;
  const VIEW = 1100;          // longest side of the on-screen result
  const AI_PREVIEW = 520;     // longest side the AI works on for the on-screen result (the download uses the full photo)
  const LOOKS = [['auto', 'Auto'], ['natural', 'Natural'], ['portrait', 'Portrait'], ['product', 'Product'], ['landscape', 'Landscape'], ['lowlight', 'Low light'], ['food', 'Food'], ['oldphoto', 'Old photo'], ['document', 'Document'], ['bw', 'Black & white']];
  const GROUPS = [
    ['Light', [['exposure', 'Exposure'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks']]],
    ['Colour', [['temperature', 'Temperature'], ['tint', 'Tint'], ['vibrance', 'Vibrance'], ['saturation', 'Saturation']]],
    ['Detail', [['clarity', 'Clarity'], ['dehaze', 'Dehaze'], ['sharpen', 'Sharpen'], ['denoise', 'Noise reduction']]],
    ['Effects and repair', [['vignette', 'Vignette'], ['repair', 'Repair faded colours'], ['flatten', 'Document cleanup']]],
  ];
  const pre = (HT.pageMeta && HT.pageMeta.preset) || {};
  const st = {
    files: [], cur: null, look: LOOKS.some(l => l[0] === pre.look) ? pre.look : 'auto', deltas: {},
    ai: null,   // 'off' or 1 / 2 / 4; decided when the first photo arrives (it depends on the graphics card check)
    full: null, base: null, before: null, aiBase: null, aiKey: '', viewScale: 1, token: 0, busy: false, again: false,
  };
  const aiFromPreset = pre.ai ? ({ restore: 1, '2x': 2, '1': 1, '2': 2, '4': 4 })[String(pre.ai)] || 1 : null;

  // ---------------------------------------------------------------- before a photo: one friendly drop area
  const add = fs => { const imgs = [...fs].filter(f => /^image\//.test(f.type) || /\.(heic|heif|avif|tiff?)$/i.test(f.name)); if (!imgs.length) return; st.files.push(...imgs); paintThumbs(); show(true); if (!st.cur) open(imgs[0]); };
  const dz = HT.dropzone({ accept: 'image/*,.heic,.heif,.avif,.tif,.tiff', multiple: true, label: (HT.pageMeta && HT.pageMeta.dropLabel) || 'Drop a photo to enhance',
    hint: 'JPG, PNG, WebP, HEIC. Several at once. Nothing is uploaded.', onFiles: add });
  const empty = el('div', { class: 'enh-empty' }, dz,
    el('ul', { class: 'enh-points' },
      el('li', {}, el('b', { text: 'AI HD' }), el('span', { text: 'Sharper details, less blur and noise, up to 4× larger' })),
      el('li', {}, el('b', { text: 'Auto fix' }), el('span', { text: 'Light, colour and white balance corrected for each photo' })),
      el('li', {}, el('b', { text: 'Private and unlimited' }), el('span', { text: 'Runs in your browser: no upload, no sign-up, no daily limit' }))));

  // ---------------------------------------------------------------- the workspace
  // big before / after
  const after = HT.canvas(10, 10), before = HT.canvas(10, 10);
  const split = el('input', { type: 'range', min: 0, max: 100, value: 50, class: 'enh-split', 'aria-label': 'Compare before and after' });
  const line = el('div', { class: 'enh-line' }), beforeWrap = el('div', { class: 'enh-before' }, before);
  const busyTxt = el('div', { class: 'enh-busy-t' }), busyBar = el('i'), busy = el('div', { class: 'enh-busy hidden' }, el('div', { class: 'enh-spin' }), busyTxt, el('div', { class: 'enh-busy-bar' }, busyBar));
  const stage = el('div', { class: 'enh-stage' }, after, beforeWrap, line, split, el('span', { class: 'enh-tag l', text: 'Before' }), el('span', { class: 'enh-tag r', text: 'After' }), busy);
  const placeSplit = () => { const p = +split.value; beforeWrap.style.clipPath = `inset(0 ${100 - p}% 0 0)`; line.style.left = p + '%'; };
  split.addEventListener('input', placeSplit); placeSplit();
  const meta = el('div', { class: 'enh-meta', 'data-notr': '' }), thumbs = el('div', { class: 'enh-thumbs' });
  const more = el('label', { class: 'btn sec sm enh-addmore' }, '+ ', 'Add photos', el('input', { type: 'file', accept: 'image/*,.heic,.heif,.avif,.tif,.tiff', multiple: true, hidden: true, onchange: e => { add(e.target.files); e.target.value = ''; } }));
  const restart = el('button', { type: 'button', class: 'btn sec sm', text: 'Start over', onclick: () => { st.files = []; st.cur = null; paintThumbs(); show(false); } });
  const mainCard = el('div', { class: 'card enh-main' }, el('div', { class: 'enh-top' }, thumbs, el('div', { class: 'enh-top-r' }, more, restart)), stage, meta);

  // side panel: AI HD
  const aiSwitch = el('input', { type: 'checkbox', class: 'enh-sw-in', onchange: () => setAI(aiSwitch.checked ? (st.lastFactor || 2) : 'off') });
  const factorBtns = [[1, '1× Restore'], [2, '2× HD'], [4, '4× Ultra HD']].map(([f, t]) => el('button', { type: 'button', class: 'segb', 'data-f': f, text: t, onclick: () => setAI(f) }));
  const aiNote = el('p', { class: 'help enh-ainote' });
  const aiSec = el('section', { class: 'enh-sec' },
    el('label', { class: 'enh-sw' }, aiSwitch, el('span', { class: 'enh-sw-ui' }), el('span', {}, el('b', { text: 'AI HD' }), el('small', { text: 'Sharper details, less blur, noise and JPEG blocks' }))),
    el('div', { class: 'enh-factors seg' }, factorBtns), aiNote);
  // looks as tiles of the visitor's own photo
  const lookGrid = el('div', { class: 'enh-lookgrid' });
  const lookSec = el('section', { class: 'enh-sec' }, el('h3', { text: 'Look' }), lookGrid);
  // fine-tune (folded)
  const forms = {};
  const groupEls = GROUPS.map(([title, keys]) => {
    const f = HT.form(keys.map(([k, label]) => ({ name: k, label, type: 'range', min: ['denoise', 'sharpen', 'repair', 'flatten'].includes(k) ? 0 : -100, max: 100, value: 0 })), () => onSlide());
    keys.forEach(([k]) => (forms[k] = f));
    return el('div', { class: 'enh-group' }, el('h4', { text: title }), f.el);
  });
  const resetBtn = el('button', { type: 'button', class: 'btn sec sm', text: 'Reset to the look', onclick: () => { st.deltas = {}; fill(); render(); } });
  const tuneSec = el('details', { class: 'enh-sec enh-tune' }, el('summary', { text: 'Fine-tune' }), ...groupEls, el('div', { class: 'actions' }, resetBtn));
  // download
  const save = HT.form([
    { name: 'format', label: 'Save as', type: 'select', options: [['same', 'Same as original'], ['jpg', 'JPG'], ['webp', 'WebP (smaller)'], ['avif', 'AVIF (smallest)'], ['png', 'PNG']] },
    { name: 'quality', label: 'Quality', type: 'range', min: 50, max: 100, value: 92, unit: '%', showIf: v => v.format !== 'png' },
    { name: 'maxSide', label: 'Maximum size', type: 'select', options: [[0, 'Keep the size'], [4096, '4096 px'], [2560, '2560 px'], [1920, '1920 px (web, social)'], [1280, '1280 px'], [1080, '1080 px (Instagram)']] },
    { name: 'targetKB', label: 'Target file size (KB, optional)', type: 'number', min: 0, placeholder: 'e.g. 200', showIf: v => v.format !== 'png', help: 'The best quality that fits under this size.' },
  ], () => paintMeta());
  for (const [k, v] of Object.entries(pre)) if (save.ctl[k]) save.set(k, v);
  const go = el('button', { class: 'btn enh-go', type: 'button', onclick: download }, el('span', { text: 'Download' }));
  const goSub = el('div', { class: 'enh-go-sub', 'data-notr': '' });
  const saveSec = el('section', { class: 'enh-sec enh-save' }, go, goSub, el('details', { class: 'enh-export' }, el('summary', { text: 'Export settings' }), save.el));
  const panel = el('aside', { class: 'card enh-panel' }, aiSec, lookSec, tuneSec, saveSec);
  const ws = el('div', { class: 'enh-ws hidden' }, mainCard, panel);
  root.append(empty, ws);
  function show(on) { empty.classList.toggle('hidden', on); ws.classList.toggle('hidden', !on); }

  // ---------------------------------------------------------------- state changes
  function setAI(v) {
    st.ai = v === 'off' ? 'off' : +v; if (st.ai !== 'off') st.lastFactor = st.ai;
    aiSwitch.checked = st.ai !== 'off';
    factorBtns.forEach(b => { b.classList.toggle('on', +b.dataset.f === st.ai); b.disabled = st.ai === 'off'; });
    if (st.cur) { fill(); prepareView(); }
  }
  function paintThumbs() {
    thumbs.textContent = '';
    st.files.forEach(f => {
      const im = el('img', { alt: f.name }); im.src = URL.createObjectURL(f); im.onload = () => URL.revokeObjectURL(im.src);
      thumbs.append(el('button', { type: 'button', class: 'enh-thumb' + (f === st.cur ? ' on' : ''), title: f.name, onclick: () => open(f) }, im));
    });
    thumbs.classList.toggle('hidden', st.files.length < 2);
  }
  function busyOn(text, f) { busy.classList.remove('hidden'); busyTxt.textContent = text; busyBar.style.width = f == null ? '' : Math.round(f * 100) + '%'; busy.classList.toggle('ind', f == null); }
  const busyOff = () => busy.classList.add('hidden');

  // ---------------------------------------------------------------- opening a photo
  async function open(f) {
    if (!f) return;
    st.cur = f; st.aiBase = null; st.aiKey = ''; paintThumbs();
    const my = ++st.token;
    try {
      busyOn('Reading the photo...');
      await HT.loadScript('/assets/engine/image.js'); await HT.loadScript('/assets/engine/enhance.js');
      const full = await HT.img.load(f); if (my !== st.token) return;
      st.full = full;
      // the analysis looks at a copy of up to 1100 px (it scales its noise and detail readings to the full photo)
      const k = Math.min(1, VIEW / Math.max(full.width, full.height)), probe = k < 1 ? HT.resample(full, full.width * k, full.height * k) : full;
      st.base = E().analyze(probe.getContext('2d').getImageData(0, 0, probe.width, probe.height), k);
      if (st.ai == null) {   // first photo: AI HD is on by default when the device has a graphics card for it
        const gpu = await E().hasGPU();
        const small = Math.max(full.width, full.height) <= 1400;
        setAIQuiet(aiFromPreset || (gpu ? (small ? 2 : 1) : 'off'));
        aiNote.textContent = gpu ? 'Runs on your graphics card: a few seconds.' : 'Runs on the processor of this device: up to a minute per photo.';
        if (gpu || aiFromPreset) E().srWarm().catch(() => {});
      }
      fill(); paintLooks();
      await prepareView();
    } catch (e) { busyOff(); HT.toast(e.message); }
  }
  function setAIQuiet(v) { st.ai = v; if (v !== 'off') st.lastFactor = v; aiSwitch.checked = v !== 'off'; factorBtns.forEach(b => { b.classList.toggle('on', +b.dataset.f === v); b.disabled = v === 'off'; }); }

  // the on-screen pair: "before" is the photo simply enlarged to the result's size, "after" the AI + adjustments
  async function prepareView() {
    const full = st.full; if (!full) return;
    const my = ++st.token, factor = st.ai === 'off' ? 1 : st.ai;
    const outW = full.width * factor, outH = full.height * factor;
    const k = Math.min(1, VIEW / Math.max(outW, outH)), vw = Math.max(1, Math.round(outW * k)), vh = Math.max(1, Math.round(outH * k));
    st.viewScale = vw / outW;
    for (const c of [after, before]) { c.width = vw; c.height = vh; }
    const bx = before.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.clearRect(0, 0, vw, vh); bx.drawImage(full, 0, 0, vw, vh);
    st.before = bx.getImageData(0, 0, vw, vh);
    if (st.ai !== 'off') {
      const key = `${st.cur.name}|${st.cur.size}|${vw}`;
      if (st.aiKey !== key) {
        try {
          busyOn('AI HD is sharpening the details...', 0);
          // the AI works on a copy of up to 520 px and enlarges it 4x, which is then fitted to the view
          const s = Math.min(1, AI_PREVIEW / Math.max(full.width, full.height));
          const src = s < 1 ? HT.resample(full, Math.max(1, full.width * s), Math.max(1, full.height * s)) : full;
          const big = await E().sr4x(src, p => { if (my === st.token) busyOn('AI HD is sharpening the details...', p); });
          if (my !== st.token) return;
          const v = HT.canvas(vw, vh), vx = v.getContext('2d'); vx.imageSmoothingQuality = 'high'; vx.drawImage(big.width > vw * 2 ? HT.resample(big, vw * 2, vh * 2) : big, 0, 0, vw, vh);
          st.aiBase = vx.getImageData(0, 0, vw, vh); st.aiKey = key;
        } catch (e) { busyOff(); HT.toast(e.message); setAIQuiet('off'); return prepareView(); }
      }
    }
    busyOff(); fit(); paintMeta(); render();
  }
  // the comparison fills the space it has: small photos are shown larger (that is where AI HD shows most), big ones fit the screen
  function fit() {
    const vw = after.width, vh = after.height; if (vw < 2) return;
    const maxW = Math.max(200, mainCard.clientWidth - 28), maxH = Math.min(innerHeight * 0.72, 780);
    const k = Math.min(maxW / vw, maxH / vh, Math.max(1, 680 / Math.max(vw, vh)));
    after.style.width = Math.round(vw * k) + 'px'; after.style.height = Math.round(vh * k) + 'px';
  }
  addEventListener('resize', HT.debounce(fit, 120));

  // ---------------------------------------------------------------- the sliders and looks
  const aiOn = () => st.ai !== 'off' && st.ai != null;
  const settings = () => E().combine(st.base, st.look, st.deltas, aiOn());
  function fill() { if (!st.base) return; const s = E().combine(st.base, st.look, {}, aiOn()); for (const k of E().KEYS) forms[k].set(k, Math.round(s[k] + (st.deltas[k] || 0))); }
  function onSlide() {
    if (!st.base) return;
    const s0 = E().combine(st.base, st.look, {}, aiOn());
    for (const k of E().KEYS) st.deltas[k] = forms[k].values()[k] - s0[k];
    render();
  }
  function paintLooks() {
    lookGrid.textContent = '';
    const full = st.full; if (!full) return;
    const T = 104, k = T / Math.min(full.width, full.height), tw = Math.round(full.width * k), th = Math.round(full.height * k);
    const t = HT.canvas(T, T), tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high';
    tx.drawImage(full, (T - tw) / 2, (T - th) / 2, tw, th);   // a centred square crop of the photo
    const src = tx.getImageData(0, 0, T, T);
    for (const [key, label] of LOOKS) {
      const c = HT.canvas(T, T);
      try { c.getContext('2d').putImageData(E().apply(new ImageData(new Uint8ClampedArray(src.data), T, T), E().combine(st.base, key, {}), T / Math.min(full.width, full.height)), 0, 0); } catch (e) { c.getContext('2d').putImageData(src, 0, 0); }
      const bt = el('button', { type: 'button', class: 'enh-look' + (key === st.look ? ' on' : ''), onclick: () => { st.look = key; st.deltas = {}; [...lookGrid.children].forEach(b => b.classList.toggle('on', b === bt)); fill(); render(); } }, c, el('span', { text: label }));
      lookGrid.append(bt);
    }
  }
  function render() {
    if (!st.base || !st.before) return;
    if (st.busy) { st.again = true; return; }
    st.busy = true;
    HT.tick().then(() => {
      try {
        const src = st.ai !== 'off' && st.aiBase ? st.aiBase : st.before;
        const out = E().apply(new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), settings(), st.viewScale);
        after.getContext('2d').putImageData(out, 0, 0);
      } catch (e) { HT.toast(e.message); }
      st.busy = false;
      if (st.again) { st.again = false; render(); }
    });
  }
  function paintMeta() {
    const full = st.full; if (!full) return;
    const factor = st.ai === 'off' ? 1 : st.ai, max = +save.values().maxSide || 0;
    let w = full.width * factor, h = full.height * factor;
    if (max && Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    meta.textContent = `${st.cur.name} · ${full.width} × ${full.height} px` + (st.ai !== 'off' ? ` → ${w} × ${h} px · AI HD ${factor}×${E().backend === 'gpu' ? ' (GPU)' : ''}` : '');
    go.firstChild.textContent = st.files.length > 1 ? HT.t('Download all {0}', st.files.length) : (st.ai !== 'off' && factor > 1 ? HT.t('Download HD') : HT.t('Download'));
    const fmt = save.values().format;
    goSub.textContent = `${w} × ${h} px · ${fmt === 'same' ? (HT.ext(st.cur.name) || 'jpg').toUpperCase() : fmt.toUpperCase()}`;
  }

  // ---------------------------------------------------------------- download: each photo analysed on its own, same look and changes
  async function download() {
    if (!st.files.length) return;
    const v = save.values(); go.disabled = true;
    try {
      busyOn('Preparing...', 0);
      const { id } = await HT.upload('image-enhancer', st.files.slice(), { preset: st.look, deltas: st.deltas, ai: st.ai, format: v.format, quality: v.quality, maxSide: +v.maxSide, targetKB: +v.targetKB || 0 });
      const job = await HT.poll(id, s => busyOn(s.speed || 'Enhancing...', (s.progress || 0) / 100));
      busyOff();
      if (job.status === 'error') throw new Error(job.error);
      HT.download(job.url, job.filename);
      HT.toast((job.info && job.info.summary) || 'Done');
    } catch (e) { busyOff(); HT.toast(e.message); }
    go.disabled = false;
  }
});
