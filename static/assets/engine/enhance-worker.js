// Image Enhancer: works on one strip of a large photo, so every processor core works at once (see applyFast in
// engine/enhance.js). The first message names the engine to load; each next one is a strip: RGBA rows, the settings,
// and where the strip sits in the whole photo. The strip comes back the same size.
self.HT = { engine() {} };
let ready = false;
self.onmessage = ({ data: m }) => {
  if (m.type === 'init') { if (!ready) { importScripts(m.url); ready = true; } return; }
  try {
    const out = self.HT.enhance.apply(new ImageData(new Uint8ClampedArray(m.buf), m.w, m.h), m.s, 1, m.at);
    self.postMessage({ id: m.id, buf: out.data.buffer }, [out.data.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, error: (e && e.message) || String(e) });
  }
};
