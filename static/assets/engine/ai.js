// AI engine (runs in the browser with ONNX Runtime): background removal and replacement, upscaler, face blur,
// anime style and passport photos. Models are downloaded once from this site and then come from the browser cache.
(() => {
  const ORT = '/assets/vendor/onnxruntime-1.30.0/', MODELS = '/assets/models/';
  // files over 25 MiB are stored in parts (Cloudflare Pages' limit) and joined after download
  const MODEL = {
    u2netp: { files: ['u2netp.onnx'], mb: 4.6 },
    modnet: { files: ['modnet.onnx'], mb: 26 },
    isnet: { files: ['isnet-general-use-q8.onnx.part0', 'isnet-general-use-q8.onnx.part1'], mb: 46 },
    yunet: { files: ['yunet-2023mar.onnx'], mb: 0.2 },
    realesr: { files: ['realesr-general-x4v3.onnx'], mb: 4.9 },
    hayao: { files: ['animeganv3-hayao-36.onnx'], mb: 4.2 },
    shinkai: { files: ['animeganv3-shinkai-37.onnx'], mb: 4.2 },
  };
  const tick = HT.tick;
  let ortP = null;
  const sessions = {};
  const runtime = () => ortP || (ortP = import(ORT + 'ort.wasm.min.mjs').then(ort => {
    ort.env.wasm.wasmPaths = ORT;
    ort.env.logLevel = 'error'; // the models trigger harmless 'unused initializer' warnings
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return ort;
  }));
  async function session(ctx, key) {
    if (sessions[key]) return sessions[key];
    const ort = await runtime(), m = MODEL[key], chunks = [];
    let got = 0;
    for (const file of m.files) {
      const r = await fetch(MODELS + file);
      if (!r.ok) throw new Error('Could not download the AI model. Check your connection and try again.');
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        ctx.status(`Downloading the AI model: ${Math.round(got / 1048576)} of ${Math.round(m.mb)} MB (only the first time)...`);
      }
    }
    const bytes = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    ctx.status('Starting the AI model...'); await tick();
    sessions[key] = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    ctx.status('');
    return sessions[key];
  }
  async function infer(key, ctx, feeds) {
    const s = await session(ctx, key), ort = await runtime(), inputs = {};
    for (const [i, [data, dims]] of feeds.entries()) inputs[s.inputNames[i]] = new ort.Tensor('float32', data, dims);
    return s.run(inputs);
  }

  // ---------------------------------------------------------------- canvas helpers
  const load = async f => { await HT.loadScript('/assets/engine/image.js'); return HT.img.load(f); };
  const limit = (c, max) => { const s = Math.min(1, max / Math.max(c.width, c.height)); return s < 1 ? HT.resample(c, c.width * s, c.height * s) : c; };
  const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const scaled = (c, w, h) => { const o = HT.canvas(w, h), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, h); return o; };
  const outName = (f, ext, suffix) => HT.stem(f.name) + suffix + '.' + ext;
  const blob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not save the image (it may be too large for this device).')), type, q));
  // NCHW float tensor from a canvas, (value / maxValue - mean) / std per channel
  function chw(c, mean, std, max = 255) {
    const { data } = pixels(c), n = c.width * c.height, t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) t[k * n + i] = (data[i * 4 + k] / max - mean[k]) / std[k];
    return t;
  }
  // single-channel 0..1 map -> grey canvas of that size
  function maskCanvas(values, w, h) {
    const c = HT.canvas(w, h), img = c.getContext('2d').createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, values[i] * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- background removal (like rembg)
  const CUT = {
    // [model, input size, mean, std]; ISNet and U2-Net as in rembg, MODNet as in its reference code
    general: { key: 'isnet', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], norm: true },
    fast: { key: 'u2netp', size: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], norm: true },
    person: { key: 'modnet', mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
  };
  async function cutout(ctx, c, model) {
    const cfg = CUT[model] || CUT.general;
    let w, h;
    if (cfg.size) w = h = cfg.size;
    else { // MODNet reference sizing: shorter side 512 unless the photo already straddles 512, sides multiples of 32
      w = c.width; h = c.height;
      if (Math.max(w, h) < 512 || Math.min(w, h) > 512) { if (w >= h) { w = Math.round(w / h * 512); h = 512; } else { h = Math.round(h / w * 512); w = 512; } }
      w = Math.max(32, w - w % 32); h = Math.max(32, h - h % 32);
    }
    const small = scaled(c, w, h);
    let max = 255;
    if (cfg.norm) { const d = pixels(small).data; max = 1; for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]); }
    const out = await infer(cfg.key, ctx, [[chw(small, cfg.mean, cfg.std, max), [1, 3, h, w]]]);
    const pred = out[Object.keys(out)[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const norm = cfg.norm ? Float32Array.from(pred, v => (v - lo) / (hi - lo || 1)) : pred;
    // scale the mask up to the photo and use it as the alpha channel
    const mask = scaled(maskCanvas(norm, w, h), c.width, c.height), md = pixels(mask).data;
    const res = HT.canvas(c.width, c.height), img = pixels(c);
    for (let i = 0; i < md.length; i += 4) img.data[i + 3] = md[i];
    res.getContext('2d').putImageData(img, 0, 0);
    return res;
  }

  HT.engine('remove-background', async ctx => {
    const fmt = ctx.opts.format === 'webp' ? 'webp' : 'png', outs = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Removing background ${i + 1} of ${ctx.files.length}...` : 'Removing background...');
      await tick();
      const res = await cutout(ctx, limit(await load(f), 3000), ctx.opts.model);
      outs.push({ name: outName(f, fmt, '_nobg'), blob: await blob(res, 'image/' + fmt, fmt === 'webp' ? 1 : undefined) });
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Background removed from ${outs.length} image(s)` };
    return outs;
  });

  HT.engine('replace-background', async ctx => {
    const o = ctx.opts, mode = o.mode || 'color', f = ctx.files[0];
    const subject = limit(await load(f), 3000), { width: w, height: h } = subject;
    ctx.status('Cutting out the subject...');
    const fg = await cutout(ctx, subject, o.model);
    ctx.progress(0.7);
    const out = HT.canvas(w, h), x = out.getContext('2d');
    if (mode === 'color') { x.fillStyle = o.color || '#ffffff'; x.fillRect(0, 0, w, h); }
    else if (mode === 'gradient') { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, o.color || '#4f46e5'); g.addColorStop(1, o.color2 || '#ec4899'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    else if (mode === 'blur') { // blur by shrinking and enlarging (works in every browser)
      const r = Math.max(2, parseInt(o.blur, 10) || 20), k = Math.max(1, r / 2);
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.drawImage(scaled(scaled(subject, Math.max(1, w / k), Math.max(1, h / k)), w, h), 0, 0);
    } else if (mode === 'image') {
      if (ctx.files.length < 2) throw new Error('Add a background image as the second file.');
      HT.cover(x, await load(ctx.files[1]), 0, 0, w, h);
    } else if (mode !== 'transparent') throw new Error('Unknown background type.');
    x.drawImage(fg, 0, 0);
    ctx.info = { summary: 'Background replaced' };
    return [{ name: outName(f, 'png', '_newbg'), blob: await blob(out) }];
  });

  // ---------------------------------------------------------------- upscaler (Real-ESRGAN x4, 128x128 tiles)
  const TILE = 112, PAD = 8; // the model takes exactly 128x128: 112 new pixels plus 8 of context on each side
  async function tileUpscale(ctx, c, onTile) {
    const { width: w, height: h } = c, pw = Math.ceil(w / TILE) * TILE, ph = Math.ceil(h / TILE) * TILE;
    // padded copy with mirrored edges so tiles at the border have context
    const pad = HT.canvas(pw + 2 * PAD, ph + 2 * PAD), px = pad.getContext('2d');
    px.drawImage(c, PAD, PAD);
    px.save(); px.scale(-1, 1); px.drawImage(c, 0, 0, PAD, h, -PAD, PAD, PAD, h); px.restore(); // left edge
    px.drawImage(c, w - 1, 0, 1, h, PAD + w, PAD, pw - w + PAD, h); // right: stretch the last column
    px.drawImage(pad, 0, PAD, pad.width, 1, 0, 0, pad.width, PAD); // top
    px.drawImage(pad, 0, PAD + h - 1, pad.width, 1, 0, PAD + h, pad.width, ph - h + PAD); // bottom
    const src = px.getImageData(0, 0, pad.width, pad.height).data, sw = pad.width;
    const out = HT.canvas(w * 4, h * 4), ox = out.getContext('2d');
    const tiles = (pw / TILE) * (ph / TILE), S = TILE + 2 * PAD, n = S * S;
    let done = 0;
    for (let ty = 0; ty < ph; ty += TILE) for (let tx = 0; tx < pw; tx += TILE) {
      const t = new Float32Array(3 * n);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const s = ((ty + y) * sw + tx + x) * 4, d = y * S + x;
        t[d] = src[s] / 255; t[n + d] = src[s + 1] / 255; t[2 * n + d] = src[s + 2] / 255;
      }
      const res = await infer('realesr', ctx, [[t, [1, 3, S, S]]]), r = res[Object.keys(res)[0]].data, R = S * 4, rn = R * R;
      const core = new ImageData(TILE * 4, TILE * 4), cd = core.data;
      for (let y = 0; y < TILE * 4; y++) for (let x = 0; x < TILE * 4; x++) {
        const s = (y + PAD * 4) * R + x + PAD * 4, d = (y * TILE * 4 + x) * 4;
        cd[d] = r[s] * 255 + 0.5; cd[d + 1] = r[rn + s] * 255 + 0.5; cd[d + 2] = r[2 * rn + s] * 255 + 0.5; cd[d + 3] = 255;
      }
      ox.putImageData(core, tx * 4, ty * 4);
      onTile(++done / tiles);
      await tick();
    }
    return out;
  }
  // unsharp mask (amount 0.6, threshold 2) against a 3x3 box blur, like the server's Pillow UnsharpMask
  function unsharp(c) {
    const img = pixels(c), d = img.data, src = new Uint8ClampedArray(d), W = c.width, H = c.height;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) for (let k = 0; k < 3; k++) {
      const i = (y * W + x) * 4 + k;
      const blur = (src[i - 4 * W - 4] + src[i - 4 * W] + src[i - 4 * W + 4] + src[i - 4] + src[i] + src[i + 4] + src[i + 4 * W - 4] + src[i + 4 * W] + src[i + 4 * W + 4]) / 9;
      const diff = src[i] - blur;
      if (Math.abs(diff) > 2) d[i] = src[i] + 0.6 * diff;
    }
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }
  const hasAlpha = c => { const d = pixels(c).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true; return false; };
  HT.engine('upscale-image', async ctx => {
    const scale = parseInt(ctx.opts.scale, 10) || 2, engine = ctx.opts.engine || 'ai';
    if (![2, 3, 4].includes(scale)) throw new Error('Choose 2x, 3x or 4x.');
    const outs = [];
    for (const [i, f] of ctx.files.entries()) {
      const c = await load(f), { width: w, height: h } = c, alpha = hasAlpha(c);
      let res;
      if (engine === 'ai') {
        if (w * h > 1500000) throw new Error('For AI upscaling in the browser please use an image up to about 1.5 megapixels (e.g. 1400x1000). Use "Fast" mode for bigger images.');
        ctx.status(ctx.files.length > 1 ? `Upscaling ${i + 1} of ${ctx.files.length}...` : 'Upscaling...');
        const flat = HT.canvas(w, h), fx = flat.getContext('2d'); fx.fillStyle = '#fff'; fx.fillRect(0, 0, w, h); fx.drawImage(c, 0, 0);
        res = await tileUpscale(ctx, flat, p => ctx.progress((i + p) / ctx.files.length));
        if (scale !== 4) res = HT.resample(res, w * scale, h * scale); // the model is 4x: scale down to the size asked for
      } else {
        if (w * h * scale * scale > 64e6) throw new Error('The result would be over 64 megapixels, too big for a browser. Choose a smaller enlargement.');
        res = unsharp(scaled(c, w * scale, h * scale));
        ctx.progress((i + 1) / ctx.files.length);
      }
      if (alpha) { // put the transparency back, enlarged
        const a = scaled(c, res.width, res.height), ad = pixels(a).data, rd = pixels(res);
        for (let k = 3; k < ad.length; k += 4) rd.data[k] = ad[k];
        res.getContext('2d').putImageData(rd, 0, 0);
      }
      outs.push({ name: outName(f, 'png', `_${scale}x`), blob: await blob(res) });
    }
    ctx.info = { summary: `Upscaled ${scale}x (${engine === 'ai' ? 'AI' : 'fast'} mode)` };
    return outs;
  });

  // ---------------------------------------------------------------- face detection (YuNet, 640x640 input)
  async function detectFaces(ctx, c, score = 0.6) {
    const S = 640, s = Math.min(1, S / Math.max(c.width, c.height)), box = HT.canvas(S, S), bx = box.getContext('2d');
    bx.fillStyle = '#000'; bx.fillRect(0, 0, S, S); bx.drawImage(c, 0, 0, c.width * s, c.height * s);
    const { data } = bx.getImageData(0, 0, S, S), n = S * S, t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { t[i] = data[i * 4 + 2]; t[n + i] = data[i * 4 + 1]; t[2 * n + i] = data[i * 4]; } // BGR, 0..255
    const out = await infer('yunet', ctx, [[t, [1, 3, S, S]]]), faces = [];
    for (const stride of [8, 16, 32]) {
      const cls = out['cls_' + stride].data, obj = out['obj_' + stride].data, bb = out['bbox_' + stride].data, cols = S / stride;
      for (let i = 0; i < cls.length; i++) {
        const conf = Math.sqrt(Math.max(0, Math.min(1, cls[i])) * Math.max(0, Math.min(1, obj[i])));
        if (conf < score) continue;
        const cx = ((i % cols) + bb[i * 4]) * stride, cy = (Math.floor(i / cols) + bb[i * 4 + 1]) * stride;
        const w = Math.exp(bb[i * 4 + 2]) * stride, h = Math.exp(bb[i * 4 + 3]) * stride;
        faces.push({ x: (cx - w / 2) / s, y: (cy - h / 2) / s, w: w / s, h: h / s, conf });
      }
    }
    // non-maximum suppression
    faces.sort((a, b) => b.conf - a.conf);
    const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
    const keep = [];
    for (const f of faces) if (keep.every(k => iou(k, f) < 0.3)) keep.push(f);
    return keep;
  }

  HT.engine('face-blur', async ctx => {
    const o = ctx.opts, style = o.style || 'blur', strength = Math.max(1, Math.min(100, parseInt(o.strength, 10) || 60)), grow = (parseInt(o.padding, 10) || 0) / 100;
    const outs = [], rows = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Finding faces in ${i + 1} of ${ctx.files.length}...` : 'Finding faces...');
      const c = await load(f), faces = await detectFaces(ctx, c, parseFloat(o.sensitivity) || 0.6), x = c.getContext('2d');
      for (const fc of faces) {
        const px = fc.w * grow, py = fc.h * grow;
        const x0 = Math.max(0, Math.round(fc.x - px)), y0 = Math.max(0, Math.round(fc.y - py));
        const x1 = Math.min(c.width, Math.round(fc.x + fc.w + px)), y1 = Math.min(c.height, Math.round(fc.y + fc.h + py)), w = x1 - x0, h = y1 - y0;
        if (w < 2 || h < 2) continue;
        const fx = HT.canvas(w, h), fxx = fx.getContext('2d');
        if (style === 'black') { fxx.fillStyle = '#000'; fxx.fillRect(0, 0, w, h); }
        else {
          // pixelate: few big blocks; blur: shrink a lot and enlarge smoothly
          const across = style === 'pixelate' ? 4 + Math.round((100 - strength) / 100 * 16) : Math.max(2, Math.round(24 - strength / 100 * 20));
          const sw = Math.max(1, across), sh = Math.max(1, Math.round(across * h / w)), tiny = HT.canvas(sw, sh);
          tiny.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, sw, sh);
          fxx.imageSmoothingEnabled = style !== 'pixelate'; fxx.imageSmoothingQuality = 'high';
          fxx.drawImage(tiny, 0, 0, w, h);
        }
        // oval mask with soft edges (hard edge for the black cover)
        const g = fxx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); // drawn in a space squashed by h/w, so it becomes an oval
        g.addColorStop(0, '#000'); g.addColorStop(style === 'black' ? 0.999 : 0.85, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
        fxx.globalCompositeOperation = 'destination-in';
        fxx.save(); fxx.scale(1, h / w); fxx.fillStyle = g; fxx.beginPath(); fxx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); fxx.fill(); fxx.restore();
        x.drawImage(fx, x0, y0);
      }
      const ext = HT.ext(f.name) === 'png' ? 'png' : 'jpg';
      outs.push({ name: outName(f, ext, '_blurred'), blob: await blob(c, ext === 'png' ? 'image/png' : 'image/jpeg', 0.95) });
      rows.push({ name: f.name, removed: [`${faces.length} face(s) found`] });
      ctx.progress((i + 1) / ctx.files.length);
    }
    const total = rows.reduce((a, r) => a + parseInt(r.removed[0], 10), 0);
    ctx.info = { summary: `${total} face(s) blurred` + (total ? '' : ". None found - try raising 'Detection'."), files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- anime style (AnimeGANv3)
  HT.engine('anime-style', async ctx => {
    const style = ctx.opts.style || 'hayao';
    if (style !== 'hayao' && style !== 'shinkai') throw new Error('Unknown style.');
    const outs = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Painting ${i + 1} of ${ctx.files.length}...` : 'Painting...');
      let c = limit(await load(f), 1024);
      const w = Math.max(8, c.width - c.width % 8), h = Math.max(8, c.height - c.height % 8); // sizes divisible by 8
      c = scaled(c, w, h);
      const { data } = pixels(c), t = new Float32Array(w * h * 3);
      for (let k = 0, j = 0; k < data.length; k += 4) { t[j++] = data[k] / 127.5 - 1; t[j++] = data[k + 1] / 127.5 - 1; t[j++] = data[k + 2] / 127.5 - 1; }
      await tick();
      const out = await infer(style, ctx, [[t, [1, h, w, 3]]]), y = out[Object.keys(out)[0]].data, img = new ImageData(w, h);
      for (let k = 0, j = 0; k < img.data.length; k += 4) { img.data[k] = (y[j++] + 1) * 127.5; img.data[k + 1] = (y[j++] + 1) * 127.5; img.data[k + 2] = (y[j++] + 1) * 127.5; img.data[k + 3] = 255; }
      const res = HT.canvas(w, h); res.getContext('2d').putImageData(img, 0, 0);
      outs.push({ name: outName(f, 'jpg', '_' + style), blob: await blob(res, 'image/jpeg', 0.95) });
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Anime style applied (${style[0].toUpperCase() + style.slice(1)})` };
    return outs;
  });

  // ---------------------------------------------------------------- passport / ID photo
  const DPI = 300, MM = DPI / 25.4, px = mm => Math.round(mm * MM);
  const PRESETS = { '35x45': [35, 45], '51x51': [51, 51], '33x48': [33, 48], '25x35': [25, 35] };
  const BACKGROUNDS = { white: '#ffffff', lightgray: '#e8e8e8', blue: '#4682d2', red: '#c8282d' };
  const PAPERS = { '4x6': [152.4, 101.6], '5x7': [177.8, 127.0], a4: [297.0, 210.0] };
  HT.engine('passport-size-photo-maker', async ctx => {
    const o = ctx.opts, size = o.size || '35x45';
    let wmm, hmm;
    if (size === 'custom') { wmm = parseFloat(o.width_mm) || 35; hmm = parseFloat(o.height_mm) || 45; }
    else if (PRESETS[size]) [wmm, hmm] = PRESETS[size]; else throw new Error('Unknown photo size.');
    if (!(wmm >= 15 && wmm <= 100 && hmm >= 15 && hmm <= 130)) throw new Error('Width must be 15-100 mm and height 15-130 mm.');
    const bg = o.background === 'custom' ? (o.custom_color || '#ffffff') : BACKGROUNDS[o.background || 'white'];
    if (!bg) throw new Error('Unknown background colour.');
    const ow = px(wmm), oh = px(hmm), f = ctx.files[0];
    const img = limit(await load(f), 3000);
    ctx.status('Finding the face...'); ctx.progress(0.05);
    const faces = await detectFaces(ctx, img, 0.5);
    if (!faces.length) throw new Error("We couldn't find a face. Use a clear, front-facing photo with the whole head visible.");
    const { x, y, w, h } = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    ctx.status('Removing the background...');
    const person = await cutout(ctx, img, 'person');
    ctx.progress(0.7);
    // top of the hair: first row with solid (alpha > 100) pixels
    const ad = pixels(person).data;
    let top = -1;
    for (let r = 0; r < person.height && top < 0; r++) for (let q = 0; q < person.width; q++) if (ad[(r * person.width + q) * 4 + 3] > 100) { top = r; break; }
    let crown = top >= 0 ? top : Math.max(0, y - 0.35 * h);
    const chin = y + h;
    if (chin - crown < h * 1.1) crown = y - 0.35 * h; // implausible: fall back to a typical crown position
    // how big the head should be: crown to chin as a share of the photo height
    const headRatio = (ow / oh < 0.85 ? 0.72 : 0.58) * ({ smaller: 0.92, larger: 1.08 }[o.head] || 1);
    const cropH = (chin - crown) / headRatio, cropW = cropH * ow / oh;
    const left = x + w / 2 - cropW / 2, topY = crown - 0.08 * cropH, s = oh / cropH;
    const photo = HT.canvas(ow, oh), p = photo.getContext('2d');
    p.fillStyle = bg; p.fillRect(0, 0, ow, oh); p.imageSmoothingQuality = 'high';
    p.drawImage(person, -left * s, -topY * s, person.width * s, person.height * s);
    const label = `${wmm}x${hmm}mm`, outs = [{ name: outName(f, 'jpg', `_passport_${label}`), blob: await blob(photo, 'image/jpeg', 0.95) }];
    const sheet = o.sheet || '4x6';
    let copiesTxt = '';
    if (sheet !== 'none') {
      if (!PAPERS[sheet]) throw new Error('Unknown paper size.');
      const gap = 2, margin = 4;
      let best = null;
      for (const [pw, ph] of [PAPERS[sheet], [...PAPERS[sheet]].reverse()]) { // landscape and portrait: keep the one that fits more
        const cols = Math.floor((pw - 2 * margin + gap) / (wmm + gap)), rows = Math.floor((ph - 2 * margin + gap) / (hmm + gap));
        if (!best || cols * rows > best[0]) best = [cols * rows, cols, rows, pw, ph];
      }
      const [cap, cols, rows, pw, ph] = best;
      if (cap < 1) throw new Error("This photo doesn't fit on that paper. Choose a bigger sheet.");
      const want = parseInt(o.copies, 10) || 0, n = want <= 0 ? cap : Math.min(want, cap);
      const page = HT.canvas(px(pw), px(ph)), g = page.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, page.width, page.height);
      const gw = cols * wmm + (cols - 1) * gap, gh = rows * hmm + (rows - 1) * gap, x0 = (pw - gw) / 2, y0 = (ph - gh) / 2;
      g.strokeStyle = '#bebebe'; g.lineWidth = 1;
      for (let k = 0; k < n; k++) {
        const cx = px(x0 + (k % cols) * (wmm + gap)), cy = px(y0 + Math.floor(k / cols) * (hmm + gap));
        g.drawImage(photo, cx, cy); g.strokeRect(cx - 0.5, cy - 0.5, ow + 1, oh + 1); // cutting guide
      }
      outs.push({ name: outName(f, 'jpg', `_sheet_${sheet}`), blob: await blob(page, 'image/jpeg', 0.95) });
      copiesTxt = ` + a ${sheet.toUpperCase()} print sheet with ${n} copies`;
    }
    ctx.info = { summary: `Passport photo ${label} at ${DPI} DPI${copiesTxt}. Check your country's rules (head size, expression, background).` };
    return outs;
  });
  // ---------------------------------------------------------------- headshot: face found, background replaced, framed head-and-shoulders
  const HEAD_BG = { studio: ['#eef1f5', '#bcc6d4'], warm: ['#f6ecdb', '#d4b98f'], blue: ['#d6e7ff', '#5f8fdb'], dark: ['#4a505e', '#12141a'], white: ['#ffffff', '#eceff3'] };
  HT.engine('ai-headshot-generator', async ctx => {
    const o = ctx.opts, f = ctx.files[0], img = limit(await load(f), 3000);
    ctx.status('Finding the face...'); ctx.progress(0.05);
    const faces = await detectFaces(ctx, img, 0.5);
    if (!faces.length) throw new Error("We couldn't find a face. Use a clear photo of yourself with the whole head visible.");
    const { x, y, w, h } = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    ctx.status('Cutting you out of the background...');
    const person = await cutout(ctx, img, 'person'); ctx.progress(0.7);
    const ad = pixels(person).data; let top = -1;
    for (let r = 0; r < person.height && top < 0; r++) for (let q = 0; q < person.width; q++) if (ad[(r * person.width + q) * 4 + 3] > 100) { top = r; break; }
    let crown = top >= 0 ? top : Math.max(0, y - 0.35 * h); const chin = y + h;
    if (chin - crown < h * 1.1) crown = y - 0.35 * h;
    const aspect = o.shape === 'portrait' ? 4 / 5 : 1, outW = { 1200: 1200, 800: 800, 400: 400 }[+o.size || 1200] || 1200, outH = Math.round(outW / aspect);
    const headRatio = { standard: 0.46, tight: 0.58, wide: 0.36 }[o.framing || 'standard'] || 0.46;
    const cropH = (chin - crown) / headRatio, cropW = cropH * aspect, left = x + w / 2 - cropW / 2;
    let topY = crown - 0.2 * cropH; if (topY + cropH > img.height && img.height - cropH <= crown - 0.04 * cropH) topY = img.height - cropH; // keep the picture inside the photo when the head still fits
    const s = outH / cropH, out = HT.canvas(outW, outH), g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
    // background
    const bgKey = o.background || 'studio';
    if (bgKey === 'blur') {
      const cs = Math.max(outW / img.width, outH / img.height) * 1.0; g.filter = `blur(${Math.round(outW / 40)}px)`; g.drawImage(img, (outW - img.width * cs) / 2 - 20, (outH - img.height * cs) / 2 - 20, img.width * cs + 40, img.height * cs + 40); g.filter = 'none';
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, outW, outH);
    } else if (bgKey === 'custom') { g.fillStyle = /^#[0-9a-f]{6}$/i.test(o.custom_color) ? o.custom_color : '#ffffff'; g.fillRect(0, 0, outW, outH); }
    else {
      const [c1, c2] = HEAD_BG[bgKey] || HEAD_BG.studio, grad = g.createRadialGradient(outW / 2, outH * 0.38, outW * 0.05, outW / 2, outH * 0.45, outW * 0.85);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2); g.fillStyle = grad; g.fillRect(0, 0, outW, outH);
    }
    // you, with a soft shadow so the cut-out edge sits naturally on the new background
    g.save(); g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = outW * 0.025; g.shadowOffsetY = outW * 0.008;
    g.drawImage(person, -left * s, -topY * s, person.width * s, person.height * s); g.restore();
    let final = out;
    if (o.touchup === true || o.touchup === 'true') { final = HT.canvas(outW, outH); const t = final.getContext('2d'); t.filter = 'brightness(1.04) contrast(1.06) saturate(1.05)'; t.drawImage(out, 0, 0); }
    ctx.progress(0.95);
    const blobOut = await blob(final, 'image/jpeg', 0.94);
    ctx.info = { summary: `Headshot ${outW} × ${outH} px. The background was replaced and the photo framed head-and-shoulders: it is your own photo, not a generated face.` };
    return [{ name: outName(f, 'jpg', '_headshot'), blob: blobOut }];
  });
})();
