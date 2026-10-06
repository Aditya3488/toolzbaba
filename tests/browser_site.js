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

  await T('bookmark: header star opens the panel with the keys', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('.bmbtn').click(); await page.waitForSelector('.bmpanel');
    const t = await page.locator('.bmpanel').innerText(); ex(/Ctrl|⌘/.test(t) && /Bookmark Toolz Baba/.test(t), 'panel text: ' + t);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); ex(!(await page.locator('.bmpanel').count()), 'Escape did not close it');
    await page.locator('.bmbtn').click(); await page.getByRole('button', { name: 'Done' }).click(); ex(!(await page.locator('.bmpanel').count()), 'Done did not close it');
    return t.replace(/\s+/g, ' ').slice(0, 60);
  });

  await T('header: no Image links entry, All tools stays on one line on a phone', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    ex(!(await page.locator('.top nav a', { hasText: 'Image links' }).count()), 'Image links still in the header');
    const h = await page.locator('.top nav a').first().evaluate(e => e.getBoundingClientRect().height); ex(h < 40, 'All tools wraps onto two lines: ' + h);
  }, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  await T('bookmark: footer link opens it', async page => {
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Bookmark this site' }).click(); await page.waitForSelector('.bmpanel');
  });

  await T('bookmark: iPhone gets share-sheet steps', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('.bmbtn').click(); const t = await page.locator('.bmpanel').innerText(); ex(/Share/.test(t) && !/Ctrl/.test(t), t);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ex(w[0] <= w[1] + 1, 'sideways scroll ' + w);
    return 'no sideways scroll at ' + w[1];
  }, { viewport: { width: 390, height: 800 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true });

  await T('bookmark: Android gets menu steps', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.locator('.bmbtn').click(); const t = await page.locator('.bmpanel').innerText(); ex(/menu/.test(t) && /bookmarks/.test(t), t);
  }, { viewport: { width: 390, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', hasTouch: true, isMobile: true });

  await T('bookmark: one reminder after the first download, never twice', async page => {
    await page.goto(BASE + '/json-formatter', { waitUntil: 'networkidle' });
    const fire = () => page.evaluate(() => HT.download(new Blob(['x']), 'a.txt'));
    await fire(); await page.waitForSelector('.bmpanel.nudge', { timeout: 5000 });
    ex(/Bookmark this website/.test(await page.locator('.bmpanel').innerText()), 'nudge text');
    await page.getByRole('button', { name: 'Not now' }).click(); ex(!(await page.locator('.bmpanel').count()), 'not closed');
    await fire(); await page.waitForTimeout(2200); ex(!(await page.locator('.bmpanel').count()), 'the reminder came back');
    await page.reload({ waitUntil: 'networkidle' }); await fire(); await page.waitForTimeout(2200); ex(!(await page.locator('.bmpanel').count()), 'the reminder came back after a reload');
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
    await page.goto(BASE + '/photo-collage-maker', { waitUntil: 'networkidle' }); await page.setInputFiles('input[type=file]', [SAMPLES + 'photo.jpeg', SAMPLES + 'face.jpg', SAMPLES + 'big_photo.jpg', SAMPLES + 'photo_exif.jpg']); await page.waitForSelector('.laypick .layopt');
    ex(await page.locator('.layopt').count() === 7, 'layouts ' + await page.locator('.layopt').count()); ex(await page.locator('.layopt svg rect').count() >= 20, 'the drawings are missing');
    const before = await page.locator('.pv canvas').evaluate(c => c.toDataURL().length); await page.locator('.layopt', { hasText: 'Featured left' }).click(); await page.waitForTimeout(900);
    ex(await page.locator('.layopt.on', { hasText: 'Featured left' }).count() === 1, 'not marked as chosen'); const after = await page.locator('.pv canvas').evaluate(c => c.toDataURL().length); ex(before !== after, 'the preview did not change');
  });
  await T('home page: a tool with tabs is one card; its tab pages open through its tabs and the search', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForSelector('.tcard');
    for (const n of ['Blur & Redact PDF', 'LinkedIn Carousel Maker', 'Instagram Carousel Splitter', 'Video to Text', 'Split Video', 'Merge Audio Files', 'Add Watermark to PDF', 'AI Headshot Generator', 'Color Palette Generator']) ex(await page.locator('.tcard', { hasText: n }).count() === 0, n + ' is a tab and must not be a card of its own');
    const icons = await page.locator('.tcard .ic').evaluateAll(es => new Set(es.map(e => e.innerHTML)).size); ex(icons >= 45, 'the cards share too few icons: ' + icons + ' different ones');   // every tool has its own icon
    await page.fill('#q', 'redact'); await page.waitForTimeout(300); ex(await page.locator('.tcard:not(.hidden)', { hasText: 'Pixelate Image' }).count() === 1, 'the search for "redact" should find the tool that has the tab');
    await page.goto(BASE + '/pixelate-image', { waitUntil: 'networkidle' }); await page.locator('.vtabs').getByRole('tab', { name: /PDF blur/ }).click(); await page.waitForURL('**/blur-redact-pdf'); await page.waitForSelector('#tool .drop');
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
