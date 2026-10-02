// Traces an image into SVG paths off the main thread (used by the image engine's "Image to SVG").
importScripts('/assets/vendor/img-codecs/imagetracer-1.2.6.js');
self.onmessage = e => {
  try {
    const { imgd, opts } = e.data;
    self.postMessage({ svg: ImageTracer.imagedataToSVG(imgd, Object.assign({ viewbox: true, desc: false }, opts)) });
  } catch (err) {
    self.postMessage({ error: 'Tracing failed: ' + ((err && err.message) || err) });
  }
};
