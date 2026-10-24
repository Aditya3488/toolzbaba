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
    const inv = 1 / (2 * r + 1), mid = w - r - 1;
    for (let y = 0; y < h; y++) {
      const o = y * w, last = src[o + w - 1];
      let acc = src[o] * (r + 1), x = 0;
      for (let k = 1; k <= r; k++) acc += src[o + Math.min(k, w - 1)];
      for (; x <= r && x < w; x++) { dst[o + x] = acc * inv; acc += src[o + Math.min(x + r + 1, w - 1)] - src[o]; }   // left edge
      for (; x < mid; x++) { dst[o + x] = acc * inv; acc += src[o + x + r + 1] - src[o + x - r]; }                    // no edge: no checks
      for (; x < w; x++) { dst[o + x] = acc * inv; acc += last - src[o + Math.max(x - r, 0)]; }                        // right edge
    }
  }
  // vertical pass row by row (one running sum per column): reading memory in order is several times faster on big photos
  function boxV(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1), acc = new Float64Array(w);
    for (let x = 0; x < w; x++) acc[x] = src[x] * (r + 1);
    for (let y = 1; y <= r; y++) { const o = Math.min(y, h - 1) * w; for (let x = 0; x < w; x++) acc[x] += src[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, add = Math.min(y + r + 1, h - 1) * w, sub = Math.max(y - r, 0) * w;
      for (let x = 0; x < w; x++) { dst[o + x] = acc[x] * inv; acc[x] += src[add + x] - src[sub + x]; }
    }
  }
  let scratch = new Float32Array(0);   // the in-between pass, reused: a new 100 MB array per blur costs more than the blur
  function box(src, w, h, r) {   // one box blur
    const out = new Float32Array(src.length);
    if (r < 1) { out.set(src); return out; }
    if (scratch.length < src.length) scratch = new Float32Array(src.length);
    const tmp = scratch.length === src.length ? scratch : scratch.subarray(0, src.length);
    boxH(src, tmp, w, h, r); boxV(tmp, out, w, h, r);
    return out;
  }
  // shrink by s (the average of each s x s block) and enlarge back (bilinear): wide, smooth filters are worked out small
  function down(p, w, h, s) {
    const sw = Math.ceil(w / s), sh = Math.ceil(h / s), o = new Float32Array(sw * sh), c = new Float32Array(sw * sh);
    for (let y = 0; y < h; y++) { const row = ((y / s) | 0) * sw, i0 = y * w; for (let x = 0; x < w; x++) { const k = row + ((x / s) | 0); o[k] += p[i0 + x]; c[k]++; } }
    for (let k = 0; k < o.length; k++) o[k] /= c[k];
    return { o, sw, sh };
  }
  function up(q, sw, sh, w, h, s) {
    const out = new Float32Array(w * h), X0 = new Int32Array(w), X1 = new Int32Array(w), FX = new Float32Array(w);
    for (let x = 0; x < w; x++) { const gx = Math.min(sw - 1, Math.max(0, (x + 0.5) / s - 0.5)); X0[x] = gx | 0; X1[x] = Math.min(sw - 1, X0[x] + 1); FX[x] = gx - X0[x]; }
    for (let y = 0; y < h; y++) {
      const gy = Math.min(sh - 1, Math.max(0, (y + 0.5) / s - 0.5)), y0 = gy | 0, y1 = Math.min(sh - 1, y0 + 1), fy = gy - y0, r0 = y0 * sw, r1 = y1 * sw, o = y * w;
      for (let x = 0; x < w; x++) {
        const a = q[r0 + X0[x]] + (q[r0 + X1[x]] - q[r0 + X0[x]]) * FX[x], b = q[r1 + X0[x]] + (q[r1 + X1[x]] - q[r1 + X0[x]]) * FX[x];
        out[o + x] = a + (b - a) * fy;
      }
    }
    return out;
  }
  function blur(src, w, h, radius) {   // close to a gaussian of that radius
    if (radius >= 16) {   // a wide blur is smooth anyway: worked out on a smaller copy
      const s = Math.min(4, Math.floor(radius / 8)), d = down(src, w, h, s);
      return up(blur(d.o, d.sw, d.sh, radius / s), d.sw, d.sh, w, h, s);
    }
    const r = Math.max(1, Math.round(radius / 1.7));
    let a = box(src, w, h, r);
    a = box(a, w, h, r);
    return box(a, w, h, r);
  }
  // edge-preserving smoothing (He et al., guided filter with the image as its own guide)
  // a wide radius uses the fast guided filter (He & Sun 2015): the coefficients are worked out on a smaller copy and
  // enlarged, the edges still come from the full-size photo
  function guided(p, w, h, r, eps) {
    const s = r >= 8 ? Math.min(4, Math.floor(r / 4)) : 1;
    if (s > 1) {
      const d = down(p, w, h, s), { ma, mb } = guidedAB(d.o, d.sw, d.sh, Math.max(1, Math.round(r / s)), eps);
      const A = up(ma, d.sw, d.sh, w, h, s), B = up(mb, d.sw, d.sh, w, h, s);
      for (let i = 0; i < A.length; i++) A[i] = A[i] * p[i] + B[i];
      return A;
    }
    const { ma, mb } = guidedAB(p, w, h, r, eps), q = new Float32Array(p.length);
    for (let i = 0; i < q.length; i++) q[i] = ma[i] * p[i] + mb[i];
    return q;
  }
  function guidedAB(p, w, h, r, eps) {
    const n = p.length, pp = new Float32Array(n);
    for (let i = 0; i < n; i++) pp[i] = p[i] * p[i];
    const m = box(p, w, h, r), mm = box(pp, w, h, r), a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = mm[i] - m[i] * m[i], k = v / (v + eps); a[i] = k; b[i] = m[i] - k * m[i]; }
    return { ma: box(a, w, h, r), mb: box(b, w, h, r) };
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

  // ---------------------------------------------------------------- the backdrop (grey paper, a sweep, a light table)
  // Measured on a grid of about 400 cells across, whatever the photo's size, so the preview and the download agree.
  // Returns the backdrop's own lighting per channel (I), which pixels are backdrop (M), and how sure we are it is one.
  function maxLine(src, dst, len, stride, off, r) {
    for (let i = 0; i < len; i++) {
      let m = 0; const a = Math.max(0, i - r), b = Math.min(len - 1, i + r);
      for (let j = a; j <= b; j++) { const v = src[off + j * stride]; if (v > m) m = v; }
      dst[off + i * stride] = m;
    }
  }
  function backdropOf(R, G, B, w, h) {
    const f = Math.max(1, Math.ceil(Math.max(w, h) / 400)), gw = Math.ceil(w / f), gh = Math.ceil(h / f), m = gw * gh;
    const r = new Float32Array(m), g = new Float32Array(m), b = new Float32Array(m), cnt = new Float32Array(m);
    for (let y = 0; y < h; y++) { const row = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) { const i = y * w + x, k = row + ((x / f) | 0); r[k] += R[i]; g[k] += G[i]; b[k] += B[i]; cnt[k]++; } }
    const Y = new Float32Array(m), Y2 = new Float32Array(m);
    for (let k = 0; k < m; k++) { r[k] /= cnt[k]; g[k] /= cnt[k]; b[k] /= cnt[k]; Y[k] = luma(r[k], g[k], b[k]); Y2[k] = Y[k] * Y[k]; }
    // the backdrop: light, colourless, smooth, and as bright as the brightest backdrop around it (dark objects drop out)
    const side = Math.max(gw, gh), rd = Math.max(2, Math.round(side * 0.03)), tmp = new Float32Array(m), env = new Float32Array(m);
    for (let y = 0; y < gh; y++) maxLine(Y, tmp, gw, 1, y * gw, rd);
    for (let x = 0; x < gw; x++) maxLine(tmp, env, gh, gw, x, rd);
    const mY = box(Y, gw, gh, 1), mY2 = box(Y2, gw, gh, 1), M = new Float32Array(m);
    for (let k = 0; k < m; k++) {
      const c = Math.max(r[k], g[k], b[k]) - Math.min(r[k], g[k], b[k]), sd = Math.sqrt(Math.max(0, mY2[k] - mY[k] * mY[k]));
      M[k] = c < 0.09 && Y[k] > 0.3 && Y[k] > env[k] * 0.86 && sd < 0.025 ? 1 : 0;
    }
    // how much of the frame's edge is backdrop: a product shot is surrounded by it
    let ring = 0, ringOn = 0, all = 0; const e = Math.max(1, Math.round(side * 0.08));
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x; all += M[k];
      if (x < e || y < e || x >= gw - e || y >= gh - e) { ring++; ringOn += M[k]; }
    }
    const sure = clamp01((ringOn / Math.max(ring, 1) - 0.6) / 0.25) * (all / m > 0.3 ? 1 : 0);
    // the backdrop's lighting under the object: averaged from backdrop cells only (near, then far for big objects)
    const fill = (rad) => {
      const wM = blur(M, gw, gh, rad), out = [r, g, b].map(ch => { const t = new Float32Array(m); for (let k = 0; k < m; k++) t[k] = ch[k] * M[k]; return blur(t, gw, gh, rad); });
      for (let k = 0; k < m; k++) { const d = Math.max(wM[k], 1e-4); out[0][k] /= d; out[1][k] /= d; out[2][k] /= d; }
      return { I: out, wM };
    };
    const near = fill(Math.max(2, side * 0.06)), far = fill(Math.max(4, side * 0.2)), I = [new Float32Array(m), new Float32Array(m), new Float32Array(m)];
    for (let k = 0; k < m; k++) {
      const t = clamp01(near.wM[k] / 0.15);
      for (let c = 0; c < 3; c++) I[c][k] = Math.max(0.2, far.I[c][k] + (near.I[c][k] - far.I[c][k]) * t);
    }
    let lv = 0; for (let k = 0; k < m; k++) lv += M[k] * luma(r[k], g[k], b[k]);
    return { I: all ? I : null, gw, gh, f, sure, level: lv / Math.max(all, 1) };   // level: how bright the backdrop already is
  }

  // ---------------------------------------------------------------- what does this photo need?
  // Every number is a slider value (-100..100, sharpen / denoise / flatten / repair 0..100), so the visitor sees exactly what was decided.
  // scale: how much smaller this copy is than the photo that will be saved (shrinking hides grain and looks sharper)
  function analyze(img, scale = 1, inner = false) {
    const P = split(img), { R, G, B, n, w, h } = P;
    // a product on a grey backdrop: the backdrop turns white first, and the photo is judged as it will then look
    if (!inner) {
      const bd = backdropOf(R, G, B, w, h);
      if (bd.sure > 0.4) {
        const v = Math.round(60 + 40 * bd.sure), zero = {}; for (const k of KEYS) zero[k] = 0; zero.backdrop = v;
        const s = analyze(apply(img, zero, scale), scale, true); s.backdrop = v;
        s.exposure = Math.min(s.exposure, 10); s.shadows = 0; s.vibrance = Math.min(s.vibrance, 10);   // a dark product is meant to be dark: keep its blacks deep
        return s;
      }
    }
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
    s.vignette = 0; s.repair = 0; s.flatten = 0; s.backdrop = 0;
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
    document: { label: 'Document', set: { backdrop: 0, flatten: 85, saturation: -40, vibrance: 0, contrast: 30, whites: 40, blacks: -30, clarity: 25, sharpen: 35, denoise: 15, exposure: 0, shadows: 0, highlights: 0, temperature: 0, tint: 0, dehaze: 0 } },
    bw: { label: 'Black & white', add: { contrast: 15, clarity: 18 }, set: { saturation: -100, vibrance: 0 } },
    natural: { label: 'Natural', mul: 0.5 },
  };
  const KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation', 'clarity', 'dehaze', 'denoise', 'sharpen', 'vignette', 'repair', 'flatten', 'backdrop'];
  const RANGE = k => (k === 'denoise' || k === 'sharpen' || k === 'repair' || k === 'flatten' || k === 'backdrop') ? [0, 100] : [-100, 100];
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
  // at (a strip of a large photo, see applyFast): { size, fullW, fullH, y0, bd } so sizes, the vignette and the backdrop
  // follow the whole photo, not the strip
  function apply(img, s, scale = 1, at = null) {
    const P = split(img), { R, G, B, n, w, h } = P, size = at ? at.size : Math.max(w, h) / scale, oy = at ? at.y0 : 0;
    const px = r => Math.max(1, r * scale);   // a radius given in full-size pixels -> this copy's pixels

    // 1. faded-colour repair: stretch each channel to its own range (fixes the yellow / pink cast of old prints)
    if (s.repair > 0 && s._chan) {
      const k = s.repair / 100, C = [R, G, B];
      for (let c = 0; c < 3; c++) {
        const lo = s._chan.lo[c], hi = Math.max(s._chan.hi[c], lo + 0.05), ch = C[c];
        for (let i = 0; i < n; i++) ch[i] = ch[i] + k * ((ch[i] - lo) / (hi - lo) - ch[i]);
      }
    }
    // 1b. white backdrop: divide by the backdrop's own lighting, so grey paper and uneven light turn pure white and its colour cast goes;
    //     then the darks are deepened (lenses, black parts), so the product stands out crisp, as in a retouched catalogue photo
    if (s.backdrop > 0) {
      const bd = at && at.bd ? at.bd : backdropOf(R, G, B, w, h), k = s.backdrop / 100;
      if (bd.I) {
        const { I, gw, gh, f } = bd, [Ir, Ig, Ib] = I, gam = 1 + 0.35 * clamp01((0.96 - bd.level) / 0.15);   // a grey (dull) backdrop shot also gets deeper darks
        for (let y = 0; y < h; y++) {
          const gy = Math.min(gh - 1, Math.max(0, (y + oy + 0.5) / f - 0.5)), y0 = gy | 0, y1 = Math.min(gh - 1, y0 + 1), fy = gy - y0;
          for (let x = 0; x < w; x++) {
            const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = gx | 0, x1 = Math.min(gw - 1, x0 + 1), fx = gx - x0;
            const a = y0 * gw + x0, b = y0 * gw + x1, c = y1 * gw + x0, d = y1 * gw + x1;
            const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
            const i = y * w + x;
            let r = R[i] / (Ir[a] * w00 + Ir[b] * w01 + Ir[c] * w10 + Ir[d] * w11);
            let g = G[i] / (Ig[a] * w00 + Ig[b] * w01 + Ig[c] * w10 + Ig[d] * w11);
            let bl = B[i] / (Ib[a] * w00 + Ib[b] * w01 + Ib[c] * w10 + Ib[d] * w11);
            const yy = luma(r, g, bl);
            if (gam > 1.01 && yy > 1e-4 && yy < 1) { const t = Math.pow(yy, gam) / yy; r *= t; g *= t; bl *= t; }
            const ch = Math.max(r, g, bl) - Math.min(r, g, bl);
            const wt = smooth(0.86, 0.97, yy) * (1 - smooth(0.05, 0.14, ch));   // the backdrop (and its grain) becomes exactly white; bright colours stay
            r += (1 - r) * wt; g += (1 - g) * wt; bl += (1 - bl) * wt;
            R[i] += (r - R[i]) * k; G[i] += (g - G[i]) * k; B[i] += (bl - B[i]) * k;
          }
        }
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
      // colour noise is coarse (and JPEG keeps colour at half size anyway): cleaned on a half-size copy, four times faster
      const rC = Math.max(1, Math.round(px(2 + k * 5))), half = rC >= 2, epsC = 0.0004 + k * 0.004;
      const chroma = C => { if (!half) return guided(C, w, h, rC, epsC); const d = down(C, w, h, 2); return up(guided(d.o, d.sw, d.sh, Math.max(1, Math.round(rC / 2)), epsC), d.sw, d.sh, w, h, 2); };
      const Cbs = chroma(Cb), Crs = chroma(Cr);
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
      const k = s.vignette / 100, cx = (at ? at.fullW : w) / 2, cy = (at ? at.fullH : h) / 2, rr = Math.hypot(cx, cy);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y + oy - cy) / rr, f = 1 + k * 0.6 * smooth(0.35, 1.0, d), i = y * w + x;
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

  // ---------------------------------------------------------------- big photos: every processor core at once
  // The photo is cut into horizontal strips, each worked on in its own worker (engine/enhance-worker.js). Each strip
  // carries a margin wider than any filter reaches (5% of the photo), so the joins can not be seen; strips start on
  // rows that are multiples of 8, so the shrunken copies of every strip line up with those of the whole photo.
  let pool = null, jobSeq = 0;
  const jobs = {};
  function workers() {
    if (pool) return pool;
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    const n = Math.max(1, Math.min(cores - 1, Math.floor(mem / 2), mem >= 8 ? 6 : 4)), url = new URL(HT.ver('/assets/engine/enhance.js'), location.href).href;
    pool = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(HT.ver('/assets/engine/enhance-worker.js'));
      w.onmessage = ({ data: m }) => { const j = jobs[m.id]; if (!j) return; delete jobs[m.id]; if (m.error) j.rej(new Error(m.error)); else j.res(m.buf); };
      w.onerror = e => { for (const k of Object.keys(jobs)) { jobs[k].rej(new Error(e.message || 'worker failed')); delete jobs[k]; } pool = null; };
      w.postMessage({ type: 'init', url });
      pool.push(w);
    }
    return pool;
  }
  // a small copy (block averages) for the backdrop's lighting, which must be the same for every strip
  function shrinkRGB(img, q) {
    const W = img.width, H = img.height, w = Math.ceil(W / q), h = Math.ceil(H / q), m = w * h, d = img.data;
    const R = new Float32Array(m), G = new Float32Array(m), B = new Float32Array(m), c = new Float32Array(m);
    for (let y = 0; y < H; y++) { const row = ((y / q) | 0) * w; for (let x = 0; x < W; x++) { const k = row + ((x / q) | 0), j = (y * W + x) * 4; R[k] += d[j]; G[k] += d[j + 1]; B[k] += d[j + 2]; c[k]++; } }
    for (let k = 0; k < m; k++) { const v = 255 * c[k]; R[k] /= v; G[k] /= v; B[k] /= v; }
    return { R, G, B, w, h };
  }
  async function applyFast(img, s, progress = () => {}) {
    const W = img.width, H = img.height;
    if (W * H < 3e6 || typeof Worker === 'undefined') return apply(img, s, 1);
    let ws;
    try { ws = workers(); } catch (e) { return apply(img, s, 1); }
    // the margin: how far the widest filter in use reaches (document cleanup 2.5% blur, highlights / shadows 2%, clarity
    // 1.2%, dehaze 1% of the photo; each reaches about twice its radius), plus a little for the shrunken copies
    const size = Math.max(W, H);
    const reach = Math.max(s.flatten > 0 ? 0.046 : 0, s.highlights || s.shadows ? 0.042 : 0, s.clarity ? 0.026 : 0, s.dehaze ? 0.02 : 0, 0.004);
    const halo = Math.ceil((size * reach + 16) / 8) * 8;
    let bd = null;
    if (s.backdrop > 0) { const q = Math.max(1, Math.ceil(size / 900)), sm = shrinkRGB(img, q); bd = backdropOf(sm.R, sm.G, sm.B, sm.w, sm.h); bd.f *= q; }
    const count = Math.max(ws.length, Math.ceil(W * H / 6e6)), rows = Math.ceil(H / count / 8) * 8, strips = [];
    for (let y0 = 0; y0 < H; y0 += rows) strips.push([y0, Math.min(H, y0 + rows)]);
    let done = 0, next = 0;
    const run = async w => {
      while (next < strips.length) {
        const [y0, y1] = strips[next++], a = Math.max(0, y0 - halo), b = Math.min(H, y1 + halo), id = ++jobSeq;
        const buf = img.data.slice(a * W * 4, b * W * 4).buffer;
        const out = await new Promise((res, rej) => { jobs[id] = { res, rej }; w.postMessage({ id, buf, w: W, h: b - a, s, at: { size, fullW: W, fullH: H, y0: a, bd } }, [buf]); });
        img.data.set(new Uint8ClampedArray(out, (y0 - a) * W * 4, (y1 - y0) * W * 4), y0 * W * 4);
        progress(++done / strips.length);
      }
    };
    try { await Promise.all(ws.map(run)); return img; }
    catch (e) { return apply(img, s, 1); }   // a worker could not run (memory, an old browser): the same work here
  }

  HT.enhance = { analyze, apply, applyFast, combine, histogram, PRESETS, KEYS, RANGE };

  // ---------------------------------------------------------------- the batch job (Download): each photo analysed on its own
  // opts: { preset, deltas: {key: change}, ai: 'off'|'restore'|'2x', format, quality, maxSide, targetKB, fastBatch }
  HT.engine('image-enhancer', async ctx => {
    await HT.loadScript('/assets/engine/image.js');
    const o = ctx.opts || {}, outs = [], rows = [], failures = [], fastBatch = !!o.fastBatch;
    HT.enhance.aiSkipped = 0;
    for (const [i, f] of ctx.files.entries()) {
      const label = ctx.files.length > 1 ? `${i + 1} of ${ctx.files.length}: ` : '';
      try {
        ctx.status(label + 'Reading the photo...'); await HT.tick();
        let c = await HT.img.load(f), mask = null;
        if (!fastBatch && o.studio) {   // Studio: preserve original product pixels and replace only the background
          const part = { status: ctx.status, progress: p => ctx.progress((i + p * 0.8) / ctx.files.length) };
          const S = await studioPrep(part, f, c, label); c = S.big; mask = S.mask;
        } else if (!fastBatch && o.ai && o.ai !== 'off') {   // the AI's own progress, as this photo's share of the whole batch
          const part = { status: ctx.status, progress: p => ctx.progress((i + p * 0.85) / ctx.files.length) };
          c = await aiRestore(part, c, o.ai, label);
        }
        const requestedMax = +o.maxSide || 0, max = fastBatch ? Math.min(requestedMax || 1600, 1600) : requestedMax;
        if (max && Math.max(c.width, c.height) > max) { const k = max / Math.max(c.width, c.height); c = HT.resample(c, c.width * k, c.height * k); }
        ctx.status(label + 'Enhancing...'); ctx.progress((i + 0.1) / ctx.files.length); await HT.tick();
        const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height);
        const ai = !fastBatch && !!(o.studio || (o.ai && o.ai !== 'off')), probe = probeOf(c), s = combine(analyze(probe.img, probe.scale), o.preset || 'auto', o.deltas || {}, ai);
        x.putImageData(mask ? studioFinish(img, mask) : await applyFast(img, s, p => ctx.progress((i + 0.1 + p * 0.8) / ctx.files.length)), 0, 0);
        ctx.status(label + 'Saving...'); await HT.tick();
        const fmt = pickFormat(o.format, f, HT.img.hasAlpha(c)), out = await encodeTo(c, fmt, +o.quality || 90, +o.targetKB || 0);
        outs.push({ name: HT.stem(f.name) + '_enhanced.' + (fmt === 'jpg' ? 'jpg' : fmt), blob: out });
        rows.push(`${f.name}: ${HT.fmtBytes(f.size)} → ${HT.fmtBytes(out.size)}`);
      } catch (e) {
        failures.push(`${f.name}: ${(e && e.message) || 'Could not process this image.'}`);
      }
      ctx.progress((i + 1) / ctx.files.length);
    }
    if (!outs.length) throw new Error(failures[0] || 'Could not process any of the selected images.');
    const skipped = HT.enhance.aiSkipped ? ` AI HD was skipped for ${HT.enhance.aiSkipped} photo(s) that are already high resolution.` : '';
    const failed = failures.length ? ` ${failures.length} photo(s) could not be processed: ${failures.slice(0, 3).join(' · ')}${failures.length > 3 ? ' · …' : ''}` : '';
    ctx.info = { summary: `Enhanced ${outs.length} of ${ctx.files.length} photo(s).` + (fastBatch ? ' Fast batch used; AI and Studio were skipped and outputs were capped at 1600 px.' : ' ' + rows.slice(0, 3).join(' · ')) + failed + skipped,
      failures: failures.map(x => x.split(': ', 1)[0]) };
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
    const max = (gpu ? { 1: 2048, 2: 2048, 4: 1024 } : { 1: 1280, 2: 1280, 4: 640 })[factor];
    if (Math.max(c.width, c.height) > max) { HT.enhance.aiSkipped = (HT.enhance.aiSkipped || 0) + 1; return c; }   // already large: AI would lose detail
    const src = c;
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
  // ---------------------------------------------------------------- Studio: preserve the product, replace the background
  // The AI only finds the product boundary. Its original pixels are kept; the background becomes white with a soft shadow.
  // Filling enclosed holes keeps the original scene visible through things such as tinted sunglass lenses.
  const studioCache = new Map();
  function studioPrep(ctx, file, full, label = '') {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (studioCache.has(key)) return studioCache.get(key);
    const p = (async () => {
      const gpu = await hasGPU(), side = gpu ? 1024 : 640, k = Math.min(1, side / Math.max(full.width, full.height));
      const src = k < 1 ? HT.resample(full, full.width * k, full.height * k) : full;
      await HT.loadScript('/assets/engine/ai.js');
      const msg = label + 'Studio: isolating the product while keeping its original pixels...';
      ctx.status(msg); ctx.progress(0);
      const cut = await HT.aiCutout({ status: t => ctx.status(/^Downloading/.test(t) ? label + t : msg), progress: p => ctx.progress(p) }, src, 'general');
      return { big: full, mask: studioMask(cut) };
    })();
    studioCache.set(key, p);
    p.catch(() => studioCache.delete(key));
    if (studioCache.size > 4) studioCache.delete(studioCache.keys().next().value);
    return p;
  }
  // the outline, cleaned: speckles in the background go, holes in a blurred edge close, edges stay soft
  function studioMask(cut) {
    const w = cut.width, h = cut.height, n = w * h, d = cut.getContext('2d').getImageData(0, 0, w, h).data, A = new Float32Array(n);
    for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3] / 255;
    // Remove tiny isolated segmentation specks while keeping substantial detached product parts.
    const outside = new Uint8Array(n), queue = new Int32Array(n); let tail = 0, largest = 0;
    const addForeground = i => { if (!outside[i] && A[i] >= 0.5) { outside[i] = 1; queue[tail++] = i; } };
    for (let i = 0; i < n; i++) if (A[i] >= 0.5 && !outside[i]) {
      const start = tail; addForeground(i);
      for (let head = start; head < tail; head++) {
        const j = queue[head], x = j % w, y = (j / w) | 0;
        if (x) addForeground(j - 1); if (x + 1 < w) addForeground(j + 1); if (y) addForeground(j - w); if (y + 1 < h) addForeground(j + w);
      }
      largest = Math.max(largest, tail - start);
    }
    outside.fill(0); tail = 0;
    const minKeep = Math.max(8, largest * 0.001);
    for (let i = 0; i < n; i++) if (A[i] >= 0.5 && !outside[i]) {
      const start = tail; addForeground(i);
      for (let head = start; head < tail; head++) {
        const j = queue[head], x = j % w, y = (j / w) | 0;
        if (x) addForeground(j - 1); if (x + 1 < w) addForeground(j + 1); if (y) addForeground(j - w); if (y + 1 < h) addForeground(j + w);
      }
      if (tail - start < minKeep) for (let j = start; j < tail; j++) A[queue[j]] = 0;
    }
    // Treat enclosed transparent regions as part of the product. This preserves the original scene through tinted lenses.
    outside.fill(0); tail = 0;
    const visit = i => { if (!outside[i] && A[i] < 0.5) { outside[i] = 1; queue[tail++] = i; } };
    for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
    for (let head = 0; head < tail; head++) {
      const i = queue[head], x = i % w, y = (i / w) | 0;
      if (x) visit(i - 1); if (x + 1 < w) visit(i + 1); if (y) visit(i - w); if (y + 1 < h) visit(i + w);
    }
    for (let i = 0; i < n; i++) if (!outside[i]) A[i] = 1;
    const B = blur(A, w, h, Math.max(2, Math.max(w, h) * 0.005)), out = HT.canvas(w, h), x = out.getContext('2d'), o = x.createImageData(w, h);
    for (let i = 0; i < n; i++) o.data[i * 4 + 3] = Math.max(smooth(0.3, 0.6, B[i]), smooth(0.85, 0.98, A[i])) * 255;
    x.putImageData(o, 0, 0);
    return out;
  }
  // Keep the original product colors, replace the rest with white, and cast a subtle shadow below the product.
  function studioFinish(img, mask) {
    const W = img.width, H = img.height, mw = mask.width, mh = mask.height;
    const md = mask.getContext('2d').getImageData(0, 0, mw, mh).data, n = mw * mh, A = new Float32Array(n);
    for (let i = 0; i < n; i++) A[i] = md[i * 4 + 3] / 255;
    const shadow = blur(A, mw, mh, Math.max(2, Math.max(mw, mh) * 0.014)), shift = Math.max(1, Math.max(mw, mh) * 0.008);
    const sample = (data, x, y) => {
      if (x < 0 || y < 0 || x > mw - 1 || y > mh - 1) return 0;
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, mw - 1), y1 = Math.min(y0 + 1, mh - 1), fx = x - x0, fy = y - y0;
      return (data[y0 * mw + x0] * (1 - fx) + data[y0 * mw + x1] * fx) * (1 - fy)
        + (data[y1 * mw + x0] * (1 - fx) + data[y1 * mw + x1] * fx) * fy;
    };
    const d = img.data;
    for (let y = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, j += 4) {
      const mx = (x + 0.5) * mw / W - 0.5, my = (y + 0.5) * mh / H - 0.5;
      const a = sample(A, mx, my) * (d[j + 3] / 255), s = sample(shadow, mx, my - shift) * 0.24, bg = 255 * (1 - s);
      d[j] = bg * (1 - a) + d[j] * a; d[j + 1] = bg * (1 - a) + d[j + 1] * a; d[j + 2] = bg * (1 - a) + d[j + 2] * a; d[j + 3] = 255;
    }
    return img;
  }
  HT.enhance.studioPrep = studioPrep; HT.enhance.studioMask = studioMask; HT.enhance.studioFinish = studioFinish;

  HT.enhance.sr4x = sr4x; HT.enhance.srWarm = srWarm; HT.enhance.hasGPU = hasGPU; HT.enhance.FACTOR = FACTOR;
  HT.enhance.aiRestore = aiRestore;
})();
