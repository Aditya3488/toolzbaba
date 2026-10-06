/* Shared helpers for every tool page. Global: HT */
(() => {
  const HT = (window.HT = { tools: {} });
  HT.register = (slug, fn) => { HT.tools[slug] = fn; };
  // build.py stamps this file's URL with ?v=<build version>; the site's own scripts and data loaded later carry the
  // same stamp, so a new deploy never mixes with old cached files (third-party libraries have versioned folders)
  const VERSION = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || '';
  HT.ver = url => VERSION && url.startsWith('/assets/') && !url.startsWith('/assets/vendor/') && !url.startsWith('/assets/models/')
    ? url + (url.includes('?') ? '&' : '?') + 'v=' + VERSION : url;

  // ---------------------------------------------------------------- tiny DOM helper
  HT.el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    const add = k => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else n.append(k.nodeType ? k : document.createTextNode(k)); };
    kids.forEach(add);
    return n;
  };
  const el = HT.el;
  // small inline SVG icons (static strings only, never user data)
  const ICON = {
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    search: '<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12.5 3 3 5-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  };
  HT.ICON = ICON;
  HT.svg = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  HT.stepTitle = (n, text) => el('h2', { class: 'ct' }, el('span', { class: 'n', text: String(n) }), text);
  HT.fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  HT.debounce = (fn, ms = 80) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  HT.stem = name => name.replace(/\.[^.]+$/, '');
  HT.ext = name => (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();

  HT.toast = msg => {
    let t = document.getElementById('toast');
    if (!t) { t = el('div', { id: 'toast', style: { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#171a26', color: '#fff', padding: '9px 16px', borderRadius: '10px', fontSize: '.9rem', zIndex: 99, opacity: 0, transition: 'opacity .2s', pointerEvents: 'none' } }); document.body.append(t); }
    t.textContent = msg; t.style.opacity = 1; clearTimeout(t._h); t._h = setTimeout(() => (t.style.opacity = 0), 1600);
  };
  HT.copy = async (text, msg = 'Copied!') => {
    try { await navigator.clipboard.writeText(text); }
    catch { const a = el('textarea', { style: { position: 'fixed', opacity: 0 } }); a.value = text; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
    HT.toast(msg);
  };

  const scripts = {};
  // The tool screens are loaded as modules, so each one keeps its own top-level names (two tabs of one family can then be on the same page without clashing).
  HT.loadScript = src => (src = HT.ver(src), scripts[src] || (scripts[src] = new Promise((res, rej) => { const s = el('script', Object.assign({ src }, /\/assets\/tools\//.test(src) ? { type: 'module' } : {})); s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); })));

  // ---------------------------------------------------------------- files / images / downloads
  HT.download = (blobOrUrl, name) => {
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    try { bookmarkNudge(); } catch { }
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  HT.zip = async entries => {
    await HT.loadScript('/assets/vendor/jszip.min.js');
    const z = new JSZip(); const used = new Set();
    for (const { name, blob } of entries) {
      let n = name, i = 1; while (used.has(n)) n = HT.stem(name) + '_' + i++ + '.' + HT.ext(name); used.add(n); z.file(n, blob);
    }
    return z.generateAsync({ type: 'blob', compression: 'STORE' });
  };
  // HEIC (iPhone photos) and TIFF only open natively in some browsers: decode those with small libraries instead
  const CODECS = '/assets/vendor/img-codecs/';
  HT.decodeSpecial = async file => {
    const ext = HT.ext(file.name), type = file.type || '';
    if (/^(heic|heif)$/.test(ext) || /hei[cf]/.test(type)) {
      await HT.loadScript(CODECS + 'heic2any-0.0.4.min.js');
      const out = await heic2any({ blob: file, toType: 'image/png' });
      return createImageBitmap(Array.isArray(out) ? out[0] : out);
    }
    if (/^tiff?$/.test(ext) || type === 'image/tiff') {
      await HT.loadScript(CODECS + 'pako-1.0.11.min.js'); await HT.loadScript(CODECS + 'utif-3.1.0.js');
      const buf = await file.arrayBuffer(), ifds = UTIF.decode(buf); UTIF.decodeImage(buf, ifds[0]);
      const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifds[0]));
      return createImageBitmap(new ImageData(rgba, ifds[0].width, ifds[0].height));
    }
    return null;
  };
  HT.loadBitmap = async file => {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      const special = await HT.decodeSpecial(file).catch(() => null);
      if (special) return special;
      return new Promise((res, rej) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => { if (!img.naturalWidth) { img.width = 512; img.height = 512; } else { img.width = img.naturalWidth; img.height = img.naturalHeight; } res(img); };
        img.onerror = () => rej(new Error("Couldn't read '" + file.name + "' as an image. Try the Format Converter first (HEIC/AVIF may not open in every browser)."));
        img.src = url;
      });
    }
  };
  HT.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  HT.encode = (canvas, mime = 'image/png', q = 0.92) => {
    let src = canvas;
    if (mime === 'image/jpeg') { src = HT.canvas(canvas.width, canvas.height); const x = src.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, src.width, src.height); x.drawImage(canvas, 0, 0); }
    return new Promise((res, rej) => src.toBlob(b => b ? res(b) : rej(new Error('Could not encode the image (it may be too large).')), mime, q));
  };
  HT.mimeFor = (fmt, file) => {
    if (fmt === 'jpg' || fmt === 'jpeg') return ['image/jpeg', 'jpg'];
    if (fmt === 'webp') return ['image/webp', 'webp'];
    if (fmt === 'png') return ['image/png', 'png'];
    const t = file && file.type; // keep original when the browser can write it
    return t === 'image/jpeg' ? ['image/jpeg', 'jpg'] : t === 'image/webp' ? ['image/webp', 'webp'] : ['image/png', 'png'];
  };
  // high-quality downscale: step down by halves so thin lines don't alias
  HT.resample = (src, w, h) => {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    let cur = src, cw = src.width, ch = src.height;
    while (cw / 2 >= w && ch / 2 >= h) { const c = HT.canvas(cw / 2, ch / 2); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height); cur = c; cw = c.width; ch = c.height; }
    const out = HT.canvas(w, h); const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); return out;
  };
  HT.toCanvas = bmp => { const c = HT.canvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); return c; };
  HT.cover = (ctx, img, x, y, w, h, fx = .5, fy = .5) => { // draw img to fill the box, cropping overflow
    const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, x, y, w, h);
  };
  HT.roundRect = (ctx, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  const matches = (file, accept) => {
    if (!accept) return true;
    return accept.split(',').map(s => s.trim().toLowerCase()).some(a =>
      a.startsWith('.') ? file.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a);
  };

  HT.matches = matches;

  // ---------------------------------------------------------------- dropzone
  HT.dropzone = ({ accept, multiple = false, label, hint, onFiles }) => {
    const input = el('input', { type: 'file', hidden: true, accept: accept || null, multiple: multiple || null });
    const box = el('div', { class: 'drop', tabindex: 0, role: 'button' },
      el('div', { class: 'drop-ic' }, HT.svg(ICON.upload)),
      el('b', { text: label || (multiple ? 'Drop your files here' : 'Drop your file here') }),
      el('span', { class: 'or', text: 'or click to browse from your device' }),
      el('span', { class: 'btn' }, multiple ? 'Choose files' : 'Choose file'),
      hint && el('small', { text: hint }), input);
    const take = list => {
      const files = [...list].filter(f => matches(f, accept));
      if (list.length && !files.length) HT.toast('That file type is not supported here.');
      if (files.length) { const w = box.closest('.work'); if (w) w.classList.add('has-file'); onFiles(multiple ? files : files.slice(0, 1)); }
    };
    box.addEventListener('click', e => { if (e.target !== input) input.click(); });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { take(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.remove('over'); }));
    box.addEventListener('drop', e => take(e.dataTransfer.files));
    const onPaste = e => { if (!document.body.contains(box)) return document.removeEventListener('paste', onPaste); const fs = [...(e.clipboardData?.files || [])]; if (fs.length) take(fs); };
    document.addEventListener('paste', onPaste);
    return box;
  };

  // ---------------------------------------------------------------- form builder
  HT.form = (defs, onChange) => {
    const wrap = el('div', { class: 'fields' }), ctl = {}, fieldEls = {};
    const fire = HT.debounce(() => { refresh(); onChange && onChange(api.values()); }, 30);
    for (const d of defs) {
      const id = 'f_' + d.name + Math.random().toString(36).slice(2, 6);
      let c, valEl;
      if (d.type === 'select') c = el('select', { id }, d.options.map(o => Array.isArray(o) ? el('option', { value: o[0], text: o[1] }) : el('option', { value: o, text: o })));
      else if (d.type === 'checkbox') c = el('input', { id, type: 'checkbox', checked: !!d.value });
      else if (d.type === 'textarea') c = el('textarea', { id, placeholder: d.placeholder || '' });
      else if (d.type === 'range') { c = el('input', { id, type: 'range', min: d.min, max: d.max, step: d.step || 1 }); valEl = el('span', { class: 'rangeval' }); }
      else c = el('input', { id, type: d.type || 'text', min: d.min ?? null, max: d.max ?? null, step: d.step ?? null, placeholder: d.placeholder || '' });
      if (d.value != null && d.type !== 'checkbox') c.value = d.value;
      const upd = () => { if (valEl) valEl.textContent = c.value + (d.unit || ''); };
      c.addEventListener('input', () => { upd(); fire(); }); c.addEventListener('change', () => { upd(); fire(); });
      upd();
      ctl[d.name] = c;
      const field = d.type === 'checkbox'
        ? el('div', { class: 'field' }, el('label', { class: 'chk', for: id }, c, d.label), d.help && el('div', { class: 'help', text: d.help }))
        : el('div', { class: 'field' }, el('label', { class: 'lbl', for: id }, d.label, valEl), c, d.help && el('div', { class: 'help', text: d.help }));
      fieldEls[d.name] = field; wrap.append(field);
    }
    const read = (d, c) => d.type === 'checkbox' ? c.checked : (d.type === 'number' || d.type === 'range') ? (c.value === '' ? '' : Number(c.value)) : c.value;
    const api = {
      el: wrap,
      values() { const v = {}; defs.forEach(d => (v[d.name] = read(d, ctl[d.name]))); return v; },
      set(name, val) { const c = ctl[name]; if (c.type === 'checkbox') c.checked = !!val; else c.value = val; c.dispatchEvent(new Event('input')); },
      ctl,
    };
    function refresh() { const v = api.values(); defs.forEach(d => { if (d.showIf) fieldEls[d.name].classList.toggle('hide', !d.showIf(v)); }); }
    refresh();
    return api;
  };

  // ---------------------------------------------------------------- file list widget
  HT.fileList = ({ onChange, reorder = false, thumbs = true }) => {
    const ul = el('ul', { class: 'files' });
    const state = { files: [] };
    const render = () => {
      ul.textContent = '';
      state.files.forEach((f, i) => {
        const th = thumbs && f.type.startsWith('image/') ? el('img', { alt: '' }) : el('div', { class: 'ph', text: (HT.ext(f.name) || 'file').slice(0, 4).toUpperCase() });
        if (th.tagName === 'IMG') { th.src = URL.createObjectURL(f); th.onload = () => URL.revokeObjectURL(th.src); }
        ul.append(el('li', { class: 'file' }, th, el('div', { class: 'nm', text: f.name }), el('small', { text: HT.fmtBytes(f.size) }),
          reorder && el('button', { type: 'button', title: 'Move up', disabled: i === 0 || null, onclick: () => move(i, -1), text: '↑' }),
          reorder && el('button', { type: 'button', title: 'Move down', disabled: i === state.files.length - 1 || null, onclick: () => move(i, 1), text: '↓' }),
          el('button', { type: 'button', title: 'Remove', onclick: () => { state.files.splice(i, 1); render(); onChange && onChange(state.files); }, text: '×' })));
      });
    };
    const move = (i, d) => { const j = i + d; [state.files[i], state.files[j]] = [state.files[j], state.files[i]]; render(); onChange && onChange(state.files); };
    state.el = ul;
    state.add = (fs, multiple = true) => { state.files = multiple ? state.files.concat(fs) : fs.slice(0, 1); render(); onChange && onChange(state.files); };
    state.clear = () => { state.files = []; render(); onChange && onChange(state.files); };
    return state;
  };

  // ---------------------------------------------------------------- jobs (run on the visitor's device)
  // The heavier tools used to be uploaded to a server. They now run here, in "engines" loaded on demand from
  // /assets/engine/<name>.js (named by the tool's "engine" field in tools.json). HT.upload starts a job and
  // HT.poll waits for it, with the same job shape the server used, so the tool screens work unchanged.
  // An engine is async ctx => [{ name, blob }]; ctx = { files, opts, progress(0..1), status(msg), info }.
  HT.engines = {};
  // yield to the browser between steps of a long job. A message (not setTimeout) so it isn't slowed to once a
  // second or once a minute when the visitor switches to another tab while waiting.
  HT.tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  HT.engine = (slug, fn) => { HT.engines[slug] = fn; };
  const jobs = {};
  let jobSeq = 0;
  async function runJob(slug, job, files, opts) {
    const all = await HT.loadTools(), meta = all.tools.find(t => t.slug === slug) || (all.variants || []).find(t => t.slug === slug);
    if (!meta || !meta.engine) throw new Error('This tool is not available.');
    job.speed = 'Loading the tool...';
    await HT.loadScript(`/assets/engine/${meta.engine}.js`);
    job.speed = '';
    const ctx = { files, opts: opts || {}, info: null,
      progress: f => { job.progress = Math.round(Math.max(0, Math.min(1, f)) * 950) / 10; },
      status: msg => { job.speed = msg || ''; } };
    const outs = await HT.engines[slug](ctx);
    if (!outs || !outs.length) throw new Error('Nothing was produced.');
    let blob = outs[0].blob, name = outs[0].name;
    if (outs.length > 1) { job.status = 'processing'; blob = await HT.zip(outs); name = slug + '.zip'; }
    Object.assign(job, { url: URL.createObjectURL(blob), filename: name, size: blob.size, info: ctx.info, progress: 100, status: 'done' });
  }
  HT.upload = async (slug, files, options, onProgress) => {
    const id = 'j' + (++jobSeq), job = jobs[id] = { status: 'queued', progress: 0, speed: '' };
    if (onProgress) onProgress(1);
    // the result Promise settles when the job ends; HT.poll reports progress until then
    const t0 = performance.now();
    job.done = runJob(slug, job, files, options).catch(e => {
      console.warn(e);   // a message for the visitor (wrong password, no face found ...) is not a crash
      Object.assign(job, { status: 'error', error: (e && e.message) || 'Processing failed.' });
    });
    job.done.then(() => HT.rum && HT.rum.run(slug, performance.now() - t0, job.status === 'done'));
    return { id };
  };
  HT.poll = (id, onStatus) => new Promise((res, rej) => {
    const job = jobs[id];
    if (!job) return rej(new Error('Unknown job.'));
    const tick = () => {
      onStatus(job);
      if (job.status === 'done') { clearInterval(t); res(job); } else if (job.status === 'error') { clearInterval(t); rej(new Error(job.error)); }
    };
    const t = setInterval(tick, 250);
    job.done.then(tick);
  });

  // A progress bar + status line pair
  HT.progress = () => {
    const fill = el('i'), bar = el('div', { class: 'bar' }, fill), st = el('div', { class: 'status' });
    return { bar, st, el: el('div', {}, bar, st),
      set(p, msg) { bar.style.display = 'block'; fill.style.width = Math.max(0, Math.min(100, p)) + '%'; st.className = 'status'; st.textContent = msg || ''; },
      error(msg) { bar.style.display = 'none'; st.className = 'status err'; st.textContent = msg; },
      clear() { bar.style.display = 'none'; st.className = 'status'; st.textContent = ''; } };
  };

  // The workbench: everything you can change in a left sidebar, the preview / result on the right (stacked on small screens).
  // Call bench.set(true) once there is a file: it switches to two columns and scrolls the workbench into view the first time.
  HT.bench = (sideKids, main, opts = {}) => {
    const bench = el('div', { class: 'tbench' + (opts.half ? ' half' : opts.keep ? '' : ' pf') }, el('div', { class: 'tside' }, ...sideKids.filter(Boolean)), main); let shown = false;
    bench.set = on => { bench.classList.toggle('on', on); if (on && !shown) setTimeout(() => bench.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320); shown = on; };
    return bench;
  };
  // Result | Original | Side by side, for a .compare.tview element holding the original figure first and the result second
  HT.viewToggle = (tview, initial = innerWidth < 700 ? 'result' : 'both') => {
    let mode = initial;
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'What to show' }, [['result', 'Result'], ['original', 'Original'], ['both', 'Side by side']].map(([v, t]) =>
      el('button', { type: 'button', class: 'segb', 'data-v': v, text: t, onclick: () => { mode = v; paint(); } })));
    const paint = () => { tview.className = 'compare tview v-' + mode; seg.querySelectorAll('.segb').forEach(b => b.classList.toggle('on', b.dataset.v === mode)); };
    paint(); return seg;
  };

  // Show a finished server job: summary, table, preview, download
  HT.showResult = (job, id, inputs = [], opts = {}) => {
    const info = job.info || {}, name = job.filename, ext = HT.ext(name), url = job.url;
    const box = el('div', { class: 'card result' }, el('h2', {}, HT.svg(ICON.check), 'All done'));
    if (info.summary) box.append(el('div', { class: 'sum', text: info.summary }));
    if (info.files && info.files.length) {
      const has = info.files[0].before != null;
      const t = el('table', { class: 'ftable' });
      t.append(el('tr', {}, ...(has ? ['File', 'Before', 'After', 'Saved'] : ['File', 'What was found']).map(h => el('th', { text: h }))));
      info.files.slice(0, 30).forEach(f => t.append(has
        ? el('tr', {}, el('td', { text: f.name }), el('td', { text: HT.fmtBytes(f.before) }), el('td', { text: HT.fmtBytes(f.after) }), el('td', { text: f.before ? Math.max(0, Math.round((1 - f.after / f.before) * 100)) + '%' : '' }))
        : el('tr', {}, el('td', { text: f.name }), el('td', { text: (f.removed || []).join(' · ') }))));
      box.append(t);
    }
    const inline = url;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg', 'bmp'].includes(ext) && opts.preview !== false) {
      const out = el('div', { class: 'pv' }, el('img', { src: inline, alt: 'Result' }));
      if (inputs.length === 1 && inputs[0].type.startsWith('image/') && opts.compare !== false && !['svg'].includes(ext)) {
        box.append(el('div', { class: 'compare' }, el('figure', {}, el('figcaption', { text: 'Original' }), el('div', { class: 'pv' }, el('img', { src: URL.createObjectURL(inputs[0]), alt: 'Original' }))), el('figure', {}, el('figcaption', { text: 'Result' }), out)));
      } else box.append(el('div', { style: { marginBottom: '14px' } }, out));
    } else if (['mp4', 'webm'].includes(ext)) box.append(el('div', { class: 'pv plain', style: { marginBottom: '14px' } }, el('video', { src: inline, controls: true })));
    else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) box.append(el('div', { style: { marginBottom: '14px' } }, el('audio', { src: inline, controls: true, style: { width: '100%' } })));
    else if (ext === 'pdf') box.append(el('div', { style: { marginBottom: '14px' } }, el('a', { href: inline, target: '_blank', rel: 'noopener', text: 'Open PDF in a new tab ↗' })));
    const actions = el('div', { class: 'actions' }, el('a', { class: 'btn', href: url, download: name, text: 'Download ' + name }), opts.again && el('button', { class: 'btn sec', type: 'button', onclick: opts.again, text: 'Start over' }));
    box.querySelector('h2').after(actions);  // the download button sits at the top, under the heading
    return box;
  };

  // ---------------------------------------------------------------- generic server tool UI
  HT.serverTool = (root, cfg) => {
    const multiple = cfg.max > 1 || cfg.multiple;
    const list = HT.fileList({ reorder: cfg.reorder, onChange: sync });
    const dz = HT.dropzone({ accept: cfg.accept, multiple, label: cfg.dropLabel, hint: cfg.hint, onFiles: fs => list.add(fs, multiple) });
    const form = HT.form(cfg.fields || [], () => toggleExtra());
    const prog = HT.progress(), resultBox = el('div');
    let extra = null; const extraList = cfg.extraFile ? HT.fileList({ onChange: () => { } }) : null;
    const extraEl = cfg.extraFile && el('div', { class: 'field', style: { marginTop: '14px' } }, el('label', { class: 'lbl', text: cfg.extraFile.label }),
      HT.dropzone({ accept: 'image/*', label: cfg.extraFile.label, onFiles: fs => extraList.add(fs, false) }), extraList.el);
    const run = el('button', { class: 'btn', type: 'button', text: cfg.action || 'Start', disabled: true, onclick: go });
    const optsCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, cfg.fields && cfg.fields.length ? 'Choose your settings' : 'Ready when you are'), cfg.fields && cfg.fields.length ? form.el : null, extraEl, el('div', { class: 'actions' }, run));
    // right side: a preview of the file you added (until there is a result), then the result with its download button on top
    const empty = el('div', { class: 'card tmain' }), main = el('div', { class: 'hidden' }, empty, resultBox);
    const bench = HT.bench([dz, list.el, optsCard, prog.el], main);
    if (cfg.notice) root.append(el('div', { class: 'notice', text: cfg.notice }));
    root.append(bench);
    let emptyUrl = null;
    function paintEmpty(files) {
      empty.textContent = ''; if (emptyUrl) { URL.revokeObjectURL(emptyUrl); emptyUrl = null; }
      const f = files[0]; if (!f) return;
      const t = f.type || '';
      if (/^image\/(png|jpe?g|webp|gif|avif|svg)/.test(t)) { emptyUrl = URL.createObjectURL(f); empty.append(el('div', { class: 'pv' }, el('img', { src: emptyUrl, alt: 'Your file' }))); }
      else if (t.startsWith('video/')) { emptyUrl = URL.createObjectURL(f); empty.append(el('div', { class: 'pv plain' }, el('video', { src: emptyUrl, controls: true }))); }
      else if (t.startsWith('audio/')) { emptyUrl = URL.createObjectURL(f); empty.append(el('audio', { src: emptyUrl, controls: true, style: { width: '100%' } })); }
      else empty.append(el('div', { class: 'bigname', text: f.name }));
      empty.append(el('p', { class: 'help', style: { marginTop: '10px' }, text: (files.length > 1 ? files.length + ' files added, showing the first one. ' : '') + 'This is your file as it is now. Choose the settings and click \u201c' + run.textContent + '\u201d: the result and its download button appear here.' }));
    }
    cfg.onReady && cfg.onReady({ root, list, form, optsCard, empty, resultBox });
    function toggleExtra() { if (extraEl) extraEl.classList.toggle('hidden', !cfg.extraFile.showIf(form.values())); }
    toggleExtra();
    function sync(files) {
      const min = cfg.min || 1;
      optsCard.classList.toggle('hidden', !files.length); bench.set(files.length > 0); main.classList.toggle('hidden', !files.length);
      resultBox.textContent = ''; empty.classList.remove('hidden');
      run.disabled = files.length < min;
      run.textContent = cfg.action ? (typeof cfg.action === 'function' ? cfg.action(files) : cfg.action) : 'Start';
      paintEmpty(files);
      cfg.onFiles && cfg.onFiles(files, { form, empty, resultBox });
      if (files.length && files.length < min) prog.st.textContent = `Add at least ${min} files (${files.length} so far).`; else if (prog.st.textContent.startsWith('Add at least')) prog.clear();
    }
    async function go() {
      const files = list.files.slice(); if (!files.length) return;
      const vals = form.values(); const send = files.slice();
      if (cfg.extraFile && cfg.extraFile.showIf(vals) && extraList.files.length) send.push(extraList.files[0]);
      resultBox.textContent = ''; run.disabled = true;
      try {
        prog.set(0, 'Starting...');
        const { id } = await HT.upload(cfg.slug, send, cfg.buildOptions ? cfg.buildOptions(vals, files) : vals);
        const job = await HT.poll(id, s => prog.set(s.progress || 0, (s.speed || (s.status === 'processing' ? 'Finishing up...' : `Processing ${Math.round(s.progress || 0)}%`))));
        prog.clear(); empty.classList.add('hidden');
        if (matchMedia('(max-width:900px)').matches) setTimeout(() => main.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);  // on a phone the result sits above the settings
        resultBox.append(HT.showResult(job, id, files, { again: () => { list.clear(); resultBox.textContent = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); }, compare: cfg.compare, preview: cfg.preview }));
      } catch (e) { prog.error(e.message); }
      run.disabled = list.files.length < (cfg.min || 1);
    }
    return { list, form, accept: cfg.accept };
  };

  // ---------------------------------------------------------------- generic in-browser image tool UI
  // cfg: { fields, process(bitmap, vals, file, i) -> canvas, suffix, multiple, formatField, accept }
  HT.canvasTool = (root, cfg) => {
    const multiple = cfg.multiple !== false;
    const fields = (cfg.fields || []).slice();
    if (cfg.formatField !== false) {
      fields.push({ name: '_fmt', label: 'Save as', type: 'select', options: [['keep', 'Same as original'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']], value: cfg.defaultFormat || 'keep' });
      fields.push({ name: '_q', label: 'Quality', type: 'range', min: 40, max: 100, value: 92, unit: '%', showIf: v => v._fmt !== 'png' });
    }
    const bitmaps = new Map();
    const list = HT.fileList({ onChange: files => { optsCard.classList.toggle('hidden', !files.length); pvCard.classList.toggle('hidden', !files.length); bench.set(files.length > 0); dl.disabled = !files.length; origFor = null; preview(); } });
    const dz = HT.dropzone({ accept: cfg.accept || 'image/*', multiple, hint: cfg.hint || 'Runs in your browser: nothing is uploaded.', onFiles: fs => list.add(fs, multiple) });
    const form = HT.form(fields, () => preview());
    const pv = el('div', { class: 'pv' }), orig = el('div', { class: 'pv' }), info = el('div', { class: 'help', style: { marginTop: '4px' } }); let origFor = null;
    const prog = HT.progress();
    const dl = el('button', { class: 'btn', type: 'button', disabled: true, onclick: downloadAll, text: 'Download' });
    const optsCard = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Adjust'), form.el);
    const tview = el('div', { class: 'compare tview v-both' }, el('figure', {}, el('figcaption', { text: 'Original' }), orig), el('figure', {}, el('figcaption', { text: 'Result' }), pv));
    const pvCard = el('div', { class: 'card tmain hidden' }, el('div', { class: 'tbar' }, el('div', { class: 'tinfo' }, info), el('div', { class: 'actions' }, dl)), el('div', { class: 'tctl' }, HT.viewToggle(tview)), tview);
    const bench = HT.bench([dz, list.el, optsCard, prog.el], pvCard);
    root.append(bench);
    const bmp = async f => { if (!bitmaps.has(f)) bitmaps.set(f, await HT.loadBitmap(f)); return bitmaps.get(f); };
    let token = 0;
    async function preview() {
      const my = ++token; const f = list.files[0]; if (!f) { pv.textContent = ''; return; }
      try {
        const c = await cfg.process(await bmp(f), form.values(), f, 0, true);
        if (my !== token) return;
        pv.textContent = ''; pv.append(c);
        if (origFor !== f) { origFor = f; const b = await bmp(f), k = Math.min(1, 1400 / Math.max(b.width, b.height)); orig.textContent = ''; orig.append(k < 1 ? HT.resample(HT.toCanvas(b), b.width * k, b.height * k) : HT.toCanvas(b)); }
        info.textContent = `${c.width} × ${c.height} px` + (list.files.length > 1 ? ` · preview of the first of ${list.files.length} images` : '');
        prog.clear();
      } catch (e) { prog.error(e.message); }
    }
    async function downloadAll() {
      const files = list.files.slice(), v = form.values(), outs = [];
      dl.disabled = true;
      try {
        for (let i = 0; i < files.length; i++) {
          prog.set((i / files.length) * 100, `Processing ${i + 1}/${files.length}...`);
          const c = await cfg.process(await bmp(files[i]), v, files[i], i, false);
          const [mime, ext] = HT.mimeFor(v._fmt || cfg.outFormat || 'png', files[i]);
          outs.push({ name: HT.stem(files[i].name) + (cfg.suffix || '') + '.' + ext, blob: await HT.encode(c, mime, (v._q || 92) / 100) });
        }
        prog.clear();
        if (outs.length === 1) HT.download(outs[0].blob, outs[0].name); else HT.download(await HT.zip(outs), (cfg.zipName || 'images') + '.zip');
        HT.toast('Saved ' + (outs.length === 1 ? HT.fmtBytes(outs[0].blob.size) : outs.length + ' files'));
      } catch (e) { prog.error(e.message); }
      dl.disabled = false;
    }
    cfg.onReady && cfg.onReady({ root, list, form, preview, pv });
    return { list, form, preview };
  };

  // ---------------------------------------------------------------- tool icons (logo style: colourful rounded tile + white glyph)
  const GLYPH = {
    'compress-image': '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    'resize-image': '<path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6"/>',
    'crop-image': '<path d="M6 2.5v14a2 2 0 0 0 2 2h13.5"/><path d="M2.5 6H16a2 2 0 0 1 2 2v13.5"/>',
    'convert-image': '<path d="M4 10a8 8 0 0 1 14-3.5L20 8.5M20 4v4.5h-4.5M20 14a8 8 0 0 1-14 3.5L4 15.5M4 20v-4.5h4.5"/>',
    'rotate-flip': '<path d="M20 12a8 8 0 1 1-2.6-5.9M20.5 3.5v5.2h-5.2"/>',
    'social-media-image-resizer': '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>',
    'thumbnail-generator': '<rect x="3" y="4.5" width="18" height="12" rx="2.6"/><path d="M10 7.8v5.4l4.4-2.7z"/><path d="M7 20h10"/>',
    'exif-remover': '<path d="M12 3l7.5 3v5.4c0 4.4-3 7.9-7.5 9.6-4.5-1.7-7.5-5.2-7.5-9.6V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.4"/>',
    'add-watermark-to-image': '<path d="M12 3c3.6 4.4 6 7.4 6 10.8a6 6 0 0 1-12 0C6 10.4 8.4 7.4 12 3z"/><path d="M9.5 14.5a2.7 2.7 0 0 0 2.5 2"/>',
    'pixelate-image': '<rect x="4" y="4" width="7" height="7" rx="1.4" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4" fill="currentColor"/>',
    'meme-generator': '<circle cx="12" cy="12" r="9"/><path d="M8.3 14c.9 1.7 2.2 2.6 3.7 2.6s2.8-.9 3.7-2.6"/><path d="M9 9.6h.01M15 9.6h.01" stroke-width="2.6"/>',
    'photo-collage-maker': '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 3.5v17M12 11.5h8.5"/>',
    'screenshot-beautifier': '<path d="M11 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/><path d="M18.5 15.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/>',
    'favicon-generator': '<path d="M12 3.4l2.7 5.5 6 .9-4.4 4.2 1 6L12 17.2l-5.3 2.8 1-6-4.4-4.2 6-.9z"/>',
    'image-to-svg': '<circle cx="5.8" cy="18.2" r="2.3"/><circle cx="18.2" cy="5.8" r="2.3"/><path d="M8 18.2c7 0 1.5-12.4 8-12.4"/>',
    'remove-background': '<path d="M4.5 19.5l11-11"/><path d="M15 8.5l1.5 1.5"/><path d="M15 3.5v3M13.5 5h3M19.5 10v3M18 11.5h3M8 3.5v2M7 4.5h2"/>',
    'replace-background': '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4 18l5-5 4 4 3-3 4.5 4.5"/>',
    'upscale-image': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4l5.1 5.1M7.8 10.5h5.4M10.5 7.8v5.4"/>',
    'face-blur': '<circle cx="12" cy="12" r="8.6"/><path d="M8.6 10h.01M15.4 10h.01" stroke-width="2.6"/><path d="M8.5 15.2h7" stroke-dasharray="1.4 2.2"/>',
    'anime-style': '<circle cx="12" cy="7" r="3"/><circle cx="17" cy="11" r="3"/><circle cx="15" cy="17" r="3"/><circle cx="9" cy="17" r="3"/><circle cx="7" cy="11" r="3"/>',
    'image-to-pdf': '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M12 18v-6m0 0-2.4 2.4M12 12l2.4 2.4"/>',
    'pdf-to-image': '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8 18l2.6-3 2 2 1.4-1.4L16 18"/>',
    'pdf-merge': '<path d="M6 3.5v3.5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V3.5M12 11v9M9 17l3 3 3-3"/>',
    'pdf-split': '<path d="M6.5 8.5V5a2 2 0 0 1 2-2h4.5l4.5 4.5v1"/><path d="M6.5 15.5V19a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3.5"/><path d="M3 12h3.2M9.4 12h1.7M13 12h1.7M17.8 12H21"/>',
    'compress-pdf': '<rect x="3" y="4" width="18" height="5" rx="1.6"/><path d="M5 9v9.2A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8V9M10 13h4"/>',
    'word-to-pdf': '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8.5 12.5h7M8.5 16h7"/>',
    'pdf-to-word': '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8.2 12.4l1.6 5 2.2-4.4 2.2 4.4 1.6-5"/>',
    'video-converter': '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M8 5v14M16 5v14M3 10h5M3 14h5M16 10h5M16 14h5"/>',
    'video-to-gif': '<circle cx="12" cy="12" r="9"/><path d="M10.2 8.6v6.8l5.6-3.4z"/>',
    'gif-to-video': '<rect x="3" y="6.5" width="12.5" height="11" rx="2.6"/><path d="M15.5 11l5.5-3.2v8.4L15.5 13"/>',
    'video-trimmer': '<circle cx="6" cy="6.5" r="2.6"/><circle cx="6" cy="17.5" r="2.6"/><path d="M8 8.2l12 9.3M8 15.8L20 6.5"/>',
    'compress-video': '<path d="M13.2 2.8L5 13.6h6.2L10 21.2l8.2-10.8H12z"/>',
    'image-color-palette-extractor': '<path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.2-1.1 1.6-2.4-.6-1.4.3-2.9 1.9-2.9H18a3 3 0 0 0 3-3C21 7 17 3 12 3z"/><path d="M7.6 11.2h.01M10.2 7.6h.01M14.6 7.6h.01" stroke-width="2.6"/>',
    'qr-code-generator': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><path d="M14 14h2.6v2.6M20.5 14v.01M14 20.5v.01M17.6 20.5h2.9v-2.9"/>',
    base64: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.6 5l-3.2 14"/>',
    'image-cdn': '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.9 6 6 0 0 1 11.7.9A4 4 0 0 1 17.5 18.5z"/><path d="M12 15.5v-5m0 0-2.2 2.2M12 10.5l2.2 2.2"/>',
    'resize-image-to-kb': '<path d="M12 4v15M6 20h12M6.5 7.5h11"/><path d="M6.5 7.5L3.5 14a3 3 0 0 0 6 0zM17.5 7.5L14.5 14a3 3 0 0 0 6 0z"/>',
    'passport-size-photo-maker': '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M6.8 18.5c.8-2.8 2.9-4.2 5.2-4.2s4.4 1.4 5.2 4.2"/>',
    'image-to-text': '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8.5 9h7M8.5 12h7M8.5 15h4"/>',
    'organize-pdf': '<rect x="3.5" y="3.5" width="9" height="11" rx="2"/><rect x="11.5" y="9.5" width="9" height="11" rx="2"/><path d="M6.5 18l-2-2 2-2M4.5 16H8"/>',
    'esign-pdf': '<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M12.5 6.5l5 5"/>',
    'add-page-numbers-to-pdf': '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M10.6 11.5L9.9 17M13.6 11.5L12.9 17M8.8 13.3h5.6M8.4 15.4h5.6"/>',
    'protect-pdf': '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.6v2.6"/>',
    'unlock-pdf': '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6"/><path d="M8 10.5V7.5a4 4 0 0 1 7.4-2.1"/><path d="M12 14.6v2.6"/>',
    'audio-cutter': '<path d="M4 10v4M8 6.5v11M12 3v18M16 7v10M20 10v4"/>',
    'video-merger': '<rect x="2.5" y="7" width="8" height="10" rx="2.2"/><rect x="13.5" y="7" width="8" height="10" rx="2.2"/><path d="M10.5 12h3"/>',
    'change-video-speed': '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="M12 14l4-4.5"/><circle cx="12" cy="14.4" r="1.3"/>',
    'json-formatter': '<path d="M9 4C7 4 6 5 6 7v2c0 1.5-1 2.5-2.5 3C5 12.5 6 13.5 6 15v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2.5 3-1.5.5-2.5 1.5-2.5 3v2c0 2-1 3-3 3"/>',
    'word-counter': '<path d="M4 6h16M4 11h10M4 16h16M4 21h7"/>',
    'text-case-converter': '<path d="M3 18l4.4-11L11.8 18M4.7 14.2h5.4"/><circle cx="17.6" cy="14.6" r="3.2"/><path d="M20.8 11.6V18"/>',
    'password-generator': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    'hash-uuid-generator': '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4 9h16M3.5 15h16"/>',
    'url-encoder': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    // extras used on the home page
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    bolt: '<path d="M13.2 2.8L5 13.6h6.2L10 21.2l8.2-10.8H12z"/>',
    toolbox: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a2 2 0 0 0 2.8 2.8l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><path d="M16.5 13v7M13 16.5h7"/>',
  };
  const PAL = {
    red: ['#ff6a78', '#e5334a'], blue: ['#43a5ff', '#1a66ee'], purple: ['#a374ff', '#6b3fe6'], green: ['#3fd89f', '#14a06f'],
    amber: ['#ffc340', '#f29a08'], indigo: ['#6482ff', '#3a4ee0'], orange: ['#ff8f45', '#e95400'], pink: ['#ff72b4', '#e13a86'], teal: ['#33d6de', '#0a9fb4'],
  };
  const TOOL_COLOR = {
    'compress-image': 'green', 'resize-image': 'blue', 'crop-image': 'amber', 'convert-image': 'blue', 'rotate-flip': 'indigo',
    'social-media-image-resizer': 'purple', 'thumbnail-generator': 'red', 'exif-remover': 'green', 'add-watermark-to-image': 'teal', 'pixelate-image': 'purple', 'meme-generator': 'amber',
    'photo-collage-maker': 'indigo', 'screenshot-beautifier': 'pink', 'favicon-generator': 'amber', 'image-to-svg': 'teal', 'remove-background': 'pink',
    'replace-background': 'orange', 'upscale-image': 'indigo', 'face-blur': 'purple', 'anime-style': 'pink', 'image-to-pdf': 'purple', 'pdf-to-image': 'blue',
    'pdf-merge': 'red', 'pdf-split': 'orange', 'compress-pdf': 'green', 'word-to-pdf': 'blue', 'pdf-to-word': 'indigo', 'video-converter': 'red',
    'video-to-gif': 'purple', 'gif-to-video': 'blue', 'video-trimmer': 'orange', 'compress-video': 'amber', 'image-color-palette-extractor': 'pink', 'qr-code-generator': 'indigo',
    base64: 'teal', 'image-cdn': 'blue', lock: 'green', bolt: 'amber', toolbox: 'purple', grid: 'blue',
  };
  Object.assign(TOOL_COLOR, {
    'resize-image-to-kb': 'green', 'passport-size-photo-maker': 'blue', 'image-to-text': 'purple', 'organize-pdf': 'orange', 'esign-pdf': 'indigo',
    'add-page-numbers-to-pdf': 'amber', 'protect-pdf': 'red', 'unlock-pdf': 'green', 'audio-cutter': 'pink', 'video-merger': 'blue', 'change-video-speed': 'teal',
    'json-formatter': 'indigo', 'word-counter': 'blue', 'text-case-converter': 'amber', 'password-generator': 'red', 'hash-uuid-generator': 'purple', 'url-encoder': 'teal',
  });
  // NEW-TOOL-ICONS-START
  Object.assign(GLYPH, {
    'pdf-editor': '<path d="M7 3h7l5 5v4"/><path d="M5 21V5a2 2 0 0 1 2-2"/><path d="M5 21h6"/><path d="M13.5 20.5l.6-2.9 6.2-6.2a1.6 1.6 0 0 1 2.3 2.3l-6.2 6.2z"/>',
    'font-library': '<path d="M3.5 18L8 6.5 12.5 18M5.2 14h6.4"/><circle cx="17" cy="14.5" r="3"/><path d="M20 11.5V18"/>',
    "instagram-image-carousel-splitter": "<rect x=\"3\" y=\"6\" width=\"5.5\" height=\"12\" rx=\"1.6\"/><rect x=\"9.25\" y=\"6\" width=\"5.5\" height=\"12\" rx=\"1.6\"/><rect x=\"15.5\" y=\"6\" width=\"5.5\" height=\"12\" rx=\"1.6\"/>",
    "linkedin-carousel-maker": "<rect x=\"4\" y=\"3.5\" width=\"16\" height=\"17\" rx=\"2.6\"/><path d=\"M8 8.5h8M8 12h8M8 15.5h5\"/>",
    "color-palette-generator": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"8.5\" cy=\"10\" r=\"1.3\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"7.5\" r=\"1.3\" fill=\"currentColor\"/><circle cx=\"15.5\" cy=\"10\" r=\"1.3\" fill=\"currentColor\"/><path d=\"M12 21c-1.7 0-2.2-1.8-1.2-3 .8-1 .3-2.2-1-2.2H8\"/>",
    "ai-headshot-generator": "<circle cx=\"12\" cy=\"8.5\" r=\"4\"/><path d=\"M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6\"/><path d=\"M17.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z\"/>",
    "video-to-text": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7\"/>",
    "text-to-audio": "<path d=\"M4 9.5v5h3.2L12 18.5v-13L7.2 9.5z\"/><path d=\"M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11\"/>",
    "temporary-file-upload-direct-link-share": "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1\"/>",
    "website-color-palette-extractor": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z\"/>",
    "add-watermark-to-pdf": "<path d=\"M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M14 3v5h5\"/><path d=\"M12 11c1.5 1.8 2.4 2.9 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.1.9-2.2 2.4-4z\"/>",
    "blur-redact-pdf": "<path d=\"M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M14 3v5h5\"/><rect x=\"8\" y=\"12\" width=\"8\" height=\"3.4\" rx=\"1\" fill=\"currentColor\"/>",
    "video-to-audio": "<path d=\"M9 18V5l11-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"17\" cy=\"16\" r=\"3\"/>",
    "split-video": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.6\"/><path d=\"M12 5v3M12 11v2M12 16v3\"/>",
    "split-audio": "<path d=\"M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2\"/>",
    "merge-audio": "<path d=\"M3 9v6M7 6v12M11 9v6\"/><path d=\"M15 12h6M18 9l3 3-3 3\"/>",
    "add-watermark-to-video": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.6\"/><path d=\"M12 9c1.6 1.9 2.6 3.1 2.6 4.4a2.6 2.6 0 0 1-5.2 0C9.4 12.1 10.4 10.9 12 9z\"/>",
  });
  Object.assign(TOOL_COLOR, { 'pdf-editor': 'red', 'font-library': 'purple', "instagram-image-carousel-splitter": "pink", "linkedin-carousel-maker": "blue", "color-palette-generator": "amber", "ai-headshot-generator": "indigo", "video-to-text": "indigo", "text-to-audio": "orange", "temporary-file-upload-direct-link-share": "teal", "website-color-palette-extractor": "pink", "add-watermark-to-pdf": "teal", "blur-redact-pdf": "red", "video-to-audio": "purple", "split-video": "orange", "split-audio": "pink", "merge-audio": "teal", "add-watermark-to-video": "amber" });
  // NEW-TOOL-ICONS-END
  // HT.toolIcon('compress-image') -> <span class="ticon"> gradient tile with the white glyph. size: 'xs' | undefined (fills its box)
  HT.toolIcon = (key, size) => {
    const [c1, c2] = PAL[TOOL_COLOR[key] || 'blue'], span = document.createElement('span');
    span.className = 'ticon' + (size ? ' ' + size : '');
    span.style.setProperty('--c1', c1); span.style.setProperty('--c2', c2);
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GLYPH[key] || GLYPH.grid) + '</svg>';
    return span;
  };

  // ---------------------------------------------------------------- page chrome
  let cfgP = null, toolsP = null;
  // site settings: written by build.py for the static site (the old Python server answered /api/config)
  HT.config = () => cfgP || (cfgP = fetch(HT.ver('/assets/site.json')).then(r => { if (!r.ok) throw r; return r.json(); })
    .catch(() => fetch('/api/config').then(r => r.json())).catch(() => ({ siteName: 'Toolz Baba', contactEmail: '' })));
  // ---- archived tools. The admin panel (/admin) archives a tool for everyone: the list lives in KV (/api/tool-status), a tool can also be archived
  // for good in tools.json ("archived": true). The answer is cached in this browser for 10 minutes and refreshed when the browser is idle, so it never
  // slows a page down. Someone signed in to the admin panel in this browser (localStorage tz_admin) still sees everything, to test before going live.
  const STATUS_KEY = 'tz_status', STATUS_TTL = 10 * 60e3;
  HT.isAdmin = () => { try { return !!localStorage.getItem('tz_admin'); } catch { return false; } };
  const statusCache = () => { try { const o = JSON.parse(localStorage.getItem(STATUS_KEY) || 'null'); return o && Array.isArray(o.archived) ? o : null; } catch { return null; } };
  HT.status = {
    // refresh the cached list when it is old (or missing); resolves with the list, or null when it could not be fetched
    refresh(force) {
      const c = statusCache(); if (!force && c && Date.now() - c.t < STATUS_TTL) return Promise.resolve(c.archived);
      return fetch('/api/tool-status', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject())).then(j => {
        const list = (Array.isArray(j.archived) ? j.archived : []).filter(x => typeof x === 'string').slice(0, 500);
        try { localStorage.setItem(STATUS_KEY, JSON.stringify({ t: Date.now(), archived: list })); } catch { }
        return list;
      }).catch(() => null);
    },
  };
  const sortOutArchived = data => {
    const live = new Set((statusCache() || { archived: [] }).archived);
    for (const t of data.tools) if (t.archived) live.add(t.slug);
    const hide = new Set(), gone = [];
    if (!HT.isAdmin()) {
      for (const t of data.tools) if (live.has(t.slug)) { hide.add(t.slug); gone.push(t); }
      for (const v of data.variants || []) if (live.has(v.slug) || hide.has(v.base)) { hide.add(v.slug); gone.push(v); }
      data.tools = data.tools.filter(t => !hide.has(t.slug)); data.variants = (data.variants || []).filter(v => !hide.has(v.slug));
    }
    data.archivedTools = gone; data.archivedSlugs = live; return data;
  };
  // A first-time visitor has no saved list yet: it is fetched together with tools.json (waiting at most 1.2 s for it), so an archived tool is never
  // shown at all. Later visits use the saved list straight away and refresh it in the background when it is older than 10 minutes.
  HT.loadTools = () => toolsP || (toolsP = (async () => {
    const saved = statusCache(), tp = fetch(HT.ver('/assets/tools.json')).then(r => r.json());
    if (!saved) await Promise.all([tp, Promise.race([HT.status.refresh(true), new Promise(r => setTimeout(r, 1200))])]);
    else if (Date.now() - saved.t >= STATUS_TTL) (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => HT.status.refresh(true));
    return sortOutArchived(await tp);
  })());
  const catOf = (data, id) => data.categories.find(c => c.id === id);

  // light / dark / auto
  const THEMES = ['', 'light', 'dark'];
  const themeNow = () => { try { return localStorage.getItem('tz_theme') || ''; } catch { return ''; } };
  const applyTheme = t => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  // ---------------------------------------------------------------- bookmark this site
  // A web page cannot add a bookmark by itself (no browser allows it), so this shows the right keys or taps for the device, and offers "Install app" where the browser supports it.
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  const keysFor = () => {
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), android = /Android/.test(ua), mac = /Mac/.test(navigator.platform) && !ios;
    if (ios) return { key: null, steps: 'Tap the Share button (the square with an arrow), then choose "Add Bookmark" or "Add to Home Screen".' };
    if (android) return { key: null, steps: 'Tap the ⋮ menu in your browser, then the star ☆ ("Add to bookmarks"). You can also pick "Install app" or "Add to Home screen".' };
    return { key: mac ? ['⌘', 'D'] : ['Ctrl', 'D'], steps: 'Press these keys on your keyboard while you are on this page:' };
  };
  HT.bookmark = (anchor, { nudge = false } = {}) => {
    document.querySelectorAll('.bmpanel').forEach(x => x.remove());
    const k = keysFor(), close = () => { panel.remove(); document.removeEventListener('click', away, true); document.removeEventListener('keydown', esc); };
    const away = e => { if (!panel.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }, esc = e => { if (e.key === 'Escape') close(); };
    const panel = el('div', { class: 'bmpanel' + (nudge ? ' nudge' : ''), role: 'dialog', 'aria-label': 'Bookmark this site' },
      el('div', { class: 'bmhead' }, HT.svg(ICON.star), el('b', { text: nudge ? 'Bookmark this website, so you do not have to search for it again' : 'Bookmark Toolz Baba' })),
      el('p', { text: k.steps }),
      k.key ? el('div', { class: 'bmkeys' }, el('kbd', { text: k.key[0] }), '+', el('kbd', { text: k.key[1] })) : null,
      el('div', { class: 'bmact' },
        installEvt ? el('button', { class: 'btn sm', type: 'button', text: 'Install app', onclick: async () => { try { installEvt.prompt(); await installEvt.userChoice; } catch { } installEvt = null; close(); } }) : null,
        el('button', { class: 'btn sec sm', type: 'button', text: 'Copy link', onclick: () => HT.copy(location.origin + '/', 'Link copied') }),
        el('button', { class: 'btn ghost sm', type: 'button', text: nudge ? 'Not now' : 'Done', onclick: close })));
    document.body.append(panel);
    if (!nudge && anchor) { const r = anchor.getBoundingClientRect(); panel.style.top = Math.round(r.bottom + 8) + 'px'; panel.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px'; }
    setTimeout(() => { document.addEventListener('click', away, true); document.addEventListener('keydown', esc); }, 0);
    return panel;
  };
  // after the first finished download, one gentle reminder (never again once it was shown)
  const bookmarkNudge = () => {
    let seen = false; try { seen = !!localStorage.getItem('tz_bm_nudge'); localStorage.setItem('tz_bm_nudge', String(Date.now())); } catch { seen = true; }
    if (seen || document.querySelector('.bmpanel')) return;
    setTimeout(() => HT.bookmark(null, { nudge: true }), 1400);
  };
  const bookmarkButton = () => { const b = el('button', { class: 'iconbtn bmbtn', type: 'button', 'aria-label': 'Bookmark this site', title: 'Bookmark this site' }, HT.svg(ICON.star)); b.onclick = () => HT.bookmark(b); return b; };

  applyTheme(themeNow());
  const themeButton = () => {
    const b = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Change theme' });
    const paint = () => { const t = themeNow(); b.textContent = ''; b.append(HT.svg(t === 'light' ? ICON.sun : t === 'dark' ? ICON.moon : ICON.auto)); b.title = 'Theme: ' + (t || 'auto') + ' (click to change)'; };
    b.onclick = () => { const next = THEMES[(THEMES.indexOf(themeNow()) + 1) % 3]; try { localStorage.setItem('tz_theme', next); } catch { } applyTheme(next); paint(); HT.toast('Theme: ' + (next || 'automatic')); };
    paint(); return b;
  };

  // tools.json gives a tool an emoji in `icon` (not an icon name): only a plain name (a tab page uses the name of its tool) picks another icon
  const iconKey = t => (t.icon && /^[a-z0-9-]+$/i.test(t.icon) ? t.icon : t.slug);

  // quick tool search in the header ("/" or Ctrl+K)
  const headerSearch = () => {
    const input = el('input', { type: 'search', placeholder: 'Search tools...', 'aria-label': 'Search tools', autocomplete: 'off' });
    const res = el('div', { class: 'hres hidden' }), box = el('div', { class: 'hsearch' }, HT.svg(ICON.search), input, el('kbd', { text: '/' }), res);
    let items = [], sel = -1, data = null;
    const show = () => {
      const q = input.value.trim().toLowerCase(); res.textContent = ''; sel = -1;
      if (!q || !data) return res.classList.add('hidden');
      // the tools, and the tab pages of tool families (Video to Text, Merge Audio ...): size pages and the compress format pages stay out
      const tabs = (data.variants || []).filter(v => v.group !== 'size' && !/^compress-/.test(v.slug)).map(v => { const b = data.tools.find(t => t.slug === v.base); return { ...v, cat: b.cat, kind: v.kind || b.kind, href: '/' + v.slug, icon: v.base }; });
      items = [...data.tools, ...tabs].filter(t => q.split(/\s+/).every(w => (t.name + ' ' + t.desc + ' ' + t.slug.replace(/-/g, ' ')).toLowerCase().includes(w))).slice(0, 8);
      if (!items.length) { res.append(el('div', { class: 'help', style: { padding: '10px 12px' }, text: 'No matching tools' })); return res.classList.remove('hidden'); }
      items.forEach(t => res.append(el('a', { class: 'cat-' + t.cat, href: t.href || '/' + t.slug }, el('i', {}, HT.toolIcon(iconKey(t))), t.name, el('small', { text: catOf(data, t.cat).name }))));
      res.classList.remove('hidden');
    };
    const mark = () => [...res.children].forEach((a, i) => a.classList.toggle('sel', i === sel));
    input.addEventListener('focus', () => HT.loadTools().then(d => { data = d; show(); }));
    input.addEventListener('input', show);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { const t = items[Math.max(0, sel)]; if (t) location.href = t.href || '/' + t.slug; }
      else if (e.key === 'Escape') { input.value = ''; show(); input.blur(); }
    });
    document.addEventListener('click', e => { if (!box.contains(e.target)) res.classList.add('hidden'); });
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) || (document.activeElement || {}).isContentEditable;
      if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); const big = document.getElementById('q'); (big && big.offsetParent ? big : input).focus(); }
    });
    return box;
  };

  HT.header = active => {
    const h = document.getElementById('top'); if (!h) return;
    h.className = 'top'; h.textContent = '';
    const nav = el('nav', { 'aria-label': 'Main' }, el('a', { href: '/', class: active === 'tools' ? 'on' : '', text: 'All tools' }));
    const name = el('span', { class: 'wm' });
    const setName = n => { name.textContent = ''; const [first, ...rest] = String(n).split(/\s+/); name.append(first, rest.length ? el('em', { text: rest.join(' ') }) : ''); };
    setName(h.dataset.site || 'Toolz Baba');
    h.append(el('div', { class: 'top-in' }, el('a', { class: 'brand', href: '/', 'aria-label': 'Home' }, el('img', { src: '/assets/brand/mark-64.png', alt: '', width: 36, height: 36 }), name), nav, headerSearch(), bookmarkButton(), themeButton()));
    HT.config().then(c => setName(c.siteName));
    if (!document.querySelector('.skip')) { const m = document.querySelector('main, #tool, .page'); if (m) { m.id = m.id || 'content'; document.body.prepend(el('a', { class: 'skip', href: '#' + m.id, text: 'Skip to content' })); } }
  };

  HT.footer = () => {
    if (document.querySelector('footer.foot')) return;
    const col = (title, links) => el('div', {}, el('h4', { text: title }), el('ul', {}, links.map(([t, href]) => el('li', {}, el('a', { href, text: t })))));
    const popular = el('div', {}, el('h4', { text: 'Popular' }), el('ul', {}));
    const f = el('footer', { class: 'foot' }, el('div', { class: 'foot-in' },
      el('div', { class: 'foot-brand' }, el('a', { href: '/', 'aria-label': 'Toolz Baba home' }, el('img', { class: 'foot-logo logo-light', src: '/assets/brand/logo-315.webp', alt: 'Toolz Baba', width: 210, height: 140, loading: 'lazy', decoding: 'async' }), el('img', { class: 'foot-logo logo-dark', src: '/assets/brand/logo-dark-315.webp', alt: 'Toolz Baba', width: 210, height: 140, loading: 'lazy', decoding: 'async' })), el('p', { text: 'Free everyday file tools that run right in your browser, so your files stay on your device.' })),
      col('Tools', [['Image tools', '/#image'], ['AI tools', '/#ai'], ['PDF & documents', '/#pdf'], ['Video & audio', '/#video'], ['Text & developer', '/#dev'], ['Utilities', '/#util']]),
      popular,
      col('Company', [['Privacy Policy', '/privacy'], ['Terms of Use', '/terms'], ['Contact', '/contact'], ['Report content', '/takedown']]),
      el('div', { class: 'foot-bottom' }, el('span', { text: '\u00a9 ' + new Date().getFullYear() + ' Toolz Baba. All rights reserved.' }), el('span', { text: 'Files are never sold or shared.' }))));
    const bm = el('a', { href: '#bookmark', text: 'Bookmark this site', onclick: e => { e.preventDefault(); HT.bookmark(bm); } }); f.querySelector('.foot-in > div:nth-of-type(4) ul').append(el('li', {}, bm));
    document.body.append(f);
    HT.config().then(c => { f.querySelector('.foot-bottom span').textContent = '\u00a9 ' + new Date().getFullYear() + ' ' + c.siteName + '. All rights reserved.'; });
    HT.loadTools().then(d => { const ul = popular.querySelector('ul'); d.tools.filter(t => t.popular).sort((a, b) => a.popular - b.popular).slice(0, 6).forEach(t => ul.append(el('li', {}, el('a', { href: '/' + t.slug, text: t.name })))); });
  };

  // tools.json gives a tool an emoji in `icon` (not an icon name): only a plain name (a tab page uses the name of its tool) picks another icon
  const cardFor = t => el('a', { class: 'tcard cat-' + t.cat, href: t.href || '/' + t.slug },
    el('div', { class: 'ic' }, HT.toolIcon(iconKey(t))),
    el('div', {}, el('b', { text: t.name }), el('span', { class: 'd', text: t.desc }),
      el('div', {}, t.kind === 'client' ? el('span', { class: 'tag local', text: 'In your browser' }) : null, t.cat === 'ai' ? el('span', { class: 'tag ai', text: 'AI' }) : null)),
    el('span', { class: 'go', text: '\u2192' }));
  HT.cardFor = cardFor;

  // what a visitor sees at the address of an archived tool
  HT.unavailable = (work, data, t) => {
    document.title = (t.name || 'Tool') + ' is not available – Toolz Baba';
    let r = document.querySelector('meta[name="robots"]'); if (!r) { r = el('meta', { name: 'robots' }); document.head.append(r); } r.setAttribute('content', 'noindex');
    const same = data.tools.filter(x => x.cat === t.cat && !x.href).slice(0, 4);
    work.append(el('div', { class: 'card', style: { textAlign: 'center', padding: '34px 22px' } },
      el('h1', { text: (t.name || 'This tool') + ' is taking a break', style: { fontSize: '1.5rem' } }),
      el('p', { class: 'help', style: { margin: '10px 0 18px' }, text: 'We switched it off for a while. Please try again later, or use one of the other tools.' }),
      el('div', { class: 'actions', style: { justifyContent: 'center' } }, el('a', { class: 'btn', href: '/', text: 'See all tools' }), ...same.map(x => el('a', { class: 'btn sec', href: '/' + x.slug, text: x.name })))));
  };

  HT.mount = async () => {
    HT.header('tool');
    const slug = location.pathname.split('/').filter(Boolean).pop();
    const data = await HT.loadTools();
    let meta = data.tools.find(t => t.slug === slug), variant = null;
    if (!meta) {  // a format page such as /compress-png: the same tool, with its own address, title and text
      variant = (data.variants || []).find(v => v.slug === slug);
      const base = variant && data.tools.find(t => t.slug === variant.base);
      if (base) meta = { ...base, ...variant };
    }
    const iconKey = variant ? variant.base : slug, baseSlug = variant ? variant.base : slug;
    const page = document.getElementById('page'), work = document.getElementById('tool');
    if (!meta) {
      const gone = (data.archivedTools || []).find(t => t.slug === slug);
      if (gone) { document.querySelector('#crumb') && (document.getElementById('crumb').textContent = ''); document.getElementById('thead').textContent = ''; HT.unavailable(work, data, gone); }
      else work.append(el('h1', { text: 'Tool not found' }), el('p', {}, el('a', { href: '/', text: '← Back to all tools' })));
      return;
    }
    if (HT.isAdmin() && data.archivedSlugs && (data.archivedSlugs.has(slug) || data.archivedSlugs.has(baseSlug))) work.before(el('div', { class: 'help', style: { background: 'var(--warn-bg, #fff4d6)', border: '1px solid #f0d58a', borderRadius: '10px', padding: '8px 12px', marginBottom: '12px' }, text: 'This tool is archived. Visitors do not see it. You can, because you are signed in to the admin panel in this browser.' }));
    const cat = catOf(data, meta.cat), client = meta.kind === 'client';
    page.classList.add('cat-' + meta.cat);
    const pathOf = s => '/' + s; // every tool and tab lives at the site root
    const metaFor = s => {  // a tool, or a format page merged onto its base tool
      const t = data.tools.find(x => x.slug === s); if (t) return t;
      const v = (data.variants || []).find(x => x.slug === s), b = v && data.tools.find(x => x.slug === v.base); return b ? { ...b, ...v } : null;
    };
    const drawCrumb = (m, isVariant) => {
      const c = document.getElementById('crumb'); c.textContent = '';
      c.append(el('a', { href: '/', text: 'All tools' }), ' / ', el('a', { href: '/#' + m.cat, text: cat.name }), ' / ',
        ...(isVariant ? [el('a', { href: pathOf(m.parent || baseSlug), text: (m.parent ? metaFor(m.parent) : data.tools.find(t => t.slug === baseSlug)).name }), ' / ' + m.name] : [m.name]));
    };
    drawCrumb(meta, !!variant);
    document.getElementById('thead').append(el('div', { class: 'ic' }, HT.toolIcon(iconKey)), el('div', {}, el('h1', { text: meta.name }), el('p', { class: 'sub', text: meta.desc }),
      el('div', { class: 'badges' }, client ? el('span', { class: 'badge ok' }, HT.svg(ICON.lock).cloneNode(true), 'Runs in your browser') : el('span', { class: 'badge ok' }, meta.badge || 'Links last 90 days'),
        meta.cat === 'ai' ? el('span', { class: 'badge', text: 'AI powered' }) : null, el('span', { class: 'badge', text: 'Free \u00b7 no sign-up' }))));
    const app = el('div', { id: 'app' });
    const group = (data.variants || []).filter(v => v.base === baseSlug && v.group !== 'size');  // format tabs
    const sizes = (data.variants || []).filter(v => v.group === 'size' && v.base === baseSlug);  // "compress to under X" pages
    const medias = [...new Set(sizes.map(v => v.media))];  // e.g. 'jpg', 'png', 'jpeg': each format has its own row of chips, shown only on its own pages
    const homeOf = m => (m.group === 'size' ? (m.parent || baseSlug) : m.slug);  // the tab that stays lit on a size page
    let slugNow = slug, current = null;  // current = what the tool screen returned, so added files survive a tab change
    const tabs = [], chips = [], navs = {};
    if (group.length) {
      // Format tabs (PNG / JPEG / JPG / GIF): real links, so search engines and "open in new tab" work, but a plain click
      // switches the tool in place without reloading the page; only the address, text and settings change.
      const items = [{ slug: baseSlug, label: data.tools.find(t => t.slug === baseSlug).tabAll || 'All formats' }, ...group.map(v => ({ slug: v.slug, label: v.tab || v.name }))], lit = homeOf(meta);
      work.append(el('nav', { class: 'vtabs', role: 'tablist', 'aria-label': 'Choose a version of this tool' }, items.map(t => {
        const a = el('a', { class: 'vtab' + (t.slug === lit ? ' on' : ''), href: pathOf(t.slug), role: 'tab', 'aria-selected': t.slug === lit ? 'true' : 'false', 'data-slug': t.slug, text: t.label });
        a.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return; e.preventDefault(); switchTo(t.slug, true); });
        tabs.push(a); return a;
      })));
    }
    for (const media of medias) {
      // Size chips (Any size | 10 KB | 20 KB ...): links to the "compress to under X" pages; a click switches in place like the tabs do
      const mine = sizes.filter(v => v.media === media), first = mine[0].parent || baseSlug, row = [{ slug: first, label: 'Any size' }, ...mine.map(v => ({ slug: v.slug, label: v.chip || v.name }))];
      work.append(navs[media] = el('nav', { class: 'vchips' + (meta.media === media ? '' : ' hidden'), 'aria-label': 'Compress to a size' }, el('span', { class: 'vlbl', text: 'Compress to under:' }), ...row.map(t => {
        const a = el('a', { class: 'vchip' + (t.slug === slug ? ' on' : ''), href: pathOf(t.slug), 'data-slug': t.slug, text: t.label });
        a.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return; e.preventDefault(); switchTo(t.slug, true); });
        chips.push(a); return a;
      })));
    }
    work.append(app);

    async function mountTool(s, keepFiles) {
      const m = metaFor(s), files = keepFiles && current && current.list ? current.list.files.slice() : [];
      work.classList.remove('has-file');
      page.classList.add('wide');  // every tool page uses the full width; the "how it works" cards sit below the workbench
      app.textContent = '';
      try {
        await HT.loadScript(`/assets/tools/${m.js}.js`);
        current = (HT.tools[m.ui] || HT.tools[s] || HT.tools[baseSlug])(app, m) || null;
        if (files.length && current && current.list) {
          const ok = files.filter(f => HT.matches(f, current.accept));
          if (ok.length) { work.classList.add('has-file'); current.list.add(ok, true); }
          if (ok.length < files.length) HT.toast((files.length - ok.length) + ' file(s) removed: ' + (files.length - ok.length > 1 ? 'they are' : 'it is') + ' not ' + (m.tab || 'the right type') + '.');
        }
      } catch (e) { app.append(el('div', { class: 'status err', text: 'Could not load this tool: ' + e.message })); console.error(e); }
    }

    async function switchTo(s, push) {
      const m = metaFor(s); if (!m || s === slugNow) return;
      slugNow = s;
      const path = pathOf(s);
      if (push) history.pushState({ slug: s }, '', path);
      tabs.forEach(a => { const on = a.dataset.slug === homeOf(m); a.classList.toggle('on', on); a.setAttribute('aria-selected', on ? 'true' : 'false'); });
      chips.forEach(a => a.classList.toggle('on', a.dataset.slug === s));
      for (const [media, nav] of Object.entries(navs)) nav.classList.toggle('hidden', m.media !== media);
      document.querySelector('.thead h1').textContent = m.name;
      document.querySelector('.thead .sub').textContent = m.desc;
      drawCrumb(m, s !== baseSlug);
      document.title = m.title || (m.name + ' \u2013 Free Online Tool');
      // take the tags and the "About" text from the address's own server-built page, so they are exactly what a search engine sees
      fetch(path).then(r => r.ok ? r.text() : Promise.reject()).then(html => {
        if (slugNow !== s) return;  // the visitor already moved on
        const d = new DOMParser().parseFromString(html, 'text/html');
        document.title = d.title;
        for (const [sel, attr] of [['meta[name=description]', 'content'], ['link[rel=canonical]', 'href'], ['meta[property="og:title"]', 'content'], ['meta[property="og:description"]', 'content'],
          ['meta[property="og:url"]', 'content'], ['meta[name="twitter:title"]', 'content'], ['meta[name="twitter:description"]', 'content']]) {
          const a = d.querySelector(sel), b = document.querySelector(sel); if (a && b) b.setAttribute(attr, a.getAttribute(attr));
        }
        document.querySelectorAll('script[type="application/ld+json"]').forEach(x => x.remove());
        d.querySelectorAll('script[type="application/ld+json"]').forEach(x => { const n = document.createElement('script'); n.type = 'application/ld+json'; n.textContent = x.textContent; document.head.append(n); });
        const seo = d.getElementById('seo'); if (seo) document.getElementById('seo').innerHTML = seo.innerHTML;
      }).catch(() => { });
      await mountTool(s, true);
    }
    if (group.length || sizes.length) addEventListener('popstate', () => { const s = location.pathname.split('/').filter(Boolean).pop(); if (metaFor(s)) switchTo(s, false); });

    await mountTool(slug, false);
    try { performance.mark('tz-ready'); } catch { }
    const how = meta.how ? meta.how : client && meta.cat === 'dev' ? ['<b>Type or paste</b> your text or pick your options', '<b>See</b> the result straight away', '<b>Copy</b> it or download it'] : client ? ['<b>Add your file</b>: it stays on your device', '<b>Adjust</b> the settings and watch the live preview', '<b>Download</b> the finished result']
      : ['<b>Add your images</b> (drag and drop or paste)', '<b>Wait</b> a moment while they upload', '<b>Copy</b> the links. They keep working for 90 days'];
    const side = document.getElementById('side');
    const stepsUl = el('ol', { class: 'steps' }); how.forEach(h => { const li = el('li'), sp = el('span'); sp.innerHTML = h; li.append(sp); stepsUl.append(li); });
    side.append(el('div', { class: 'sidecard' }, el('h3', { text: 'How it works' }), stepsUl),
      el('div', { class: 'sidecard privacy' }, HT.svg(client ? ICON.lock : ICON.shield), el('div', {}, el('b', { text: meta.privacyTitle || (client ? 'Private by design' : 'Shared by link') }),
        meta.privacy || (client ? 'This tool runs entirely in your browser. Nothing is uploaded.' : 'Images are stored on Cloudflare so their links work. Anyone with a link can see them, so upload nothing private.'))));
    const rel = data.tools.filter(t => t.cat === meta.cat && t.slug !== baseSlug && !t.href).slice(0, 6);
    if (rel.length) side.append(el('div', { class: 'sidecard' }, el('h3', { text: 'More ' + cat.name + ' tools' }), el('ul', { class: 'sidelist' }, rel.map(t => el('li', {}, el('a', { class: 'cat-' + t.cat, href: '/' + t.slug }, el('i', {}, HT.toolIcon(t.slug)), t.name))))));

    HT.footer();
    const later = window.requestIdleCallback || (f => setTimeout(f, 1500));
    later(() => HT.status.refresh().then(list => {
      if (!list || HT.isAdmin() || !(list.includes(slug) || list.includes(baseSlug))) return;
      try { if (sessionStorage.getItem('tz_arch_reload') === slug) return; sessionStorage.setItem('tz_arch_reload', slug); } catch { return; }
      location.reload();   // the tool was archived since the page was cached: show the notice instead
    }));
  };
  // ---------------------------------------------------------------- performance beacon ("real user monitoring")
  // 1 page view in 10 sends ONE small message with the speed numbers the browser measured (no personal data, no file names or text), once the
  // visitor leaves the page. /admin shows them per tool. Nothing is sent from the admin's own browser or when "Do Not Track" is on.
  HT.rum = (() => {
    const RATE = 0.1, runs = [];
    const page = (() => { const p = location.pathname.replace(/\/+$/, ''); if (!p) return 'home'; const m = p.match(/^\/(?:tool\/)?([a-z0-9][a-z0-9-]*)$/); return m && !['privacy', 'terms', 'contact', 'takedown', 'admin', '404'].includes(m[1]) ? m[1] : null; })();
    const on = page && Math.random() < RATE && 'PerformanceObserver' in window && navigator.sendBeacon && navigator.doNotTrack !== '1' && !HT.isAdmin();
    const api = { run: (slug, ms, ok) => { if (on) runs.push({ s: slug, ms: Math.round(ms), ok: ok ? 1 : 0 }); } };
    if (!on) return api;
    const m = { cls: 0, err: 0, inp: 0, lcp: null }; let sent = false;
    const watch = (type, fn, extra) => { try { new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { } };
    watch('largest-contentful-paint', e => { m.lcp = e.startTime; });
    watch('layout-shift', e => { if (!e.hadRecentInput) m.cls += e.value; });
    watch('event', e => { if (e.interactionId) m.inp = Math.max(m.inp, e.duration); }, { durationThreshold: 40 });
    addEventListener('error', () => m.err++); addEventListener('unhandledrejection', () => m.err++);
    const send = () => {
      const nav = performance.getEntriesByType('navigation')[0] || {}, fcp = performance.getEntriesByName('first-contentful-paint')[0], ready = performance.getEntriesByName('tz-ready')[0];
      const mobile = /Mobi|Android|iPhone/.test(navigator.userAgent) || innerWidth < 700 ? 1 : 0, post = o => { try { navigator.sendBeacon('/api/rum', new Blob([JSON.stringify(o)], { type: 'text/plain' })); } catch { } };
      const mine = runs.filter(r => r.s === page).map(r => ({ ms: r.ms, ok: r.ok }));
      if (!sent) {
        sent = true; const r1 = n => (n == null ? undefined : Math.round(n));
        post({ s: page, m: mobile, t: { ttfb: r1(nav.responseStart), fcp: r1(fcp && fcp.startTime), lcp: r1(m.lcp), load: r1(nav.loadEventEnd || undefined), inp: r1(m.inp || undefined), ready: r1(ready && ready.startTime), cls: Math.round(m.cls * 1000) / 1000, err: m.err }, runs: mine });
      } else if (mine.length) post({ s: page, v: 0, t: {}, runs: mine });
      for (const o of runs.filter(r => r.s !== page)) post({ s: o.s, v: 0, t: {}, runs: [{ ms: o.ms, ok: o.ok }] });
      runs.length = 0;
    };
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); }); addEventListener('pagehide', send);
    return api;
  })();
})();
