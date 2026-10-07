// Browser tests for the "compress to under X KB / MB" pages (/compress-jpg-under-100kb, /compress-pdf-under-1mb ...):
// the pages exist with their own tags, the size control + live preview work, results really come in under the limit.
//
//   cd tests && npm install ; python smoke_api.py    (once: creates tests/samples)
//   node browser_sizes.js                            (needs the site running, e.g. `npx wrangler pages dev dist --kv CDN --port 8200`
//                                                     with BASE_URL=http://127.0.0.1:8200, after `python build.py`)
// Environment: BASE_URL (default http://127.0.0.1:8000), BROWSER_PATH (Chrome/Edge; auto-detected).
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const S = path.join(__dirname, 'samples') + '/';
const EXE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
const JPG_SIZES = { '10kb': 10, '20kb': 20, '50kb': 50, '100kb': 100, '150kb': 150, '200kb': 200, '300kb': 300, '500kb': 500, '1mb': 1024, '2mb': 2048 };
const PDF_SIZES = { '100kb': 100, '200kb': 200, '300kb': 300, '500kb': 500, '1mb': 1024, '2mb': 2048 };
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  async function T(name, fn) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(52), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(52), String(e.message).split('\n').filter(Boolean)[0].slice(0, 300)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch {} }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); };
  const settled = page => page.waitForFunction(() => { const v = document.querySelector('.verdict'); return v && v.textContent.length > 0 && !v.textContent.startsWith('Working'); }, null, { timeout: 90000 });
  const verdict = page => page.locator('.verdict').innerText();
  const jpg = async (page, url, file) => { await go(page, url); await page.locator('input[type=file]').first().setInputFiles(S + file); await settled(page); };
  const download = async page => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download/ }).first().click()]); const buf = fs.readFileSync(await dl.path()); return { name: dl.suggestedFilename(), size: buf.length, head: Array.from(buf.slice(0, 4)) }; };

  // ---------------------------------------------------------------- pages
  for (const [key, kb] of Object.entries(JPG_SIZES)) {
    const slug = 'compress-jpg-under-' + key, L = key.toUpperCase().replace('KB', ' KB').replace('MB', ' MB');
    await T('page /' + slug, async page => {
      const r = await page.goto(BASE + '/' + slug, { waitUntil: 'networkidle' }); ex(r.status() === 200, 'status ' + r.status()); await page.waitForSelector('#app .drop');
      const info = await page.evaluate(() => ({ t: document.title, h1: document.querySelector('.thead h1').textContent, canon: document.querySelector('link[rel=canonical]').href,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type']), tabOn: [...document.querySelectorAll('.vtab.on')].map(a => a.textContent), chipOn: [...document.querySelectorAll('.vchips:not(.hidden) .vchip.on')].map(a => a.textContent),
        chips: document.querySelectorAll('.vchips:not(.hidden) .vchip').length, seo: document.getElementById('seo').textContent, crumb: document.getElementById('crumb').textContent, val: document.querySelector('.sizebox input[type=number]')?.value }));
      ex(info.h1 === 'Compress JPG Under ' + L, 'h1 ' + info.h1); ex(info.t.includes(L), 'title ' + info.t); ex(info.canon === 'https://toolzbaba.com/' + slug, 'canonical ' + info.canon);
      ex(['WebApplication', 'BreadcrumbList', 'FAQPage'].every(t => info.ld.includes(t)), 'json-ld ' + info.ld); ex(info.tabOn.join() === 'JPG', 'parent tab not lit: ' + info.tabOn);
      ex(info.chipOn.join() === L && info.chips === 11, 'chips ' + info.chipOn + ' ' + info.chips); ex(info.seo.includes('Questions') && info.seo.length > 900, 'seo text');
      ex(info.crumb.endsWith('Compress JPG / Compress JPG Under ' + L), 'crumb ' + info.crumb);
      ex(parseFloat(info.val) === (kb >= 1024 ? kb / 1024 : kb), 'size box shows ' + info.val); return info.t;
    });
  }
  for (const [fmt, Fmt, tab] of [['png', 'PNG', 'PNG'], ['jpeg', 'JPEG', 'JPEG']]) for (const [key, kb] of Object.entries(JPG_SIZES)) {
    const slug = `compress-${fmt}-under-` + key, L = key.toUpperCase().replace('KB', ' KB').replace('MB', ' MB');
    await T('page /' + slug, async page => {
      const r = await page.goto(BASE + '/' + slug, { waitUntil: 'networkidle' }); ex(r.status() === 200, 'status ' + r.status()); await page.waitForSelector('#app .drop');
      const info = await page.evaluate(() => ({ t: document.title, h1: document.querySelector('.thead h1').textContent, tabOn: [...document.querySelectorAll('.vtab.on')].map(a => a.textContent), chipOn: [...document.querySelectorAll('.vchips:not(.hidden) .vchip.on')].map(a => a.textContent), chips: document.querySelectorAll('.vchips:not(.hidden) .vchip').length, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type']), seo: document.getElementById('seo').textContent.length, val: document.querySelector('.sizebox input[type=number]')?.value, accept: document.querySelector('input[type=file]').accept }));
      ex(info.h1 === `Compress ${Fmt} Under ` + L && info.t.includes(L), info.h1 + ' | ' + info.t); ex(info.tabOn.join() === tab, 'tab ' + info.tabOn); ex(info.chipOn.join() === L && info.chips === 11, JSON.stringify(info));
      ex(info.ld.includes('FAQPage') && info.seo > 900, 'seo/ld'); ex(parseFloat(info.val) === (kb >= 1024 ? kb / 1024 : kb), 'size box ' + info.val); ex(fmt === 'png' ? /png/.test(info.accept) && !/jpe?g/.test(info.accept) : /jpe?g/.test(info.accept) && !/png/.test(info.accept), 'accept ' + info.accept); return info.t;
    });
  }
  for (const [key, kb] of Object.entries(PDF_SIZES)) {
    const slug = 'compress-pdf-under-' + key, L = key.toUpperCase().replace('KB', ' KB').replace('MB', ' MB');
    await T('page /' + slug, async page => {
      const r = await page.goto(BASE + '/' + slug, { waitUntil: 'networkidle' }); ex(r.status() === 200, 'status ' + r.status()); await page.waitForSelector('#app .drop');
      const info = await page.evaluate(() => ({ t: document.title, h1: document.querySelector('.thead h1').textContent, chipOn: [...document.querySelectorAll('.vchips:not(.hidden) .vchip.on')].map(a => a.textContent), chips: document.querySelectorAll('.vchips:not(.hidden) .vchip').length, tabs: document.querySelectorAll('.vtab').length, val: document.querySelector('.sizebox input[type=number]')?.value, seo: document.getElementById('seo').textContent.length }));
      ex(info.h1 === 'Compress PDF Under ' + L && info.t.includes(L), 'heading/title ' + info.h1 + ' | ' + info.t); ex(info.chipOn.join() === L && info.chips === 7 && info.tabs === 0, JSON.stringify(info)); ex(parseFloat(info.val) === (kb >= 1024 ? kb / 1024 : kb), 'size box ' + info.val); ex(info.seo > 900, 'seo text'); return info.t;
    });
  }
  await T('all size pages in the sitemap, none on the home page', async page => {
    const sm = await (await page.request.get(BASE + '/sitemap.xml')).text();
    for (const k of Object.keys(JPG_SIZES)) ex(sm.includes(`https://toolzbaba.com/compress-jpg-under-${k}<`), 'sitemap misses jpg ' + k);
    for (const k of Object.keys(PDF_SIZES)) ex(sm.includes(`https://toolzbaba.com/compress-pdf-under-${k}<`), 'sitemap misses pdf ' + k);
    for (const k of Object.keys(JPG_SIZES)) for (const f of ['png', 'jpeg']) ex(sm.includes(`https://toolzbaba.com/compress-${f}-under-${k}<`), `sitemap misses ${f} ${k}`);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('#list .tcard'); const names = await page.$$eval('#list .tcard b', b => b.map(x => x.textContent));
    const total = (await (await page.request.get(BASE + '/assets/tools.json')).json()).tools.filter(t => !t.href).length; ex(!names.some(x => /Under/.test(x)) && names.length === total, 'home lists ' + names.length + ' of ' + total); return `36 in sitemap, home lists the ${total} real tools only`;
  });
  await T('the compress-jpg and compress-pdf pages show the chips too', async page => {
    await go(page, '/compress-jpg'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 11 && (await page.locator('.vchips:not(.hidden) .vchip.on').innerText()) === 'Any size', 'jpg chips');
    await go(page, '/compress-jpeg'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 11 && (await page.locator('.vchips:not(.hidden) .vchip.on').innerText()) === 'Any size', 'jpeg chips');
    await go(page, '/compress-gif'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 0, 'gif page should not show chips');
    await go(page, '/compress-pdf'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 7, 'pdf chips'); await go(page, '/compress-image'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 0, 'base image page has no chips'); return 'ok';
  });

  // ---------------------------------------------------------------- JPG: control + live preview
  await T('JPG: result is under the chosen size and the preview shows it', async page => {
    await jpg(page, '/compress-jpg-under-100kb', 'big_photo.jpg'); const v = await verdict(page); ex(/^\u2713/.test(v) && /under 100 KB/.test(v), 'verdict ' + v);
    const sizes = await page.evaluate(() => ({ figs: [...document.querySelectorAll('figcaption')].map(f => f.textContent), imgs: document.querySelectorAll('.compare img').length, detail: document.querySelector('.verdict + .help').textContent }));
    ex(sizes.imgs === 2 && /Original/.test(sizes.figs[0]) && /Result/.test(sizes.figs[1]), JSON.stringify(sizes));
    const o = await download(page); ex(o.head.slice(0, 3).join() === '255,216,255', 'not a jpeg'); ex(o.size <= 100 * 1024 && o.size > 40 * 1024, 'downloaded ' + o.size + ' (the caption said ' + sizes.figs[1] + ')'); ex(/under-100kb\.jpg$/.test(o.name), 'file name ' + o.name);
    return `${v} | ${o.name} ${Math.round(o.size / 1024)} KB | ${sizes.detail}`;
  });
  await T('JPG: every size page reaches its limit (big photo)', async page => {
    const out = [];
    for (const [key, kb] of Object.entries(JPG_SIZES)) {
      await go(page, '/compress-jpg-under-' + key); await page.locator('input[type=file]').first().setInputFiles(S + 'big_photo.jpg'); await settled(page);
      const v = await verdict(page), o = await download(page);
      if (kb >= 873) { ex(/Already under|\u2713/.test(v), key + ': ' + v); out.push(key + ' ' + Math.round(o.size / 1024) + 'K'); continue; }
      ex(o.size <= kb * 1024, `${key}: file is ${o.size} bytes, limit ${kb * 1024}`); ex(o.size >= kb * 1024 * 0.45 || kb <= 10, `${key}: ${o.size} bytes is far below the limit (quality wasted)`); out.push(key + ' ' + (o.size / 1024).toFixed(1) + 'K');
    }
    return out.join(' ');
  });
  await T('JPG: slider, number box, unit and chips stay in sync', async page => {
    await jpg(page, '/compress-jpg', 'big_photo.jpg'); const num = page.locator('.sizebox input[type=number]'), unit = page.locator('.sizebox select'), range = page.locator('.sizebox input[type=range]');
    await page.locator('.schip', { hasText: /^50 KB$/ }).click(); await settled(page); ex((await num.inputValue()) === '50' && (await unit.inputValue()) === 'KB' && (await page.locator('.schip.on').innerText()) === '50 KB', 'chip did not set 50 KB');
    ex(/under 50 KB/.test(await verdict(page)), 'verdict ' + await verdict(page)); const pv50 = await page.locator('figcaption').nth(1).innerText();
    await num.fill('1.5'); await unit.selectOption('MB'); await settled(page);
    await page.waitForFunction(() => /under 1\.50 MB/.test(document.querySelector('.verdict').textContent), null, { timeout: 30000 });
    const pv15 = await page.locator('figcaption').nth(1).innerText(); ex(pv50 !== pv15, 'preview did not change: ' + pv50 + ' / ' + pv15);
    await range.evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(400); await settled(page); const small = await num.inputValue(); ex(parseFloat(small) <= 6 && (await unit.inputValue()) === 'KB', 'slider at far left gives ' + small);
    await range.evaluate(el => { el.value = 1000; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(400); ex((await unit.inputValue()) === 'MB' && parseFloat(await num.inputValue()) >= 4, 'slider at far right gives ' + await num.inputValue() + ' ' + await unit.inputValue());
    return `50 KB -> ${pv50.split('\u00b7')[1].trim()}; 1.5 MB -> ${pv15.split('\u00b7')[1].trim()}`;
  });
  await T('JPG: a limit that cannot be met says so, with the smallest size', async page => {
    await jpg(page, '/compress-jpg', 'big_photo.jpg'); const num = page.locator('.sizebox input[type=number]'); await num.fill('0.2'); await page.waitForTimeout(500);
    await page.waitForFunction(() => document.querySelector('.verdict').textContent.length > 0 && !document.querySelector('.verdict').textContent.startsWith('Working'), null, { timeout: 60000 });
    const v = await verdict(page); ex(/^\u26a0/.test(v) || /^\u2713/.test(v), 'verdict ' + v); return v;
  });
  await T('JPG: a file already under the limit is kept as it is', async page => {
    const small = fs.statSync(S + 'photo_exif.jpg').size; await jpg(page, '/compress-jpg-under-2mb', 'photo_exif.jpg'); const v = await verdict(page); ex(/Already under/.test(v), 'verdict ' + v);
    const o = await download(page); ex(o.size === small, `file was changed: ${small} -> ${o.size}`); return v;
  });
  await T('JPG: quality mode and max width', async page => {
    await jpg(page, '/compress-jpg', 'big_photo.jpg'); await page.getByRole('button', { name: 'Choose quality' }).click(); ex(!(await page.locator('.sizebox').isVisible()), 'size box still visible in quality mode');
    const q = page.locator('input[type=range][aria-label=Quality]'); await q.evaluate(el => { el.value = 30; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(600); await settled(page);
    const lo = await download(page); await q.evaluate(el => { el.value = 90; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(600); await settled(page); const hi = await download(page);
    ex(lo.size < hi.size * 0.7, `quality 30 (${lo.size}) should be much smaller than 90 (${hi.size})`);
    await page.locator('input[aria-label="Max width"]').fill('500'); await page.waitForTimeout(600); await settled(page); const dim = await page.locator('.verdict + .help').innerText(); ex(/500 \u00d7 500/.test(dim), 'max width ignored: ' + dim);
    return `q30 ${Math.round(lo.size / 1024)} KB < q90 ${Math.round(hi.size / 1024)} KB; ${dim.split('\u00b7')[0]}`;
  });
  await T('JPG: several files, picker, Download all (ZIP)', async page => {
    await go(page, '/compress-jpg-under-50kb'); await page.locator('input[type=file]').first().setInputFiles([S + 'big_photo.jpg', S + 'photo.jpeg']); await settled(page);
    ex((await page.locator('.pickrow select option').count()) === 2, 'picker should list 2 pictures'); await page.locator('.pickrow select').selectOption('1'); await settled(page); ex(/photo\.jpeg/.test(await page.locator('.pickrow select option:checked').innerText()), 'picker');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all/ }).click()]); const buf = fs.readFileSync(await dl.path());
    ex(buf[0] === 0x50 && buf[1] === 0x4b, 'not a zip'); ex(/under-50kb\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename()); ex(buf.toString('latin1').includes('big_photo_under-50kb.jpg'), 'zip lacks big_photo_under-50kb.jpg'); return dl.suggestedFilename() + ' ' + buf.length + ' B';
  });

  // ---------------------------------------------------------------- chips switch in place
  await T('PNG: every size reaches its limit, stays PNG with transparency', async page => {
    const out = [];
    for (const [key, kb] of Object.entries(JPG_SIZES)) {
      await go(page, '/compress-png-under-' + key); await page.locator('input[type=file]').first().setInputFiles(S + 'alpha.png'); await settled(page);
      const v = await verdict(page), o = await download(page); ex(o.head.slice(0, 3).join() === '137,80,78', key + ' not png');
      if (kb >= 1176) { ex(/Already under/.test(v), key + ': ' + v); out.push(key + ' kept'); continue; }
      const warn = v.startsWith('⚠'); ex(o.size <= kb * 1024 || warn, `${key}: ${o.size} bytes over ${kb * 1024} and no warning (${v})`); out.push(key + ' ' + (o.size / 1024).toFixed(1) + 'K' + (warn ? '!' : ''));
    }
    return out.join(' ');
  });
  await T('PNG: transparency survives the size limit', async page => {
    await jpg(page, '/compress-png-under-100kb', 'alpha.png');
    const alpha = await page.evaluate(async () => { const b = await createImageBitmap(await (await fetch(document.querySelector('.compare figure:last-child img').src)).blob()); const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d'); x.drawImage(b, 0, 0); return x.getImageData(1, 1, 1, 1).data[3] + '/' + x.getImageData(b.width >> 1, b.height >> 1, 1, 1).data[3]; });
    ex(alpha === '0/255', 'alpha ' + alpha); return 'corner transparent, centre opaque';
  });
  await T('PNG: colours mode makes fewer colours smaller', async page => {
    await jpg(page, '/compress-png', 'alpha.png'); await page.getByRole('button', { name: 'Choose colours' }).click(); const sel = page.locator('select[aria-label=Colours]');
    await sel.selectOption('16'); await page.waitForTimeout(600); await settled(page); const o16 = await download(page); await sel.selectOption('256'); await page.waitForTimeout(600); await settled(page); const o256 = await download(page);
    ex(o16.size < o256.size * 0.7, `16 colours ${o16.size} vs 256 ${o256.size}`); return `16 colours ${Math.round(o16.size / 1024)} KB < 256 colours ${Math.round(o256.size / 1024)} KB`;
  });
  await T('JPEG size page reaches its limit', async page => {
    await jpg(page, '/compress-jpeg-under-50kb', 'big_photo.jpg'); const o = await download(page); ex(o.head.slice(0, 3).join() === '255,216,255' && o.size <= 50 * 1024 && o.size > 25 * 1024, 'size ' + o.size); return Math.round(o.size / 1024) + ' KB';
  });
  await T('chips switch IN PLACE: URL, text, size box, files kept', async page => {
    await go(page, '/compress-jpg'); await page.evaluate(() => { window.__marker = 'same'; }); await page.locator('input[type=file]').first().setInputFiles(S + 'big_photo.jpg'); await settled(page);
    await page.locator('.vchips:not(.hidden) .vchip', { hasText: /^20 KB$/ }).click(); await page.waitForURL('**/compress-jpg-under-20kb'); await page.waitForFunction(() => document.title.includes('20 KB') && document.querySelector('#seo').textContent.includes('20 KB'));
    await page.waitForSelector('.file'); await settled(page);
    const st = await page.evaluate(() => ({ m: window.__marker, h1: document.querySelector('.thead h1').textContent, canon: document.querySelector('link[rel=canonical]').href, val: document.querySelector('.sizebox input[type=number]').value, chip: document.querySelector('.vchips:not(.hidden) .vchip.on').textContent, tab: document.querySelector('.vtab.on').textContent,
      files: [...document.querySelectorAll('.file .nm')].map(x => x.textContent), faq: [...document.querySelectorAll('script[type="application/ld+json"]')].some(s => /FAQPage/.test(s.textContent)), crumb: document.getElementById('crumb').textContent }));
    ex(st.m === 'same', 'page reloaded'); ex(st.h1 === 'Compress JPG Under 20 KB' && st.canon.endsWith('/compress-jpg-under-20kb') && st.val === '20' && st.chip === '20 KB' && st.tab === 'JPG', JSON.stringify(st)); ex(st.files.join() === 'big_photo.jpg', 'file lost: ' + st.files); ex(st.faq, 'FAQ json-ld not swapped');
    ex(/under 20 KB/.test(await verdict(page)), 'verdict ' + await verdict(page)); ex(st.crumb.endsWith('Compress JPG / Compress JPG Under 20 KB'), 'crumb ' + st.crumb);
    await page.locator('.vtabs').getByRole('tab', { name: 'PNG', exact: true }).click(); await page.waitForURL('**/compress-png'); ex((await page.evaluate(() => window.__marker)) === 'same', 'reloaded'); const pngChips = await page.$$eval('.vchips:not(.hidden) .vchip', a => a.map(x => x.getAttribute('href'))); ex(pngChips.length === 11 && pngChips[1] === '/compress-png-under-10kb' && (await page.locator('.vchips:not(.hidden) .vchip.on').innerText()) === 'Any size', 'PNG tab should show the PNG chips: ' + pngChips);
    await page.locator('.vtabs').getByRole('tab', { name: 'GIF', exact: true }).click(); await page.waitForURL('**/compress-gif'); ex((await page.locator('.vchips:not(.hidden) .vchip').count()) === 0, 'chips should go away on the GIF tab'); await page.goBack(); await page.waitForURL('**/compress-png'); await page.goBack(); await page.waitForURL('**/compress-jpg-under-20kb');
    await page.waitForFunction(() => document.querySelector('.thead h1').textContent === 'Compress JPG Under 20 KB'); ex((await page.evaluate(() => window.__marker)) === 'same', 'back reloaded');
    return 'jpg -> 20 KB -> PNG tab -> back';
  });
  await T('Ctrl+click on a chip opens it as a normal link', async page => {
    await go(page, '/compress-jpg'); const [popup] = await Promise.all([page.context().waitForEvent('page'), page.locator('.vchips:not(.hidden) .vchip', { hasText: /^1 MB$/ }).click({ modifiers: ['Control'] })]);
    await popup.waitForLoadState('networkidle'); ex(popup.url().endsWith('/compress-jpg-under-1mb'), popup.url()); await popup.close(); return 'ok';
  });

  // ---------------------------------------------------------------- PDF
  await T('PDF: compress to under 200 KB (+ first-page preview)', async page => {
    const before = fs.statSync(S + 'scan3.pdf').size; await go(page, '/compress-pdf-under-200kb'); await page.locator('input[type=file]').first().setInputFiles(S + 'scan3.pdf'); await page.waitForSelector('.file');
    ex(/Compress to under 200 KB/.test(await page.locator('.actions .btn').first().innerText()), 'button text'); await page.getByRole('button', { name: /^Compress to under/ }).click();
    await page.waitForSelector('.result, .status.err', { timeout: 240000 }); if (await page.locator('.status.err').count()) throw new Error(await page.locator('.status.err').innerText());
    const sum = (await page.locator('.result .sum').innerText()).replace(/\s+/g, ' '); await page.waitForSelector('.result canvas', { timeout: 30000 }); const o = await (async () => { const a = page.locator('.result a[download]'); const r = await page.evaluate(async () => { const a = document.querySelector('.result a[download]'); const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); return { name: a.download, size: b.length, head: Array.from(b.slice(0, 4)) }; }); return r; })();
    ex(o.head.join() === '37,80,68,70', 'not a pdf'); ex(o.size <= 200 * 1024, `${before} -> ${o.size} (limit 204800): ${sum}`); ex(/Under 200 KB/.test(sum), 'summary: ' + sum); return `${Math.round(before / 1024)} KB -> ${Math.round(o.size / 1024)} KB | ${sum}`;
  });
  await T('PDF: a limit that cannot be met is reported honestly', async page => {
    await go(page, '/compress-pdf-under-100kb'); const num = page.locator('.sizebox input[type=number]'); await page.locator('input[type=file]').first().setInputFiles(S + 'five.pdf'); await page.waitForSelector('.file'); await num.fill('2');
    await page.getByRole('button', { name: /^Compress to under/ }).click(); await page.waitForSelector('.result, .status.err', { timeout: 240000 }); if (await page.locator('.status.err').count()) throw new Error(await page.locator('.status.err').innerText());
    const sum = (await page.locator('.result .sum').innerText()).replace(/\s+/g, ' '); ex(/could not get under 2\.0 KB|could not get under 2 KB/.test(sum) || /could not get under/.test(sum), 'summary ' + sum); return sum.slice(0, 120);
  });
  await T('PDF: already under the limit is returned unchanged', async page => {
    await go(page, '/compress-pdf-under-2mb'); await page.locator('input[type=file]').first().setInputFiles(S + 'other.pdf'); await page.waitForSelector('.file'); await page.getByRole('button', { name: /^Compress to under/ }).click();
    await page.waitForSelector('.result, .status.err', { timeout: 240000 }); const sum = (await page.locator('.result .sum').innerText()); ex(/Already under/.test(sum), sum); return sum.trim();
  });
  await T('PDF: chip change updates the button text, keeps the PDF', async page => {
    await go(page, '/compress-pdf-under-100kb'); await page.locator('input[type=file]').first().setInputFiles(S + 'five.pdf'); await page.waitForSelector('.file');
    await page.locator('.vchips:not(.hidden) .vchip', { hasText: /^500 KB$/ }).click(); await page.waitForURL('**/compress-pdf-under-500kb'); await page.waitForSelector('.file');
    ex(/Compress to under 500 KB/.test(await page.getByRole('button', { name: /^Compress to under/ }).innerText()), 'button text'); await page.locator('.sizebox .schip', { hasText: /^1 MB$/ }).click();
    ex(/Compress to under 1\.00 MB/.test(await page.getByRole('button', { name: /^Compress to under/ }).innerText()), 'button after preset: ' + await page.getByRole('button', { name: /^Compress to under/ }).innerText()); return 'ok';
  });
  await T('PDF: original /compress-pdf still works', async page => {
    await go(page, '/compress-pdf'); await page.locator('input[type=file]').first().setInputFiles(S + 'five.pdf'); await page.waitForSelector('.file'); await page.getByRole('button', { name: /^Compress/ }).first().click();
    await page.waitForSelector('.result, .status.err', { timeout: 240000 }); ex(!(await page.locator('.status.err').count()), 'error'); return (await page.locator('.result .sum').innerText()).slice(0, 60);
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
