// Browser tests for the tools added from the SEO slug sheet (video-to-audio, split/merge audio, watermarks, redact, carousels ...).
//
//   cd tests && npm install ; python smoke_api.py     (once: creates tests/samples)
//   node browser_newtools.js                          (site running, e.g. BASE_URL=http://127.0.0.1:8200 after `python build.py`)
//   node browser_newtools.js audio pdf                (only tests whose name contains one of these words)
// Environment: BASE_URL (default http://127.0.0.1:8000), BROWSER_PATH (Chrome/Edge; auto-detected).
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const S = path.join(__dirname, 'samples') + '/';
const EXE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
const only = process.argv.slice(2).map(s => s.toLowerCase());
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  async function T(name, fn) {
    if (only.length && !only.some(o => name.toLowerCase().includes(o))) return;
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|couldn't find a face/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(46), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(46), String(e.message).split('\n').filter(Boolean)[0].slice(0, 300)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch {} }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); };
  const btn = (page, re) => page.getByRole('button', { name: re }).first();
  const field = (page, label) => page.locator('.field').filter({ has: page.locator('label.lbl', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }) }).first();
  const setOpts = async (page, opts) => { for (const [label, val] of Object.entries(opts)) { const f = field(page, label); const sel = f.locator('select'); if (await sel.count()) await sel.selectOption(String(val)); else { const i = f.locator('input,textarea').first(); await i.fill(String(val)); } } };
  // result of a "run" style tool: wait for the result box, then read the downloadable file
  const fetchResult = page => page.evaluate(async () => { const a = document.querySelector('.result a[download]'); const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); return { name: a.download, size: b.length, head: Array.from(b.slice(0, 12)), bytes: b.length < 3e6 ? Array.from(b) : null }; });
  const runTool = async (page, url, files, { opts = {}, button = /./, extra = null, timeout = 240000 } = {}) => {
    await go(page, url); await page.locator('input[type=file]').first().setInputFiles([].concat(files).map(f => S + f)); await page.waitForSelector('.file');
    if (opts && Object.keys(opts).length) await setOpts(page, opts);
    if (extra) await page.locator('input[type=file]').nth(1).setInputFiles(S + extra);
    await btn(page, button).click(); await page.waitForSelector('.result, .status.err', { timeout });
    if (await page.locator('.status.err').count()) throw new Error('tool error: ' + await page.locator('.status.err').innerText());
    return { text: (await page.locator('.result').innerText()).replace(/\s+/g, ' '), out: await fetchResult(page) };
  };
  const str = (b, a, n) => String.fromCharCode(...b.slice(a, n));
  // unzip (store/deflate) just enough to list names
  const zipNames = bytes => { const names = []; const b = Buffer.from(bytes); for (let i = 0; i < b.length - 30; i++) if (b.readUInt32LE(i) === 0x04034b50) { const n = b.readUInt16LE(i + 26), m = b.readUInt16LE(i + 28); names.push(b.toString('utf8', i + 30, i + 30 + n)); i += 29 + n + m; } return names; };

  // ---------------------------------------------------------------- video / audio
  await T('video-to-audio: mp4 -> mp3', async page => {
    const { text, out } = await runTool(page, '/video-to-audio', 'clip.mp4', { button: /^Get the audio/ });
    ex(/\.mp3$/.test(out.name) && (str(out.head, 0, 3) === 'ID3' || out.head[0] === 255), 'not an mp3: ' + out.name + ' ' + out.head); ex(out.size > 2000, 'tiny file'); return out.name + ' ' + out.size + ' B';
  });
  await T('video-to-audio: wav format', async page => {
    const { out } = await runTool(page, '/video-to-audio', 'clip.mp4', { opts: { 'Save the audio as': 'wav' }, button: /^Get the audio/ });
    ex(str(out.head, 0, 4) === 'RIFF' && /\.wav$/.test(out.name), 'not wav: ' + out.name); return out.name;
  });
  await T('mp4-to-mp3 page (variant): in-place tab + convert', async page => {
    await go(page, '/video-to-audio'); await page.evaluate(() => { window.__m = 1; });
    await page.locator('.vtabs').getByRole('tab', { name: 'MP4 to MP3', exact: true }).click(); await page.waitForURL('**/mp4-to-mp3'); await page.waitForFunction(() => document.title.includes('MP4 to MP3'));
    ex(await page.evaluate(() => window.__m === 1), 'reloaded');
    await page.waitForSelector('#app input[type=file]', { state: 'attached' }); await page.locator('input[type=file]').first().setInputFiles(S + 'clip.mp4'); await page.waitForSelector('.file');
    await btn(page, /^Convert 1 MP4 to MP3/).click(); await page.waitForSelector('.result, .status.err', { timeout: 240000 });
    ex(!(await page.locator('.status.err').count()), 'tool error'); const out = await fetchResult(page); ex(/\.mp3$/.test(out.name), out.name); return out.name;
  });
  await T('mp4-to-mp3: direct url has own tags', async page => {
    const r = await page.goto(BASE + '/mp4-to-mp3', { waitUntil: 'networkidle' }); ex(r.status() === 200, 'status ' + r.status());
    const info = await page.evaluate(() => ({ t: document.title, h1: document.querySelector('.thead h1').textContent, canon: document.querySelector('link[rel=canonical]').href, on: document.querySelector('.vtab.on')?.textContent })); ex(/MP4 to MP3/.test(info.t) && info.canon.endsWith('/mp4-to-mp3') && info.on === 'MP4 to MP3', JSON.stringify(info)); return info.t;
  });
  await T('split-video: every 2 seconds -> zip', async page => {
    const { text, out } = await runTool(page, '/split-video', 'clip.mp4', { opts: { 'Length of each part (seconds or mm:ss)': '2' }, button: /^Split video/ });
    ex(/\.zip$/.test(out.name) && out.bytes, 'not a zip: ' + out.name); const names = zipNames(out.bytes); ex(names.length >= 2 && names.every(n => /_part\d\d\.mp4$/.test(n)), names.join()); return names.join(', ');
  });
  await T('split-video: equal parts, accurate', async page => {
    const { out } = await runTool(page, '/split-video', 'clip.mp4', { opts: { 'Split': 'parts', 'Number of parts': '2', 'Cutting method': 'accurate' }, button: /^Split video/ });
    const names = out.bytes ? zipNames(out.bytes) : []; ex(names.length === 2, 'parts: ' + names.join()); return names.join(', ');
  });
  await T('split-audio: mp3 into parts', async page => {
    const { out } = await runTool(page, '/split-audio', 'tone.mp3', { opts: { 'What do you want?': 'length', 'Length of each part (seconds or mm:ss)': '2' }, button: /^Split audio/ });
    const names = zipNames(out.bytes); ex(names.length === 3 && names.every(n => /_part0\d\.mp3$/.test(n)), names.join()); return names.join(', ');
  });
  await T('split-audio: cut out one part (the old audio cutter)', async page => {
    const { out } = await runTool(page, '/split-audio', 'tone.mp3', { opts: { 'Start (seconds or mm:ss)': '1', 'End (seconds or mm:ss)': '3' }, button: /^Split audio/ });
    ex(/tone_cut\.mp3$/.test(out.name), out.name);
    const dur = await page.evaluate(async () => { const a = document.querySelector('.result a[download]'); return (await new AudioContext().decodeAudioData(await (await fetch(a.href)).arrayBuffer())).duration; }); ex(dur > 1.8 && dur < 2.3, 'length ' + dur.toFixed(2)); return `${out.name}, ${dur.toFixed(1)} s`;
  });
  await T('split-audio page has the Merge audio tab; old /audio-cutter redirects', async page => {
    const r = await page.request.get(BASE + '/audio-cutter', { maxRedirects: 0 }); ex([301, 302, 308].includes(r.status()) && (r.headers().location || '').endsWith('/split-audio'), 'redirect ' + r.status() + ' ' + r.headers().location);
    await go(page, '/split-audio'); const tabs = await page.$$eval('.vtab', a => a.map(x => x.textContent + '=' + x.getAttribute('href') + (x.classList.contains('on') ? '*' : ''))); ex(tabs.join() === 'Split audio=/split-audio*,Merge audio=/merge-audio', tabs.join()); return tabs.join(' | ');
  });
  await T('merge-audio: two files -> one', async page => {
    const { text, out } = await runTool(page, '/merge-audio', ['tone.mp3', 'tone.mp3'], { opts: { 'Silence between files (seconds)': '1' }, button: /^Merge 2 audio files/ });
    ex(/merged\.mp3$/.test(out.name), out.name);
    const dur = await page.evaluate(async () => { const a = document.querySelector('.result a[download]'); const ctx = new AudioContext(); const buf = await ctx.decodeAudioData(await (await fetch(a.href)).arrayBuffer()); return buf.duration; });
    ex(dur > 10.5 && dur < 12.5, 'merged length is ' + dur.toFixed(2) + ' s (two 5 s files + 1 s gap = about 11 s)'); return `${out.name} ${out.size} B, ${dur.toFixed(1)} s`;
  });
  await T('add-watermark-to-video: text', async page => {
    const { out } = await runTool(page, '/add-watermark-to-video', 'clip.mp4', { opts: { 'Text': 'Toolz Baba test' }, button: /^Add watermark/ });
    ex(/_watermarked\.mp4$/.test(out.name) && str(out.head, 4, 8) === 'ftyp', 'not mp4: ' + out.name); return out.name + ' ' + out.size + ' B';
  });
  await T('add-watermark-to-video: logo image', async page => {
    const { out } = await runTool(page, '/add-watermark-to-video', 'clip.mp4', { opts: { 'Watermark': 'image' }, button: /^Add watermark/, extra: 'icon.png' });
    ex(str(out.head, 4, 8) === 'ftyp', 'not mp4'); return out.name + ' ' + out.size + ' B';
  });

  // ---------------------------------------------------------------- PDF: watermark and redact
  // render a page of the result PDF (the link in the result box) with pdf.js and measure it
  const analyse = (page, pageNo = 1) => page.evaluate(async no => {
    await HT.loadScript('/assets/tools/pdf-helpers.js');
    const a = document.querySelector('.result a[download]'), blob = await (await fetch(a.href)).blob(), doc = await HT.pdf.open(new File([blob], 'r.pdf'));
    const r = await HT.pdf.render(doc, no, 400, { dpr: 1 }), c = r.canvas, x = c.getContext('2d'), W = c.width, H = c.height;
    const ink = (x0, y0, x1, y1) => { const d = x.getImageData(Math.round(x0 * W), Math.round(y0 * H), Math.round((x1 - x0) * W), Math.round((y1 - y0) * H)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++; return n; };
    const tc = await (await doc.getPage(no)).getTextContent();
    return { W, H, pages: doc.numPages, middle: ink(0.2, 0.35, 0.8, 0.65), corner: ink(0, 0.9, 0.1, 1), top: ink(0, 0, 1, 0.2), text: tc.items.map(i => i.str).join(' ') };
  }, pageNo);
  await T('add-watermark-to-pdf: text in the middle', async page => {
    const { text, out } = await runTool(page, '/add-watermark-to-pdf', 'other.pdf', { opts: { 'Text': 'DRAFT COPY', 'Opacity': '60' }, button: /^Add watermark/ });
    ex(/_watermarked\.pdf$/.test(out.name) && str(out.head, 0, 4) === '%PDF', out.name); const a = await analyse(page);
    ex(a.middle > 300, 'no watermark in the middle: ' + a.middle + ' dark pixels'); ex(a.corner === 0, 'the corner should stay white (' + a.corner + ')  - transparency lost?'); ex(/Second document/.test(a.text), 'original text gone: ' + a.text); return `${a.middle} watermark pixels in the middle, corner clean`;
  });
  await T('add-watermark-to-pdf: tiled on a range of pages', async page => {
    const { out } = await runTool(page, '/add-watermark-to-pdf', 'five.pdf', { opts: { 'Text': 'COPY', 'Position': 'tile', 'Size (% of the page width)': '30', 'Pages': '2-3' }, button: /^Add watermark/ });
    const p1 = await analyse(page, 1), p2 = await analyse(page, 2); ex(p2.top > p1.top + 150, `page 2 (${p2.top}) should have more ink at the top than page 1 (${p1.top})`); return `top-band ink: page 1 ${p1.top}, page 2 ${p2.top}`;
  });
  await T('add-watermark-to-pdf: logo image', async page => {
    const { out } = await runTool(page, '/add-watermark-to-pdf', 'other.pdf', { opts: { 'Watermark': 'image', 'Opacity': '80' }, button: /^Add watermark/, extra: 'icon.png' });
    const a = await analyse(page); ex(a.middle > 300, 'logo missing: ' + a.middle); ex(a.corner === 0, 'corner not clean'); return a.middle + ' logo pixels';
  });
  // redact: draw a box on the page preview
  const drawBox = async (page, [fx0, fy0, fx1, fy1]) => { await page.waitForSelector('.rdstage canvas', { state: 'visible' }); await page.waitForTimeout(500); const b = await page.locator('.rdstage canvas').boundingBox(); await page.mouse.move(b.x + fx0 * b.width, b.y + fy0 * b.height); await page.mouse.down(); await page.mouse.move(b.x + (fx0 + fx1) / 2 * b.width, b.y + (fy0 + fy1) / 2 * b.height, { steps: 4 }); await page.mouse.move(b.x + fx1 * b.width, b.y + fy1 * b.height, { steps: 4 }); await page.mouse.up(); };
  const openRedact = async (page, file) => { await go(page, '/blur-redact-pdf'); await page.locator('input[type=file]').first().setInputFiles(S + file); await page.waitForSelector('.rdstage canvas'); };
  await T('blur-redact-pdf: black box removes the text', async page => {
    await openRedact(page, 'five.pdf'); await drawBox(page, [0.06, 0.08, 0.9, 0.145]);
    ex(/1 area/.test(await page.locator('.setcard, .tside').innerText()), 'area not counted'); await btn(page, /^Redact and download/).click(); await page.waitForSelector('.result, .status.err', { timeout: 120000 });
    ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const a = await analyse(page, 1), b = await analyse(page, 2); ex(!/Page 1 of/.test(a.text), 'the text is still in the file: ' + a.text); ex(/Page 2 of/.test(b.text), 'other pages must keep their text'); ex(a.top > 400, 'no black box visible (' + a.top + ')');
    return `page 1 text now: "${a.text.trim()}"; page 2 text kept`;
  });
  await T('blur-redact-pdf: blur an image area', async page => {
    await openRedact(page, 'five.pdf'); await page.locator('select').first().selectOption('blur'); await drawBox(page, [0.12, 0.2, 0.8, 0.62]);
    const before = await page.evaluate(() => { const c = document.querySelector('.rdstage canvas'), x = c.getContext('2d'), W = c.width, H = c.height, d = x.getImageData(W * .2, H * .3, W * .5, H * .25).data; let s = 0, n = 0; const w = Math.round(W * .5); for (let i = 4; i < d.length; i += 4) { if ((i / 4) % w === 0) continue; s += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[i - 4] - d[i - 3] - d[i - 2]); n++; } return s / n; });
    await btn(page, /^Redact and download/).click(); await page.waitForSelector('.result, .status.err', { timeout: 120000 }); ex(!(await page.locator('.status.err').count()), 'error');
    const after = await page.evaluate(async () => { await HT.loadScript('/assets/tools/pdf-helpers.js'); const a = document.querySelector('.result a[download]'), doc = await HT.pdf.open(new File([await (await fetch(a.href)).blob()], 'r.pdf')), r = await HT.pdf.render(doc, 1, 400, { dpr: 1 }), x = r.canvas.getContext('2d'), W = r.canvas.width, H = r.canvas.height, d = x.getImageData(W * .2, H * .3, W * .5, H * .25).data; let s = 0, n = 0; const w = Math.round(W * .5); for (let i = 4; i < d.length; i += 4) { if ((i / 4) % w === 0) continue; s += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[i - 4] - d[i - 3] - d[i - 2]); n++; } return s / n; });
    ex(after < before * 0.6 && after > 0.3, `fine detail before ${before.toFixed(1)} after ${after.toFixed(1)}: should be much smoother but not blank`); return `fine detail ${before.toFixed(1)} -> ${after.toFixed(1)}`;
  });
  await T('blur-redact-pdf: areas on several pages', async page => {
    await openRedact(page, 'five.pdf'); await drawBox(page, [0.1, 0.1, 0.4, 0.2]); await btn(page, /Next/).click(); await page.waitForFunction(() => /Page 2 of 5/.test(document.body.innerText)); await drawBox(page, [0.1, 0.1, 0.4, 0.2]);
    ex(/2 areas marked \(1 on this page\)/.test(await page.locator('.tside').innerText()), 'count: ' + await page.locator('.tside').innerText());
    await page.locator('.rdx').first().click(); ex(/1 area marked \(0 on this page\)/.test(await page.locator('.tside').innerText()), 'remove failed'); return 'counts follow the pages';
  });

  // ---------------------------------------------------------------- carousels and palette
  const jpegSize = buf => { for (let i = 2; i < buf.length - 9;) { if (buf[i] !== 0xFF) { i++; continue; } const m = buf[i + 1]; if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + buf.readUInt16BE(i + 2); } return null; };
  const pdfPages = (page, bytes) => page.evaluate(async b => { await HT.loadScript('/assets/tools/pdf-helpers.js'); return (await HT.pdf.open(new File([new Uint8Array(b)], 'x.pdf'))).numPages; }, Array.from(bytes));
  await T('instagram-image-carousel-splitter: slides + seamless', async page => {
    await go(page, '/instagram-image-carousel-splitter'); await page.locator('input[type=file]').first().setInputFiles(S + 'wide.jpg'); await page.waitForSelector('.cpiece');
    const n = await page.locator('.cstrip .cpiece').count(); ex(n === 4, 'suggested ' + n + ' slides: a 3:1 picture at 1080x1350 per slide is 3.75 slides wide, so 4'); ex((await page.locator('.cgrid .cslide').count()) === n, 'grid count');
    const seam = await page.evaluate(() => { const p = [...document.querySelectorAll('.cstrip .cpiece')], col = (c, x) => c.getContext('2d').getImageData(x, 0, 1, c.height).data; const a = col(p[0], p[0].width - 1), b = col(p[1], 0); let d = 0, k = 0; for (let i = 0; i < a.length; i += 4) { d += Math.abs(a[i] - b[i]); k++; } return d / k; });
    ex(seam < 25, 'slides do not continue into each other (avg difference ' + seam.toFixed(1) + ')');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download all/ }).click()]); const buf = fs.readFileSync(await dl.path()); const names = zipNames(buf);
    ex(names.length === n && names.every((x, i) => new RegExp(`wide_slide_0${i + 1}\\.jpg$`).test(x)), names.join()); ex(/wide_carousel\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const [dl1] = await Promise.all([page.waitForEvent('download'), page.locator('.cgrid .cslide').first().click()]); const one = fs.readFileSync(await dl1.path()), dim = jpegSize(one); ex(dim && dim[0] === 1080 && dim[1] === 1350, 'slide size ' + dim);
    return `${n} slides, seam diff ${seam.toFixed(1)}, ${names[0]}, 1080x1350`;
  });
  await T('instagram splitter: count, square, contain', async page => {
    await go(page, '/instagram-image-carousel-splitter'); await page.locator('input[type=file]').first().setInputFiles(S + 'wide.jpg'); await page.waitForSelector('.cpiece');
    await setOpts(page, { 'Number of slides': '5', 'Slide size': '1080x1080', 'If the picture is not the same shape': 'contain' }); await page.waitForTimeout(500);
    ex((await page.locator('.cstrip .cpiece').count()) === 5, 'five slides expected'); ex(/5 slides of 1080 × 1080/.test(await page.locator('.tinfo').innerText()), await page.locator('.tinfo').innerText());
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.cgrid .cslide').nth(2).click()]); const dim = jpegSize(fs.readFileSync(await dl.path())); ex(dim[0] === 1080 && dim[1] === 1080, 'size ' + dim); return 'five square slides';
  });
  await T('linkedin-carousel-maker: sample, edit, PDF, PNG zip', async page => {
    await go(page, '/linkedin-carousel-maker'); await page.waitForSelector('.cthumb');
    ex((await page.locator('.cthumb').count()) === 5, 'the sample has 5 slides'); ex(/Slide 1 of 5/.test(await page.locator('.tinfo').innerText()), 'info');
    const ink = await page.evaluate(() => { const c = document.querySelector('.cbig'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]]; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) n++; return n; });
    ex(ink > 4000, 'the slide looks empty (' + ink + ' text pixels)');
    await page.locator('.cthumb').nth(2).click(); ex(/Slide 3 of 5/.test(await page.locator('.tinfo').innerText()), 'thumb click');
    await page.locator('textarea[aria-label=Slides]').fill('First slide\nHello there\n---\nSecond slide\n- one\n- two'); await page.waitForTimeout(600); ex((await page.locator('.cthumb').count()) === 2, 'two slides after editing');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /^Download PDF/ }).click()]); const buf = fs.readFileSync(await dl.path());
    ex(buf.slice(0, 4).toString() === '%PDF', 'not a pdf'); ex((await pdfPages(page, buf)) === 2, 'the PDF should have 2 pages');
    const [dz] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /^Download PNGs/ }).click()]); const names = zipNames(fs.readFileSync(await dz.path())); ex(names.join() === 'slide-01.png,slide-02.png', names.join());
    return `PDF ${buf.length} B with 2 pages; ${names.join(', ')}`;
  });
  await T('linkedin-carousel-maker: themes change the look', async page => {
    await go(page, '/linkedin-carousel-maker'); await page.waitForSelector('.cbig'); const px = () => page.evaluate(() => { const c = document.querySelector('.cbig'); return Array.from(c.getContext('2d').getImageData(5, c.height - 5, 1, 1).data.slice(0, 3)); });
    const a = await px(); await setOpts(page, { 'Look': 'clean' }); await page.waitForTimeout(400); const b = await px(); ex(a.join() !== b.join() && b[0] > 230, `corner ${a} -> ${b}`); return `corner pixel ${a} -> ${b}`;
  });
  await T('color-palette-generator: palettes and export', async page => {
    await go(page, '/color-palette-generator'); await page.waitForSelector('.pcolor');
    ex((await page.locator('.pcolor').count()) === 5, 'five colours'); const first = (await page.locator('.pcolor').first().innerText()).trim(); const d = [1, 3, 5].map(i => Math.abs(parseInt(first.slice(i, i + 2), 16) - parseInt('3B6CF6'.slice(i - 1, i + 1), 16))); ex(d.every(x => x <= 3), 'first colour should be the base: ' + first);
    ex((await page.locator('.pstep').count()) === 10, 'shade scale'); await setOpts(page, { 'Colour harmony': 'triadic', 'Number of colours': '3' }); await page.waitForTimeout(300);
    const hex = await page.locator('.pcolor').allInnerTexts(); ex(hex.length === 3, 'three triadic colours'); const hues = await page.evaluate(h => h.map(x => { const r = parseInt(x.slice(1, 3), 16) / 255, g = parseInt(x.slice(3, 5), 16) / 255, b = parseInt(x.slice(5), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; let hh = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; return Math.round(((hh * 60) + 360) % 360); }), hex.map(x => x.trim()));
    const gap = (a, b) => { const x = Math.abs(a - b) % 360; return Math.min(x, 360 - x); }; ex(Math.abs(gap(hues[0], hues[1]) - 120) < 6 && Math.abs(gap(hues[0], hues[2]) - 120) < 6, 'triadic hues ' + hues);
    await page.locator('input[type=text]').first().fill('#E5334A'); await page.waitForTimeout(400); const f2 = (await page.locator('.pcolor').first().innerText()).trim(); ex(f2.startsWith('#E5') || f2.startsWith('#E4') || f2.startsWith('#E6'), 'typing a HEX code did not change the palette: ' + f2);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download PNG/ }).click()]); const bb = fs.readFileSync(await dl.path()); ex(bb.slice(1, 4).toString() === 'PNG', 'not a png');
    return `triadic hues ${hues}, base ${f2}`;
  });

  // ---------------------------------------------------------------- AI headshot
  await T('ai-headshot-generator: framed, new background', async page => {
    const { text, out } = await runTool(page, '/ai-headshot-generator', 'face.jpg', { opts: { 'Background': 'dark', 'Size': '800' }, button: /^Make my headshot/ });
    ex(/_headshot\.jpg$/.test(out.name) && out.head.slice(0, 3).join() === '255,216,255', 'not a jpg: ' + out.name);
    const px = await page.evaluate(async () => { const a = document.querySelector('.result a[download]'), b = await createImageBitmap(await (await fetch(a.href)).blob()), c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d'); x.drawImage(b, 0, 0); const p = (u, v) => Array.from(x.getImageData(Math.round(u * b.width), Math.round(v * b.height), 1, 1).data.slice(0, 3)); return { w: b.width, h: b.height, corner: p(0.03, 0.03), centre: p(0.5, 0.5) }; });
    ex(px.w === 800 && px.h === 800, 'size ' + px.w + 'x' + px.h); ex(px.corner.every(v => v < 120), 'the dark background is missing: corner ' + px.corner);
    ex(/not a generated face|own photo/.test(text), 'summary should say it is the person\'s own photo'); return `${px.w}x${px.h}, corner ${px.corner}, centre ${px.centre}`;
  });
  await T('ai-headshot-generator: no face gives a clear message', async page => {
    await go(page, '/ai-headshot-generator'); await page.locator('input[type=file]').first().setInputFiles(S + 'icon.png'); await page.waitForSelector('.file'); await btn(page, /^Make my headshot/).click();
    await page.waitForSelector('.result, .status.err', { timeout: 240000 }); const msg = await page.locator('.status.err').innerText().catch(() => ''); ex(/couldn't find a face|could not find a face/i.test(msg) || /\bface\b/i.test(msg), 'message: ' + msg); return msg.slice(0, 80);
  });

  // ---------------------------------------------------------------- speech (models are served from /assets/models; first run loads them)
  const SPEECH = S + '_speech_en.wav';
  await T('text-to-audio: English voice speaks the text', async page => {
    await go(page, '/text-to-audio'); await page.locator('textarea[aria-label="Text to speak"]').fill('Hello world. This is a short test of the Toolz Baba voice. Thank you for listening.');
    await btn(page, /^Make audio/).click(); await page.waitForFunction(() => { const d = [...document.querySelectorAll('button')].find(b => /^Download speech/.test(b.textContent)); return (d && !d.disabled) || document.querySelector('.status.err'); }, null, { timeout: 420000 });
    ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const r = await page.evaluate(async () => { const a = document.querySelector('audio'), buf = await (await fetch(a.src)).arrayBuffer(); const ctx = new AudioContext(), d = await ctx.decodeAudioData(buf.slice(0)); let peak = 0; const ch = d.getChannelData(0); for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i])); return { dur: d.duration, rate: d.sampleRate, peak, bytes: Array.from(new Uint8Array(buf)) }; });
    ex(r.dur > 3 && r.dur < 15, 'duration ' + r.dur.toFixed(1)); ex(r.peak > 0.1, 'silent audio (peak ' + r.peak.toFixed(3) + ')'); fs.writeFileSync(SPEECH, Buffer.from(r.bytes));
    return `${r.dur.toFixed(1)} s at ${r.rate} Hz, peak ${r.peak.toFixed(2)}`;
  });
  await T('video-to-text: the speech comes back as text', async page => {
    ex(fs.existsSync(SPEECH), 'run the text-to-audio test first to create ' + SPEECH);
    await go(page, '/video-to-text'); await page.locator('input[type=file]').first().setInputFiles(SPEECH); await page.waitForSelector('.file');
    await setOpts(page, { 'Language spoken': 'english' }); await btn(page, /^Turn into text/).click();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label=Text]').value.length > 5 || document.querySelector('.status.err'), null, { timeout: 420000 });
    ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const t = (await page.locator('textarea[aria-label=Text]').inputValue()).toLowerCase(); ex(/hello/.test(t) && /(test|voice|listening)/.test(t), 'transcript: ' + t);
    const [d1] = await Promise.all([page.waitForEvent('download'), btn(page, /^\.srt/).click()]); const srt = fs.readFileSync(await d1.path(), 'utf8'); ex(/^1\n00:00:0\d,\d{3} --> /.test(srt.replace(/\r/g, '')), 'srt: ' + srt.slice(0, 80));
    const [d2] = await Promise.all([page.waitForEvent('download'), btn(page, /^\.vtt/).click()]); ex(fs.readFileSync(await d2.path(), 'utf8').startsWith('WEBVTT'), 'vtt header');
    return `"${t.trim().slice(0, 70)}"`;
  });
  await T('text-to-audio: Hindi voice + mp3', async page => {
    await go(page, '/text-to-audio'); await setOpts(page, { 'Voice': 'hin', 'Save as': 'mp3' }); await page.locator('textarea[aria-label="Text to speak"]').fill('नमस्ते दोस्तों, यह एक छोटा सा परीक्षण है।');
    await btn(page, /^Make audio/).click(); await page.waitForFunction(() => { const d = [...document.querySelectorAll('button')].find(b => /^Download speech\.mp3/.test(b.textContent)); return (d && !d.disabled) || document.querySelector('.status.err'); }, null, { timeout: 480000 });
    ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const r = await page.evaluate(async () => { const a = document.querySelector('audio'), buf = await (await fetch(a.src)).arrayBuffer(), d = await new AudioContext().decodeAudioData(buf.slice(0)); return { dur: d.duration, head: Array.from(new Uint8Array(buf).slice(0, 3)) }; });
    ex(r.dur > 1.5, 'duration ' + r.dur); ex(r.head[0] === 255 || (r.head[0] === 73 && r.head[1] === 68), 'not an mp3: ' + r.head); return `${r.dur.toFixed(1)} s mp3`;
  });

  await T('video-to-text: mp4 with the better model, SRT with timestamps', async page => {
    const MP4 = S + '_speech_en.mp4'; ex(fs.existsSync(MP4), 'missing ' + MP4 + ' (make it from _speech_en.wav with ffmpeg)');
    await go(page, '/video-to-text'); await page.locator('input[type=file]').first().setInputFiles(MP4); await page.waitForSelector('.file');
    await setOpts(page, { 'Accuracy': 'base' }); await btn(page, /^Turn into text/).click();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label=Text]').value.length > 5 || document.querySelector('.status.err'), null, { timeout: 600000 });
    ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const t = (await page.locator('textarea[aria-label=Text]').inputValue()).toLowerCase(); ex(/hello/.test(t) && /(short test|voice|listening)/.test(t), 'transcript: ' + t);
    ex(/words from \d+ seconds/.test(await page.locator('.tinfo').innerText()), await page.locator('.tinfo').innerText()); return `"${t.trim().slice(0, 70)}"`;
  });
  // ---------------------------------------------------------------- server-backed tools (Pages Functions + KV)
  await T('temporary-file-share: upload, link works, delete', async page => {
    await go(page, '/temporary-file-upload-direct-link-share'); page.on('dialog', d => d.accept());
    await page.locator('input[type=file]').first().setInputFiles(S + 'hello.txt'); await page.waitForSelector('.file');
    await setOpts(page, { 'Keep the link working for': '24' }); await btn(page, /^Upload 1 file/).click(); await page.waitForSelector('.sharerow input', { timeout: 60000 });
    const link = await page.locator('.sharerow input').first().inputValue(); ex(/\/f\/[A-Za-z0-9]{10}\/hello\.txt$/.test(link), 'link ' + link);
    const r = await page.evaluate(async l => { const x = await fetch(l); return { s: x.status, cd: x.headers.get('content-disposition'), t: (await x.text()).slice(0, 40) }; }, link);
    ex(r.s === 200 && /attachment; filename="hello\.txt"/.test(r.cd), JSON.stringify(r)); ex(/1 day|23 hours|24 hours|1 days/.test(await page.locator('.sharerow .help').first().innerText()), 'expiry text: ' + await page.locator('.sharerow .help').first().innerText());
    await page.getByRole('button', { name: 'Delete' }).first().click(); await page.waitForFunction(() => !document.querySelector('.sharerow')); const gone = await page.evaluate(async l => (await fetch(l, { cache: 'no-store' })).status, link); ex(gone === 404, 'after deleting the link should be 404, got ' + gone);
    return `${link} -> 200 -> deleted -> 404`;
  });
  await T('temporary-file-share: a program is refused', async page => {
    await go(page, '/temporary-file-upload-direct-link-share'); await page.locator('input[type=file]').first().setInputFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ fake') }); await page.waitForSelector('.file');
    await btn(page, /^Upload 1 file/).click(); await page.waitForSelector('.status.err', { timeout: 30000 }); const m = await page.locator('.status.err').innerText(); ex(/programs|can't be shared/i.test(m), m); return m.slice(0, 80);
  });
  await T('website-color-palette-extractor: reads a page', async page => {
    await go(page, '/website-color-palette-extractor'); await field(page, 'Website address').locator('input').fill(BASE + '/'); await btn(page, /^Get the colours/).click();
    await page.waitForFunction(() => document.querySelector('.pcolor') || document.querySelector('.status.err'), null, { timeout: 60000 }); ex(!(await page.locator('.status.err').count()), await page.locator('.status.err').innerText().catch(() => ''));
    const hexes = (await page.locator('.pcolor').allInnerTexts()).map(x => x.trim().toUpperCase()); ex(hexes.length >= 3, 'few colours: ' + hexes); ex(hexes.includes('#0A4FF5'), 'the site blue #0A4FF5 should be among them: ' + hexes);
    ex(/theme colour #0A4FF5/.test(await page.locator('.tinfo').innerText()), 'theme colour in the header'); ex(!hexes.includes('#FFFFFF'), 'white should be hidden by default');
    await page.getByLabel('Hide white, black and greys').uncheck(); await page.waitForTimeout(300); ex((await page.locator('.pcolor').allInnerTexts()).map(x => x.trim().toUpperCase()).includes('#FFFFFF'), 'white should show when the filter is off');
    return hexes.join(' ');
  });
  await T('website-color-palette-extractor: errors are clear', async page => {
    await go(page, '/website-color-palette-extractor'); await field(page, 'Website address').locator('input').fill('http://127.0.0.1:9/nothing'); await btn(page, /^Get the colours/).click();
    await page.waitForSelector('.status.err', { timeout: 60000 }); const m = await page.locator('.status.err').innerText(); ex(m.length > 10, m); return m.slice(0, 90);
  });

  // ---------------------------------------------------------------- the slug sheet: every address exists, the misspelt ones redirect
  await T('slug sheet: all new addresses exist with their own title', async page => {
    const slugs = ['/video-to-audio', '/mp4-to-mp3', '/split-video', '/split-audio', '/merge-audio', '/add-watermark-to-video', '/add-watermark-to-pdf', '/blur-redact-pdf',
      '/instagram-image-carousel-splitter', '/linkedin-carousel-maker', '/ai-headshot-generator', '/video-to-text', '/text-to-audio', '/color-palette-generator',
      '/website-color-palette-extractor', '/temporary-file-upload-direct-link-share'], titles = new Set();
    for (const u of slugs) { const r = await page.request.get(BASE + u); ex(r.status() === 200, u + ' -> ' + r.status()); const html = await r.text(); const t = (/<title>([^<]*)<\/title>/.exec(html) || [])[1]; ex(t && /Toolz Baba/.test(t), u + ' title: ' + t); ex(!titles.has(t), 'duplicate title ' + t); titles.add(t); ex(html.includes('rel="canonical"'), u + ' canonical'); }
    const sm = await (await page.request.get(BASE + '/sitemap.xml')).text(); for (const u of slugs) ex(sm.includes('https://toolzbaba.com' + u + '<'), 'sitemap misses ' + u);
    return slugs.length + ' pages, unique titles, all in the sitemap';
  });
  await T('slug sheet: the misspelt addresses redirect', async page => {
    const pairs = [['/instagram-image-carousel-spliter', '/instagram-image-carousel-splitter'], ['/color-paletter-generator', '/color-palette-generator'], ['/audio-to-text', '/video-to-text'], ['/text-to-speech', '/text-to-audio']];
    for (const [from, to] of pairs) { const r = await page.request.get(BASE + from, { maxRedirects: 0 }); ex([301, 302, 308].includes(r.status()) && (r.headers().location || '').endsWith(to), `${from} -> ${r.status()} ${r.headers().location}`); }
    return pairs.length + ' redirects';
  });
  await T('crop-image: 16:9 crop is downloaded at the right size', async page => {
    await go(page, '/crop-image'); await page.locator('input[type=file]').first().setInputFiles(S + 'big_photo.jpg'); await page.waitForSelector('.tab');
    await page.locator('.tab', { hasText: '16:9' }).click(); await page.waitForTimeout(300);
    const sel = await page.locator('.tinfo').innerText(); ex(/2000 × 1125/.test(sel), 'selection: ' + sel);
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Crop & download/).click()]); const dim = jpegSize(fs.readFileSync(await dl.path())); ex(dim && dim[0] === 2000 && dim[1] === 1125, 'size ' + dim); return sel;
  });

  // ---------------------------------------------------------------- tool families: the primary tool of a sheet row with its tabs (like Compress Image)
  const FAMILIES = {
    '/add-watermark-to-image': [['Image', '/add-watermark-to-image'], ['PDF', '/add-watermark-to-pdf'], ['Video', '/add-watermark-to-video']],
    '/pixelate-image': [['Image', '/pixelate-image'], ['PDF blur & redact', '/blur-redact-pdf']],
    '/photo-collage-maker': [['Photo collage', '/photo-collage-maker'], ['LinkedIn carousel', '/linkedin-carousel-maker'], ['Instagram carousel', '/instagram-image-carousel-splitter']],
    '/passport-size-photo-maker': [['Passport photo', '/passport-size-photo-maker'], ['AI headshot', '/ai-headshot-generator']],
    '/image-to-text': [['Image to text', '/image-to-text'], ['Video to text', '/video-to-text'], ['Text to audio', '/text-to-audio'], ['Video to audio', '/video-to-audio'], ['MP4 to MP3', '/mp4-to-mp3']],
    '/compress-video': [['Compress video', '/compress-video'], ['Split video', '/split-video']],
    '/split-audio': [['Split audio', '/split-audio'], ['Merge audio', '/merge-audio']],
    '/image-color-palette-extractor': [['From an image', '/image-color-palette-extractor'], ['Palette generator', '/color-palette-generator'], ['From a website', '/website-color-palette-extractor']],
    '/image-cdn': [['Image link', '/image-cdn'], ['Temporary file share', '/temporary-file-upload-direct-link-share']],
  };
  for (const [primary, tabs] of Object.entries(FAMILIES))
    await T('family ' + primary.replace('/', ''), async page => {
      await go(page, primary); const got = await page.$$eval('.vtab', a => a.map(x => [x.textContent, x.getAttribute('href'), x.classList.contains('on')]));
      ex(JSON.stringify(got.map(g => [g[0], g[1]])) === JSON.stringify(tabs), 'tabs ' + JSON.stringify(got)); ex(got[0][2] && got.filter(g => g[2]).length === 1, 'the primary tab should be lit');
      await page.evaluate(() => { window.__same = 1; }); const seen = [];
      for (const [label, href] of tabs.slice(1)) {
        await page.locator('.vtabs').getByRole('tab', { name: label, exact: true }).click(); await page.waitForURL('**' + href); await page.waitForFunction(l => document.querySelector('.vtab.on') && document.querySelector('.vtab.on').textContent === l, label);
        await page.waitForSelector('#app input, #app textarea, #app .drop, #app select', { timeout: 20000 }); await page.waitForFunction(h => document.querySelector('link[rel=canonical]').href.endsWith(h), href);
        const st = await page.evaluate(() => ({ same: window.__same === 1, h1: document.querySelector('.thead h1').textContent, title: document.title, canon: document.querySelector('link[rel=canonical]').href, seo: document.getElementById('seo').textContent.length, side: document.querySelectorAll('.sidecard').length }));
        ex(st.same, label + ': the page reloaded'); ex(st.canon.endsWith(href), label + ': canonical ' + st.canon); ex(/Toolz Baba/.test(st.title) && st.seo > 200 && st.side >= 2, label + ' ' + JSON.stringify(st)); seen.push(st.h1);
      }
      await page.locator('.vtabs').getByRole('tab', { name: tabs[0][0], exact: true }).click(); await page.waitForURL('**' + primary); ex(await page.evaluate(() => window.__same === 1), 'back to the primary reloaded');
      return seen.join(' | ');
    });
  await T('family pages open directly on their own address, with their tab lit', async page => {
    const bad = [];
    for (const tabs of Object.values(FAMILIES)) for (const [label, href] of tabs.slice(1)) {
      const r = await page.goto(BASE + href, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); const on = await page.evaluate(() => (document.querySelector('.vtab.on') || {}).textContent);
      if (r.status() !== 200 || on !== label) bad.push(`${href}: ${r.status()} tab "${on}" (wanted "${label}")`);
    }
    ex(!bad.length, bad.join('; ')); return '25 tab addresses open directly';
  });
  await T('search finds the tabs: "video to text" finds the Image to Text family', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('#list .tcard'); await page.fill('#q', 'video to text'); await page.waitForTimeout(300);
    const vis = await page.$$eval('#list .tcard:not(.hidden) b', b => b.map(x => x.textContent)); ex(vis.some(x => /Image to Text/i.test(x)), 'cards: ' + vis);
    await page.goto(BASE + '/compress-image', { waitUntil: 'networkidle' }); await page.locator('.hsearch input').focus(); await page.locator('.hsearch input').fill('merge audio'); await page.waitForSelector('.hres a');
    const links = await page.$$eval('.hres a', a => a.map(x => x.textContent + ' -> ' + x.getAttribute('href'))); ex(links.some(l => /Merge Audio.*-> \/merge-audio/.test(l)), 'header search: ' + links); return links[0];
  });

  // ---- NEW TESTS BELOW

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
