// Browser tests for the format pages of the compressor (/compress-png, /compress-jpeg, /compress-jpg, /compress-gif):
// page tags, the format buttons, that they are not listed on the home page, and that each one really compresses.
//
//   cd tests && npm install ; python smoke_api.py    (once: creates tests/samples)
//   node browser_variants.js                         (needs the site running, e.g. `npx wrangler pages dev dist --kv CDN --port 8200`
//                                                     with BASE_URL=http://127.0.0.1:8200, after `python build.py`)
// Environment: BASE_URL (default http://127.0.0.1:8000), BROWSER_PATH (Chrome/Edge; auto-detected).
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const S = path.join(__dirname, 'samples') + '/';
const EXE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  async function T(name, fn) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(46), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(46), String(e.message).split('\n').filter(Boolean)[0].slice(0, 300)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch {} }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); };
  const result = async page => { await page.waitForSelector('.result, .status.err', { timeout: 240000 }); if (await page.locator('.status.err').count()) throw new Error('tool error: ' + await page.locator('.status.err').innerText()); return (await page.locator('.result').innerText()).replace(/\s+/g, ' ').slice(0, 110); };
  const output = page => page.evaluate(async () => { const a = document.querySelector('.result a[download]'); const r = await fetch(a.href); const b = new Uint8Array(await r.arrayBuffer()); return { name: a.download, size: b.length, head: Array.from(b.slice(0, 12)), bytes: Array.from(b) }; });
  const compressVia = async (page, url, file, opts = {}) => {
    await go(page, url); await page.locator('input[type=file]').first().setInputFiles(S + file); await page.waitForTimeout(500);
    for (const [label, val] of Object.entries(opts)) { const f = page.locator('.field').filter({ has: page.locator('label.lbl', { hasText: label }) }).first(); await f.locator('select').selectOption(String(val)); }
    await page.getByRole('button', { name: /^Compress/ }).first().click(); const s = await result(page); return { s, o: await output(page) };
  };

  // ---------------------------------------------------------------- pages and navigation
  for (const [slug, title, h1] of [['compress-png', /PNG/, 'Compress PNG'], ['compress-jpeg', /JPEG/, 'Compress JPEG'], ['compress-jpg', /JPG/, 'Compress JPG'], ['compress-gif', /GIF/, 'Compress GIF']])
    await T('page /' + slug, async page => {
      const r = await page.goto(BASE + '/' + slug, { waitUntil: 'networkidle' }); ex(r.status() === 200, 'status ' + r.status()); await page.waitForSelector('#app .drop');
      const info = await page.evaluate(() => ({ t: document.title, canon: document.querySelector('link[rel=canonical]').href, h1: document.querySelector('.thead h1').textContent, ogu: document.querySelector('meta[property="og:url"]').content,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type']), on: [...document.querySelectorAll('.vtab.on')].map(a => a.textContent), pills: [...document.querySelectorAll('.vtab')].map(a => a.getAttribute('href')),
        seo: document.getElementById('seo').textContent.length, crumb: document.getElementById('crumb').textContent }));
      ex(info.canon === 'https://toolzbaba.com/' + slug, 'canonical ' + info.canon); ex(info.h1 === h1, 'h1 ' + info.h1); ex(title.test(info.t), 'title ' + info.t); ex(info.ogu.endsWith('/' + slug), 'og:url ' + info.ogu);
      ex(info.ld.includes('WebApplication') && info.ld.includes('BreadcrumbList'), 'json-ld ' + info.ld); ex(info.on.length === 1 && h1.endsWith(info.on[0]), 'highlighted tab ' + info.on);
      ex(info.pills.length === 5 && info.pills.includes('/tool/compress-image') && ['png','jpeg','jpg','gif'].every(f => info.pills.includes('/compress-' + f)), 'pills ' + info.pills); ex(info.seo > 500, 'seo text too short');
      return info.t + ' | ' + info.crumb;
    });
  await T('base page shows the format tabs above the drop zone', async page => {
    await go(page, '/tool/compress-image'); const tabs = await page.$$eval('.vtab', a => a.map(x => x.textContent + '=' + x.getAttribute('href') + (x.classList.contains('on') ? '*' : '')));
    ex(tabs.length === 5 && tabs[0] === 'All formats=/tool/compress-image*' && ['PNG=/compress-png', 'JPEG=/compress-jpeg', 'JPG=/compress-jpg', 'GIF=/compress-gif'].every(t => tabs.includes(t)), tabs.join(' '));
    const above = await page.evaluate(() => document.querySelector('.vtabs').getBoundingClientRect().bottom <= document.querySelector('.drop').getBoundingClientRect().top + 1); ex(above, 'tabs should sit above the drop zone'); return tabs.join(' | ');
  });
  await T('tab click switches IN PLACE (no reload), URL + text change', async page => {
    await go(page, '/tool/compress-image'); await page.evaluate(() => { window.__marker = 'same-page'; });
    const tab = n => page.locator('.vtabs').getByRole('tab', { name: n, exact: true });
    await tab('PNG').click(); await page.waitForURL('**/compress-png'); await page.waitForFunction(() => document.title.includes('PNG') && document.querySelector('#seo').textContent.includes('PNG')); await page.waitForSelector('#app input[type=file]', { state: 'attached' });  // the PNG screen loads its own script
    let st = await page.evaluate(() => ({ m: window.__marker, h1: document.querySelector('.thead h1').textContent, sub: document.querySelector('.thead .sub').textContent, canon: document.querySelector('link[rel=canonical]').href, ogu: document.querySelector('meta[property="og:url"]').content, desc: document.querySelector('meta[name=description]').content, crumb: document.getElementById('crumb').textContent, on: document.querySelector('.vtab.on').textContent, accept: document.querySelector('input[type=file]').accept, ld: document.querySelectorAll('script[type="application/ld+json"]').length, ldurl: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).url }));
    ex(st.m === 'same-page', 'the page was RELOADED (marker lost)'); ex(st.h1 === 'Compress PNG' && /PNG/.test(st.sub), 'heading ' + st.h1); ex(st.canon.endsWith('/compress-png') && st.ogu.endsWith('/compress-png'), 'canonical ' + st.canon);
    ex(/PNG/.test(st.desc), 'meta description not updated'); ex(st.crumb.endsWith('Compress Image / Compress PNG'), 'crumb ' + st.crumb); ex(st.on === 'PNG', 'tab ' + st.on); ex(/png/i.test(st.accept) && !/jpe?g/i.test(st.accept), 'accept ' + st.accept);
    ex(st.ld === 2 && st.ldurl.endsWith('/compress-png'), 'json-ld not swapped: ' + st.ld + ' ' + st.ldurl);
    await tab('GIF').click(); await page.waitForURL('**/compress-gif'); await page.waitForFunction(() => document.title.includes('GIF')); await page.waitForSelector('#app .notice');  // the GIF screen loads its own script
    st = await page.evaluate(() => ({ m: window.__marker, h1: document.querySelector('.thead h1').textContent, notice: !!document.querySelector('#app .notice'), fields: [...document.querySelectorAll('#app label.lbl')].map(l => l.textContent.trim()) }));
    ex(st.m === 'same-page' && st.h1 === 'Compress GIF' && st.notice, JSON.stringify(st)); ex(st.fields.some(f => /Colours/.test(f)), 'GIF settings not shown: ' + st.fields);
    await page.goBack(); await page.waitForURL('**/compress-png'); ex(await page.evaluate(() => window.__marker === 'same-page' && document.querySelector('.thead h1').textContent === 'Compress PNG'), 'Back button did not return to PNG in place');
    await page.goForward(); await page.waitForURL('**/compress-gif'); await page.waitForFunction(() => document.querySelector('.thead h1').textContent === 'Compress GIF');
    await tab('All formats').click(); await page.waitForURL('**/tool/compress-image'); ex((await page.evaluate(() => document.querySelector('.thead h1').textContent)) === 'Compress Image', 'All formats heading');
    return 'PNG -> GIF -> back -> forward -> All formats, never reloaded';
  });
  await T('files you added stay when the tab changes', async page => {
    await go(page, '/compress-png'); await page.locator('input[type=file]').first().setInputFiles(S + 'alpha.png'); await page.waitForSelector('.file');
    await page.locator('.vtabs').getByRole('tab', { name: 'All formats', exact: true }).click(); await page.waitForURL('**/tool/compress-image'); await page.waitForSelector('.file');
    const kept = await page.locator('.file .nm').allInnerTexts(); ex(kept.join() === 'alpha.png', 'file lost on All formats: ' + kept);
    await page.locator('.vtabs').getByRole('tab', { name: 'JPEG', exact: true }).click(); await page.waitForURL('**/compress-jpeg'); await page.waitForTimeout(500);
    const after = await page.locator('.file').count(); ex(after === 0, 'a PNG file stayed on the JPEG tab'); const toast = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    ex(/removed/.test(toast), 'no notice about the removed file: ' + toast);
    await page.locator('input[type=file]').first().setInputFiles(S + 'photo.jpeg'); await page.waitForSelector('.file');
    await page.locator('.vtabs').getByRole('tab', { name: 'JPG', exact: true }).click(); await page.waitForURL('**/compress-jpg'); await page.waitForSelector('.file');
    ex((await page.locator('.file .nm').allInnerTexts()).join() === 'photo.jpeg', 'JPEG file did not carry over to the JPG tab'); return 'PNG kept on All formats, removed on JPEG (with notice); .jpeg kept on JPG';
  });
  await T('compress still works after switching tabs', async page => {
    await go(page, '/tool/compress-image'); await page.locator('.vtabs').getByRole('tab', { name: 'GIF', exact: true }).click(); await page.waitForURL('**/compress-gif');
    await page.locator('input[type=file]').first().setInputFiles(S + 'big.gif'); await page.waitForSelector('.file');
    await page.getByRole('button', { name: /^Compress/ }).first().click(); const sum = await result(page); const o = await output(page);
    ex(String.fromCharCode(...o.head.slice(0, 4)) === 'GIF8' && o.size < fs.statSync(S + 'big.gif').size, 'gif not smaller'); return sum;
  });
  await T('Ctrl+click opens the tab as a normal link', async page => {
    await go(page, '/tool/compress-image'); const href = await page.locator('.vtabs').getByRole('tab', { name: 'PNG', exact: true }).getAttribute('href'); ex(href === '/compress-png', href);
    const [popup] = await Promise.all([page.context().waitForEvent('page'), page.locator('.vtabs').getByRole('tab', { name: 'PNG', exact: true }).click({ modifiers: ['Control'] })]);
    await popup.waitForLoadState('networkidle'); ex(popup.url().endsWith('/compress-png'), popup.url()); await popup.close(); return 'new tab opened /compress-png';
  });
  await T('home page and search do NOT list the 4 pages', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('#list .tcard');
    const n = await page.locator('#list .tcard').count(); const names = await page.$$eval('#list .tcard b', b => b.map(x => x.textContent));
    const total = (await (await page.request.get(BASE + '/assets/tools.json')).json()).tools.filter(t => !t.href).length; ex(n === total && !names.some(x => /Compress (PNG|JPEG|JPG|GIF)/.test(x)), `cards ${n}, tools.json has ${total}`);
    await page.fill('#q', 'compress png'); await page.waitForTimeout(300); const vis = await page.$$eval('#list .tcard:not(.hidden) b', b => b.map(x => x.textContent));
    ex(!vis.some(x => /PNG|JPEG|JPG|GIF/.test(x)), 'search shows ' + vis); return `${n} cards, search "compress png" -> ${vis.join(', ')}`;
  });
  await T('sitemap and tools.json', async page => {
    const sm = await (await page.request.get(BASE + '/sitemap.xml')).text(); for (const s of ['compress-png', 'compress-jpeg', 'compress-jpg', 'compress-gif']) ex(sm.includes(`https://toolzbaba.com/${s}<`), 'sitemap misses ' + s);
    return 'all 4 in sitemap';
  });
  await T('drop zone accepts only the right type (png page)', async page => {
    await go(page, '/compress-png'); await page.locator('input[type=file]').first().setInputFiles(S + 'photo_exif.jpg'); await page.waitForTimeout(500);
    const files = await page.locator('.file').count(); ex(files === 0, 'a JPG was accepted on the PNG page'); return 'JPG refused';
  });

  // ---------------------------------------------------------------- real compression
  // the JPG pages compress to a size you choose (target-size screen): add a file, read the live verdict, download
  const settled2 = page => page.waitForFunction(() => { const v = document.querySelector('.verdict'); return v && v.textContent.length > 0 && !v.textContent.startsWith('Working'); }, null, { timeout: 60000 });
  const download2 = async page => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download/ }).first().click()]); const buf = fs.readFileSync(await dl.path()); return { name: dl.suggestedFilename(), size: buf.length, head: Array.from(buf.slice(0, 4)) }; };
  const jpgVia = async (page, url, file) => {
    await go(page, url); await page.locator('input[type=file]').first().setInputFiles(S + file); await page.waitForSelector('.verdict.ok, .verdict.warn', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('.verdict').textContent.startsWith('Working'), null, { timeout: 60000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download/ }).first().click()]);
    const buf = fs.readFileSync(await dl.path()); return { name: dl.suggestedFilename(), size: buf.length, head: Array.from(buf.slice(0, 3)) };
  };
  for (const slug of ['compress-jpeg', 'compress-jpg'])
    await T(`JPEG via /${slug}`, async page => {
      const o = await jpgVia(page, '/' + slug, 'big_photo.jpg'); const before = fs.statSync(S + 'big_photo.jpg').size; ex(o.head.join() === '255,216,255', 'not jpeg'); ex(o.size < before * 0.5 && o.size <= 200 * 1024, `not small enough ${before} -> ${o.size}`); return `${Math.round(before / 1024)} KB -> ${Math.round(o.size / 1024)} KB (${o.name})`;
    });
  await T('JPG page accepts a .jpeg file', async page => { const o = await jpgVia(page, '/compress-jpg', 'photo.jpeg'); ex(o.head.join() === '255,216,255', 'not jpeg'); return o.name; });
  await T('PNG: under the chosen size, still transparent, still PNG', async page => {
    const o = await jpgVia(page, '/compress-png', 'alpha.png'); const before = fs.statSync(S + 'alpha.png').size;
    ex(o.head.join() === '137,80,78', 'not a png'); ex(o.size < before * 0.5 && o.size <= 200 * 1024, `not small enough: ${before} -> ${o.size}`); ex(/\.png$/.test(o.name), o.name);
    const alpha = await page.evaluate(async () => { const b = await createImageBitmap(await (await fetch(document.querySelector('.compare figure:last-child img').src)).blob()); const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d'); x.drawImage(b, 0, 0); return x.getImageData(1, 1, 1, 1).data[3] + '/' + x.getImageData(b.width >> 1, b.height >> 1, 1, 1).data[3]; });
    ex(alpha === '0/255', 'transparency lost: ' + alpha); return `${Math.round(before / 1024)} KB -> ${Math.round(o.size / 1024)} KB, alpha kept`;
  });
  await T('GIF: smaller, still animated', async page => {
    const { s, o } = await compressVia(page, '/compress-gif', 'big.gif', { Colours: '64', Width: '240' }); const before = fs.statSync(S + 'big.gif').size;
    ex(String.fromCharCode(...o.head.slice(0, 4)) === 'GIF8', 'not gif'); ex(o.size < before, `not smaller ${before} -> ${o.size}`);
    const frames = await page.evaluate(async () => { const a = document.querySelector('.result a[download]'); const u = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); let n = 0; for (let i = 0; i < u.length - 3; i++) if (u[i] === 0x21 && u[i + 1] === 0xF9 && u[i + 2] === 0x04) n++; return { n, w: u[6] | (u[7] << 8), h: u[8] | (u[9] << 8) }; });
    ex(frames.n > 5, 'only ' + frames.n + ' frames: animation lost?'); ex(frames.w === 240, 'width ' + frames.w);
    return `${Math.round(before / 1024)} KB -> ${Math.round(o.size / 1024)} KB, ${frames.n} frames, ${frames.w}x${frames.h}`;
  });
  await T('GIF: already-small file is returned unchanged', async page => {
    const { s, o } = await compressVia(page, '/compress-gif', 'anim.gif', { Colours: '256' }); const before = fs.statSync(S + 'anim.gif').size;
    ex(o.size <= before, `got a BIGGER file ${before} -> ${o.size}`); return `${before} -> ${o.size} B | ${s.slice(0, 60)}`;
  });
  await T('All formats page: live quality preview, same format kept', async page => {
    await go(page, '/tool/compress-image'); await page.locator('input[type=file]').first().setInputFiles(S + 'big_photo.jpg'); await settled2(page);
    const q = page.locator('input[type=range][aria-label=Quality]'); await q.evaluate(el => { el.value = 40; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(700); await settled2(page);
    const caps = await page.locator('figcaption').allInnerTexts(); ex(/Original/i.test(caps[0]) && /Result/i.test(caps[1]) && /KB/.test(caps[1]), 'captions ' + caps);
    const lo = await download2(page); await q.evaluate(el => { el.value = 90; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(700); await settled2(page); const hi = await download2(page);
    ex(lo.head.slice(0, 3).join() === '255,216,255' && /\.jpg$/.test(lo.name), 'not a jpg: ' + lo.name); ex(lo.size < hi.size * 0.6, `q40 ${lo.size} vs q90 ${hi.size}`);
    return `q40 ${Math.round(lo.size / 1024)} KB < q90 ${Math.round(hi.size / 1024)} KB (captions: ${caps.join(' / ')})`;
  });
  await T('All formats page: PNG stays PNG, WebP option, GIF note', async page => {
    await go(page, '/tool/compress-image'); await page.locator('input[type=file]').first().setInputFiles(S + 'alpha.png'); await settled2(page);
    const o = await download2(page); ex(o.head.slice(0, 3).join() === '137,80,78' && /\.png$/.test(o.name), 'png not kept: ' + o.name);
    await page.locator('select[aria-label="Output format"]').selectOption('webp'); await page.waitForTimeout(700); await settled2(page); const w = await download2(page); ex(/\.webp$/.test(w.name) && String.fromCharCode(...w.head) === 'RIFF', 'webp ' + w.name);
    await page.locator('input[type=file]').first().setInputFiles(S + 'big.gif'); await page.waitForTimeout(500); await page.locator('select[aria-label="Output format"]').selectOption('keep'); await page.locator('.pickrow select').selectOption({ label: 'big.gif' }); await page.waitForTimeout(700); await settled2(page);
    ex(/animation/.test(await page.locator('.verdict').innerText()), 'gif verdict: ' + await page.locator('.verdict').innerText()); return 'png ' + o.name + ', webp ' + w.name + ', gif left as is';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
