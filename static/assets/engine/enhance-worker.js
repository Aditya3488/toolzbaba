// Image Enhancer: works on one strip of a large photo, or on a whole photo of a batch, so every processor core works at
// once (see applyFast and enhanceInWorker in engine/enhance.js). The first message names the engine to load. A strip
// comes with its settings and where it sits in the whole photo; a whole photo comes with a small copy, which is
// analysed here, and the look and changes to apply. The pixels come back the same size.
self.HT = { engine() {} };
let ready = false;
self.onmessage = ({ data: m }) => {
  if (m.type === 'init') { if (!ready) { importScripts(m.url); ready = true; } return; }
  try {
    const E = self.HT.enhance, img = new ImageData(new Uint8ClampedArray(m.buf), m.w, m.h);
    let out;
    if (m.whole) {
      const probe = new ImageData(new Uint8ClampedArray(m.probe.buf), m.probe.w, m.probe.h);
      out = E.apply(img, E.combine(E.analyze(probe, m.probe.scale), m.preset, m.deltas, m.ai), 1);
    } else out = E.apply(img, m.s, 1, m.at);
    self.postMessage({ id: m.id, buf: out.data.buffer }, [out.data.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, error: (e && e.message) || String(e) });
  }
};
