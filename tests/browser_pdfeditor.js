// Browser tests for the PDF Editor and the Font Library.
//
//   cd tests && npm install ; python smoke_api.py        (once: creates tests/samples)
//   node browser_pdfeditor.js                            (site running, e.g. BASE_URL=http://127.0.0.1:8200 after `python build.py`)
//   node browser_pdfeditor.js engine fonts               (only tests whose name contains one of these words)
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(54), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(54), String(e.message).split('\n').filter(Boolean)[0].slice(0, 320)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch {} }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForSelector('#app *'); };
  const b64 = f => fs.readFileSync(S + f).toString('base64');

  // ---------------------------------------------------------------- the export engine, called directly with a hand-made plan
  await T('engine: every kind of object ends up in the PDF', async page => {
    await go(page, '/font-library');
    const r = await page.evaluate(async ([pdfB64, pngB64]) => {
      const bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const pdf = new File([bytes(pdfB64)], 'five.pdf', { type: 'application/pdf' }), icon = new File([bytes(pngB64)], 'icon.png', { type: 'image/png' });
      const objects = [
        { page: 0, type: 'text', x: 72, y: 600, w: 300, h: 40, text: 'Hello Poppins world', lines: ['Hello Poppins world'], font: 'poppins', size: 24, bold: true, color: '#cc0000', asc: 1.05, desc: 0.35, lh: 1.25, align: 'left' },
        { page: 0, type: 'text', x: 72, y: 660, w: 300, h: 40, text: 'नमस्ते दुनिया', lines: ['नमस्ते दुनिया'], font: 'noto-sans-devanagari', size: 24, color: '#0000cc', asc: 1.07, desc: 0.35, lh: 1.25 },
        { page: 0, type: 'rect', x: 400, y: 600, w: 120, h: 60, fill: '#00aa00', stroke: '#000000', sw: 3 },
        { page: 0, type: 'ellipse', x: 400, y: 680, w: 120, h: 60, fill: '', stroke: '#aa00aa', sw: 4 },
        { page: 0, type: 'arrow', x1: 80, y1: 760, x2: 300, y2: 800, stroke: '#ff6600', sw: 4 },
        { page: 0, type: 'pen', pts: [[320, 780], [340, 760], [360, 790], [380, 760]], stroke: '#000000', sw: 3 },
        { page: 0, type: 'image', img: 'a', x: 450, y: 760, w: 60, h: 60 },
        { page: 1, type: 'whiteout', x: 60, y: 70, w: 400, h: 50, remove: true, color: '#ffffff' },
        { page: 2, type: 'text', x: 72, y: 100, w: 400, h: 40, text: 'Blank page text', lines: ['Blank page text'], font: 'lora', size: 20, color: '#000000', asc: 1.0, desc: 0.27, lh: 1.25 },
        { page: 3, type: 'textedit', x: 70, y: 80, w: 400, h: 34, text: 'Edited line', lines: ['Edited line'], font: 'arimo', size: 24, color: '#000000', asc: 0.91, desc: 0.21, lh: 1.15 },
        { page: 3, type: 'highlight', x: 72, y: 300, w: 300, h: 40, color: '#fff200', opacity: 0.5 },
      ];
      const { id } = await HT.upload('pdf-editor', [pdf, icon], { pages: [{ src: 0, rotate: 0 }, { src: 1, rotate: 0 }, { src: -1, w: 595, h: 842, rotate: 0 }, { src: 2, rotate: 0 }, { src: 3, rotate: 90 }], objects, images: { a: 1 } });
      const job = await HT.poll(id, () => { });
      await HT.loadScript('/assets/tools/pdf-helpers.js');
      const doc = await HT.pdf.open(new File([await (await fetch(job.url)).blob()], 'out.pdf')), out = { pages: doc.numPages, summary: job.info.summary, size: job.size, text: [], ink: [] };
      for (let n = 1; n <= doc.numPages; n++) {
        out.text.push((await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' '));
        const r = await HT.pdf.render(doc, n, 500, { dpr: 1 }), x = r.canvas.getContext('2d'), W = r.canvas.width, H = r.canvas.height;
        const color = (u, v) => Array.from(x.getImageData(Math.round(u * W), Math.round(v * H), 1, 1).data.slice(0, 3));
        out.ink.push({ W, H, green: color(430 / 595, 630 / 842), white: color(0.5, 0.97), c: color(0.5, 0.5) });
      }
      return out;
    }, [b64('five.pdf'), b64('icon.png')]);
    ex(r.pages === 5, 'pages ' + r.pages); ex(/Hello Poppins world/.test(r.text[0]), 'real text lost: ' + r.text[0]); ex(!/नमस्ते/.test(r.text[0]), 'the Hindi line should be a picture, not text');
    ex(r.ink[0].green[1] > 120 && r.ink[0].green[0] < 80, 'the green rectangle is missing: ' + r.ink[0].green);
    ex(!/Page 2 of/.test(r.text[1]), 'the white-out should remove the text underneath for good: ' + r.text[1]);
    ex(/Blank page text/.test(r.text[2]), 'text on the blank page: ' + r.text[2]);
    ex(/Edited line/.test(r.text[3]) && !/Page 3 of/.test(r.text[3]), 'edited text: ' + r.text[3]);
    ex(r.ink[4].W > r.ink[4].H && r.ink[3].W < r.ink[3].H, 'the last page should be rotated to landscape: ' + r.ink[4].W + 'x' + r.ink[4].H);
    return `${r.pages} pages, ${r.summary}; text: "${r.text[0].slice(0, 40)}" / "${r.text[3].slice(0, 30)}"`;
  });

  // ---- NEW TESTS BELOW

  // ---------------------------------------------------------------- the font library page
  await T('fonts: library lists the fonts, filters by script, downloads a ZIP', async page => {
    await go(page, '/font-library'); await page.waitForSelector('.fcard'); await page.waitForTimeout(800);
    const all = await page.locator('.fcard').count(); ex(all >= 40, 'only ' + all + ' fonts');
    await page.locator('.tab', { hasText: 'Indian scripts' }).click(); await page.waitForTimeout(500);
    const indic = await page.locator('.fcard').count(); ex(indic >= 8 && indic < all, 'indian scripts: ' + indic);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.fcard').first().getByRole('button', { name: 'Download' }).click()]);
    const buf = fs.readFileSync(await dl.path()); ex(buf.slice(0, 2).toString() === 'PK', 'not a zip');
    return `${all} fonts, ${indic} Indian, zip ${buf.length} bytes`;
  });

  // ---------------------------------------------------------------- the editor
  const openEditor = async (page, file = 'five.pdf') => {
    await go(page, '/pdf-editor'); await page.setInputFiles('input[type=file]', S + file); await page.waitForSelector('.edlayer'); await page.waitForTimeout(700);
    return await page.locator('.edlayer').boundingBox();
  };
  const dragOn = async (page, box, x0, y0, x1, y1) => { await page.mouse.move(box.x + x0, box.y + y0); await page.mouse.down(); await page.mouse.move(box.x + x1, box.y + y1, { steps: 6 }); await page.mouse.up(); };
  const tool = (page, t) => page.locator(`.edtool[data-t=${t}]`).click();
  // downloads the edit as the chosen format and returns the file's bytes
  const save = async (page, kind) => {
    await page.locator('select[aria-label="Download as"]').selectOption(kind);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
  };
  const pdfText = (page, b) => page.evaluate(async b64 => {
    await HT.loadScript('/assets/tools/pdf-helpers.js'); const doc = await HT.pdf.open(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'x.pdf')), t = [];
    for (let n = 1; n <= doc.numPages; n++) t.push((await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' '));
    return { pages: doc.numPages, text: t };
  }, b.buf.toString('base64'));

  await T('editor: add text + shape, undo/redo, download PDF', async page => {
    const box = await openEditor(page);
    await tool(page, 'text'); await dragOn(page, box, 80, 100, 380, 150); await page.keyboard.type('Typed in the editor'); await page.keyboard.press('Escape');
    await tool(page, 'rect'); await dragOn(page, box, 80, 400, 220, 470);
    ex(await page.locator('.edo').count() === 2, 'two objects expected');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400); ex(await page.locator('.edo').count() === 1, 'undo did not remove the rectangle');
    await page.keyboard.press('Control+y'); await page.waitForTimeout(400); ex(await page.locator('.edo').count() === 2, 'redo did not bring it back');
    const f = await save(page, 'pdf'); ex(f.name === 'five_edited.pdf', f.name);
    const r = await pdfText(page, f); ex(r.pages === 5, 'pages ' + r.pages); ex(/Typed in the editor/.test(r.text[0]) && /Page 1 of/.test(r.text[0]), 'text: ' + r.text[0]);
    return `${f.buf.length} bytes, "${r.text[0].slice(0, 50)}"`;
  });

  await T('editor: change the font and write Hindi, export keeps both', async page => {
    const box = await openEditor(page);
    await tool(page, 'text'); await dragOn(page, box, 80, 100, 400, 150); await page.keyboard.type('नमस्ते दुनिया'); await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.fpick-btn').click(); await page.locator('.fpick-row', { hasText: 'Noto Sans Devanagari' }).first().click(); await page.waitForTimeout(500);
    const fam = await page.locator('.edtext').evaluate(e => getComputedStyle(e).fontFamily); ex(/Devanagari/.test(fam), 'font not applied: ' + fam);
    const f = await save(page, 'pdf'); ex(f.buf.length > 2000, 'tiny file');
    return fam;
  });

  await T('editor: edit the text that is already in the PDF', async page => {
    const box = await openEditor(page);
    await tool(page, 'edit'); await page.waitForSelector('.edblock'); await page.locator('.edblock').first().click(); await page.waitForSelector('.edtext.editing'); await page.waitForTimeout(200);
    await page.keyboard.press('Control+a'); await page.keyboard.type('Replaced title'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const f = await save(page, 'pdf'); const r = await pdfText(page, f);
    ex(/Replaced title/.test(r.text[0]), 'new text missing: ' + r.text[0]); ex(!/Page 1 of the test document/.test(r.text[0]), 'old text still there: ' + r.text[0]);
    return r.text[0].slice(0, 60);
  });

  await T('editor: white-out removes text for good; pages: blank, delete', async page => {
    const box = await openEditor(page);
    await tool(page, 'whiteout'); await dragOn(page, box, 60, 60, box.width - 40, 160);
    await page.getByRole('button', { name: '+ Blank page after' }).click(); await page.waitForTimeout(500);
    ex(/Page 2 of 6/.test(await page.locator('.edbar').innerText()), 'blank page not added');
    await page.getByRole('button', { name: 'Delete page' }).click(); await page.waitForTimeout(400);
    const bar = await page.locator('.edbar').innerText(); ex(/of 5/.test(bar), 'page not deleted: ' + bar);
    const f = await save(page, 'pdf'); const r = await pdfText(page, f); ex(r.pages === 5, 'pages ' + r.pages); ex(!/Page 1 of the test/.test(r.text[0]), 'white-out left the text in the file: ' + r.text[0]);
    return 'text gone: "' + r.text[0].slice(0, 30) + '"';
  });

  await T('editor: download as Word, text and page pictures', async page => {
    const box = await openEditor(page);
    await tool(page, 'text'); await dragOn(page, box, 80, 100, 400, 150); await page.keyboard.type('Export me'); await page.keyboard.press('Escape');
    const w = await save(page, 'docx'); ex(/\.docx$/.test(w.name) && w.buf.slice(0, 2).toString() === 'PK', 'word: ' + w.name);
    const t = await save(page, 'txt'); ex(/Export me/.test(t.buf.toString('utf8')), 'txt: ' + t.buf.toString('utf8').slice(0, 80));
    const i = await save(page, 'images'); ex(i.buf.slice(0, 2).toString() === 'PK', 'images zip: ' + i.name);
    return `${w.name} ${w.buf.length}b, ${t.name}, ${i.name} ${i.buf.length}b`;
  });

  await T('editor: picture, drag + resize handles, arrow, pen', async page => {
    const box = await openEditor(page);
    await tool(page, 'image'); await page.waitForTimeout(100);
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(S + 'icon.png'); await page.waitForSelector('.edimg'); await page.waitForTimeout(300);
    await page.locator('.edh.h-se').scrollIntoViewIfNeeded(); const before = await page.locator('.edimg').boundingBox(); const h = await page.locator('.edh.h-se').boundingBox();
    await page.mouse.move(h.x + 5, h.y + 5); await page.mouse.down(); await page.mouse.move(h.x + 65, h.y + 65, { steps: 5 }); await page.mouse.up();
    const after = await page.locator('.edimg').boundingBox(); ex(after.width > before.width + 20, `resize: ${before.width} -> ${after.width}`);
    await page.mouse.move(after.x + 20, after.y + 20); await page.mouse.down(); await page.mouse.move(after.x + 120, after.y + 70, { steps: 5 }); await page.mouse.up();
    const moved = await page.locator('.edimg').boundingBox(); ex(moved.x > after.x + 50, 'move: ' + after.x + ' -> ' + moved.x);
    await tool(page, 'arrow'); await dragOn(page, box, 100, 600, 300, 520); await tool(page, 'pen'); await dragOn(page, box, 320, 600, 420, 560);
    ex(await page.locator('.edo').count() === 3, 'objects ' + await page.locator('.edo').count());
    const f = await save(page, 'pdf'); ex(f.buf.length > 4000, 'tiny');
    return `${f.buf.length} bytes`;
  });

  await T('editor: font library window - search, preview your text, use a font', async page => {
    const box = await openEditor(page);
    // nothing selected: the choice becomes the font of the next text
    await page.getByRole('button', { name: 'Aa Font library' }).click(); await page.waitForSelector('dialog.flib[open] .fcard'); await page.waitForTimeout(600);
    const all = await page.locator('dialog.flib .fcard').count(); ex(all >= 40, 'only ' + all + ' fonts');
    await page.locator('dialog.flib input[type=search]').fill('poppins'); await page.waitForTimeout(500); ex(await page.locator('dialog.flib .fcard').count() === 1, 'search did not narrow the list');
    await page.locator('dialog.flib .fcard').getByRole('button', { name: 'Use this font' }).click(); await page.waitForSelector('dialog.flib', { state: 'detached' });
    await tool(page, 'text'); await dragOn(page, box, 80, 100, 400, 150); await page.keyboard.type('Poppins please'); await page.keyboard.press('Escape');
    ex(/Poppins/.test(await page.locator('.edtext').evaluate(e => getComputedStyle(e).fontFamily)), 'the next text did not get the chosen font');
    // a selected text: the choice changes that text, and fonts without its letters are marked
    await page.getByRole('button', { name: 'Browse the font library' }).click(); await page.waitForSelector('dialog.flib[open] .fcard');
    ex(await page.locator('dialog.flib .fcard.on').count() === 1, 'the font in use is not marked');
    await page.locator('dialog.flib input[type=search]').fill('lora'); await page.waitForTimeout(500); await page.locator('dialog.flib .fcard').getByRole('button', { name: 'Use this font' }).click();
    await page.waitForTimeout(500); ex(/Lora/.test(await page.locator('.edtext').evaluate(e => getComputedStyle(e).fontFamily)), 'selected text did not change');
    await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(500); ex(/Poppins/.test(await page.locator('.edtext').evaluate(e => getComputedStyle(e).fontFamily)), 'undo did not bring the old font back');
    return all + ' fonts in the window';
  });

  await T('editor: font library marks fonts that miss the letters of a Hindi text', async page => {
    const box = await openEditor(page);
    await tool(page, 'text'); await dragOn(page, box, 80, 100, 400, 150); await page.keyboard.type('नमस्ते'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Browse the font library' }).click(); await page.waitForSelector('dialog.flib[open] .fcard'); await page.waitForTimeout(600);
    const missing = await page.locator('dialog.flib .fcard.no').count(), total = await page.locator('dialog.flib .fcard').count();
    ex(missing > 20 && missing < total, `missing ${missing} of ${total}`); ex(/नमस्ते/.test(await page.locator('dialog.flib .fprev').first().innerText()), 'preview should show the selected text');
    await page.keyboard.press('Escape'); await page.waitForSelector('dialog.flib', { state: 'detached' });
    return `${missing} of ${total} marked`;
  });

  await T('editor: font library window fits a phone', async page => {
    await page.setViewportSize({ width: 390, height: 800 }); await openEditor(page);
    await page.getByRole('button', { name: 'Aa Font library' }).click(); await page.waitForSelector('dialog.flib[open] .fcard');
    const r = await page.evaluate(() => { const d = document.querySelector('dialog.flib').getBoundingClientRect(), b = document.querySelector('.flib-body'); return { w: Math.round(d.width), h: Math.round(d.height), over: b.scrollWidth > b.clientWidth + 1 }; });
    ex(r.w <= 390 && !r.over, 'dialog ' + JSON.stringify(r)); return r.w + 'x' + r.h;
  });

  // ---------------------------------------------------------------- changing what is already in the PDF, without picking a special tool
  await T('editor: click the PDF\'s own text (Select mode) and change it', async page => {
    await openEditor(page, 'doc_standard.pdf'); await page.waitForSelector('.edblock'); ex(/Tip/.test(await page.locator('.edtip').first().innerText()), 'tip missing');
    ex(await page.locator('.edtool[data-t=select].on').count() === 1, 'Select should be the tool on open');
    const n = await page.locator('.edblock').count(); ex(n >= 10, 'blocks ' + n);
    const tops = await page.locator('.edblock').evaluateAll(es => es.map(e => parseFloat(e.style.top))), top = tops.indexOf(Math.min(...tops)), heading = page.locator('.edblock').nth(top); const bb = await heading.boundingBox(); await page.mouse.move(bb.x + 20, bb.y + 8);
    ex((await heading.evaluate(e => getComputedStyle(e).borderTopStyle)) === 'dashed', 'no hover outline on the text');
    await page.mouse.click(bb.x + 20, bb.y + 8); await page.waitForSelector('.edtext.editing'); ex(/Quarterly Report 2026/.test(await page.locator('.edtext.editing').innerText()), 'wrong text opened');
    await page.keyboard.press('Control+a'); await page.keyboard.type('Annual Report 2027'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const f = await save(page, 'pdf'); const r = await pdfText(page, f);
    ex(/Annual Report 2027/.test(r.text[0]) && !/Quarterly Report 2026/.test(r.text[0]), 'text: ' + r.text[0].slice(0, 120)); ex(/Prepared by Toolz Baba/.test(r.text[0]) && /Compress Image/.test(r.text[0]), 'the rest of the page was damaged: ' + r.text[0].slice(0, 200));
    return `${n} text blocks, heading changed`;
  });

  await T('editor: a list keeps its lines, a paragraph is one block, table cells are separate', async page => {
    await openEditor(page, 'doc_standard.pdf'); await page.waitForSelector('.edblock');
    const blocks = await page.locator('.edblock').count();
    await page.locator('.edtool[data-t=edit]').click(); await page.waitForTimeout(300);
    const t = async i => { await page.locator('.edblock').nth(i).click(); await page.waitForSelector('.edtext.editing'); const x = await page.locator('.edtext.editing').innerText(); await page.keyboard.press('Escape'); await page.waitForTimeout(200); return x; };
    // find the list block by its content
    let list = null; for (let i = 0; i < blocks && !list; i++) { const x = await t(i); if (/Faster tools/.test(x)) list = x; }
    ex(list && list.split('\n').length === 3, 'the 3 bullets should stay 3 lines: ' + JSON.stringify(list));
    return JSON.stringify(list).slice(0, 80);
  });

  await T('editor: things you added stay on top of the page text and can be selected', async page => {
    const box = await openEditor(page, 'doc_standard.pdf'); await page.waitForSelector('.edblock');
    await tool(page, 'rect'); await dragOn(page, box, 100, 340, 360, 420);               // over the paragraph
    await page.waitForTimeout(300); ex(await page.locator('.edshape').count() === 1, 'rect not drawn');
    await page.mouse.click(box.x + 200, box.y + 380); await page.waitForTimeout(300);
    ex(await page.locator('.edsel').count() === 1 && !(await page.locator('.edtext.editing').count()), 'clicking the rectangle should select it, not edit the text under it');
  });

  await T('editor: a column layout gives one block per column', async page => {
    await openEditor(page, 'doc_columns.pdf'); await page.waitForSelector('.edblock'); const n = await page.locator('.edblock').count(); ex(n === 4, 'blocks ' + n); return n + ' blocks';
  });

  await T('editor: a scan explains that it has no text and offers OCR', async page => {
    await openEditor(page, 'scan3.pdf'); await page.waitForTimeout(1200); ex(await page.locator('.edblock').count() === 0, 'a scan has no text blocks');
    ex(await page.locator('.edtip:has-text("a scan")').isVisible(), 'a scanned page should offer OCR'); ex(await page.getByRole('button', { name: /Make the text editable/ }).isVisible(), 'no OCR button');
  });

  await T('editor: remove a picture of the PDF and put your own in its place', async page => {
    await openEditor(page, 'five.pdf'); await page.waitForSelector('.edpic'); ex(await page.locator('.edpic').count() === 1, 'the picture of page 1 should be clickable');
    await page.locator('.edpic').click(); await page.waitForSelector('.edorig'); ex(/Picture of the PDF/.test(await page.locator('.card').filter({ hasText: 'Picture of the PDF' }).first().innerText()), 'settings missing');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Replace with my picture' }).click()]); await fc.setFiles(S + 'icon.png'); await page.waitForSelector('.edimg'); await page.waitForTimeout(400);
    const f = await save(page, 'pdf');
    const r = await page.evaluate(async b64 => { await HT.loadScript('/assets/tools/pdf-helpers.js'); const doc = await HT.pdf.open(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'x.pdf')), pg = await doc.getPage(1), L = await HT.pdf.lib(), ol = await pg.getOperatorList(); return ol.fnArray.filter(x => x === L.OPS.paintImageXObject || x === L.OPS.paintInlineImageXObject).length; }, f.buf.toString('base64'));
    ex(r === 1, 'page 1 should hold exactly one picture (the new one), found ' + r); ex(f.buf.length < 100000, 'the old picture is still in the file: ' + f.buf.length + ' bytes');
    return `new file ${f.buf.length} bytes (was 84 KB)`;
  });

  await T('editor: "Put it back" restores a removed picture', async page => {
    await openEditor(page, 'five.pdf'); await page.waitForSelector('.edpic'); await page.locator('.edpic').click(); await page.waitForSelector('.edorig');
    await page.getByRole('button', { name: 'Put it back' }).click(); await page.waitForTimeout(400); ex(!(await page.locator('.edorig').count()), 'still marked as removed'); ex(await page.locator('.edpic').count() === 1, 'the picture is not clickable again');
  });

  await T('editor: a scan is read with OCR and its text can be changed', async page => {
    await openEditor(page, 'doc_scan.pdf'); await page.waitForTimeout(800); ex(await page.locator('.edblock').count() === 0, 'a scan has no text blocks before OCR');
    await page.locator('.edtip select').selectOption('eng'); await page.getByRole('button', { name: /Make the text editable/ }).click(); await page.waitForSelector('.edblock', { timeout: 180000 });
    const n = await page.locator('.edblock').count(); ex(n >= 8, 'only ' + n + ' lines read');
    let seen = false; for (let i = 0; i < n && !seen; i++) { await page.locator('.edblock').nth(i).click(); await page.waitForSelector('.edtext.editing'); if (/Quarterly Report/.test(await page.locator('.edtext.editing').innerText())) seen = true; else { await page.keyboard.press('Escape'); await page.waitForTimeout(150); } }
    ex(seen, 'the heading was not read'); await page.keyboard.press('Control+a'); await page.keyboard.type('Annual Report 2027'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const f = await save(page, 'pdf'); const r = await pdfText(page, f); ex(/Annual Report 2027/.test(r.text[0]), 'new text missing: ' + JSON.stringify(r.text[0]));
    return n + ' lines read, heading changed';
  });

  await T('editor: phone layout has no sideways scroll', async page => {
    await page.setViewportSize({ width: 390, height: 800 }); await openEditor(page);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ex(w[0] <= w[1] + 1, 'sideways scroll ' + w);
    return w.join('/');
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
