// Web Worker for AI HD (Image Enhancer): Real-ESRGAN (realesr-general-x4v3) enlarges 4x while removing blur, noise and
// JPEG blocks. It runs on the graphics card through WebGPU when the browser has it (often 10-50x faster), otherwise on the
// processor; either way in this worker, so the page never freezes.
// In:  {type: 'warm'} | {type: 'run', id, w, h, rgba: ArrayBuffer}
// Out: {type: 'ready', backend} | {type: 'progress', id, f} | {type: 'done', id, w, h, rgba: ArrayBuffer} | {type: 'error', id, msg}
const ORT = '/assets/vendor/onnxruntime-1.30.0/', MODEL = '/assets/models/realesr-general-x4v3.onnx', CACHE = 'tz-models-v1';
const TILE = 112, PAD = 8, S = TILE + 2 * PAD;   // the model takes exactly 128 x 128: 112 new pixels and 8 of context per side

async function cached(url) {   // the same cache the other AI tools use: a model downloaded once is not downloaded again
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return hit.arrayBuffer(); } catch (e) { /* private window */ }
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not download the AI model. Check your connection and try again.');
  if (cache) cache.put(url, r.clone()).catch(() => {});
  return r.arrayBuffer();
}

let ready = null;
async function start() {
  const model = new Uint8Array(await cached(MODEL));
  // 1. the graphics card, when there is one the browser lets us use
  if (self.navigator && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const ort = await import(ORT + 'ort.webgpu.min.mjs');
        ort.env.wasm.wasmPaths = ORT; ort.env.logLevel = 'error'; ort.env.wasm.numThreads = 1;
        // the runtime file is over the host's 25 MB limit, so it is stored in two parts and joined here
        const parts = await Promise.all(['part0', 'part1'].map(p => cached(ORT + 'ort-wasm-simd-threaded.asyncify.wasm.' + p)));
        const bin = new Uint8Array(parts[0].byteLength + parts[1].byteLength); bin.set(new Uint8Array(parts[0]), 0); bin.set(new Uint8Array(parts[1]), parts[0].byteLength);
        ort.env.wasm.wasmBinary = bin.buffer;
        const session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
        return { ort, session, backend: 'gpu' };
      }
    } catch (e) { /* no usable WebGPU: the processor below */ }
  }
  // 2. the processor
  const ort = await import(ORT + 'ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = ORT; ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  return { ort, session, backend: 'cpu' };
}

// RGBA (w x h) -> RGBA (4w x 4h)
async function upscale(rt, rgba, w, h, onTile) {
  const pw = Math.ceil(w / TILE) * TILE, ph = Math.ceil(h / TILE) * TILE, sw = pw + 2 * PAD, sh = ph + 2 * PAD;
  // a padded copy: mirrored edges (so border tiles have context), the last row and column repeated to fill the tile grid
  const src = new Float32Array(sw * sh * 3);
  const at = (x, y) => { x = x < 0 ? -x - 1 : x >= w ? w - 1 : x; y = y < 0 ? -y - 1 : y >= h ? h - 1 : y; return (y * w + x) * 4; };
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const s = at(x - PAD, y - PAD), d = (y * sw + x) * 3;
    src[d] = rgba[s] / 255; src[d + 1] = rgba[s + 1] / 255; src[d + 2] = rgba[s + 2] / 255;
  }
  const W4 = w * 4, H4 = h * 4, out = new Uint8ClampedArray(W4 * H4 * 4), n = S * S, R = S * 4, rn = R * R;
  const tiles = (pw / TILE) * (ph / TILE), input = rt.session.inputNames[0], t = new Float32Array(3 * n);
  let done = 0;
  for (let ty = 0; ty < ph; ty += TILE) for (let tx = 0; tx < pw; tx += TILE) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const s = ((ty + y) * sw + tx + x) * 3, d = y * S + x;
      t[d] = src[s]; t[n + d] = src[s + 1]; t[2 * n + d] = src[s + 2];
    }
    const res = await rt.session.run({ [input]: new rt.ort.Tensor('float32', t, [1, 3, S, S]) });
    const r = res[rt.session.outputNames[0]].data;
    for (let y = 0; y < TILE * 4; y++) {
      const oy = ty * 4 + y; if (oy >= H4) break;
      for (let x = 0; x < TILE * 4; x++) {
        const ox = tx * 4 + x; if (ox >= W4) break;
        const s = (y + PAD * 4) * R + x + PAD * 4, d = (oy * W4 + ox) * 4;
        out[d] = r[s] * 255 + 0.5; out[d + 1] = r[rn + s] * 255 + 0.5; out[d + 2] = r[2 * rn + s] * 255 + 0.5; out[d + 3] = 255;
      }
    }
    onTile(++done / tiles);
  }
  return { out, W4, H4 };
}

self.onmessage = async ({ data: m }) => {
  try {
    if (!ready) ready = start().catch(e => { ready = null; throw e; });
    const rt = await ready;
    if (m.type === 'warm') return postMessage({ type: 'ready', backend: rt.backend });
    const { out, W4, H4 } = await upscale(rt, new Uint8ClampedArray(m.rgba), m.w, m.h, f => postMessage({ type: 'progress', id: m.id, f }));
    postMessage({ type: 'done', id: m.id, w: W4, h: H4, rgba: out.buffer, backend: rt.backend }, [out.buffer]);
  } catch (e) {
    postMessage({ type: 'error', id: m.id, msg: (e && e.message) || 'The AI step failed.' });
  }
};
