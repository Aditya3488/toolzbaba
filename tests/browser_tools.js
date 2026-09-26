// Browser tests for the newer tools (image-to-KB, OCR, passport photo, visual PDF tools, audio/video, text utilities).
// They drive a real browser with playwright-core, so the whole page (UI + server) is exercised.
//
//   cd tests && npm install            (once: installs playwright-core, no browser download)
//   python tests/smoke_api.py          (once: creates the sample files in tests/samples)
//   node browser_tools.js              (app must be running)   |  node browser_tools.js pdf ocr   (only names containing these)
//
// Environment: BASE_URL (default http://127.0.0.1:8000), BROWSER_PATH (path to Chrome/Edge; auto-detected on Windows/macOS/Linux).
// tests/samples/face.jpg (any front-facing portrait) is needed for the passport test; without it that test is skipped.
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const CANDIDATES = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const EDGE = CANDIDATES.find(p => p && fs.existsSync(p));
if (!EDGE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const SAMPLES = path.join(__dirname, 'samples');
const only = process.argv.slice(2);
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  async function T(name, fn) {
    if (only.length && !only.some(o => name.toLowerCase().includes(o))) return;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|Parameter not found/.test(m.text())) errs.push('console: ' + m.text()); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(38), note || ''); pass++; }
    catch (e) { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); console.log('FAIL', name.padEnd(38), String(e.message).split('\n')[0].slice(0, 300)); fail++; try { await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch {} }
    await ctx.close();
  }
  const go = async (page, slug) => { await page.goto(`${BASE}/tool/${slug}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); };
  const feed = (page, files, idx = 0) => page.locator('input[type=file]').nth(idx).setInputFiles([].concat(files).map(f => path.join(SAMPLES, f)));
  const btn = (page, re) => page.getByRole('button', { name: re }).first();
  const resultText = async page => { await page.waitForSelector('.result', { timeout: 120000 }); return (await page.locator('.result').innerText()).replace(/\s+/g, ' ').slice(0, 140); };
  const capture = page => page.evaluate(() => { window.__dl = []; HT.download = (b, n) => window.__dl.push({ b, n }); });
  const clickDownload = page => page.evaluate(async () => { [...document.querySelectorAll('button')].find(b => b.textContent === 'Download').click(); await new Promise(r => setTimeout(r, 2500)); });

  // ------------------------------------------------------------------ image tools
  if (fs.existsSync(path.join(SAMPLES, 'face.jpg'))) await T('resize-image-to-kb: 200x230, 20-50 KB', async page => {
    await go(page, 'resize-image-to-kb'); await capture(page); await feed(page, 'face.jpg');
    await page.selectOption('select >> nth=0', 'photo-200x230'); await page.waitForTimeout(1800);
    await clickDownload(page);
    const r = await page.evaluate(async () => { const d = window.__dl[0], u = new Uint8Array(await d.b.arrayBuffer()), bm = await createImageBitmap(d.b); return { kb: d.b.size / 1024, w: bm.width, h: bm.height, name: d.n, units: u[13], dpi: (u[14] << 8) | u[15] }; });
    if (r.w !== 200 || r.h !== 230) throw new Error('size ' + r.w + 'x' + r.h);
    if (r.kb > 50.1 || r.kb < 20) throw new Error('kb ' + r.kb.toFixed(1));
    if (r.units !== 1 || r.dpi !== 200) throw new Error('dpi header ' + r.units + '/' + r.dpi);
    return `${r.w}x${r.h}px ${r.kb.toFixed(1)} KB ${r.dpi} DPI (${r.name})`;
  });
  await T('resize-image-to-kb: padded to min KB', async page => {
    await go(page, 'resize-image-to-kb'); await capture(page);
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#3366cc'; x.fillRect(0, 0, 300, 300); const b = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([b], 'flat.png', { type: 'image/png' })); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(800);
    await page.fill('input[placeholder="e.g. 20"]', '40'); await page.waitForTimeout(900);
    await clickDownload(page);
    const r = await page.evaluate(async () => { const d = window.__dl[0], bm = await createImageBitmap(d.b); return { kb: d.b.size / 1024, w: bm.width }; });
    if (r.kb < 39.9 || r.kb > 50.1) throw new Error('kb ' + r.kb.toFixed(1)); return r.kb.toFixed(1) + ' KB and still a valid image';
  });
  await T('image-to-text: English + Hindi', async page => {
    await go(page, 'image-to-text');
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 1000; c.height = 320; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1000, 320); x.fillStyle = '#000'; x.font = '64px Arial'; x.fillText('Toolz Baba OCR 2026', 30, 100); x.font = '64px "Nirmala UI", "Mangal", "Noto Sans Devanagari", sans-serif'; x.fillText('\u0928\u092e\u0938\u094d\u0924\u0947 \u0926\u0941\u0928\u093f\u092f\u093e', 30, 230);
      const b = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([b], 'text.png', { type: 'image/png' })); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500); await btn(page, /Extract text/).click();
    await page.waitForFunction(() => document.querySelector('textarea') && document.querySelector('textarea').value.length > 5, null, { timeout: 150000 });
    await page.waitForTimeout(500); const t = await page.locator('textarea').inputValue();
    if (!/Toolz/i.test(t)) throw new Error('English not read: ' + JSON.stringify(t));
    const hindi = /[\u0900-\u097F]/.test(t);
    return JSON.stringify(t.replace(/\s+/g, ' ').slice(0, 60)) + (hindi ? ' (Hindi detected)' : ' (no Devanagari found)');
  });
  if (fs.existsSync(path.join(SAMPLES, 'face.jpg'))) await T('passport-photo-maker (UI)', async page => {
    await go(page, 'passport-photo-maker'); await feed(page, 'face.jpg'); await page.selectOption('select >> nth=1', 'blue'); await btn(page, /Make passport photo/).click();
    return await resultText(page);
  });

  // ------------------------------------------------------------------ PDF tools
  await T('organize-pdf: rotate, delete, reorder', async page => {
    await go(page, 'organize-pdf'); await feed(page, 'five.pdf');
    await page.waitForFunction(() => document.querySelectorAll('.pcard canvas').length === 5, null, { timeout: 30000 });
    const cards = page.locator('.pcard');
    await cards.nth(1).locator('button[title="Rotate right"]').click();
    await cards.nth(2).getByRole('button', { name: 'Delete' }).click();
    await cards.nth(0).locator('button[title="Move later"]').click();
    const summary = await page.locator('.card .help').last().innerText();
    await btn(page, /Save new PDF/).click(); await resultText(page);
    const r = await page.evaluate(async () => { const href = document.querySelector('.result a[download]').href; const buf = await (await fetch(href)).arrayBuffer(); await HT.loadScript('/assets/tools/pdf-helpers.js'); const pdf = await HT.pdf.open(new File([buf], 'x.pdf')); const rot = [], texts = []; for (let i = 1; i <= pdf.numPages; i++) { const p = await pdf.getPage(i); rot.push(p.rotate); const tc = await p.getTextContent(); const m = tc.items.map(x => x.str).join(' ').match(/Page \d/); texts.push(m ? m[0] : null); } return { n: pdf.numPages, rot, texts }; });
    if (r.n !== 4) throw new Error('pages ' + r.n);
    if (JSON.stringify(r.texts) !== JSON.stringify(['Page 2', 'Page 1', 'Page 4', 'Page 5'])) throw new Error('order ' + r.texts);
    if (r.rot[0] !== 90 || r.rot[1] !== 0) throw new Error('rotation ' + r.rot);
    return `${summary} order=${r.texts.join(',')} rot=${r.rot.join(',')}`;
  });
  await T('sign-pdf: draw, place, sign', async page => {
    await go(page, 'sign-pdf'); await feed(page, 'five.pdf'); await page.waitForSelector('.sigpad');
    const b = await page.locator('.sigpad').boundingBox();
    await page.mouse.move(b.x + 40, b.y + b.height - 40); await page.mouse.down(); for (let i = 0; i <= 20; i++) await page.mouse.move(b.x + 40 + i * 12, b.y + b.height / 2 + Math.sin(i / 2) * 50); await page.mouse.up();
    await btn(page, /Use this signature/).click(); await page.waitForSelector('.sigbox.live', { timeout: 30000 });
    const box = await page.locator('.sigbox.live').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 260, { steps: 6 }); await page.mouse.up();
    await btn(page, /Add to this page/).click(); await page.waitForTimeout(400);
    await btn(page, /Next/).click(); await page.waitForTimeout(800); await btn(page, /Add to this page/).click();
    await page.waitForTimeout(900); const listText = await page.locator('.card .help').last().innerText();
    await btn(page, /Sign and save PDF/).click(); await resultText(page);
    const arr = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('.result a[download]').href)).arrayBuffer())));
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'sign_result.pdf'), Buffer.from(arr));
    return listText.slice(0, 70) + ' | result ' + arr.length + ' bytes';
  });
  await T('pdf-page-numbers (UI)', async page => { await go(page, 'pdf-page-numbers'); await feed(page, 'five.pdf'); await btn(page, /Add page numbers/).click(); return await resultText(page); });
  await T('protect-pdf: mismatch, then lock', async page => {
    await go(page, 'protect-pdf'); await feed(page, 'five.pdf'); const pw = page.locator('input[type=password]'); await pw.nth(0).fill('hunter22'); await pw.nth(1).fill('hunter23');
    await btn(page, /Protect PDF/).click(); await page.waitForSelector('.status.err'); const e1 = await page.locator('.status.err').innerText();
    if (!/not the same/.test(e1)) throw new Error('expected mismatch error, got ' + e1);
    await pw.nth(1).fill('hunter22'); await btn(page, /Protect PDF/).click(); return (await resultText(page)).slice(0, 80);
  });
  await T('unlock-pdf: wrong then right', async page => {
    await go(page, 'protect-pdf'); await feed(page, 'five.pdf'); const pw = page.locator('input[type=password]'); await pw.nth(0).fill('open-sesame'); await pw.nth(1).fill('open-sesame'); await btn(page, /Protect PDF/).click(); await page.waitForSelector('.result');
    const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('.result a[download]').href)).arrayBuffer())));
    await page.goto(`${BASE}/tool/unlock-pdf`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
    await page.locator('input[type=password]').fill('wrong-one'); await btn(page, /Remove password/).click(); await page.waitForSelector('.status.err'); const e = await page.locator('.status.err').innerText();
    if (!/not correct/.test(e)) throw new Error('got ' + e);
    await page.locator('input[type=password]').fill('open-sesame'); await btn(page, /Remove password/).click(); return await resultText(page);
  });

  // ------------------------------------------------------------------ audio / video
  await T('audio-cutter (UI)', async page => {
    await go(page, 'audio-cutter'); await feed(page, 'tone.mp3'); await page.waitForFunction(() => document.querySelector('video') && document.querySelector('video').duration > 1, null, { timeout: 15000 });
    const vals = await page.evaluate(() => [...document.querySelectorAll('input[type=text]')].map(i => i.value)); if (vals[1] !== '0:05.0') throw new Error('end not auto-filled: ' + vals);
    await page.locator('input[type=text]').nth(0).fill('1'); await page.locator('input[type=text]').nth(1).fill('3'); await btn(page, /Cut audio/).click(); const t = await resultText(page);
    if (!(await page.evaluate(() => !!document.querySelector('.result audio')))) throw new Error('no audio player in result'); return t;
  });
  await T('video-merger (UI)', async page => { await go(page, 'video-merger'); await feed(page, ['clip.mp4', 'clip2.mp4']); await btn(page, /Merge 2 videos/).click(); const t = await resultText(page); if (!(await page.evaluate(() => !!document.querySelector('.result video')))) throw new Error('no video'); return t; });
  await T('video-speed (UI)', async page => { await go(page, 'video-speed'); await feed(page, 'clip.mp4'); await btn(page, /Change speed/).click(); return await resultText(page); });

  // ------------------------------------------------------------------ text & developer
  await T('json-formatter', async page => {
    await go(page, 'json-formatter'); const [i, o] = await page.locator('textarea').all();
    await i.fill('{"a":1,\n "b":[1,2,}'); await page.waitForTimeout(500); const st = await page.locator('.status.err').innerText(); if (!/line 2/.test(st)) throw new Error('error location: ' + st);
    await i.fill('{"b":2,"a":{"y":1,"x":[1,2]}}'); await page.locator('label.chk').filter({ hasText: 'Sort keys' }).click(); await btn(page, /^Format$/).click();
    const out = await o.inputValue(); if (out.indexOf('"a"') > out.indexOf('"b"')) throw new Error('keys not sorted: ' + out); await btn(page, /Minify/).click();
    return await o.inputValue();
  });
  await T('word-counter', async page => {
    await go(page, 'word-counter'); await page.locator('textarea').fill('The quick brown fox. It jumps over the lazy dog!\n\nSecond paragraph here, quick quick.');
    await page.waitForTimeout(300); const txt = await page.locator('.sidecard').allInnerTexts(); const m = Object.fromEntries(txt.map(t => { const [v, l] = t.split('\n'); return [l, v]; }));
    if (m['Words'] !== '15' || m['Paragraphs'] !== '2' || m['Sentences'] !== '3') throw new Error(JSON.stringify(m)); const kw = await page.locator('.chip').first().innerText(); return `words=${m['Words']} sentences=${m['Sentences']} paragraphs=${m['Paragraphs']} top="${kw.replace(/\s+/g, ' ')}"`;
  });
  await T('case-converter', async page => {
    await go(page, 'case-converter'); const ta = page.locator('textarea'); const out = {};
    for (const n of ['UPPERCASE', 'Title Case', 'camelCase', 'snake_case', 'kebab-case', 'CONSTANT_CASE', 'Sentence case']) { await ta.fill('hello wORLD from toolz baba'); await btn(page, new RegExp('^' + n + '$')).click(); out[n] = await ta.inputValue(); }
    const want = { UPPERCASE: 'HELLO WORLD FROM TOOLZ BABA', 'Title Case': 'Hello World From Toolz Baba', camelCase: 'helloWorldFromToolzBaba', snake_case: 'hello_world_from_toolz_baba', 'kebab-case': 'hello-world-from-toolz-baba', CONSTANT_CASE: 'HELLO_WORLD_FROM_TOOLZ_BABA', 'Sentence case': 'Hello world from toolz baba' };
    for (const k in want) if (out[k] !== want[k]) throw new Error(k + ': ' + out[k]);
    await ta.fill('the lord of the rings'); await btn(page, /^Title Case$/).click(); if ((await ta.inputValue()) !== 'The Lord of the Rings') throw new Error('small words: ' + await ta.inputValue()); return 'all 7 conversions + small-word title case correct';
  });
  await T('password-generator', async page => {
    await go(page, 'password-generator'); const first = await page.locator('.linkrow input').all(); const pws = await Promise.all(first.map(i => i.inputValue()));
    if (pws.length !== 5 || pws.some(p => p.length !== 16) || new Set(pws).size !== 5) throw new Error(JSON.stringify(pws));
    if (!pws.every(p => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^a-zA-Z0-9]/.test(p))) throw new Error('missing a character class');
    const strength = await page.locator('.card .help').last().innerText(); return pws[0] + ' | ' + strength.slice(0, 40);
  });
  await T('hash-uuid-generator', async page => {
    await go(page, 'hash-uuid-generator'); const u = (await page.locator('textarea').first().inputValue()).split('\n'); if (u.length !== 5 || !u.every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x))) throw new Error('uuid v4 ' + u);
    await page.selectOption('select', '7'); await page.waitForTimeout(300); const u7 = (await page.locator('textarea').first().inputValue()).split('\n'); if (!u7.every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x))) throw new Error('uuid v7 ' + u7);
    await btn(page, /Hash text/).click(); await page.locator('textarea').nth(1).fill('abc'); await page.waitForTimeout(500); const vals = await page.locator('.linkrow input').evaluateAll(l => l.map(i => i.value));
    const exp = ['900150983cd24fb0d6963f7d28e17f72', 'a9993e364706816aba3e25717850c26c9cd0d89d', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']; for (const e of exp) if (!vals.includes(e)) throw new Error('missing hash ' + e);
    return 'v4/v7 valid; md5, sha1, sha256 of "abc" correct';
  });
  await T('url-encoder', async page => {
    await go(page, 'url-encoder'); const [i, o] = await page.locator('textarea').all(); await i.fill('name=Toolz Baba&city=\u0926\u093f\u0932\u094d\u0932\u0940/ok'); await page.getByRole('button', { name: 'Encode →', exact: true }).click(); const e = await o.inputValue();
    if (e !== 'name%3DToolz%20Baba%26city%3D%E0%A4%A6%E0%A4%BF%E0%A4%B2%E0%A5%8D%E0%A4%B2%E0%A5%80%2Fok') throw new Error(e);
    await i.fill(e); await page.getByRole('button', { name: '← Decode', exact: true }).click(); if ((await o.inputValue()) !== 'name=Toolz Baba&city=\u0926\u093f\u0932\u094d\u0932\u0940/ok') throw new Error('decode');
    await btn(page, /Take a URL apart/).click(); await page.locator('input[type=text]').fill('https://user@example.com:8080/a%20b/c?x=1&y=hello+world#top'); await page.waitForTimeout(300); const tbl = await page.locator('.ftable').first().innerText();
    if (!/example\.com/.test(tbl) || !/8080/.test(tbl) || !/a b\/c/.test(tbl)) throw new Error(tbl); return 'encode/decode/parse ok';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
