// Shared pdf.js helpers (loaded on demand by the PDF and OCR tools). pdf.js runs in the browser: files stay on the device.
(() => {
  const BASE = '/assets/vendor/pdfjs/';
  let lib = null;
  HT.pdf = {
    async lib() {
      if (!lib) { lib = await import(BASE + 'pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.mjs'; }
      return lib;
    },
    // open a File -> pdf.js document (friendly errors)
    async open(file) {
      const L = await HT.pdf.lib();
      const data = new Uint8Array(await file.arrayBuffer());
      try { return await L.getDocument({ data, wasmUrl: BASE + 'wasm/', standardFontDataUrl: BASE + 'standard_fonts/', isEvalSupported: false }).promise; }
      catch (e) {
        if (e && e.name === 'PasswordException') throw new Error('This PDF is password protected. Remove the password first with the "Unlock PDF" tool.');
        throw new Error("Couldn't read this PDF. It may be damaged.");
      }
    },
    // render page n (1-based) so that it is `width` CSS pixels wide (times the screen's pixel ratio, max 2x)
    async render(pdf, n, width, { dpr = Math.min(2, window.devicePixelRatio || 1) } = {}) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width * dpr) / base.width });
      const c = HT.canvas(vp.width, vp.height);
      await page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp }).promise;
      return { canvas: c, ratio: base.width / base.height, pageWidth: base.width, pageHeight: base.height };
    },
  };
})();
