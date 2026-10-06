// Two carousel tools, both in the browser: split one wide picture into seamless Instagram slides, and build a LinkedIn carousel (PDF + PNG slides) from text.
const $c = HT.el;

// ---------------------------------------------------------------- Instagram: one wide picture -> seamless slides
HT.register('instagram-image-carousel-splitter', root => {
  let bmp = null, file = null;
  const list = HT.fileList({ onChange: fs => { if (!fs.length) { bmp = file = null; sync(); } } });
  const dz = HT.dropzone({ accept: 'image/*,.heic,.heif,.avif', hint: 'One wide picture: a panorama, a banner, a long screenshot. Runs in your browser: nothing is uploaded.', onFiles: async fs => {
    try { bmp = await HT.loadBitmap(fs[0]); } catch (e) { return HT.toast(e.message); }
    file = fs[0]; list.add([fs[0]], false); suggest(); sync();
  } });
  const form = HT.form([
    { name: 'n', label: 'Number of slides', type: 'range', min: 2, max: 10, value: 3 },
    { name: 'size', label: 'Slide size', type: 'select', value: '1080x1350', options: [['1080x1350', 'Portrait 1080 × 1350 (4:5, most space)'], ['1080x1080', 'Square 1080 × 1080'], ['1080x566', 'Landscape 1080 × 566']] },
    { name: 'fit', label: 'If the picture is not the same shape', type: 'select', value: 'cover', options: [['cover', 'Fill the slides (crop the edges)'], ['contain', 'Show the whole picture']] },
    { name: 'bg', label: 'Background around the picture', type: 'select', value: 'blur', options: [['blur', 'Blurred copy of the picture'], ['#ffffff', 'White'], ['#000000', 'Black']], showIf: v => v.fit === 'contain' },
    { name: 'fmt', label: 'Save as', type: 'select', value: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG']] },
    { name: 'q', label: 'Quality', type: 'range', min: 60, max: 100, value: 95, unit: '%', showIf: v => v.fmt === 'jpg' },
  ], () => draw());
  const best = $c('button', { class: 'btn sec sm', type: 'button', text: 'Suggest the best number', onclick: () => { suggest(); draw(); } });
  const setCard = $c('div', { class: 'card hidden' }, HT.stepTitle(2, 'Slides'), form.el, $c('div', { class: 'actions', style: { marginTop: '4px' } }, best),
    $c('p', { class: 'help', style: { marginTop: '12px' }, text: 'The picture is cut into equal slides. Post them in order and the picture runs on as people swipe.' }));
  const strip = $c('div', { class: 'cstrip' }), grid = $c('div', { class: 'cgrid' }), info = $c('div', { class: 'tinfo' }), prog = HT.progress();
  const dl = $c('button', { class: 'btn', type: 'button', text: 'Download all (ZIP)', onclick: saveAll });
  const main = $c('div', { class: 'card tmain hidden' }, $c('div', { class: 'tbar' }, info, $c('div', { class: 'actions' }, dl)), $c('div', { class: 'help', text: 'The whole picture, with the cuts between slides:' }), strip, $c('div', { class: 'help', style: { margin: '14px 0 6px' }, text: 'Your slides (click one to download it on its own):' }), grid, prog.el);
  const bench = HT.bench([dz, list.el, setCard, prog.el], main); root.append(bench);

  const dims = v => v.size.split('x').map(Number);
  function suggest() { if (!bmp) return; const [sw, sh] = dims(form.values()); form.set('n', Math.max(2, Math.min(10, Math.round((bmp.width / bmp.height) * (sh / sw))))); }
  // slide i of n, at `scale` times its real size: the same big canvas is drawn each time, shifted so slide i is in view
  function slide(i, v, scale) {
    const [sw, sh] = dims(v), n = +v.n, CW = sw * n, CH = sh, c = HT.canvas(sw * scale, sh * scale), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high'; x.translate(-i * sw * scale, 0); x.scale(scale, scale);
    const W = bmp.width, H = bmp.height;
    if (v.fit === 'cover') { const s = Math.max(CW / W, CH / H); x.drawImage(bmp, (CW - W * s) / 2, (CH - H * s) / 2, W * s, H * s); }
    else {
      if (v.bg === 'blur') { const s = Math.max(CW / W, CH / H); x.filter = 'blur(40px)'; x.drawImage(bmp, (CW - W * s) / 2 - 40, (CH - H * s) / 2 - 40, W * s + 80, H * s + 80); x.filter = 'none'; }
      else { x.fillStyle = v.bg; x.fillRect(0, 0, CW, CH); }
      const s = Math.min(CW / W, CH / H); x.drawImage(bmp, (CW - W * s) / 2, (CH - H * s) / 2, W * s, H * s);
    }
    return c;
  }
  const mime = v => (v.fmt === 'png' ? ['image/png', 'png'] : ['image/jpeg', 'jpg']);
  function sync() { const on = !!bmp; setCard.classList.toggle('hidden', !on); main.classList.toggle('hidden', !on); bench.set(on); if (on) draw(); }
  let token = 0;
  function draw() {
    if (!bmp) return; const my = ++token, v = form.values(), n = +v.n, [sw, sh] = dims(v);
    info.textContent = `${n} slides of ${sw} × ${sh} px (${n * sw} × ${sh} px in all)`;
    strip.textContent = ''; grid.textContent = '';
    const sc = Math.min(1, 760 / (n * sw)), sc2 = Math.min(1, 220 / sw);
    for (let i = 0; i < n; i++) { const c = slide(i, v, sc); c.className = 'cpiece'; strip.append(c); }
    for (let i = 0; i < n; i++) {
      const c = slide(i, v, sc2), a = $c('button', { type: 'button', class: 'cslide', title: 'Download slide ' + (i + 1), onclick: async () => { const [m, ext] = mime(v); HT.download(await HT.encode(slide(i, v, 1), m, v.q / 100), `${HT.stem(file.name)}_slide_${String(i + 1).padStart(2, '0')}.${ext}`); } }, c, $c('span', { text: `Slide ${i + 1}` }));
      if (my === token) grid.append(a);
    }
  }
  async function saveAll() {
    const v = form.values(), n = +v.n, [m, ext] = mime(v), outs = []; dl.disabled = true;
    try {
      for (let i = 0; i < n; i++) { prog.set(i / n * 100, `Making slide ${i + 1} of ${n}...`); await HT.tick(); outs.push({ name: `${HT.stem(file.name)}_slide_${String(i + 1).padStart(2, '0')}.${ext}`, blob: await HT.encode(slide(i, v, 1), m, v.q / 100) }); }
      prog.clear(); HT.download(await HT.zip(outs), `${HT.stem(file.name)}_carousel.zip`); HT.toast(`Saved ${n} slides`);
    } catch (e) { prog.error(e.message); }
    dl.disabled = false;
  }
  return { list, accept: 'image/*' };
});

// ---------------------------------------------------------------- LinkedIn: text -> carousel slides (PDF + PNG)
const SAMPLE = `5 habits that made me a better developer
Small things, every day. Swipe to see them.
---
1. Read code, not just tutorials
- Open one good open-source project a week
- Ask: why did they write it this way?
---
2. Write it down
- Keep a short log of what you learned
- Explaining a thing is the fastest way to understand it
---
3. Ship small
- A tiny finished thing beats a big idea
- Share it, then improve it
---
Enjoyed this?
Follow for more, and repost to help a friend.`;
const THEMES = {
  midnight: { name: 'Midnight', bg: '#0f172a', bg2: '#1e293b', grad: true, text: '#f8fafc', accent: '#38bdf8' },
  clean: { name: 'Clean white', bg: '#ffffff', bg2: '#f1f5f9', grad: false, text: '#0f172a', accent: '#0a66c2' },
  linkedin: { name: 'LinkedIn blue', bg: '#0a66c2', bg2: '#004182', grad: true, text: '#ffffff', accent: '#ffd166' },
  sunset: { name: 'Sunset', bg: '#ff7a59', bg2: '#ffb347', grad: true, text: '#1f1306', accent: '#ffffff' },
  forest: { name: 'Forest', bg: '#0b3d2e', bg2: '#14532d', grad: true, text: '#ecfdf5', accent: '#86efac' },
  paper: { name: 'Warm paper', bg: '#fbf4e6', bg2: '#f3e7cc', grad: false, text: '#2b2118', accent: '#c2410c' },
};
HT.register('linkedin-carousel-maker', root => {
  let sel = 0, avatar = null, lastTheme = 'midnight', token = 0;
  const form = HT.form([
    { name: 'size', label: 'Slide size', type: 'select', value: '1080x1350', options: [['1080x1350', 'Portrait 1080 × 1350 (4:5)'], ['1080x1080', 'Square 1080 × 1080']] },
    { name: 'theme', label: 'Look', type: 'select', value: 'midnight', options: [...Object.entries(THEMES).map(([k, t]) => [k, t.name]), ['custom', 'Custom colours']] },
    { name: 'bg', label: 'Background', type: 'color', value: THEMES.midnight.bg },
    { name: 'grad', label: 'Fade to a second colour', type: 'checkbox', value: true },
    { name: 'bg2', label: 'Second colour', type: 'color', value: THEMES.midnight.bg2, showIf: v => v.grad },
    { name: 'text', label: 'Text colour', type: 'color', value: THEMES.midnight.text },
    { name: 'accent', label: 'Accent colour', type: 'color', value: THEMES.midnight.accent },
    { name: 'font', label: 'Font', type: 'select', value: 'sans', options: [['sans', 'Clean (sans-serif)'], ['serif', 'Classic (serif)'], ['mono', 'Code (monospace)']] },
    { name: 'name', label: 'Your name (top of every slide)', type: 'text', value: 'Your Name' },
    { name: 'handle', label: 'Handle or job title (optional)', type: 'text', value: '@yourhandle' },
    { name: 'nums', label: 'Show slide numbers (1/6)', type: 'checkbox', value: true },
    { name: 'swipe', label: 'Show "Swipe" on every slide except the last', type: 'checkbox', value: true },
  ], v => {
    if (v.theme !== lastTheme) { lastTheme = v.theme; const t = THEMES[v.theme]; if (t) { form.set('bg', t.bg); form.set('bg2', t.bg2); form.set('grad', t.grad); form.set('text', t.text); form.set('accent', t.accent); } }
    draw();
  });
  const avIn = $c('input', { type: 'file', accept: 'image/*', onchange: async e => { const f = e.target.files[0]; avatar = f ? await HT.loadBitmap(f).catch(() => null) : null; draw(); } });
  const text = $c('textarea', { rows: 16, 'aria-label': 'Slides', style: { minHeight: '260px', fontFamily: 'inherit' } }); text.value = SAMPLE;
  text.addEventListener('input', HT.debounce(() => { if (sel >= slides().length) sel = 0; draw(); }, 250));
  const textCard = $c('div', { class: 'card' }, HT.stepTitle(1, 'Your slides'), $c('div', { class: 'help', style: { margin: '-6px 0 8px' }, text: 'Separate slides with a line of ---. The first line of a slide is its title, the rest is the text. Start a line with - for a bullet.' }), text);
  const setCard = $c('div', { class: 'card', style: { marginTop: '12px' } }, HT.stepTitle(2, 'Look and feel'), form.el, $c('div', { class: 'field', style: { marginTop: '14px' } }, $c('label', { class: 'lbl', text: 'Your photo or logo (optional)' }), avIn));
  const info = $c('div', { class: 'tinfo' }), prog = HT.progress(), view = $c('div', { class: 'cview' }), thumbs = $c('div', { class: 'cthumbs' });
  const pdfBtn = $c('button', { class: 'btn', type: 'button', text: 'Download PDF', onclick: savePdf }), zipBtn = $c('button', { class: 'btn sec', type: 'button', text: 'Download PNGs (ZIP)', onclick: savePngs });
  const prev = $c('button', { class: 'btn sec sm', type: 'button', text: '◀', 'aria-label': 'Previous slide', onclick: () => go(-1) }), next = $c('button', { class: 'btn sec sm', type: 'button', text: '▶', 'aria-label': 'Next slide', onclick: () => go(1) });
  const main = $c('div', { class: 'card tmain' }, $c('div', { class: 'tbar' }, info, $c('div', { class: 'actions' }, pdfBtn, zipBtn)), $c('div', { class: 'tctl' }, $c('div', { class: 'actions', style: { margin: 0 } }, prev, next)), view, thumbs, prog.el);
  const bench = HT.bench([textCard, setCard], main); bench.classList.add('on'); root.append(bench);

  const slides = () => text.value.split(/^\s*---+\s*$/m).map(s => s.trim()).filter(Boolean).slice(0, 20).map(s => { const l = s.split('\n'); return { title: l[0].trim(), body: l.slice(1).join('\n').trim() }; });
  const go = d => { const n = slides().length; sel = (sel + d + n) % n; draw(); };
  const FONT = { sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Consolas, monospace' };
  const wrap = (x, t, maxW) => {
    const out = [];
    for (const para of t.split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = ''; for (const w of para.split(/\s+/)) { const tt = line ? line + ' ' + w : w; if (x.measureText(tt).width > maxW && line) { out.push(line); line = w; } else line = tt; }
      out.push(line);
    }
    return out;
  };
  const alpha = (hex, a) => { const h = /^#?([0-9a-f]{6})$/i.exec(hex)[1]; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4), 16)},${a})`; };
  // one slide, drawn on a 1080-unit-wide design and scaled to the canvas
  function render(i, list, v, width) {
    const [sw, sh] = v.size.split('x').map(Number), c = HT.canvas(width, Math.round(width * sh / sw)), x = c.getContext('2d'), k = width / sw, W = sw, H = sh, P = 90, n = list.length, sl = list[i];
    x.scale(k, k); const ff = FONT[v.font] || FONT.sans, first = i === 0, last = n > 1 && i === n - 1;
    if (v.grad) { const g = x.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, v.bg); g.addColorStop(1, v.bg2); x.fillStyle = g; } else x.fillStyle = v.bg;
    x.fillRect(0, 0, W, H);
    x.fillStyle = alpha(v.accent, 0.1); x.beginPath(); x.arc(W - 40, H - 120, 330, 0, 7); x.fill(); x.beginPath(); x.arc(-60, 120, 170, 0, 7); x.fill();
    // header: photo + name
    let hx = P;
    if (avatar) { x.save(); x.beginPath(); x.arc(P + 36, P + 36, 36, 0, 7); x.clip(); const s = Math.max(72 / avatar.width, 72 / avatar.height); x.drawImage(avatar, P + 36 - avatar.width * s / 2, P + 36 - avatar.height * s / 2, avatar.width * s, avatar.height * s); x.restore(); hx = P + 94; }
    x.textBaseline = 'alphabetic'; x.fillStyle = v.text; x.font = `700 34px ${ff}`; x.fillText((v.name || '').slice(0, 40), hx, P + (v.handle ? 30 : 48));
    if (v.handle) { x.fillStyle = alpha(v.text, 0.65); x.font = `400 27px ${ff}`; x.fillText(v.handle.slice(0, 50), hx, P + 66); }
    // content
    const top = 260, bottom = H - 170, maxW = W - 2 * P;
    const fit = (txt, start, min, weight, maxLines, lh) => { let px = start; for (; px >= min; px -= 2) { x.font = `${weight} ${px}px ${ff}`; if (wrap(x, txt, maxW).length * px * lh <= maxLines) return px; } return min; };
    const tPx = fit(sl.title, first || last ? 104 : 74, 36, 800, first || last ? 520 : 300, 1.15);
    x.font = `800 ${tPx}px ${ff}`; const tLines = wrap(x, sl.title, maxW), tH = tLines.length * tPx * 1.15;
    const bodyAvail = bottom - top - tH - 70, bPx = sl.body ? fit(sl.body.replace(/^[-•]\s+/gm, '   '), first || last ? 52 : 48, 24, 400, Math.max(bodyAvail, 100), 1.4) : 0;
    x.font = `400 ${bPx}px ${ff}`; const bLines = sl.body ? wrap(x, sl.body.replace(/^[-•]\s+/gm, '\u0001'), maxW - 40) : [], bH = bLines.length * bPx * 1.4;
    const total = tH + (sl.body ? 56 + bH : 0), startY = first || last ? top + Math.max(0, (bottom - top - total) / 2) : top;
    x.fillStyle = v.text; x.font = `800 ${tPx}px ${ff}`; tLines.forEach((l, j) => x.fillText(l, P, startY + tPx * 0.95 + j * tPx * 1.15));
    let y = startY + tH + 14; x.fillStyle = v.accent; x.fillRect(P, y, 110, 10); y += 56;
    x.font = `400 ${bPx}px ${ff}`;
    bLines.forEach(l => {
      y += bPx * 1.4 * 0.78; let tx = P, line = l;
      if (l.startsWith('\u0001')) { x.fillStyle = v.accent; x.beginPath(); x.arc(P + 12, y - bPx * 0.3, Math.max(5, bPx * 0.12), 0, 7); x.fill(); tx = P + 40; line = l.slice(1); }
      x.fillStyle = v.text; x.fillText(line, tx, y); y += bPx * 1.4 * 0.22;
    });
    // footer
    x.font = `600 28px ${ff}`; x.textBaseline = 'alphabetic';
    if (v.nums) { x.fillStyle = alpha(v.text, 0.6); x.textAlign = 'left'; x.fillText(`${i + 1} / ${n}`, P, H - 80); }
    if (v.swipe && !last) { x.fillStyle = v.accent; x.textAlign = 'right'; x.fillText('Swipe  →', W - P, H - 80); }
    x.textAlign = 'left'; return c;
  }
  function draw() {
    const list = slides(), v = form.values(); if (!list.length) { view.textContent = ''; thumbs.textContent = ''; info.textContent = 'Type some text for your slides.'; return; }
    if (sel >= list.length) sel = 0; const my = ++token;
    info.textContent = `Slide ${sel + 1} of ${list.length}`;
    view.textContent = ''; const big = render(sel, list, v, 760); big.className = 'cbig'; view.append(big);
    thumbs.textContent = ''; list.forEach((_, i) => { const t = render(i, list, v, 150); t.className = 'cthumb' + (i === sel ? ' on' : ''); t.addEventListener('click', () => { sel = i; draw(); }); if (my === token) thumbs.append(t); });
  }
  const files = async () => { const list = slides(), v = form.values(), out = []; for (let i = 0; i < list.length; i++) out.push(new File([await HT.encode(render(i, list, v, 1080), 'image/png')], `slide-${String(i + 1).padStart(2, '0')}.png`, { type: 'image/png' })); return out; };
  async function savePngs() {
    zipBtn.disabled = pdfBtn.disabled = true;
    try { prog.set(30, 'Drawing the slides...'); await HT.tick(); const fs = await files(); HT.download(await HT.zip(fs.map(f => ({ name: f.name, blob: f }))), 'linkedin-carousel.zip'); prog.clear(); HT.toast(`Saved ${fs.length} slides`); } catch (e) { prog.error(e.message); }
    zipBtn.disabled = pdfBtn.disabled = false;
  }
  async function savePdf() {
    zipBtn.disabled = pdfBtn.disabled = true;
    try {
      prog.set(10, 'Drawing the slides...'); await HT.tick(); const fs = await files();
      const { id } = await HT.upload('image-to-pdf', fs, { page: 'fit' }); const job = await HT.poll(id, s => prog.set(20 + (s.progress || 0) * 0.8, 'Making the PDF...'));
      HT.download(job.url, 'linkedin-carousel.pdf'); prog.clear(); HT.toast('PDF saved: upload it to LinkedIn as a document');
    } catch (e) { prog.error(e.message); }
    zipBtn.disabled = pdfBtn.disabled = false;
  }
  draw();
});
