// Image engine (runs in the browser): compress, convert, metadata remover, image -> SVG.
// Also provides HT.img, the shared image encoders used by the PDF and AI engines.
(() => {
  const V = '/assets/vendor/', CODECS = V + 'img-codecs/';
  const tick = () => new Promise(r => setTimeout(r)); // let the progress bar repaint between files
  const kb = n => n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const outName = (file, ext, suffix = '') => HT.stem(file.name) + suffix + '.' + ext;
  const FMT = { jpg: 'jpg', jpeg: 'jpg', jfif: 'jpg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', bmp: 'bmp', tif: 'tiff', tiff: 'tiff', ico: 'ico', heic: 'heic', heif: 'heic' };
  const MIME_FMT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/heic': 'heic', 'image/heif': 'heic' };
  const srcFormat = f => FMT[HT.ext(f.name)] || MIME_FMT[f.type] || 'jpg';

  // ---------------------------------------------------------------- pixels
  const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const hasAlpha = c => { const d = pixels(c).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true; return false; };
  const flatten = (c, bg = '#ffffff') => { const o = HT.canvas(c.width, c.height), x = o.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); return o; };
  const toBlob = (c, mime, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not encode the image (it may be too large for this device).')), mime, q));

  // ---------------------------------------------------------------- encoders
  async function png(c, colors = 0) {
    if (!colors) return toBlob(c, 'image/png');
    await HT.loadScript(CODECS + 'pako-1.0.11.min.js'); await HT.loadScript(CODECS + 'upng-2.1.0.js');
    const d = pixels(c);
    return new Blob([UPNG.encode([d.data.buffer], c.width, c.height, colors)], { type: 'image/png' });
  }
  async function webp(c, q) {
    const b = await toBlob(c, 'image/webp', q);
    if (b.type !== 'image/webp') throw new Error("This browser can't create WebP files. Please use Chrome, Edge or Firefox, or choose another format.");
    return b;
  }
  async function avif(c, quality) {
    const { default: encode } = await import(V + 'jsquash-avif-2.1.1/encode.js');
    return new Blob([await encode(pixels(c), { quality: Math.round(quality * 0.9), speed: 7 })], { type: 'image/avif' });
  }
  async function gif(c) {
    const { GIFEncoder, quantize, applyPalette } = await import(CODECS + 'gifenc-1.0.3.esm.js');
    const d = pixels(c).data, alpha = hasAlpha(c);
    const palette = quantize(d, 256, alpha ? { format: 'rgba4444', oneBitAlpha: true } : {});
    const index = applyPalette(d, palette, alpha ? 'rgba4444' : 'rgb565');
    const enc = GIFEncoder(), t = alpha ? palette.findIndex(p => p[3] === 0) : -1;
    enc.writeFrame(index, c.width, c.height, t >= 0 ? { palette, transparent: true, transparentIndex: t } : { palette });
    enc.finish();
    return new Blob([enc.bytes()], { type: 'image/gif' });
  }
  function bmp(c) { // 24-bit, bottom-up rows padded to 4 bytes
    const { width: w, height: h } = c, d = pixels(c).data, row = Math.ceil(w * 3 / 4) * 4, size = 54 + row * h;
    const buf = new ArrayBuffer(size), v = new DataView(buf), u = new Uint8Array(buf);
    v.setUint16(0, 0x4d42, true); v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
    v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
    v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4, o = 54 + y * row + x * 3; u[o] = d[s + 2]; u[o + 1] = d[s + 1]; u[o + 2] = d[s]; }
    return new Blob([buf], { type: 'image/bmp' });
  }
  async function tiff(c) {
    await HT.loadScript(CODECS + 'pako-1.0.11.min.js'); await HT.loadScript(CODECS + 'utif-3.1.0.js');
    return new Blob([UTIF.encodeImage(pixels(c).data.buffer, c.width, c.height)], { type: 'image/tiff' });
  }
  async function ico(c) { // ICO container with PNG images: the source centred on a transparent square, at several sizes
    const side = Math.max(c.width, c.height), sq = HT.canvas(side, side);
    sq.getContext('2d').drawImage(c, (side - c.width) / 2, (side - c.height) / 2);
    const sizes = [16, 32, 48, 64, 128, 256], pngs = [];
    for (const s of sizes) pngs.push(new Uint8Array(await (await toBlob(HT.resample(sq, s, s), 'image/png')).arrayBuffer()));
    const head = 6 + 16 * sizes.length, total = head + pngs.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total), v = new DataView(out.buffer);
    v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true);
    let off = head;
    sizes.forEach((s, i) => {
      const e = 6 + 16 * i; out[e] = s % 256; out[e + 1] = s % 256; v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true);
      v.setUint32(e + 8, pngs[i].length, true); v.setUint32(e + 12, off, true); out.set(pngs[i], off); off += pngs[i].length;
    });
    return new Blob([out], { type: 'image/x-icon' });
  }
  // canvas -> Blob in any supported format. quality is 1-100.
  async function encode(c, fmt, { quality = 85, bg = '#ffffff', pngColors = 0 } = {}) {
    switch (fmt) {
      case 'jpg': return toBlob(flatten(c, bg), 'image/jpeg', quality / 100);
      case 'png': return png(c, pngColors);
      case 'webp': return webp(c, quality / 100);
      case 'avif': return avif(c, quality);
      case 'gif': return gif(c);
      case 'bmp': return bmp(flatten(c, bg));
      case 'tiff': return tiff(c);
      case 'ico': return ico(c);
    }
    throw new Error('Unsupported format: ' + fmt);
  }
  const load = async f => HT.toCanvas(await HT.loadBitmap(f));
  HT.img = { encode, load, pixels, hasAlpha, flatten, toBlob, srcFormat, outName, kb, tick };

  // ---------------------------------------------------------------- compress
  HT.engine('compress-image', async ctx => {
    const { quality = 75, format = 'same', max_width: maxW = 0, lossy_png: lossyPng = true } = ctx.opts;
    const outs = [], rows = []; let keptGif = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Compressing ${i + 1} of ${ctx.files.length}...` : 'Compressing...');
      await tick();
      const src = srcFormat(f);
      let fmt = format === 'same' ? src : format === 'jpeg' ? 'jpg' : format, blob = null, name;
      if (src === 'gif' && format === 'same') { blob = f; name = outName(f, 'gif', '_compressed'); keptGif++; } // keep animations intact
      else {
        let c = await load(f);
        if (fmt === 'heic') fmt = 'jpg';
        if (['bmp', 'tiff', 'ico', 'gif'].includes(fmt)) fmt = hasAlpha(c) ? 'png' : 'jpg';
        if (maxW && c.width > maxW) c = HT.resample(c, maxW, Math.round(c.height * maxW / c.width));
        blob = await encode(c, fmt, { quality, pngColors: fmt === 'png' && lossyPng ? 256 : 0 });
        name = outName(f, fmt, '_compressed');
        if (blob.size >= f.size && fmt === src && !maxW) { blob = f; name = outName(f, HT.ext(f.name) || fmt, '_compressed'); } // already optimal: keep the original
      }
      outs.push({ name, blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
      ctx.progress((i + 1) / ctx.files.length);
    }
    const tb = rows.reduce((a, r) => a + r.before, 0), ta = rows.reduce((a, r) => a + r.after, 0);
    ctx.info = { summary: `${kb(tb)} → ${kb(ta)}  (${tb ? Math.max(0, Math.round((1 - ta / tb) * 100)) : 0}% smaller)` + (keptGif ? '. GIFs were kept as they are: choose WebP to shrink them.' : ''), files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- convert
  HT.engine('convert-image', async ctx => {
    const fmt = ctx.opts.format === 'jpeg' ? 'jpg' : ctx.opts.format || 'png', quality = ctx.opts.quality || 90;
    const outs = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Converting ${i + 1} of ${ctx.files.length}...` : 'Converting...');
      await tick();
      outs.push({ name: outName(f, fmt), blob: await encode(await load(f), fmt, { quality, bg: ctx.opts.background || '#ffffff' }) });
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Converted ${outs.length} file(s) to ${fmt.toUpperCase()}` };
    return outs;
  });

  // ---------------------------------------------------------------- metadata remover
  async function readMetadata(f) {
    const found = [];
    try {
      await HT.loadScript(CODECS + 'exifr-7.1.3.full.umd.js');
      const m = await exifr.parse(f, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, mergeOutput: false, translateValues: false, reviveValues: false });
      if (!m) return found;
      const ifd0 = m.ifd0 || {}, exif = m.exif || {};
      if (m.gps && Object.keys(m.gps).length) found.push('GPS location');
      if (ifd0.Make || ifd0.Model) found.push('Camera: ' + [ifd0.Make, ifd0.Model].filter(Boolean).map(s => String(s).trim()).join(' '));
      const taken = exif.DateTimeOriginal || ifd0.ModifyDate;
      if (taken) found.push('Date: ' + taken);
      if (ifd0.Software) found.push('Software: ' + ifd0.Software);
      if (exif.LensModel) found.push('Lens: ' + exif.LensModel);
      const n = Object.keys(ifd0).length + Object.keys(exif).length;
      if (!(m.gps || ifd0.Make || ifd0.Model) && n) found.push(n + ' other EXIF tag(s)');
      if (m.xmp || m.iptc) found.push('XMP/IPTC data');
    } catch { /* unreadable metadata: nothing to report */ }
    return found;
  }
  // JPEG: drop APP1 (EXIF/XMP), APP13 (IPTC), comments and other metadata segments without re-encoding
  function stripJpeg(d) {
    const drop = new Set([0xe1, 0xed, 0xfe, 0xef]); for (let m = 0xe3; m < 0xee; m++) drop.add(m);
    const parts = [d.subarray(0, 2)]; let i = 2;
    while (i + 4 <= d.length && d[i] === 0xff) {
      const marker = d[i + 1];
      if (marker === 0xda) { parts.push(d.subarray(i)); return new Blob(parts, { type: 'image/jpeg' }); } // start of scan: the rest is image data
      const len = (d[i + 2] << 8) | d[i + 3];
      if (!drop.has(marker)) parts.push(d.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    return null;
  }
  // PNG: drop text, time and EXIF chunks, keep the pixels. Text chunks found are added to `found`.
  function stripPng(d, found) {
    if (d[0] !== 0x89 || d[1] !== 0x50) return null;
    const drop = new Set(['tEXt', 'iTXt', 'zTXt', 'tIME', 'eXIf']), parts = [d.subarray(0, 8)]; let i = 8;
    while (i + 12 <= d.length) {
      const len = ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0, type = String.fromCharCode(...d.subarray(i + 4, i + 8));
      if (!drop.has(type)) parts.push(d.subarray(i, i + 12 + len));
      else if (type !== 'eXIf' && type !== 'tIME' && !found.includes('Text metadata')) found.push('Text metadata');
      i += 12 + len;
      if (type === 'IEND') return new Blob(parts, { type: 'image/png' });
    }
    return null;
  }
  // WebP: drop the EXIF and XMP chunks and clear their flags
  function stripWebp(d) {
    const str = (o, n = 4) => String.fromCharCode(...d.subarray(o, o + n));
    if (str(0) !== 'RIFF' || str(8) !== 'WEBP') return null;
    const parts = []; let i = 12, size = 4;
    while (i + 8 <= d.length) {
      const type = str(i), len = (d[i + 4] | (d[i + 5] << 8) | (d[i + 6] << 16) | (d[i + 7] << 24)) >>> 0, end = i + 8 + len + (len & 1);
      if (type !== 'EXIF' && type !== 'XMP ') {
        let chunk = d.subarray(i, end);
        if (type === 'VP8X') { chunk = chunk.slice(); chunk[8] &= ~0x0c; }
        parts.push(chunk); size += chunk.length;
      }
      i = end;
    }
    const head = new Uint8Array(12); head.set(d.subarray(0, 12)); new DataView(head.buffer).setUint32(4, size, true);
    return new Blob([head, ...parts], { type: 'image/webp' });
  }
  HT.engine('exif-remover', async ctx => {
    const outs = [], rows = [];
    for (const [i, f] of ctx.files.entries()) {
      await tick();
      const found = await readMetadata(f), src = srcFormat(f), d = new Uint8Array(await f.arrayBuffer());
      let orientation = 1;
      if (src === 'jpg') { try { orientation = (await exifr.orientation(f)) || 1; } catch { } }
      let blob = src === 'jpg' && orientation === 1 ? stripJpeg(d) : src === 'png' ? stripPng(d, found) : src === 'webp' ? stripWebp(d) : null;
      let ext = HT.ext(f.name) || src;
      if (!blob) { // re-save the pixels only (orientation is applied first so the photo stays upright)
        const c = await load(f);
        ext = src === 'png' || src === 'webp' ? src : ['gif', 'bmp', 'tiff', 'ico'].includes(src) && hasAlpha(c) ? 'png' : 'jpg';
        blob = await encode(c, ext, { quality: 95 });
      }
      outs.push({ name: outName(f, ext, '_clean'), blob });
      rows.push({ name: f.name, removed: found.length ? found : ['No metadata found'] });
      ctx.progress((i + 1) / ctx.files.length);
    }
    const gps = rows.filter(r => r.removed.includes('GPS location')).length;
    ctx.info = { summary: 'Metadata removed' + (gps ? ` (GPS location found in ${gps} file(s))` : ''), files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- image -> SVG (traced in a worker so the page stays responsive)
  const PRESETS = {
    logo: { maxSide: 1000, opts: { numberofcolors: 16, colorquantcycles: 3, pathomit: 8, ltres: 1, qtres: 1, roundcoords: 1, blurradius: 0, linefilter: true } },
    photo: { maxSide: 800, opts: { numberofcolors: 48, colorquantcycles: 3, pathomit: 4, ltres: 0.5, qtres: 0.5, roundcoords: 1, blurradius: 1, blurdelta: 20 } },
    bw: { maxSide: 1200, opts: { numberofcolors: 2, colorsampling: 0, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], pathomit: 4, ltres: 1, qtres: 1, roundcoords: 1 } },
  };
  function trace(imgd, opts) {
    return new Promise((res, rej) => {
      const w = new Worker('/assets/engine/svg-worker.js');
      w.onmessage = e => { w.terminate(); e.data.error ? rej(new Error(e.data.error)) : res(e.data.svg); };
      w.onerror = e => { w.terminate(); rej(new Error('Tracing failed: ' + (e.message || 'unknown error'))); };
      w.postMessage({ imgd, opts });
    });
  }
  HT.engine('image-to-svg', async ctx => {
    const p = PRESETS[ctx.opts.preset] || PRESETS.logo, outs = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Tracing ${i + 1} of ${ctx.files.length}...` : 'Tracing shapes...');
      let c = await load(f);
      const s = Math.min(1, p.maxSide / Math.max(c.width, c.height));
      if (s < 1) c = HT.resample(c, c.width * s, c.height * s);
      if (ctx.opts.preset === 'bw' || !hasAlpha(c)) c = flatten(c);
      const svg = await trace(pixels(c), p.opts);
      outs.push({ name: outName(f, 'svg'), blob: new Blob([svg], { type: 'image/svg+xml' }) });
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Traced ${outs.length} image(s) to SVG (${kb(outs.reduce((a, o) => a + o.blob.size, 0))})` };
    return outs;
  });
})();
