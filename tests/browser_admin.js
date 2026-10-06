// Browser tests for the admin panel (/admin): sign in, archive and go live (and what a visitor sees), lab tests, visitor speed beacons.
// Needs the site running with ADMIN_KEY set in .dev.vars (wrangler pages dev dist --kv CDN --port 8200 ...).
//   BASE_URL=http://127.0.0.1:8200 node browser_admin.js
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8200';
const EXE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('No Chrome/Edge found. Set BROWSER_PATH.'); process.exit(2); }
const vars = (() => { try { return Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } })();
const KEY = process.env.ADMIN_KEY || vars.ADMIN_KEY;
const USER = process.env.ADMIN_USER || vars.ADMIN_USER || '';
if (!KEY) { console.error('Set ADMIN_KEY in .dev.vars (or the environment).'); process.exit(2); }
let pass = 0, fail = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const call = async (p, method = 'GET', body) => { const r = await fetch(BASE + '/api/admin/' + p, { method, headers: { 'X-Admin-User': USER, 'X-Admin-Key': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
  async function T(name, fn, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|401/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    try { const note = await fn(page, ctx); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(58), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(58), String(e.message).split('\n').filter(Boolean)[0].slice(0, 320)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch { } }
    await ctx.close();
  }
  const signIn = async page => { await page.goto(BASE + '/admin', { waitUntil: 'networkidle' }); await page.getByLabel('ID').fill(USER); await page.getByLabel('Password').fill(KEY); await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForSelector('.adm-tabs'); };
  const clean = async () => { await call('status', 'POST', { slugs: ['anime-style', 'upscale-image', 'compress-image'], state: 'live' }); await call('rum', 'DELETE'); };
  await clean();

  await T('admin: page is private (noindex, no cache) and asks for the key', async page => {
    const r = await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    ex(/noindex/.test(r.headers()['x-robots-tag'] || ''), 'x-robots-tag'); ex(/no-store/.test(r.headers()['cache-control'] || ''), 'cache-control');
    ex(await page.locator('meta[name=robots]').getAttribute('content') === 'noindex,nofollow', 'meta robots');
    await page.getByLabel('ID').fill(USER); await page.getByLabel('Password').fill('definitely-the-wrong-key'); await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForSelector('.adm-msg:has-text("Wrong")');
    ex(!(await page.locator('.adm-tabs').count()), 'the panel opened with a wrong key');
    const robots = await (await fetch(BASE + '/robots.txt')).text(); ex(/Disallow: \/admin/.test(robots), 'robots.txt'); const sm = await (await fetch(BASE + '/sitemap.xml')).text(); ex(!/admin/.test(sm), 'admin is in the sitemap');
  });

  await T('admin: sign in shows the numbers and the tool table', async page => {
    await signIn(page); const rows = await page.locator('.adm-t tbody tr').count(); ex(rows >= 55, 'rows ' + rows);
    ex(/tools live/.test(await page.locator('.adm-cards').innerText()), 'cards');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.adm-tabs');   // the key survives a reload (this tab only)
    return rows + ' rows';
  });

  await T('admin: archive a tool, visitors see "taking a break"; make it live again', async (page, ctx) => {
    await signIn(page);
    await page.locator('.adm-bar input[type=search]').fill('anime style'); await page.waitForTimeout(200);
    const row = page.locator('.adm-t tbody tr', { hasText: 'Anime Style' }).first(); await row.getByRole('button', { name: 'Archive' }).click();
    await page.locator('.adm-dlg input').fill('model too heavy'); await page.locator('.adm-dlg').getByRole('button', { name: 'Yes' }).click(); await page.waitForSelector('.adm-pill:has-text("Archived")');
    ex((await (await fetch(BASE + '/api/tool-status')).json()).archived.includes('anime-style'), 'public list');
    // a visitor (a fresh browser with no admin flag)
    const v = await (await ctx.browser().newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const verrs = []; v.on('pageerror', e => verrs.push(e.message));
    await v.goto(BASE + '/', { waitUntil: 'networkidle' }); await v.waitForSelector('.tcard'); await v.waitForTimeout(500);
    ex(!(await v.locator('.tcard', { hasText: 'Anime Style' }).count()), 'still on the home page for a visitor'); ex(await v.locator('.tcard', { hasText: 'Compress Image' }).count() > 0, 'other tools vanished');
    await v.goto(BASE + '/tool/anime-style', { waitUntil: 'networkidle' }); await v.waitForSelector('h1:has-text("taking a break")', { timeout: 8000 });
    ex(await v.locator('meta[name=robots]').getAttribute('content') === 'noindex', 'archived page must be noindex');
    // the admin's own browser still sees it, with a note
    const own = await ctx.newPage(); await own.goto(BASE + '/tool/anime-style', { waitUntil: 'networkidle' }); await own.waitForSelector('#tool .drop'); ex(/This tool is archived/.test(await own.locator('body').innerText()), 'admin note'); await own.close();
    // back to live
    await page.locator('.adm-bar input[type=search]').fill('anime style'); await page.waitForTimeout(200);
    await page.locator('.adm-t tbody tr', { hasText: 'Anime Style' }).first().getByRole('button', { name: 'Make live' }).click(); await page.locator('.adm-dlg').getByRole('button', { name: 'Yes' }).click(); await page.waitForSelector('.adm-t tbody tr:has-text("Anime Style") .adm-pill:has-text("Live")');
    ex(!(await (await fetch(BASE + '/api/tool-status')).json()).archived.includes('anime-style'), 'still archived');
    await v.evaluate(() => localStorage.removeItem('tz_status')); await v.goto(BASE + '/tool/anime-style', { waitUntil: 'networkidle' }); await v.waitForSelector('#tool .drop', { timeout: 8000 }); ex(!verrs.length, 'visitor JS errors: ' + verrs);
    await v.context().close(); return 'hidden, noindex, back again';
  });

  await T('admin: archiving a tool also hides its tab pages', async (page, ctx) => {
    await signIn(page); await call('status', 'POST', { slugs: ['compress-image'], state: 'archived', note: 'test' });
    const v = await (await ctx.browser().newContext()).newPage();
    await v.goto(BASE + '/compress-png', { waitUntil: 'networkidle' }); await v.waitForSelector('h1:has-text("taking a break")', { timeout: 8000 });
    await v.goto(BASE + '/', { waitUntil: 'networkidle' }); await v.waitForSelector('.tcard'); ex(!(await v.locator('.tcard', { hasText: 'Compress Image' }).count()), 'still listed');
    await v.context().close(); await call('status', 'POST', { slugs: ['compress-image'], state: 'live' });
  });

  await T('admin: bulk archive and history', async page => {
    await signIn(page); await page.locator('.adm-bar input[type=search]').fill('upscale'); await page.waitForTimeout(200);
    await page.locator('.adm-t tbody input[type=checkbox]').first().check(); await page.locator('.adm-sel input[type=text]').fill('bulk test');
    await page.locator('.adm-sel').getByRole('button', { name: 'Archive' }).click(); await page.locator('.adm-dlg').getByRole('button', { name: 'Yes' }).click(); await page.waitForSelector('.adm-pill:has-text("Archived")');
    await page.getByRole('tab', { name: 'History' }).click(); ex(/Upscale/.test(await page.locator('.adm-t').innerText()) && /bulk test/.test(await page.locator('.adm-t').innerText()), 'history row');
    await call('status', 'POST', { slugs: ['upscale-image'], state: 'live' });
  });

  await T('admin: lab opens a tool, measures it and keeps the result', async page => {
    await signIn(page); await page.locator('.adm-bar input[type=search]').fill('json formatter'); await page.waitForTimeout(200);
    await page.locator('.adm-t tbody tr', { hasText: 'JSON Formatter' }).first().getByRole('button', { name: 'Test' }).click();
    await page.getByRole('button', { name: 'Start the test' }).click(); await page.waitForSelector('.adm-log :text("Done:")', { timeout: 90000 });
    const row = page.locator('.adm-t tr', { hasText: 'JSON Formatter' }).last(); const txt = await row.innerText(); ex(/ms|s/.test(txt) && /Passed|Loads OK/.test(txt), 'result row: ' + txt);
    const lab = (await call('lab')).lab['json-formatter']; ex(lab && lab.ready > 0 && lab.bytes > 1000, 'not saved on the server: ' + JSON.stringify(lab)); ex(lab.run && /ok/.test(lab.run.state), 'run ' + JSON.stringify(lab.run));
    return `ready ${lab.ready} ms, ${Math.round(lab.bytes / 1024)} KB, run ${lab.run.state}`;
  });

  await T('admin: lab tries a file tool with a generated image', async page => {
    await signIn(page); await page.locator('.adm-bar input[type=search]').fill('crop image'); await page.waitForTimeout(200);
    await page.locator('.adm-t tbody tr', { hasText: 'Crop Image' }).first().getByRole('button', { name: 'Test' }).click();
    await page.getByRole('button', { name: 'Start the test' }).click(); await page.waitForSelector('.adm-log :text("Done:")', { timeout: 120000 });
    const lab = (await call('lab')).lab['crop-image']; ex(lab && lab.ready > 0, 'no result'); ex(lab.run && (lab.run.state === 'ok' || lab.run.state === 'skip'), 'run: ' + JSON.stringify(lab.run)); ex(!lab.errors.length, 'errors: ' + lab.errors);
    return 'run ' + lab.run.state + (lab.run.msg ? ' (' + lab.run.msg + ')' : '');
  });

  const views = async slug => { const r = (await call('rum')).rum; return r && r.tools[slug] ? r.tools[slug].views : 0; };
  const visit = async (ctx, init, slug = '/tool/json-formatter') => { const v = await (await ctx.browser().newContext(init || {})).newPage(); await v.addInitScript(() => { Math.random = () => 0.01; }); await v.goto(BASE + slug, { waitUntil: 'networkidle' }); await v.waitForTimeout(800); await v.goto(BASE + '/privacy', { waitUntil: 'networkidle' }); await v.waitForTimeout(800); return v; };
  await T('rum: a sampled visit is counted once, and the panel shows it', async (page, ctx) => {
    const v = await visit(ctx); await v.context().close();
    let n = 0; for (let i = 0; i < 15 && !n; i++) { n = await views('json-formatter'); if (!n) await new Promise(r => setTimeout(r, 400)); }
    ex(n === 1, 'views ' + n); const t = (await call('rum')).rum.tools['json-formatter'], sum = t.h.ttfb.reduce((a, b) => a + b, 0) + t.h.lcp.reduce((a, b) => a + b, 0); ex(sum >= 2, 'speed numbers missing');
    await signIn(page); await page.getByRole('tab', { name: 'Real visitors' }).click(); await page.waitForSelector('.adm-t'); ex(/JSON Formatter/.test(await page.locator('.adm-t').innerText()), 'not shown in the panel');
    return 'views ' + n;
  });

  await T('rum: nothing is counted from the admin browser or with Do Not Track', async (page, ctx) => {
    const before = await views('json-formatter');
    await signIn(page); await page.addInitScript(() => { Math.random = () => 0.01; }); await page.goto(BASE + '/tool/json-formatter', { waitUntil: 'networkidle' }); await page.goto(BASE + '/privacy', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    ex(await views('json-formatter') === before, 'admin browser was counted');
    const d = await (await ctx.browser().newContext()).newPage(); await d.addInitScript(() => { Object.defineProperty(navigator, 'doNotTrack', { value: '1' }); Math.random = () => 0.01; });
    await d.goto(BASE + '/tool/json-formatter', { waitUntil: 'networkidle' }); await d.waitForTimeout(500); await d.goto(BASE + '/privacy', { waitUntil: 'networkidle' }); await d.waitForTimeout(1200); await d.context().close();
    ex(await views('json-formatter') === before, 'Do Not Track was ignored');
  });

  await T('rum: only a sample is counted (nine visits in ten send nothing)', async (page, ctx) => {
    const before = await views('json-formatter'), v = await (await ctx.browser().newContext()).newPage(); await v.addInitScript(() => { Math.random = () => 0.95; });
    await v.goto(BASE + '/tool/json-formatter', { waitUntil: 'networkidle' }); await v.goto(BASE + '/privacy', { waitUntil: 'networkidle' }); await v.waitForTimeout(1200); await v.context().close();
    ex(await views('json-formatter') === before, 'an unsampled visit was counted');
  });

  await T('public pages do not load the admin code', async page => {
    const seen = []; page.on('request', r => { if (/admin/.test(r.url())) seen.push(r.url()); });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.goto(BASE + '/tool/json-formatter', { waitUntil: 'networkidle' }); ex(!seen.length, 'loaded: ' + seen.join());
  });

  await T('admin: phone layout has no sideways page scroll', async page => {
    await signIn(page); const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ex(w[0] <= w[1] + 1, 'sideways scroll ' + w); return w.join('/');
  }, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  await clean();
  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
