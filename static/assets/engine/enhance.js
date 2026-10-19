// Image Enhancer engine (runs in the browser): reads a photo, works out what it needs, and applies a professional set of
// adjustments: exposure, contrast, highlights, shadows, whites, blacks, white balance, vibrance, saturation, clarity,
// dehaze, noise reduction, sharpening, vignette, faded-colour repair and document (scan) cleanup.
// Everything works on RGB floats (0..1). Highlights and shadows follow the blurred brightness around each pixel, so
// local contrast survives (the way pro editors do it); noise reduction is an edge-preserving guided filter in YCbCr.
// HT.enhance = { analyze(imageData) -> settings, apply(imageData, settings) -> imageData, PRESETS, combine }.
(() => {
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- fast blurs (three box passes ~ a gaussian), O(n) in the radius
  function boxH(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let acc = src[o] * (r + 1);
      for (let x = 1; x <= r; x++) acc += src[o + Math.min(x, w - 1)];
      for (let x = 0; x < w; x++) {
        dst[o + x] = acc * inv;
        acc += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)];
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let x = 0; x < w; x++) {
      let acc = src[x] * (r + 1);
      for (let y = 1; y <= r; y++) acc += src[Math.min(y, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = acc * inv;
        acc += src[Math.min(y + r + 1, h - 1) * w + x] - src[Math.max(y - r, 0) * w + x];
      }
    }
  }
  function box(src, w, h, r) {   // one box blur
    const out = new Float32Array(src.length), tmp = new Float32Array(src.length);
    if (r < 1) { out.set(src); return out; }
    boxH(src, tmp, w, h, r); boxV(tmp, out, w, h, r);
    return out;
  }
  function blur(src, w, h, radius) {   // close to a gaussian of that radius
    const r = Math.max(1, Math.round(radius / 1.7));
    let a = box(src, w, h, r);
    a = box(a, w, h, r);
    return box(a, w, h, r);
  }
  // edge-preserving smoothing (He et al., guided filter with the image as its own guide)
  function guided(p, w, h, r, eps) {
    const n = p.length, pp = new Float32Array(n);
    for (let i = 0; i < n; i++) pp[i] = p[i] * p[i];
    const m = box(p, w, h, r), mm = box(pp, w, h, r), a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = mm[i] - m[i] * m[i], k = v / (v + eps); a[i] = k; b[i] = m[i] - k * m[i]; }
    const ma = box(a, w, h, r), mb = box(b, w, h, r), q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = ma[i] * p[i] + mb[i];
    return q;
  }

  // ---------------------------------------------------------------- colour helpers
  const S2L = new Float32Array(4096), L2S = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) {
    const v = i / 4095;
    S2L[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    L2S[i] = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }
  const lut = (t, v) => t[(clamp01(v) * 4095 + 0.5) | 0];
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function split(img) {
    const n = img.width * img.height, d = img.data, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), A = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = d[j] / 255; G[i] = d[j + 1] / 255; B[i] = d[j + 2] / 255; A[i] = d[j + 3]; }
    return { R, G, B, A, w: img.width, h: img.height, n };
  }
  function join(P) {
    const out = new ImageData(P.w, P.h), d = out.data;
    for (let i = 0, j = 0; i < P.n; i++, j += 4) { d[j] = P.R[i] * 255 + 0.5; d[j + 1] = P.G[i] * 255 + 0.5; d[j + 2] = P.B[i] * 255 + 0.5; d[j + 3] = P.A[i]; }
    return out;
  }
  const pct = (hist, total, p) => { let c = 0; for (let i = 0; i < hist.length; i++) { c += hist[i]; if (c >= total * p) return i / (hist.length - 1); } return 1; };

  // ---------------------------------------------------------------- what does this photo need?
  // Every number is a slider value (-100..100, sharpen / denoise / flatten / repair 0..100), so the visitor sees exactly what was decided.
  // scale: how much smaller this copy is than the photo that will be saved (shrinking hides grain and looks sharper)
  function analyze(img, scale = 1) {
    const P = split(img), { R, G, B, n, w, h } = P;
    const HY = new Uint32Array(256), HC = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    // A product or document on white (or black) is mostly background: it must stay white, and only the subject is measured.
    const HS = new Uint32Array(256);   // brightness of the subject (everything that is not plain background)
    let sat = 0, wr = 0, wg = 0, wb = 0, wn = 0, br = 0, bgG = 0, bb = 0, bgn = 0, dark = 0, clip = 0, bg = 0, cn = 0;
    const Y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = R[i], g = G[i], b = B[i], y = luma(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      Y[i] = y; HY[(y * 255) | 0]++; HC[0][(r * 255) | 0]++; HC[1][(g * 255) | 0]++; HC[2][(b * 255) | 0]++;
      const plain = (y > 0.9 && c < 0.1) || (y < 0.04 && c < 0.06);
      if (plain) { bg++; if (y > 0.85) { br += r; bgG += g; bb += b; bgn++; } continue; }
      cn++; HS[(y * 255) | 0]++; sat += c;
      if (y < 0.15) dark++; if (y > 0.97) clip++;
      if (y > 0.15 && y < 0.9 && c < 0.25) { wr += r; wg += g; wb += b; wn++; }   // near-neutral midtones show a colour cast
    }
    const bgFrac = bg / n, cnt0 = Math.max(cn, 1), med = pct(HS, cnt0, 0.5), meanSat = sat / cnt0;
    const lo = pct(HY, n, 0.005), hi = pct(HY, n, 0.995);
    let sd = 0, k0 = 0; const cm = med; for (let i = 0; i < n; i += 5) { const y = Y[i]; if (bgFrac > 0.1 && y > 0.9) continue; sd += (y - cm) ** 2; k0++; } sd = Math.sqrt(sd / Math.max(k0, 1));
    // noise: Immerkaer's estimate (a Laplacian difference mask that cancels smooth shapes and edges, leaving the grain);
    // sharpness: how strong the finest detail is (high percentile of the difference from a tiny blur)
    let nsum = 0, cnt = 0;
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      nsum += Math.abs(Y[i - w - 1] - 2 * Y[i - w] + Y[i - w + 1] - 2 * Y[i - 1] + 4 * Y[i] - 2 * Y[i + 1] + Y[i + w - 1] - 2 * Y[i + w] + Y[i + w + 1]); cnt++;
    }
    const noise = Math.sqrt(Math.PI / 2) * nsum / (6 * Math.max(cnt, 1)) / Math.max(scale, 0.2);   // grain at full size
    const small = box(Y, w, h, 1), lap = [];
    for (let i = w + 1; i < n - w - 1; i += 3) lap.push(Math.abs(Y[i] - small[i]));
    lap.sort((a, b) => a - b);
    const detail = (lap.length ? lap[(lap.length * 0.9) | 0] : 0) * Math.max(scale, 0.2);   // fine detail at full size

    const s = {};
    const studio = bgFrac > 0.15;   // product or document shot: keep the background white, do not recover its "highlights"
    // exposure: only a clearly dark subject is brightened, only a clearly blown one darkened (a well-lit photo is left alone)
    let ev = 0;
    if (med < 0.36) ev = clamp(Math.log2(lut(S2L, 0.46) / Math.max(lut(S2L, med), 1e-4)) * 0.8, 0, 1.4);
    else if (!studio && med > 0.72 && clip / cnt0 > 0.04) ev = clamp(Math.log2(lut(S2L, 0.62) / lut(S2L, med)) * 0.6, -0.8, 0);
    s.exposure = Math.abs(ev) < 0.1 ? 0 : Math.round(ev / 2 * 100);
    s.blacks = lo > 0.05 && !studio ? -Math.round(clamp((lo - 0.02) / 0.1 * 100, 0, 40)) : 0;
    s.whites = studio ? 12 : hi < 0.93 ? Math.round(clamp((0.97 - hi) / 0.15 * 100, 0, 50)) : 0;
    s.highlights = !studio && clip / cnt0 > 0.02 ? -Math.round(clamp(clip / cnt0 * 1200, 15, 60)) : 0;
    s.shadows = dark / cnt0 > 0.15 ? Math.round(clamp(dark / cnt0 * 120, 10, 50)) : 0;
    s.contrast = sd < 0.16 ? Math.round(clamp((0.2 - sd) * 250, 4, 30)) : sd > 0.32 ? -8 : 4;
    // white balance: a white background is the best white reference; otherwise near-neutral midtones (keeping some mood)
    s.temperature = 0; s.tint = 0;
    const wbFrom = (r, g, b, k) => {
      const rb = b / Math.max(r, 1e-6), gRB = (r + b) / 2 / Math.max(g, 1e-6);
      s.temperature = Math.round(clamp((rb - 1) / (rb + 1) / 0.3 * 100 * k, -60, 60));
      s.tint = Math.round(clamp((1 - gRB) / 0.2 * 100 * k * 0.7, -25, 25));
    };
    if (bgn > n * 0.08) wbFrom(br, bgG, bb, 0.9);
    else if (wn > n * 0.02) wbFrom(wr, wg, wb, 0.7);
    if (Math.abs(s.temperature) < 4) s.temperature = 0; if (Math.abs(s.tint) < 4) s.tint = 0;
    s.vibrance = meanSat < 0.08 ? 28 : meanSat < 0.18 ? 16 : 6;
    s.saturation = 0;
    s.clarity = studio ? 6 : 8;
    s.dehaze = !studio && lo > 0.12 && sd < 0.16 && meanSat < 0.16 ? Math.round(clamp((lo - 0.08) * 250, 10, 35)) : 0;
    s.denoise = Math.round(clamp((noise - 0.006) / 0.024 * 70, 0, 70));   // ~0.006 is a clean photo, 0.03 a very noisy one
    s.sharpen = Math.round(Math.max(8, clamp(45 - detail * 900, 15, 45) - s.denoise * 0.2));   // a little crispness back after noise reduction
    s.vignette = 0; s.repair = 0; s.flatten = 0;
    // per-channel range, for "repair faded colours" (old photos) and the B&W / document looks
    s._chan = { lo: HC.map(hst => pct(hst, n, 0.005)), hi: HC.map(hst => pct(hst, n, 0.995)) };
    return s;
  }

  // ---------------------------------------------------------------- presets: changes on top of what the photo needs
  const PRESETS = {
    auto: { label: 'Auto', add: {} },
    portrait: { label: 'Portrait', add: { clarity: -14, sharpen: -12, temperature: 6, vibrance: 6, denoise: 12, shadows: 8 } },
    landscape: { label: 'Landscape', add: { clarity: 22, dehaze: 15, vibrance: 28, contrast: 10, sharpen: 10 } },
    lowlight: { label: 'Low light', add: { exposure: 12, shadows: 32, highlights: -20, denoise: 28, clarity: -6 } },
    product: { label: 'Product', add: { whites: 25, clarity: 10, sharpen: 15, vibrance: 8 }, set: { temperature: 'neutral', tint: 'neutral' } },
    food: { label: 'Food', add: { temperature: 12, vibrance: 32, clarity: 10, contrast: 6 } },
    oldphoto: { label: 'Old photo', add: { repair: 70, denoise: 25, vibrance: 30, contrast: 12, dehaze: 8, sharpen: 10 } },
    document: { label: 'Document', set: { flatten: 85, saturation: -40, vibrance: 0, contrast: 30, whites: 40, blacks: -30, clarity: 25, sharpen: 35, denoise: 15, exposure: 0, shadows: 0, highlights: 0, temperature: 0, tint: 0, dehaze: 0 } },
    bw: { label: 'Black & white', add: { contrast: 15, clarity: 18 }, set: { saturation: -100, vibrance: 0 } },
    natural: { label: 'Natural', mul: 0.5 },
  };
  const KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation', 'clarity', 'dehaze', 'denoise', 'sharpen', 'vignette', 'repair', 'flatten'];
  const RANGE = k => (k === 'denoise' || k === 'sharpen' || k === 'repair' || k === 'flatten') ? [0, 100] : [-100, 100];
  // base = what the photo needs (analyze), shaped by the preset, then the visitor's own changes (deltas) on top
  // ai: AI HD runs first and already sharpens and cleans the photo, so Auto adds only part of its own sharpening and noise reduction
  function combine(base, preset, deltas = {}, ai = false) {
    const p = PRESETS[preset] || PRESETS.auto, out = { _chan: base._chan };
    for (const k of KEYS) {
      let v = base[k] || 0;
      if (ai && k === 'sharpen') v *= 0.45;
      if (ai && k === 'denoise') v *= 0.35;
      if (p.mul != null) v *= p.mul;
      if (p.add && p.add[k] != null) v += p.add[k];
      if (p.set && p.set[k] != null) v = p.set[k] === 'neutral' ? (base[k] || 0) / 0.75 : p.set[k];   // full correction instead of 75%
      v += deltas[k] || 0;
      const [a, b] = RANGE(k); out[k] = Math.round(clamp(v, a, b));
    }
    return out;
  }

  // ---------------------------------------------------------------- apply
  // scale: how much smaller this copy is than the full photo (the preview), so radii match what the download will get
  function apply(img, s, scale = 1) {
    const P = split(img), { R, G, B, n, w, h } = P, size = Math.max(w, h) / scale;
    const px = r => Math.max(1, r * scale);   // a radius given in full-size pixels -> this copy's pixels

    // 1. faded-colour repair: stretch each channel to its own range (fixes the yellow / pink cast of old prints)
    if (s.repair > 0 && s._chan) {
      const k = s.repair / 100, C = [R, G, B];
      for (let c = 0; c < 3; c++) {
        const lo = s._chan.lo[c], hi = Math.max(s._chan.hi[c], lo + 0.05), ch = C[c];
        for (let i = 0; i < n; i++) ch[i] = ch[i] + k * ((ch[i] - lo) / (hi - lo) - ch[i]);
      }
    }
    // 2. document flatten: divide by the page's own lighting, so shadows and yellowed paper turn white and the text stays
    if (s.flatten > 0) {
      const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = Math.max(R[i], G[i], B[i]);
      const bg = blur(Y, w, h, px(size * 0.025)), k = s.flatten / 100;
      for (let i = 0; i < n; i++) { const f = 1 + k * (0.97 / Math.max(bg[i], 0.08) - 1); R[i] *= f; G[i] *= f; B[i] *= f; }
    }
    // 3. dehaze (dark channel prior, simplified): haze is the brightness every colour channel shares
    if (s.dehaze) {
      const k = s.dehaze / 100, D = new Float32Array(n);
      for (let i = 0; i < n; i++) D[i] = Math.min(R[i], G[i], B[i]);
      const dark = blur(D, w, h, px(size * 0.01)), A = 0.95;
      for (let i = 0; i < n; i++) {
        if (k > 0) { const t = Math.max(0.35, 1 - 0.9 * k * dark[i] / A); R[i] = (R[i] - A) / t + A; G[i] = (G[i] - A) / t + A; B[i] = (B[i] - A) / t + A; }
        else { const t = -k * 0.35; R[i] += (A - R[i]) * t; G[i] += (A - G[i]) * t; B[i] += (A - B[i]) * t; }
      }
    }
    // 4. noise reduction: brightness gently, colour blotches strongly (that is where phone-photo noise shows most)
    if (s.denoise > 0) {
      const k = s.denoise / 100, Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
      for (let i = 0; i < n; i++) { const y = luma(R[i], G[i], B[i]); Y[i] = y; Cb[i] = B[i] - y; Cr[i] = R[i] - y; }
      const rY = Math.max(1, Math.round(px(2))), Ys = guided(Y, w, h, rY, 0.0003 + k * k * 0.012);
      const rC = Math.max(1, Math.round(px(2 + k * 5))), Cbs = guided(Cb, w, h, rC, 0.0004 + k * 0.004), Crs = guided(Cr, w, h, rC, 0.0004 + k * 0.004);
      for (let i = 0; i < n; i++) {
        const y = Y[i] + (Ys[i] - Y[i]) * Math.min(1, k * 2.2), cb = Cb[i] + (Cbs[i] - Cb[i]) * Math.min(1, k * 2.5), cr = Cr[i] + (Crs[i] - Cr[i]) * Math.min(1, k * 2.5);
        R[i] = y + cr; B[i] = y + cb; G[i] = (y - 0.299 * R[i] - 0.114 * B[i]) / 0.587;
      }
    }
    // 5. white balance
    if (s.temperature || s.tint) {
      const t = s.temperature / 100, tn = s.tint / 100, gr = 1 + 0.3 * t, gb = 1 - 0.3 * t, gg = 1 - 0.2 * tn;   // + is warmer, as in Lightroom
      const norm = 1 / luma(gr, gg, gb);   // keep the overall brightness
      for (let i = 0; i < n; i++) { R[i] *= gr * norm; G[i] *= gg * norm; B[i] *= gb * norm; }
    }
    // 6. highlights and shadows, following the blurred brightness around each pixel (keeps local contrast)
    if (s.highlights || s.shadows) {
      const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = luma(R[i], G[i], B[i]);
      const base = guided(Y, w, h, Math.max(2, Math.round(px(size * 0.02))), 0.01), sh = s.shadows / 100, hl = s.highlights / 100;   // edge-aware: no halos
      for (let i = 0; i < n; i++) {
        const b = clamp01(base[i]);
        let f = 1 + sh * 1.1 * smooth(0.55, 0.0, b) * (sh > 0 ? 1 : 0.6);
        f *= 1 + hl * 0.45 * smooth(0.45, 1.0, b);
        R[i] *= f; G[i] *= f; B[i] *= f;
      }
    }
    // 7. the tone curve: exposure (in linear light), whites, blacks, contrast, as one table per value
    const T = new Float32Array(4096), ev = Math.pow(2, s.exposure / 50);
    const bp = s.blacks < 0 ? -s.blacks / 100 * 0.1 : 0, lift = s.blacks > 0 ? s.blacks / 100 * 0.08 : 0;
    const wp = s.whites > 0 ? 1 - s.whites / 100 * 0.15 : 1, dim = s.whites < 0 ? 1 + s.whites / 100 * 0.15 : 1;
    const c = s.contrast / 100, kc = c >= 0 ? 1 + 1.6 * c : 1 / (1 - 1.2 * c);
    for (let i = 0; i < 4096; i++) {
      let v = i / 4095;
      v = lut(L2S, lut(S2L, v) * ev);
      v = (v - bp) / (1 - bp); v = lift + v * (1 - lift);
      v = Math.min(v / wp, 1.02) * dim;
      v = clamp01(v);
      v = v < 0.5 ? 0.5 * Math.pow(2 * v, kc) : 1 - 0.5 * Math.pow(2 * (1 - v), kc);
      T[i] = v;
    }
    for (let i = 0; i < n; i++) {
      const y = luma(R[i], G[i], B[i]), f = y > 1e-4 ? lut(T, y) / y : 1 + lut(T, 0) * 1e4;
      R[i] *= f; G[i] *= f; B[i] *= f;
      const mx = Math.max(R[i], G[i], B[i]);
      if (mx > 1) { const yy = luma(R[i], G[i], B[i]), k = (1 - yy) / Math.max(mx - yy, 1e-6); R[i] = yy + (R[i] - yy) * k; G[i] = yy + (G[i] - yy) * k; B[i] = yy + (B[i] - yy) * k; }   // a bright colour fades towards white instead of changing hue
    }
    // 8. clarity (midtone local contrast) and sharpening, both on brightness so colours do not fringe
    if (s.clarity || s.sharpen) {
      const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = luma(R[i], G[i], B[i]);
      const add = new Float32Array(n);
      if (s.clarity) {
        const big = guided(Y, w, h, Math.max(2, Math.round(px(size * 0.012))), 0.015), k = s.clarity / 100 * 1.4;   // edge-aware local contrast: no halos
        for (let i = 0; i < n; i++) { const m = 1 - Math.pow(2 * Y[i] - 1, 2); add[i] += k * (Y[i] - big[i]) * m; }
      }
      if (s.sharpen) {
        const sm = blur(Y, w, h, Math.max(1, px(1.2))), k = s.sharpen / 100 * 1.8;
        for (let i = 0; i < n; i++) { const d = Y[i] - sm[i]; if (Math.abs(d) > 0.006) add[i] += k * d; }   // a small threshold leaves flat areas (and their noise) alone
      }
      for (let i = 0; i < n; i++) { R[i] += add[i]; G[i] += add[i]; B[i] += add[i]; }
    }
    // 9. vibrance (lifts dull colours, spares skin and already-strong colours) and saturation
    if (s.vibrance || s.saturation) {
      const vb = s.vibrance / 100, st = 1 + s.saturation / 100;
      for (let i = 0; i < n; i++) {
        const r = R[i], g = G[i], b = B[i], y = luma(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b), cur = mx - mn;
        const skin = r > g && g > b && (r - b) > 0.06 && (g - b) / Math.max(r - b, 1e-6) > 0.25 && (g - b) / Math.max(r - b, 1e-6) < 0.75 ? 0.45 : 1;
        const f = st * (1 + vb * (1 - clamp01(cur * 1.6)) * (vb > 0 ? skin : 1));
        R[i] = y + (r - y) * f; G[i] = y + (g - y) * f; B[i] = y + (b - y) * f;
      }
    }
    // 10. vignette (darker or lighter corners)
    if (s.vignette) {
      const k = s.vignette / 100, cx = w / 2, cy = h / 2, rr = Math.hypot(cx, cy);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy) / rr, f = 1 + k * 0.6 * smooth(0.35, 1.0, d), i = y * w + x;
        R[i] *= f; G[i] *= f; B[i] *= f;
      }
    }
    for (let i = 0; i < n; i++) { R[i] = clamp01(R[i]); G[i] = clamp01(G[i]); B[i] = clamp01(B[i]); }
    return join(P);
  }

  // RGB histogram of an image (for the little graph in the editor)
  function histogram(img, bins = 64) {
    const H = [new Uint32Array(bins), new Uint32Array(bins), new Uint32Array(bins)], d = img.data, step = Math.max(1, Math.floor(d.length / 4 / 200000)) * 4;
    for (let j = 0; j < d.length; j += step) { H[0][(d[j] * bins) >> 8]++; H[1][(d[j + 1] * bins) >> 8]++; H[2][(d[j + 2] * bins) >> 8]++; }
    return H;
  }

  HT.enhance = { analyze, apply, combine, histogram, PRESETS, KEYS, RANGE };

  // ---------------------------------------------------------------- the batch job (Download): each photo analysed on its own
  // opts: { preset, deltas: {key: change}, ai: 'off'|'restore'|'2x', format, quality, maxSide, targetKB }
  HT.engine('image-enhancer', async ctx => {
    await HT.loadScript('/assets/engine/image.js');
    const o = ctx.opts || {}, outs = [], rows = [];
    for (const [i, f] of ctx.files.entries()) {
      const label = ctx.files.length > 1 ? `${i + 1} of ${ctx.files.length}: ` : '';
      ctx.status(label + 'Reading the photo...'); await HT.tick();
      let c = await HT.img.load(f);
      if (o.ai && o.ai !== 'off') {   // the AI's own progress, as this photo's share of the whole batch
        const part = { status: ctx.status, progress: p => ctx.progress((i + p * 0.85) / ctx.files.length) };
        c = await aiRestore(part, c, o.ai, label);
      }
      const max = +o.maxSide || 0;
      if (max && Math.max(c.width, c.height) > max) { const k = max / Math.max(c.width, c.height); c = HT.resample(c, c.width * k, c.height * k); }
      ctx.status(label + 'Enhancing...'); await HT.tick();
      const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height);
      const ai = !!(o.ai && o.ai !== 'off'), probe = probeOf(c), s = combine(analyze(probe.img, probe.scale), o.preset || 'auto', o.deltas || {}, ai);
      x.putImageData(apply(img, s, 1), 0, 0);
      ctx.status(label + 'Saving...'); await HT.tick();
      const fmt = pickFormat(o.format, f, HT.img.hasAlpha(c)), out = await encodeTo(c, fmt, +o.quality || 90, +o.targetKB || 0);
      outs.push({ name: HT.stem(f.name) + '_enhanced.' + (fmt === 'jpg' ? 'jpg' : fmt), blob: out });
      rows.push(`${f.name}: ${HT.fmtBytes(f.size)} → ${HT.fmtBytes(out.size)}`);
      ctx.progress((i + 1) / ctx.files.length);
    }
    ctx.info = { summary: `Enhanced ${outs.length} photo(s). ` + rows.slice(0, 3).join(' · ') };
    return outs;
  });

  // a small copy for the analysis (the numbers do not change with size, and it is much faster)
  function probeOf(c) {
    const k = Math.min(1, 900 / Math.max(c.width, c.height)), p = k < 1 ? HT.resample(c, c.width * k, c.height * k) : c;
    return { img: p.getContext('2d').getImageData(0, 0, p.width, p.height), scale: k };
  }
  function pickFormat(want, f, alpha) {
    if (want && want !== 'same') return want;
    const ext = HT.ext(f.name);
    return ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : ext === 'avif' ? 'avif' : alpha ? 'png' : 'jpg';
  }
  // encode, and when a target size is given, find the best quality that fits it
  async function encodeTo(c, fmt, quality, targetKB) {
    if (!targetKB || fmt === 'png') return HT.img.encode(c, fmt, { quality });
    let lo = 20, hi = Math.min(98, quality), best = null;
    for (let step = 0; step < 7 && lo <= hi; step++) {
      const q = Math.round((lo + hi) / 2), b = await HT.img.encode(c, fmt, { quality: q });
      if (b.size <= targetKB * 1024) { best = b; lo = q + 1; } else hi = q - 1;
    }
    return best || HT.img.encode(c, fmt, { quality: 20 });
  }
  HT.enhance.encodeTo = encodeTo; HT.enhance.pickFormat = pickFormat; HT.enhance.probeOf = probeOf;

  // ---------------------------------------------------------------- AI HD (Real-ESRGAN in engine/sr-worker.js: the graphics card when it can)
  let srW = null, srSeq = 0;
  const srWait = {}, warmers = [];
  function srWorker() {
    if (srW) return srW;
    srW = new Worker(HT.ver('/assets/engine/sr-worker.js'), { type: 'module' });
    srW.onmessage = ({ data: m }) => {
      if (m.type === 'ready') { HT.enhance.backend = m.backend; warmers.splice(0).forEach(f => f(m.backend)); return; }
      const w = srWait[m.id]; if (!w) return;
      if (m.type === 'progress') return w.progress(m.f);
      delete srWait[m.id];
      if (m.type === 'error') w.rej(new Error(m.msg)); else { HT.enhance.backend = m.backend; w.res(m); }
    };
    srW.onerror = e => {   // the worker could not start: tell everyone waiting, start afresh next time
      for (const k of Object.keys(srWait)) { srWait[k].rej(new Error('The AI could not start: ' + (e.message || 'unknown error'))); delete srWait[k]; }
      srW.terminate(); srW = null;
    };
    return srW;
  }
  // gets the model (and on a graphics card the runtime) ready before it is needed; resolves to 'gpu' or 'cpu'
  const srWarm = () => new Promise(res => { warmers.push(res); srWorker().postMessage({ type: 'warm' }); });
  // does this browser offer a graphics card to web pages? (decides whether AI HD is on by default; downloads nothing)
  let gpuP = null;
  const hasGPU = () => gpuP || (gpuP = (async () => { try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { return false; } })());
  // canvas -> canvas 4x as large
  function sr4x(c, progress) {
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height), id = ++srSeq;
    return new Promise((res, rej) => {
      srWait[id] = { res, rej, progress: progress || (() => {}) };
      srWorker().postMessage({ type: 'run', id, w: c.width, h: c.height, rgba: img.data.buffer }, [img.data.buffer]);
    }).then(m => { const out = HT.canvas(m.w, m.h); out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.rgba), m.w, m.h), 0, 0); return out; });
  }
  const FACTOR = { restore: 1, '1': 1, '2x': 2, '2': 2, '4': 4, '4x': 4 };
  // AI HD: factor 1 keeps the size (detail restored), 2 or 4 enlarges. Very large photos are first brought to a size the
  // device can handle (a graphics card manages much more), and the enlargement never goes past what the AI produced.
  async function aiRestore(ctx, c, mode, label = '') {
    const factor = FACTOR[String(mode)] || 1, gpu = await hasGPU();
    const cap = (gpu ? 2.2e6 : 1e6) / (factor === 4 ? 2.5 : 1), mp = c.width * c.height;
    let src = c;
    if (mp > cap) { const k = Math.sqrt(cap / mp); src = HT.resample(c, c.width * k, c.height * k); }
    ctx.status(label + (gpu ? 'AI HD is sharpening the details...' : 'AI HD is sharpening the details (on this device it can take a minute)...'));
    const big = await sr4x(src, f => ctx.progress(f));
    const tw = Math.min(big.width, Math.round(c.width * factor)), th = Math.min(big.height, Math.round(c.height * factor));
    const out = tw === big.width && th === big.height ? big : HT.resample(big, tw, th);
    if (HT.img.hasAlpha(c)) {   // transparency is not part of the AI: it is enlarged smoothly and put back
      const a = HT.canvas(tw, th), ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(c, 0, 0, tw, th);
      const ad = ax.getImageData(0, 0, tw, th).data, od = out.getContext('2d').getImageData(0, 0, tw, th);
      for (let i = 3; i < ad.length; i += 4) od.data[i] = ad[i];
      out.getContext('2d').putImageData(od, 0, 0);
    }
    return out;
  }
  HT.enhance.sr4x = sr4x; HT.enhance.srWarm = srWarm; HT.enhance.hasGPU = hasGPU; HT.enhance.FACTOR = FACTOR;
  HT.enhance.aiRestore = aiRestore;
})();
