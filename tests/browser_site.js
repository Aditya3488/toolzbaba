// Site-wide browser tests: the bookmark button, panel, footer link and the one-time reminder, header on a phone.
//   BASE_URL=http://127.0.0.1:8200 node browser_site.js
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const EXE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  async function T(name, fn, ctxOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...ctxOpts }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(54), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(54), String(e.message).split('\n').filter(Boolean)[0].slice(0, 300)); fail++; }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };

  // the bookmark offer is a toast (HT.bookmark): a click on it shows the keys or taps for the device; Esc and × close it
  await T('bookmark: header star opens the toast, a click shows the keys, Esc and × close it', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('.bmbtn').click(); await page.waitForSelector('.bmtoast');
    let t = await page.locator('.bmtoast').innerText(); ex(/Never miss free tools|Get the Toolz Baba app/.test(t), 'toast text: ' + t);
    await page.locator('.bmtoast').click(); await page.waitForTimeout(300); t = await page.locator('.bmtoast').innerText(); ex(/Ctrl|⌘/.test(t), 'no keys shown: ' + t);
    await page.keyboard.press('Escape'); await page.waitForTimeout(700); ex(!(await page.locator('.bmtoast').count()), 'Escape did not close it');
    await page.locator('.bmbtn').click(); await page.waitForSelector('.bmtoast'); await page.locator('.bmx').click(); await page.waitForTimeout(700); ex(!(await page.locator('.bmtoast').count()), '× did not close it');
    return t.replace(/\s+/g, ' ').slice(0, 60);
  });

  await T('header: no Image links entry, and the header stays one line on a phone', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    ex(!(await page.getByRole('link', { name: 'Image links' }).count()), 'Image links still in the header');
    const h = await page.locator('.top-in').evaluate(e => e.getBoundingClientRect().height); ex(h < 80, 'the header wraps onto two lines: ' + h);
  }, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  await T('bookmark: footer link opens it', async page => {
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Bookmark this site' }).click(); await page.waitForSelector('.bmtoast');
  });

  await T('bookmark: iPhone gets share-sheet steps', async page => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.bmbtn');
    await page.locator('.bmbtn').click(); await page.waitForSelector('.bmtoast'); await page.locator('.bmtoast').click(); await page.waitForTimeout(300);
    const t = await page.locator('.bmtoast').innerText(); ex(/Share/.test(t) && !/Ctrl/.test(t), t);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ex(w[0] <= w[1] + 1, 'sideways scroll ' + w);
    return 'no sideways scroll at ' + w[1];
  }, { viewport: { width: 390, height: 800 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true });

  await T('bookmark: Android gets menu steps', async page => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.bmbtn');
    await page.locator('.bmbtn').click(); await page.waitForSelector('.bmtoast'); await page.locator('.bmtoast').click(); await page.waitForTimeout(300);
    const t = await page.locator('.bmtoast').innerText(); ex(/menu/.test(t) && /bookmarks/.test(t), t);
  }, { viewport: { width: 390, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', hasTouch: true, isMobile: true });

  await T('bookmark: one reminder after the first download, not again for an hour', async page => {
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' });
    const fire = () => page.evaluate(() => HT.download(new Blob(['x']), 'a.txt'));
    await fire(); await page.waitForSelector('.bmtoast', { timeout: 5000 });
    ex(/Never miss free tools|Get the Toolz Baba app/.test(await page.locator('.bmtoast').innerText()), 'nudge text');
    await page.locator('.bmx').click(); await page.waitForTimeout(700); ex(!(await page.locator('.bmtoast').count()), 'not closed');
    await fire(); await page.waitForTimeout(2200); ex(!(await page.locator('.bmtoast').count()), 'the reminder came back');
    await page.reload({ waitUntil: 'networkidle' }); await fire(); await page.waitForTimeout(2200); ex(!(await page.locator('.bmtoast').count()), 'the reminder came back after a reload');
  });

  // ---------------------------------------------------------------- EXIF viewer, collage layouts, tab pages on the home page
  const SAMPLES = path.join(__dirname, 'samples') + '/';
  await T('exif remover: shows every hidden tag, location and a privacy warning', async page => {
    await page.goto(BASE + '/exif-remover', { waitUntil: 'networkidle' }); await page.setInputFiles('input[type=file]', SAMPLES + 'photo_exif.jpg'); await page.waitForSelector('.exv-sum', { timeout: 20000 });
    const sum = await page.locator('.exv-sum').innerText(); ex(/hidden tag/.test(sum) && /could say who you are/.test(sum), 'summary: ' + sum);
    ex(/28\.6/.test(await page.locator('.exv-map').innerText()), 'location missing'); ex(await page.locator('.exv-t tr.risk').count() >= 5, 'risky tags not marked');
    const txt = await page.locator('.exv-body').innerText(); ex(/Make/.test(txt) && /TestCam/.test(txt) && /Model X/.test(txt) && /GPSLatitude/.test(txt), 'tags missing');
    ex(!/Gps IFD/.test(txt), 'internal pointer tags should be hidden');
    await page.locator('.exv-bar input').fill('testcam'); await page.waitForTimeout(400); ex(await page.locator('.exv-t tr').count() === 1, 'search should leave the one matching row');
    return sum.slice(0, 70);
  });
  await T('exif remover: a clean photo says there is nothing hidden', async page => {
    await page.goto(BASE + '/exif-remover', { waitUntil: 'networkidle' }); await page.setInputFiles('input[type=file]', SAMPLES + 'odd301x199.png'); await page.waitForSelector('.exv-sum', { timeout: 20000 });
    ex(/No hidden information/.test(await page.locator('.exv-sum').innerText()), await page.locator('.exv-sum').innerText());
  });
  await T('collage: layouts are drawings, and picking one changes the collage', async page => {
    await page.goto(BASE + '/photo-collage-maker', { waitUntil: 'networkidle' }); await page.setInputFiles('input[type=file]', [SAMPLES + 'photo.jpeg', SAMPLES + 'photo_exif.jpg', SAMPLES + 'big_photo.jpg', SAMPLES + 'photo_exif.jpg']); await page.waitForSelector('.laypick .layopt');
    ex(await page.locator('.layopt').count() === 7, 'layouts ' + await page.locator('.layopt').count()); ex(await page.locator('.layopt svg rect').count() >= 20, 'the drawings are missing');
    const before = await page.locator('.pv canvas').evaluate(c => c.toDataURL().length); await page.locator('.layopt', { hasText: 'Featured left' }).click(); await page.waitForTimeout(900);
    ex(await page.locator('.layopt.on', { hasText: 'Featured left' }).count() === 1, 'not marked as chosen'); const after = await page.locator('.pv canvas').evaluate(c => c.toDataURL().length); ex(before !== after, 'the preview did not change');
  });
  await T('home page: a tool with tabs is one card; its tab pages open through its tabs and the header search', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('.tcard');
    for (const n of ['Blur & Redact PDF', 'LinkedIn Carousel Maker', 'Instagram Carousel Splitter', 'Video to Text', 'Split Video', 'Merge Audio Files', 'Add Watermark to PDF', 'AI Headshot Generator']) ex(!(await page.locator('.tcard', { hasText: n }).count()), n + ' has a card of its own');
    const icons = await page.locator('.tcard .ic').evaluateAll(es => new Set(es.map(e => e.innerHTML)).size); ex(icons >= 45, 'the cards share too few icons: ' + icons + ' different ones');
    await page.fill('.hsearch input', 'redact'); await page.waitForTimeout(400); const hits = await page.locator('.hres a').allInnerTexts(); ex(hits.some(t => /Blur & Redact PDF/.test(t)), 'the header search for "redact" should find the PDF tab page: ' + hits.join(' | '));
    await page.goto(BASE + '/pixelate-image', { waitUntil: 'networkidle' }); await page.locator('.vtabs').getByRole('tab', { name: /PDF blur/ }).click(); await page.waitForURL('**/blur-redact-pdf'); ex(await page.locator('h1').innerText() === 'Blur & Redact PDF', 'tab page did not open');
    return 'icons ' + icons + ', search hits ' + hits.length;
  });

  // ---- JavaScript error monitoring (HT.errors in common.js -> /api/errors): one clean beacon per kind, extension errors ignored
  await T('errors: an unhandled error is reported once, scrubbed; extension errors are not', async page => {
    await page.addInitScript(() => { window.__beacons = []; const real = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, b) => { if (String(u).endsWith('/api/errors')) new Response(b).text().then(t => window.__beacons.push(JSON.parse(t))); return real(u, b); }; });
    page.removeAllListeners('pageerror'); page.removeAllListeners('console');   // this test throws on purpose
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const twice = () => { throw new Error("tz-test: could not read 'secret file.pdf' for me@example.com"); };
      setTimeout(twice, 0); setTimeout(twice, 10); Promise.reject(new Error('tz-test rejection'));
      const e = new Error('from an extension'); e.stack = 'Error: from an extension\n    at chrome-extension://abcd/content.js:1:1'; setTimeout(() => { throw e; }, 20);
    });
    await page.waitForFunction(() => window.__beacons.length > 0, null, { timeout: 8000 }); await page.waitForTimeout(400);
    const sent = (await page.evaluate(() => window.__beacons)).flatMap(b => b.e.map(e => ({ ...e, page: b.s, browser: b.b }))), msgs = sent.map(e => e.msg);
    ex(msgs.filter(m => m.includes('tz-test: could not read')).length === 1, 'the same error should be sent once: ' + JSON.stringify(msgs));
    ex(msgs.some(m => m.endsWith("tz-test: could not read '…' for [email]")), 'the file name and the e-mail should be removed: ' + JSON.stringify(msgs));   // Chrome prefixes "Uncaught Error: " 
    ex(msgs.includes('tz-test rejection'), 'rejected promises are reported');
    ex(!msgs.includes('from an extension'), 'extension errors are not reported');
    ex(sent[0].page === 'json-formatter' && ['chrome', 'edge', 'other'].includes(sent[0].browser), 'page and browser family: ' + sent[0].page + ' ' + sent[0].browser);
    ex(!JSON.stringify(sent).includes('secret file') && !JSON.stringify(sent).includes('example.com'), 'nothing personal in the beacon');
    return msgs.length + ' sent: ' + msgs.join(' | ');
  });
  // ---- Content-Security-Policy, report-only (deploy/pages/_headers): the policy is served, and ordinary use breaks none of it
  await T('csp: report-only policy served; a visit, a search and a tool run would not be blocked', async page => {
    const reports = []; page.on('request', r => { if (r.url().endsWith('/api/csp-report')) reports.push(r.postData() || '?'); });
    const r0 = await page.goto(BASE + '/', { waitUntil: 'networkidle' }), csp = r0.headers()['content-security-policy-report-only'] || '';
    ex(csp.includes("script-src 'self'") && csp.includes('report-uri /api/csp-report') && !/script-src[^;]*'unsafe-inline'/.test(csp), 'report-only policy missing or too loose: ' + csp.slice(0, 90));
    ex(!(r0.headers()['content-security-policy'] || ''), 'public pages must not get an enforced policy yet');
    await page.fill('.hsearch input', 'pdf'); await page.waitForTimeout(300);
    await page.goto(BASE + '/exif-remover', { waitUntil: 'networkidle' }); await page.setInputFiles('input[type=file]', SAMPLES + 'photo_exif.jpg'); await page.waitForSelector('.exv-sum', { timeout: 20000 });
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' }); await page.fill('textarea', '{"a":1}'); await page.waitForTimeout(1200);
    const ours = reports.filter(t => /"blocked-uri":"(inline|eval|wasm-eval|self|https?:\/\/127\.0\.0\.1[^"]*)"|"blockedURL":"(inline|eval|wasm-eval)/.test(t));
    ex(!ours.length, 'the policy would block the site itself: ' + ours.slice(0, 2).join(' | ').slice(0, 400));
    return reports.length ? reports.length + ' report(s) about other sources' : 'no violation reports';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
