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
  const tool = async (page, t) => { await page.locator(`.v2tool[data-t=${t}]`).click(); await page.waitForTimeout(120); };
  const drag = async (page, g, a, b, steps = 8) => { await page.mouse.move(...g.at(...a)); await page.mouse.down(); await page.mouse.move(...g.at(...b), { steps }); await page.mouse.up(); await page.waitForTimeout(500); };
  const download = async page => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.eddl').click()]); const f = path.join(os.tmpdir(), 'tz_v2_' + Date.now() + '.pdf'); await dl.saveAs(f); return f; };
  // what is in a PDF file: paragraphs, marks and pictures (read with the editor's own engine in a fresh page)
  const inspect = async (page, file, password) => {
    const b64 = fs.readFileSync(file).toString('base64'); await page.goto(BASE + '/font-library', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.HT && HT.loadScript);
    return page.evaluate(async ([b, pw]) => {
      await HT.loadScript('/assets/tools/fonts-helpers.js'); await HT.loadScript('/assets/engine/pdf-live.js'); const m = await import('/assets/vendor/mupdf-1.28.1/mupdf.js'), bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const raw = m.Document.openDocument(bytes, 'application/pdf'); if (raw.needsPassword()) { if (!pw) return { locked: true }; if (!raw.authenticatePassword(pw)) return { locked: true, wrong: true }; }
      const l = await HT.pdfLive.open(bytes.slice(), pw || undefined).catch(() => null); if (!l) return { locked: true };
      const pg = l.page(0);
      return { locked: false, count: l.count, size: l.size(0), text: l.paragraphs(0).map(p => p.text), raw: l.lines(0).map(x => x.text), annots: l.annots(0).map(a => a.type), pictures: l.pictures(0).length, xobjects: (() => { const r = pg.getObject().getInheritable('Resources').get('XObject'); let n = 0; if (!r.isNull()) r.forEach(() => n++); return n; })(), widgets: l.widgets(0).map(w => w.name + '=' + w.value), links: pg.getLinks().length, meta: l.getMeta() };
    }, [b64, password || null]);
  };
  const menu = async (page, label) => { await page.getByRole('button', { name: /Tools/ }).click(); await page.locator('.v2menu button', { hasText: label }).click(); await page.waitForSelector('.v2dlg'); };
  const applyDlg = async page => { await page.locator('.v2dact .btn:not(.sec)').click(); await page.waitForSelector('.v2dlg', { state: 'detached', timeout: 60000 }); await page.waitForTimeout(500); };
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

  await T('v2: Chinese, Japanese and Korean text can be edited (any language the PDF has)', async page => {
    await open(page, 'doc_cjk_cid.pdf'); const head = page.locator('.edblock').first(); await head.click(); await page.waitForSelector('.v2in', { timeout: 30000 });
    await page.keyboard.press('Control+a'); await page.keyboard.type('年度总结报告 2027 안녕 こんにちは'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    const r = await inspect(page, await download(page)); ex(r.text.some(t => t.includes('年度总结报告 2027') && t.includes('안녕') && t.includes('こんにちは')), 'the new text is not in the file: ' + JSON.stringify(r.text)); return 'Chinese + Korean + Japanese in one line';
  });

  await T('v2: a blank page does not ask for OCR', async page => {
    await open(page, 'doc_align_embedded.pdf'); await page.locator('button[title="Add a blank page after this one"]').click(); await page.waitForTimeout(1200);
    ex(await page.locator('.v2ocr:not(.hidden)').count() === 0, 'OCR prompt on a blank page'); return 'no prompt';
  });

  await T('v2: find and replace in all pages (and one by one)', async page => {
    await open(page, 'doc_align_embedded.pdf'); await page.keyboard.press('Control+f'); await page.waitForSelector('.v2find:not(.hidden)');
    await page.locator('.v2find input[type=search]').fill('quick brown fox'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ex(/^5 found/.test(await page.locator('.v2find .help').first().innerText()), 'wrong count: ' + await page.locator('.v2find .help').first().innerText()); ex(await page.locator('.v2hit').count() >= 1, 'no highlight on the page');
    await page.locator('.v2find input[type=text]').fill('FAST RED FOX'); await page.getByRole('button', { name: 'Replace all' }).click(); await page.waitForFunction(() => /found|Nothing/.test(document.querySelector('.v2find .help').innerText) && !/Replacing/.test(document.querySelector('.v2find .help').innerText), null, { timeout: 60000 }); await page.waitForTimeout(800);
    let r = await inspect(page, await download(page)); ex(r.text.join(' ').match(/FAST RED FOX/g).length === 5 && !/quick brown fox/.test(r.text.join(' ')), 'replace all failed: ' + r.text.join(' ').slice(0, 200));
    const g = await open(page, 'doc_align_embedded.pdf'); void g; await page.keyboard.press('Control+f'); await page.locator('.v2find input[type=search]').fill('colours'); await page.locator('.v2find label', { hasText: 'Match case' }).locator('input').check(); await page.keyboard.press('Enter');
    await page.locator('.v2find input[type=text]').fill('COLOURS'); await page.getByRole('button', { name: 'Replace', exact: true }).click(); await page.waitForTimeout(1500);
    r = await inspect(page, await download(page)); const all = r.text.join(' '); ex((all.match(/COLOURS/g) || []).length === 1 && (all.match(/colours/g) || []).length === 4, 'one-by-one replace: ' + (all.match(/COLOURS/g) || []).length + ' upper, ' + (all.match(/colours/g) || []).length + ' lower'); return '5 replaced at once, then 1 of 5';
  });

  await T('v2: watermark (text), header and footer, page numbers', async page => {
    await open(page, 'doc_align_embedded.pdf'); await menu(page, 'Watermark'); await page.locator('.v2dlg input[type=text]').first().fill('DRAFT COPY'); await applyDlg(page);
    await menu(page, 'Page numbers'); await applyDlg(page);
    await menu(page, 'Header'); await page.locator('.v2dlg input[data-pos=tl]').fill('Toolz Baba report'); await page.locator('.v2dlg input[data-pos=bc]').fill('Bates {page:5}'); await applyDlg(page);
    const r = await inspect(page, await download(page)); const raw = r.raw.join('|'); ex(/DRAFT COPY/.test(raw), 'watermark text missing: ' + raw.slice(-200)); ex(/Page 1 of 1/.test(raw), 'page number missing'); ex(/Toolz Baba report/.test(raw) && /Bates 00001/.test(raw), 'header or Bates missing'); return 'watermark, page number and header are real text';
  });

  await T('v2: watermark with a picture', async page => {
    await open(page, 'doc_align_embedded.pdf'); await menu(page, 'Watermark'); await page.locator('.v2dlg select').first().selectOption('image'); await page.locator('.v2dlg input[type=file]').setInputFiles(S + 'photo.jpeg'); await applyDlg(page);
    const r = await inspect(page, await download(page)); ex(r.xobjects >= 1, 'no picture on the page'); return 'picture watermark';
  });

  await T('v2: redaction removes the text for good', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'redact'); await drag(page, g, [70, 160], [530, 200]);
    ex(await page.getByRole('button', { name: 'Apply redactions' }).count() === 1, 'no Apply redactions button after marking'); await page.getByRole('button', { name: 'Apply redactions' }).click(); await page.waitForSelector('.v2dlg'); await applyDlg(page);
    const r = await inspect(page, await download(page)); ex(!/Left aligned/.test(r.raw.join('|')), 'the redacted text is still in the file'); ex(/Justified/.test(r.raw.join('|')), 'other text was removed too'); return 'text gone, the rest untouched';
  });

  await T('v2: redact all matches of a word', async page => {
    await open(page, 'doc_align_embedded.pdf'); await page.keyboard.press('Control+f'); await page.locator('.v2find input[type=search]').fill('sun sets'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Mark all for redaction' }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: 'Apply redactions' }).click(); await page.waitForSelector('.v2dlg'); await applyDlg(page);
    const r = await inspect(page, await download(page)); ex(!/sun sets/.test(r.raw.join(' ')), 'the words are still there'); return 'removed for good';
  });

  await T('v2: crop pages', async page => {
    await open(page, 'doc_align_embedded.pdf'); await menu(page, 'Crop'); const nums = page.locator('.v2dlg input[type=number]'); await nums.nth(0).fill('100'); await nums.nth(2).fill('100'); await applyDlg(page);
    const r = await inspect(page, await download(page)); ex(Math.abs(r.size[1] - (841.89 - 200)) < 3, 'height after crop ' + r.size[1]); return 'page is ' + Math.round(r.size[0]) + ' x ' + Math.round(r.size[1]);
  });

  await T('v2: fill a form (fields open the page in the form tool)', async page => {
    await open(page, 'form.pdf'); ex(await page.locator('.v2tool.on').getAttribute('data-t') === 'form', 'the form tool did not start'); ex(await page.locator('.v2fld').count() >= 4, 'fields: ' + await page.locator('.v2fld').count());
    const name = page.locator('input.v2fld').first(); await name.fill('Aditya Tiwari'); await name.press('Enter'); await page.waitForTimeout(900); await page.locator('button.v2fld').first().click(); await page.waitForTimeout(900);
    const r = await inspect(page, await download(page)); ex(r.widgets.some(w => w === 'name=Aditya Tiwari') && r.widgets.some(w => /^sub=(Yes|On)/.test(w)), 'form values: ' + r.widgets.join(', ')); return r.widgets.join(', ');
  });

  await T('v2: sign (typed signature placed on the page)', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'sign'); await page.waitForSelector('.v2dlg'); await page.locator('.v2dlg .v2row button', { hasText: 'Type' }).click(); await page.locator('.v2dlg input[type=text]').first().fill('Aditya Tiwari'); await page.locator('.v2dact .btn:not(.sec)').click(); await page.waitForTimeout(700);
    await page.mouse.click(...g.at(300, 450)); await page.waitForTimeout(1200); const r = await inspect(page, await download(page)); ex(r.annots.includes('Stamp'), 'no signature on the page'); return 'signature placed';
  });

  await T('v2: link, duplicate page, extract, insert pages, properties', async page => {
    const g = await open(page, 'doc_align_embedded.pdf'); await tool(page, 'link'); await drag(page, g, [90, 160], [300, 190]); await page.waitForSelector('.v2dlg'); await page.locator('.v2dlg input[type=text]').fill('https://toolzbaba.com'); await applyDlg(page);
    await page.getByRole('button', { name: /Tools/ }).click(); await page.locator('.v2menu button', { hasText: 'Duplicate' }).click(); await page.waitForTimeout(1500);
    await menu(page, 'Document properties'); await page.locator('.v2dlg input[type=text]').first().fill('My Report'); await applyDlg(page);
    await page.getByRole('button', { name: /Tools/ }).click(); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.v2menu button', { hasText: 'Insert pages' }).click()]); await fc.setFiles(S + 'five.pdf'); await page.waitForTimeout(2500);
    const r = await inspect(page, await download(page)); ex(r.count === 7, 'pages: ' + r.count); ex(r.meta.title === 'My Report', 'title: ' + r.meta.title); ex(r.links >= 1, 'no link in the file');
    await page.goto(BASE + '/pdf-editor?v2'); return '7 pages, a link, a title';
  });

  await T('v2: protect with a password, export text', async page => {
    await open(page, 'doc_align_embedded.pdf'); await menu(page, 'Protect'); const pw = page.locator('.v2dlg input[type=password]'); await pw.nth(0).fill('open123'); await pw.nth(1).fill('owner456'); await applyDlg(page);
    const f = await download(page); let r = await inspect(page, f); ex(r.locked && !r.wrong, 'the file opens without a password'); r = await inspect(page, f, 'nope'); ex(r.locked && r.wrong, 'a wrong password was accepted'); r = await inspect(page, f, 'open123'); ex(!r.locked && r.text.length > 4, 'the right password does not open it');
    await open(page, 'doc_align_embedded.pdf'); await page.getByRole('button', { name: /Tools/ }).click(); const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.v2menu button', { hasText: 'Export text' }).click()]); const tf = path.join(os.tmpdir(), 'tz_v2_text.txt'); await dl.saveAs(tf); ex(/Annual Report/.test(fs.readFileSync(tf, 'utf-8')), 'the text file is empty'); return 'password works, text exported';
  });

  await T('v2: a PDF with a password asks for it, then opens', async page => {
    await open(page, 'doc_align_embedded.pdf'); await menu(page, 'Protect'); await page.locator('.v2dlg input[type=password]').nth(0).fill('open123'); await applyDlg(page); const f = await download(page);
    await page.goto(BASE + '/pdf-editor?v2', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('input[type=file]', { state: 'attached' }); await page.locator('input[type=file]').first().setInputFiles(f); await page.waitForSelector('.v2dlg', { timeout: 30000 });
    await page.locator('.v2dlg input[type=password]').fill('wrong'); await page.locator('.v2dact .btn:not(.sec)').click(); await page.waitForFunction(() => { const d = document.querySelector('.v2dlg'); return !!d && /not the password/.test(d.innerText); }, null, { timeout: 30000 });
    await page.locator('.v2dlg input[type=password]').fill('open123'); await page.locator('.v2dact .btn:not(.sec)').click(); await page.waitForSelector('.edpage', { timeout: 30000 }); await page.waitForTimeout(500); ex(await page.locator('.edblock').count() >= 6, 'the unlocked PDF shows no paragraphs');
    return 'wrong password refused, right one opens it';
  });

  await T('v2: find and replace also works on text read by OCR', async page => {
    await open(page, 'doc_scan.pdf'); await page.locator('.v2ocr select').selectOption('eng'); await page.locator('.v2ocr button').click();
    for (let i = 0; i < 30 && !(await page.locator('.edblock').count()); i++) await page.waitForTimeout(3000); ex(await page.locator('.edblock').count() >= 4, 'OCR read nothing');
    await page.keyboard.press('Control+f'); await page.locator('.v2find input[type=search]').fill('Quarterly'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    ex(/^1 found/.test(await page.locator('.v2find .help').first().innerText()), 'the OCR line was not found: ' + await page.locator('.v2find .help').first().innerText());
    await page.locator('.v2find input[type=text]').fill('Yearly'); await page.getByRole('button', { name: 'Replace all' }).click(); await page.waitForFunction(() => !/Replacing/.test(document.querySelector('.v2find .help').innerText), null, { timeout: 90000 }); await page.waitForTimeout(1000);
    const r = await inspect(page, await download(page)); ex(r.raw.join('|').includes('Yearly') && !r.raw.join('|').includes('Quarterly'), 'the file says: ' + r.raw.slice(0, 4).join(' | ')); return 'Quarterly -> Yearly on a scan';
  });

  await T('default: /pdf-editor opens the new editor, /pdf-editor?classic the old one', async page => {
    await page.goto(BASE + '/pdf-editor', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 });
    await page.locator('input[type=file]').first().setInputFiles(S + 'doc_embedded.pdf'); await page.waitForSelector('.v2app:not(.hidden) .edpage', { timeout: 30000 });
    await page.goto(BASE + '/pdf-editor?classic', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 30000 });
    await page.locator('input[type=file]').first().setInputFiles(S + 'doc_embedded.pdf'); await page.waitForSelector('.edlayer', { timeout: 30000 }); ex(await page.locator('.v2app:not(.hidden)').count() === 0, 'the new editor showed in the classic one');
    return 'new by default, classic on ?classic';
  });

  await T('v2: the Tools menu links to the classic editor', async page => {
    await open(page, 'doc_embedded.pdf'); await page.getByRole('button', { name: /Tools/ }).click(); await page.locator('.v2menu button', { hasText: 'Classic editor' }).click(); await page.waitForURL(/classic/, { timeout: 30000 }); return 'link works';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
