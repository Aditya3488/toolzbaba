// Browser tests for PDF Editor v2 (/pdf-editor?v2): the editor that changes the PDF itself instead of putting a layer on it.
//
//   cd tests && npm install ; python make_pdf_samples.py      (once: creates tests/samples, needs reportlab)
//   node browser_editor_v2.js                                 (site running, e.g. BASE_URL=http://127.0.0.1:8000)
//   node browser_editor_v2.js ocr align                       (only tests whose name contains one of these words)
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
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
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1150 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(58), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(58), String(e.message).split('\n').filter(Boolean)[0].slice(0, 320)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_v2_' + name.replace(/\W+/g, '_').slice(0, 40) + '.png') }); } catch { } }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const open = async (page, file) => {
    await page.goto(BASE + '/pdf-editor?v2', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 });
    await page.locator('input[type=file]').first().setInputFiles(S + file); await page.waitForSelector('.edpage', { timeout: 30000 }); await page.waitForTimeout(700);
    const lay = await page.locator('.edlayer').boundingBox(), z = lay.width / 595.3;
    return { at: (x, y) => [lay.x + x * z, lay.y + y * z] };
  };
  const tool = async (page, t) => { await page.locator(`.edtool[data-t=${t}]`).click(); await page.waitForTimeout(120); };
  const drag = async (page, g, a, b, steps = 8) => { await page.mouse.move(...g.at(...a)); await page.mouse.down(); await page.mouse.move(...g.at(...b), { steps }); await page.mouse.up(); await page.waitForTimeout(500); };
  const download = async page => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.eddl').click()]); const f = path.join(os.tmpdir(), 'tz_v2_' + Date.now() + '.pdf'); await dl.saveAs(f); return f; };
  // what is in a PDF file: paragraphs, marks and pictures (read with the editor's own engine in a fresh page)
  const inspect = async (page, file) => {
    const b64 = fs.readFileSync(file).toString('base64'); await page.goto(BASE + '/font-library', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.HT && HT.loadScript);
    return page.evaluate(async b => { await HT.loadScript('/assets/tools/fonts-helpers.js'); await HT.loadScript('/assets/engine/pdf-live.js'); const l = await HT.pdfLive.open(Uint8Array.from(atob(b), c => c.charCodeAt(0))); return { text: l.paragraphs(0).map(p => p.text), annots: l.annots(0).map(a => a.type), pictures: l.pictures(0).length }; }, b64);
  };
  const undoDisabled = page => page.getByRole('button', { name: /Undo/ }).isDisabled();

  await T('v2: opens a PDF and finds its paragraphs', async page => {
    await open(page, 'doc_align_embedded.pdf'); const n = await page.locator('.edblock').count(); ex(n >= 6 && n <= 9, 'paragraphs found: ' + n);
    ex(await page.locator('.v2ocr:not(.hidden)').count() === 0, 'the OCR prompt showed on a PDF that has text'); return n + ' paragraphs';
  });

  await T('v2: typing at the end of a paragraph re-wraps it (saved as real text)', async page => {
    await open(page, 'doc_align_embedded.pdf'); await page.locator('.edblock[title^="Left aligned"]').click(); await page.waitForSelector('.v2in');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' Extra words typed at the end that make the paragraph wrap onto a new line.'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
    const f = await download(page), r = await inspect(page, f), q = r.text.find(t => /^Left aligned/.test(t)); ex(q && /new line\.$/.test(q), 'edited paragraph missing: ' + JSON.stringify(r.text));
    ex(r.text.filter(t => /^Left aligned/.test(t)).length === 1, 'the old paragraph is still there as well'); return 'one paragraph, ' + q.length + ' letters';
  });

  await T('v2: alignment buttons, undo and redo', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'select'); await page.locator('.edblock[title^="Justified"]').click(); await page.waitForTimeout(300);
    ex(await page.locator('button[data-a=justify].on').count() === 1, 'the paragraph was not read as justified');
    await page.locator('button[data-a=centre]').click(); await page.waitForTimeout(1000); ex(!(await undoDisabled(page)), 'undo not enabled after the change');
    await page.getByRole('button', { name: /Undo/ }).click(); await page.waitForTimeout(600); ex(await undoDisabled(page), 'undo did not go back to the start');
    await page.getByRole('button', { name: /Redo/ }).click(); await page.waitForTimeout(600); ex(!(await undoDisabled(page)), 'redo did nothing'); void g; return 'justified -> centre, undo, redo';
  });

  await T('v2: marks are real annotations (highlight, shapes, arrow, pen, note)', async page => {
    const g = await open(page, 'doc_align_embedded.pdf');
    await tool(page, 'highlight'); await drag(page, g, [90, 173], [420, 178]); await tool(page, 'underline'); await drag(page, g, [90, 233], [300, 236]);
    await tool(page, 'rect'); await drag(page, g, [100, 450], [300, 520]); await tool(page, 'ellipse'); await drag(page, g, [330, 450], [450, 520]);
    await tool(page, 'arrow'); await drag(page, g, [100, 400], [300, 430]);
    await tool(page, 'pen'); await page.mouse.move(...g.at(330, 380)); await page.mouse.down(); for (const [x, y] of [[345, 360], [360, 395], [375, 360], [390, 395]]) await page.mouse.move(...g.at(x, y), { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(500);
    await tool(page, 'note'); await page.mouse.click(...g.at(500, 450)); await page.waitForSelector('.v2in'); await page.keyboard.type('Check this'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const r = await inspect(page, await download(page)), want = ['Highlight', 'Underline', 'Square', 'Circle', 'Line', 'Ink', 'Text'];
    ex(want.every(t => r.annots.includes(t)), 'marks in the file: ' + r.annots.join(',')); return r.annots.length + ' annotations';
  });

  await T('v2: a selected mark can be moved and deleted', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'rect'); await drag(page, g, [100, 450], [300, 520]);
    await tool(page, 'select'); await page.locator('.edobj[title=Square]').click(); await page.waitForTimeout(300); await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(1000);
    await page.locator('.edobj[title=Square]').click(); await page.keyboard.press('Delete'); await page.waitForTimeout(800);
    const r = await inspect(page, await download(page)); ex(!r.annots.includes('Square'), 'the rectangle is still in the file'); return 'rectangle moved, deleted';
  });

  await T('v2: a sticker sits on top of a picture without touching it', async page => {
    const g = await open(page, 'photo_page.pdf'); await tool(page, 'sticker'); await page.locator('.v2e', { hasText: '😍' }).first().click(); await page.mouse.click(...g.at(200, 300)); await page.waitForTimeout(1000);
    await tool(page, 'sticker'); await page.locator('.v2stamp', { hasText: 'APPROVED' }).click(); await page.mouse.click(...g.at(380, 450)); await page.waitForTimeout(1000);
    await page.keyboard.press('Shift+ArrowLeft'); await page.waitForTimeout(1000);
    const se = await page.locator('.edh2.se').boundingBox(); await page.mouse.move(se.x + 5, se.y + 5); await page.mouse.down(); await page.mouse.move(se.x + 50, se.y + 25, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(900);
    const r = await inspect(page, await download(page)); ex(r.annots.filter(t => t === 'Stamp').length === 2, 'stamps in the file: ' + r.annots.join(',')); ex(r.pictures === 1, 'the picture under the stickers changed: ' + r.pictures + ' pictures');
    return '2 stickers, the photo is still there';
  });

  await T('v2: saving does not break undo', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'rect'); await drag(page, g, [100, 450], [300, 520]); await tool(page, 'ellipse'); await drag(page, g, [330, 450], [450, 520]);
    await download(page); await page.getByRole('button', { name: /Undo/ }).click(); await page.waitForTimeout(500); await page.getByRole('button', { name: /Undo/ }).click(); await page.waitForTimeout(500);
    ex(await undoDisabled(page), 'undo after saving did not go back to the start'); return 'undo works after a download';
  });

  await T('v2: a scan asks for OCR on the page itself, and OCR makes it editable', async page => {
    await open(page, 'doc_scan.pdf'); ex(await page.locator('.v2ocr:not(.hidden)').count() === 1, 'no OCR prompt on a scan'); ex(await page.locator('.edblock').count() === 0, 'blocks before OCR');
    await page.locator('.v2ocr select').selectOption('eng'); await page.locator('.v2ocr button').click();
    for (let i = 0; i < 30 && !(await page.locator('.edblock').count()); i++) await page.waitForTimeout(3000);
    const n = await page.locator('.edblock').count(); ex(n >= 4, 'OCR found ' + n + ' lines'); ex(await page.locator('.v2ocr:not(.hidden)').count() === 0, 'the OCR prompt stayed after OCR');
    await page.locator('.edblock').first().click(); await page.waitForSelector('.v2in', { timeout: 30000 }); await page.keyboard.press('Control+a'); await page.keyboard.type('Changed heading'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    const r = await inspect(page, await download(page)); ex(r.text.some(t => /Changed heading/.test(t)), 'new text missing: ' + JSON.stringify(r.text)); return n + ' lines read, one changed';
  });

  await T('v2: a blank page does not ask for OCR', async page => {
    await open(page, 'doc_align_embedded.pdf'); await page.getByRole('button', { name: '+ Blank page' }).click(); await page.waitForTimeout(1200);
    ex(await page.locator('.v2ocr:not(.hidden)').count() === 0, 'OCR prompt on a blank page'); return 'no prompt';
  });

  await T('classic: /pdf-editor without ?v2 still opens the old editor', async page => {
    await page.goto(BASE + '/pdf-editor', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 });
    await page.locator('input[type=file]').first().setInputFiles(S + 'doc_embedded.pdf'); await page.waitForSelector('.edlayer', { timeout: 30000 }); ex(await page.locator('.v2in, .v2ocr').count() === 0, 'new editor parts in the classic editor'); return 'classic editor opened';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
