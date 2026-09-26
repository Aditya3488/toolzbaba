// Image to Text (OCR) with tesseract.js running in the browser (English + Hindi). Nothing is uploaded.
const helpersReady = HT.loadScript('/assets/tools/pdf-helpers.js');
const TESS = '/assets/vendor/tesseract/';
const MAX_PDF_PAGES = 30;

HT.register('image-to-text', root => {
  const el = HT.el;
  const list = HT.fileList({ onChange: fs => { card.classList.toggle('hidden', !fs.length); run.disabled = !fs.length; } });
  const form = HT.form([
    { name: 'lang', label: 'Language in the picture', type: 'select', value: 'eng+hin', options: [['eng+hin', 'English + Hindi'], ['eng', 'English'], ['hin', 'Hindi']] },
    { name: 'enhance', label: 'Improve the scan first (grayscale + contrast)', type: 'checkbox', value: true, help: 'Helps with photos of paper. Turn it off for clean screenshots.' },
  ]);
  const prog = HT.progress(), out = el('textarea', { placeholder: 'The extracted text appears here...', style: { minHeight: '260px', fontFamily: 'inherit', fontSize: '.95rem' } }), meta = el('div', { class: 'help', style: { marginTop: '8px' } });
  const run = el('button', { class: 'btn', type: 'button', text: 'Extract text', disabled: true, onclick: go });
  const card = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Choose language'), form.el, el('div', { class: 'actions' }, run), prog.el);
  const outCard = el('div', { class: 'card hidden' }, HT.stepTitle(3, 'Your text'), out, meta,
    el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: 'Copy text', onclick: () => HT.copy(out.value) }),
      el('button', { class: 'btn sec', type: 'button', text: 'Download .txt', onclick: () => HT.download(new Blob([out.value], { type: 'text/plain;charset=utf-8' }), 'extracted-text.txt') }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Clear', onclick: () => { out.value = ''; outCard.classList.add('hidden'); } })));
  root.append(el('div', { class: 'notice', text: 'The first run loads the OCR engine and language data (a few MB) into your browser. After that it starts quickly.' }),
    HT.dropzone({ accept: 'image/*,.pdf,application/pdf', multiple: true, hint: 'Photos, screenshots or scanned PDFs (first ' + MAX_PDF_PAGES + ' pages of each PDF)', onFiles: fs => list.add(fs, true) }), list.el, card, outCard);

  let worker = null, workerLang = '';
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };
  async function getWorker(lang) {
    if (worker && workerLang === lang) return worker;
    if (worker) { await worker.terminate(); worker = null; }
    await HT.loadScript(TESS + 'tesseract.min.js');
    const label = { 'loading tesseract core': 'Loading the OCR engine...', 'loading language traineddata': 'Loading language data...', 'initializing api': 'Starting...' };
    worker = await Tesseract.createWorker(lang, 1, {
      workerPath: TESS + 'worker.min.js', corePath: TESS + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'), langPath: TESS + 'lang', gzip: true,
      logger: m => { if (label[m.status] && !current) prog.set(3 + (m.progress || 0) * 6, label[m.status]); else if (m.status === 'recognizing text' && current) prog.set(current.base + (m.progress || 0) * current.span, current.text); },
    });
    workerLang = lang; return worker;
  }
  let current = null;

  function prepare(src, enhance) { // -> canvas; optional grayscale + auto-contrast, and upscale of small pictures
    let w = src.width, h = src.height, scale = 1;
    if (Math.max(w, h) < 1200) scale = 1200 / Math.max(w, h); else if (Math.max(w, h) > 3200) scale = 3200 / Math.max(w, h);
    const c = HT.canvas(w * scale, h * scale), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
    if (enhance) {
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data, hist = new Uint32Array(256);
      for (let i = 0; i < a.length; i += 4) { const g = Math.round(a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114); a[i] = a[i + 1] = a[i + 2] = g; hist[g]++; }
      const total = a.length / 4; let lo = 0, hi = 255, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * .01) { lo = v; break; } } acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * .01) { hi = v; break; } }
      const span = Math.max(1, hi - lo);
      for (let i = 0; i < a.length; i += 4) { const g = Math.max(0, Math.min(255, Math.round((a[i] - lo) * 255 / span))); a[i] = a[i + 1] = a[i + 2] = g; }
      x.putImageData(d, 0, 0);
    }
    return c;
  }

  async function go() {
    const files = list.files.slice(), v = form.values(); if (!files.length) return;
    run.disabled = true; out.value = ''; outCard.classList.remove('hidden'); meta.textContent = '';
    try {
      prog.set(2, 'Preparing...');
      const w = await getWorker(v.lang);
      // build the list of pictures to read (images + pages of PDFs)
      const jobs = [];
      for (const f of files) {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          await helpersReady; const pdf = await HT.pdf.open(f); const n = Math.min(pdf.numPages, MAX_PDF_PAGES);
          for (let p = 1; p <= n; p++) jobs.push({ label: files.length > 1 || n > 1 ? `${f.name} – page ${p}` : f.name, get: async () => (await HT.pdf.render(pdf, p, 1500, { dpr: 1 })).canvas });
        } else jobs.push({ label: f.name, get: async () => HT.loadBitmap(f) });
      }
      const parts = []; let conf = 0, confN = 0;
      for (let i = 0; i < jobs.length; i++) {
        const label = jobs[i].label;
        current = { base: 10 + i / jobs.length * 88, span: 88 / jobs.length, text: `Reading ${jobs.length > 1 ? `${i + 1}/${jobs.length}` : 'the text'}...` };
        const canvas = prepare(await jobs[i].get(), v.enhance);
        const { data } = await w.recognize(canvas);
        const text = (data.text || '').trim(); conf += data.confidence || 0; confN++;
        parts.push(jobs.length > 1 ? `--- ${label} ---\n${text}` : text); out.value = parts.join('\n\n');
      }
      current = null; prog.clear();
      const words = (out.value.match(/\S+/g) || []).length;
      meta.textContent = words ? `${words} words · average confidence ${Math.round(conf / confN)}%. Check the text: OCR can misread blurry or unusual text.` : 'No text was found. Try a sharper, straighter picture or a different language.';
    } catch (e) { current = null; prog.error('Could not read this file: ' + e.message); }
    run.disabled = false;
  }
  addEventListener('pagehide', () => { if (worker) worker.terminate(); });
});
