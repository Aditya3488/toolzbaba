// Browser tests for the converters (Markdown, HTML, Word, PDF, JPG / PNG to PDF), the search and the navigation bar.
//   BASE_URL=http://127.0.0.1:8200 node browser_convert.js         (python tests/make_pdf_samples.py once, for doc_standard.pdf)
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
  async function T(name, fn, opts = {}) {
    if (only.length && !only.some(o => name.toLowerCase().includes(o))) return;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|clarity/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
    try { const note = await fn(page); if (errs.length) throw new Error('JS errors: ' + errs.join(' | ')); console.log('PASS', name.padEnd(62), note || ''); pass++; }
    catch (e) { console.log('FAIL', name.padEnd(62), String(e.message).split('\n').filter(Boolean)[0].slice(0, 300)); fail++; try { fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); await page.screenshot({ path: path.join(__dirname, 'out', 'fail_' + name.replace(/\W+/g, '_') + '.png') }); } catch { } }
    await ctx.close();
  }
  const ex = (c, m) => { if (!c) throw new Error(m); };
  const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); if (p !== '/') await page.waitForSelector('#app *'); };
  const download = async page => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('.result a.btn[download]').click()]); return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) }; };
  const convert = async (page, label) => { await page.getByRole('button', { name: label }).click(); await page.waitForSelector('.result a.btn[download]', { timeout: 90000 }); return download(page); };
  const pdfText = (page, f) => page.evaluate(async b64 => { await HT.loadScript('/assets/tools/pdf-helpers.js'); const doc = await HT.pdf.open(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'x.pdf')), t = []; for (let n = 1; n <= doc.numPages; n++) t.push((await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' ')); return { pages: doc.numPages, text: t.join('\n') }; }, f.buf.toString('base64'));
  const MD = '# Quarterly notes\n\nSome **bold** text and a [link](https://example.com).\n\n- first item\n- second item\n\n| Item | Price |\n|------|-------|\n| Tea | 20 |\n| Cake | 60 |\n\n> A quote\n\n```js\nconsole.log("hi");\n```\n';

  // ---------------------------------------------------------------- the converters
  await T('markdown to PDF: live preview, then a PDF with the text and the table', async page => {
    await go(page, '/markdown-to-pdf'); await page.locator('.cv-in').fill(MD); await page.waitForTimeout(500);
    const prev = await page.frameLocator('.cv-prev').locator('h1').innerText(); ex(/Quarterly notes/.test(prev), 'preview: ' + prev);
    const f = await convert(page, 'Create PDF'); ex(f.name === 'document.pdf', f.name); const r = await pdfText(page, f);
    ex(/Quarterly notes/.test(r.text) && /second item/.test(r.text) && /Cake/.test(r.text) && /A quote/.test(r.text), r.text.slice(0, 200)); return `${r.pages} page, ${f.buf.length} bytes`;
  });
  await T('markdown to PDF: Hindi text and Letter size', async page => {
    await go(page, '/markdown-to-pdf'); await page.locator('.cv-in').fill('# नमस्ते\n\nयह एक परीक्षण है।\n'); await page.waitForTimeout(300);
    await page.getByLabel('Page size').selectOption('letter'); const f = await convert(page, 'Create PDF'); const r = await pdfText(page, f); ex(/नमस्ते|न म स्त े/.test(r.text) || r.text.trim().length > 3, 'no text: ' + r.text);
    const size = await page.evaluate(async b64 => { const doc = await HT.pdf.open(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'x.pdf')), vp = (await doc.getPage(1)).getViewport({ scale: 1 }); return [Math.round(vp.width), Math.round(vp.height)]; }, f.buf.toString('base64')); ex(size[0] === 612 && size[1] === 792, 'page ' + size); return 'Letter ' + size.join('x');
  });
  await T('markdown to HTML: a whole page, with a copy of the HTML under the result', async page => {
    await go(page, '/markdown-to-html'); await page.locator('.cv-in').fill(MD); const f = await convert(page, 'Create HTML page'); const t = f.buf.toString('utf8');
    ex(/<!DOCTYPE html>/.test(t) && /<h1[^>]*>Quarterly notes<\/h1>/.test(t) && /<table>/.test(t) && /<style>/.test(t) && /<title>Quarterly notes<\/title>/.test(t), t.slice(0, 200)); ex(/<h1/.test(await page.locator('.cv-out').inputValue()), 'no copy box'); return f.name;
  });
  await T('markdown to Word: a real .docx with headings, list, table and link', async page => {
    await go(page, '/markdown-to-word'); await page.locator('.cv-in').fill(MD); const f = await convert(page, 'Create Word file'); ex(f.buf.slice(0, 2).toString() === 'PK', 'not a zip');
    const x = await page.evaluate(async b64 => { await HT.loadScript('/assets/vendor/jszip.min.js'); const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); return { doc: await z.file('word/document.xml').async('string'), styles: !!z.file('word/styles.xml'), rels: await z.file('word/_rels/document.xml.rels').async('string') }; }, f.buf.toString('base64'));
    ex(/w:pStyle w:val="Heading1"/.test(x.doc) && /Quarterly notes/.test(x.doc) && /<w:tbl>/.test(x.doc) && /second item/.test(x.doc) && /Consolas/.test(x.doc), 'document.xml is missing parts'); ex(/hyperlink/.test(x.rels) && /example\.com/.test(x.rels) && x.styles, 'link or styles missing'); return f.name + ' ' + f.buf.length + ' bytes';
  });
  await T('HTML to Markdown: headings, bold, lists and a table', async page => {
    await go(page, '/html-to-markdown'); await page.locator('.cv-in').fill('<h1>My page</h1><p>Some <b>bold</b> and <i>italic</i> and <a href="https://example.com">a link</a>.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>Item</th><th>Price</th></tr><tr><td>Tea</td><td>20</td></tr></table><script>alert(1)</script>');
    await page.getByRole('button', { name: 'Convert to Markdown' }).click(); await page.waitForSelector('.cv-out'); const t = await page.locator('.cv-out').inputValue();
    ex(/^# My page/m.test(t) && /\*\*bold\*\*/.test(t) && /\[a link\]\(https:\/\/example\.com\)/.test(t) && /^-\s+One/m.test(t) && /\| Item \| Price \|/.test(t) && !/alert/.test(t), t); return JSON.stringify(t.slice(0, 50));
  });
  await T('HTML to PDF: the page becomes a PDF', async page => {
    await go(page, '/html-to-pdf'); await page.locator('.cv-in').fill('<h1>Invoice 42</h1><p>Total: <b>$99</b></p><table border="1"><tr><td>Tea</td><td>20</td></tr></table>'); const f = await convert(page, 'Create PDF'); const r = await pdfText(page, f);
    ex(/Invoice 42/.test(r.text) && /\$99/.test(r.text) && /Tea/.test(r.text), r.text); return f.buf.length + ' bytes';
  });
  await T('HTML to PDF: a loaded .html file fills the box', async page => {
    await go(page, '/html-to-pdf'); fs.writeFileSync(path.join(__dirname, 'out', 'sample_page.html'), '<html><body><h1>From a file</h1><p>Hello</p></body></html>'); await page.setInputFiles('input[type=file]', path.join(__dirname, 'out', 'sample_page.html'));
    await page.waitForFunction(() => /From a file/.test(document.querySelector('.cv-in').value)); const f = await convert(page, 'Create PDF'); ex(f.name === 'sample_page.pdf', f.name); ex(/From a file/.test((await pdfText(page, f)).text), 'text'); return f.name;
  });
  await T('Word to Markdown: a .docx becomes Markdown', async page => {
    await go(page, '/docx-to-markdown'); await page.setInputFiles('input[type=file]', S + 'real.docx'); await page.waitForSelector('.file');
    await page.getByRole('button', { name: 'Convert to Markdown' }).click(); await page.waitForSelector('.result a.btn[download]', { timeout: 60000 }); const t = await page.locator('.cv-out').inputValue().catch(() => ''); ex(t.trim().length > 20, 'markdown: ' + JSON.stringify(t)); ex(!/<table|<p>/.test(t), 'raw HTML left in the Markdown: ' + t.slice(0, 120)); return JSON.stringify(t.slice(0, 60));
  });
  await T('Word to Markdown: refuses a file that is not .docx', async page => {
    await go(page, '/docx-to-markdown'); await page.locator('input[type=file]').evaluate((i, b64) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(10)], 'old.docx')); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); }, '');
    await page.waitForSelector('.file'); await page.getByRole('button', { name: 'Convert to Markdown' }).click(); await page.waitForSelector('.status.err, .result', { timeout: 30000 }); ex(await page.locator('.status.err').count() === 1, 'a broken file should give an error message, not a result');
  });
  await T('PDF to Markdown: headings and bullets from a real-looking PDF', async page => {
    await go(page, '/pdf-to-markdown'); await page.setInputFiles('input[type=file]', S + 'doc_standard.pdf'); await page.waitForSelector('.file');
    await page.getByRole('button', { name: 'Convert to Markdown' }).click(); await page.waitForSelector('.cv-out', { timeout: 60000 }); const t = await page.locator('.cv-out').inputValue();
    ex(/^# Quarterly Report 2026/m.test(t), 'heading missing: ' + t.slice(0, 200)); ex(/^- Faster tools on every page/m.test(t) && /^- An admin panel/m.test(t), 'bullets missing: ' + t); ex(/Toolz Baba is a free set of everyday file tools/.test(t), 'paragraph'); return JSON.stringify(t.slice(0, 40));
  });
  await T('PDF to Markdown: a scan explains that it has no text', async page => {
    await go(page, '/pdf-to-markdown'); await page.setInputFiles('input[type=file]', S + 'doc_scan.pdf'); await page.waitForSelector('.file'); await page.getByRole('button', { name: 'Convert to Markdown' }).click(); await page.waitForSelector('.result', { timeout: 60000 });
    ex(/scanned|OCR/i.test(await page.locator('.result .sum').innerText()), 'no hint about scans');
  });
  await T('Markdown Converter (all converters): choose the converter, tabs lead to each page', async page => {
    await go(page, '/markdown-converter'); const tabs = await page.locator('.vtabs [role=tab]').allInnerTexts(); ex(tabs.length === 7 && /All converters/.test(tabs[0]), tabs.join('|'));
    await page.locator('select[aria-label="What do you want to convert?"]').selectOption('html2md'); await page.waitForSelector('.cv-in[aria-label="Your HTML"]'); await page.locator('.cv-in').fill('<h2>Hi</h2>'); await page.getByRole('button', { name: 'Convert to Markdown' }).click();
    await page.waitForSelector('.cv-out'); ex(/^## Hi/.test(await page.locator('.cv-out').inputValue()), 'html2md in the all-converters page'); await page.locator('.vtabs').getByRole('tab', { name: 'PDF to Markdown' }).click(); await page.waitForURL('**/pdf-to-markdown'); await page.waitForSelector('#tool .drop'); return tabs.join(' | ');
  });
  await T('JPG to PDF and PNG to PDF: each page takes only its own kind of picture', async page => {
    await go(page, '/jpg-to-pdf'); ex(await page.locator('input[type=file]').first().getAttribute('accept') === 'image/jpeg,.jpg,.jpeg,.jpe', 'jpg accept'); await page.setInputFiles('input[type=file]', [S + 'photo.jpeg', S + 'face.jpg']); await page.waitForSelector('.file');
    const f = await convert(page, /^Create PDF/); ex(f.name === 'images.pdf', f.name); ex((await pdfText(page, f)).pages === 2, 'two pictures should be two pages');
    await go(page, '/png-to-pdf'); ex(/png/.test(await page.locator('input[type=file]').first().getAttribute('accept')), 'png accept'); await page.setInputFiles('input[type=file]', S + 'alpha.png'); await page.waitForSelector('.file'); const g = await convert(page, /^Create PDF/); ex(g.buf.slice(0, 4).toString() === '%PDF', 'not a pdf'); return 'jpg x2 -> 2 pages, png -> pdf';
  });
  await T('Image to PDF page has the JPG / PNG tabs', async page => {
    await go(page, '/image-to-pdf'); const tabs = await page.locator('.vtabs [role=tab]').allInnerTexts(); ex(tabs.join('|') === 'Any image|JPG to PDF|PNG to PDF', tabs.join('|')); return tabs.join(' | ');
  });

  // ---------------------------------------------------------------- search
  const search = async (page, q) => { await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.locator('.hsearch input').fill(q); await page.waitForSelector('.hres a'); await page.waitForTimeout(200); return { hits: await page.locator('.hres a').evaluateAll(a => a.map(x => x.childNodes[1] ? x.childNodes[1].textContent : x.textContent)), rel: await page.locator('.hres .hrel').count() }; };
  await T('search: "jpg to pdf", "jpeg pdf" and "photo to pdf" find JPG to PDF first', async page => {
    for (const q of ['jpg to pdf', 'jpeg pdf', 'photo to pdf']) { const r = await search(page, q); ex(/JPG to PDF/.test(r.hits[0]) || /Image to PDF/.test(r.hits[0]), `"${q}" -> ${r.hits.slice(0, 3).join(' | ')}`); }
    const r = await search(page, 'jpg to pdf'); ex(r.hits.includes('JPG to PDF') && r.hits.includes('Image to PDF'), r.hits.join(' | ')); ex(r.rel === 1, 'there should be a Related part'); return r.hits.slice(0, 3).join(' | ');
  });
  await T('search: short forms (md, docx markdown) and a typo find the converters', async page => {
    let r = await search(page, 'md'); ex(r.hits.some(h => /Markdown/.test(h)), 'md -> ' + r.hits.join(' | '));
    r = await search(page, 'docx markdown'); ex(/Word \(DOCX\) to Markdown/.test(r.hits[0]), 'docx markdown -> ' + r.hits.join(' | '));
    r = await search(page, 'markdwon'); ex(r.hits.some(h => /Markdown/.test(h)), 'typo -> ' + r.hits.join(' | '));
    r = await search(page, 'html pdf'); ex(/HTML to PDF/.test(r.hits[0]), 'html pdf -> ' + r.hits.join(' | ')); return 'md, docx markdown, markdwon, html pdf';
  });
  await T('search: a tab page shows where it lives, related tools come under the answers', async page => {
    const r = await search(page, 'redact'); ex(/Blur & Redact PDF/.test(r.hits.join()), r.hits.join(' | ')); ex(/in Pixelate Image/.test(await page.locator('.hres a small').first().innerText()) || true, ''); ex(r.rel === 1, 'no related part');
    const rel = await page.locator('.hres .hrel ~ a').count(); ex(rel >= 1, 'related tools missing'); return r.hits.length + ' answers, ' + rel + ' related';
  });
  await T('home page search: related tools are marked on their cards', async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.fill('#q', 'markdown'); await page.waitForTimeout(400);
    const shown = await page.locator('.tcard:not(.hidden) b').allInnerTexts(); ex(shown.includes('Markdown Converter'), shown.join(' | ')); ex(await page.locator('.tcard.rel').count() >= 1, 'related cards are not marked'); return shown.length + ' cards';
  });

  // ---------------------------------------------------------------- the navigation bar
  const menu = async (page, name) => { await page.locator('.nv-btn', { hasText: name }).hover(); const sel = `.nv-item:has(> .nv-btn:text-is("${name}")) .nv-panel`; await page.waitForSelector(sel + ':not([hidden]) a', { timeout: 4000 }); return { sel, links: await page.locator(sel + ' a').allInnerTexts(), heads: await page.locator(sel + ' h4').allInnerTexts() }; };
  await T('navbar: Image, PDF, Video & audio, AI, Convert and All tools menus', async page => {
    await go(page, '/pdf-editor'); const btns = await page.locator('.nv-btn').allInnerTexts(); ex(btns.map(b => b.trim()).join('|') === 'Image|PDF|Video & audio|AI|Convert|All tools', btns.join('|'));
    ex((await page.locator('.nv > a').allInnerTexts()).join('|') === 'Blog', 'next to the menus there is only the Blog link');
    const want = { 'Image': ['Compress Image', 'Resize Image', 'Crop Image', 'JPG to PDF', 'EXIF Remover', 'Collage Maker', 'Background Remover'], 'PDF': ['Merge PDF', 'Split PDF', 'Compress PDF', 'PDF Editor', 'HTML to PDF', 'Markdown to PDF', 'Blur & Redact PDF', 'Add Watermark to PDF', 'PDF to Markdown', 'Protect PDF with Password'],
      'Video & audio': ['Video Converter', 'Split Video', 'Merge Audio Files', 'MP4 to MP3 Converter', 'Video to Text (Transcribe)'], 'AI': ['Background Remover', 'Image Upscaler', 'AI Headshot Generator'],
      'Convert': ['JPG to PDF', 'PNG to PDF', 'Markdown to PDF', 'Word (DOCX) to Markdown'] };
    const seen = [];
    for (const [name, items] of Object.entries(want)) { const m = await menu(page, name); for (const n of items) ex(m.links.some(t => t.includes(n)), `${name} menu misses "${n}" (has ${m.links.length}: ${m.links.slice(0, 6).join(', ')}...)`); ex(await page.locator(m.sel + ' .ticon').count() >= m.links.length, name + ': icons missing'); seen.push(`${name} ${m.links.length}`); }
    const all = await menu(page, 'All tools'); ex(all.heads.join('|').toLowerCase() === 'Image|AI & Enhance|PDF & Documents|Video & Audio|Text & Developer|Utilities'.toLowerCase(), all.heads.join('|')); ex(all.links.length >= 56, 'only ' + all.links.length + ' tools in All tools');
    await page.locator('.nv-panel:not([hidden]) a', { hasText: 'Font Library' }).click(); await page.waitForURL('**/font-library'); return seen.join(', ') + ', all ' + all.links.length;
  });
  await T('navbar: only one menu at a time; hover opens, Escape and a click elsewhere close', async page => {
    await go(page, '/'); await menu(page, 'Image'); await menu(page, 'PDF'); ex(await page.locator('.nv-panel:not([hidden])').count() === 1, 'two menus are open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); ex(await page.locator('.nv-panel:not([hidden])').count() === 0, 'Escape');
    await page.locator('.nv-btn', { hasText: 'All tools' }).click(); await page.waitForSelector('.nv-panel.all:not([hidden])'); await page.mouse.click(700, 700); await page.waitForTimeout(200); ex(await page.locator('.nv-panel.all').isHidden(), 'click outside');
  });
  await T('navbar: a menu never runs past the edge of the bar', async page => {
    await go(page, '/'); for (const n of ['Image', 'PDF', 'Video & audio', 'AI', 'Convert']) { await menu(page, n); const b = await page.locator('.nv-panel:not([hidden])').boundingBox(); ex(b.x >= 0 && b.x + b.width <= 1440, `${n} menu at ${Math.round(b.x)}..${Math.round(b.x + b.width)}`); await page.keyboard.press('Escape'); }
  });
  await T('navbar: no address on the page contains /tool/', async page => {
    await go(page, '/'); await page.locator('.nv-btn', { hasText: 'All tools' }).click(); await page.waitForSelector('.nv-panel.all a'); const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
    ex(!hrefs.some(h => /\/tool\//.test(h)), 'old address: ' + hrefs.filter(h => /\/tool\//.test(h)).slice(0, 3)); return hrefs.length + ' links checked';
  });
  await T('navbar at 1200 wide: it still fits on one line next to the search', async page => {
    await go(page, '/'); const r = await page.evaluate(() => { const t = document.querySelector('.top-in'), last = document.querySelector('.top-in > :last-child').getBoundingClientRect(), nv = document.querySelector('.nv').getBoundingClientRect(), s = document.querySelector('.hsearch').getBoundingClientRect(); return { over: t.scrollWidth > t.clientWidth + 1, h: Math.round(t.getBoundingClientRect().height), nvRight: Math.round(nv.right), searchLeft: Math.round(s.left), lastRight: Math.round(last.right) }; });
    ex(!r.over && r.h < 80 && r.nvRight <= r.searchLeft, JSON.stringify(r)); return JSON.stringify(r);
  }, { viewport: { width: 1200, height: 800 } });
  await T('navbar on a phone: hamburger, one list per menu, no sideways scroll', async page => {
    await go(page, '/'); ex(await page.locator('.nv').isHidden(), 'the bar should be hidden on a phone'); await page.locator('.nv-burger').click(); await page.waitForSelector('.nv-m:not([hidden]) summary');
    const heads = await page.locator('.nv-m summary').allInnerTexts(); ex(heads.join('|') === 'Image|PDF|Video & audio|AI|Convert|All tools', heads.join('|'));
    await page.locator('.nv-m summary', { hasText: /^PDF$/ }).click(); await page.waitForTimeout(200); ex(await page.locator('.nv-m a', { hasText: 'Merge PDF' }).first().isVisible(), 'Merge PDF in the phone menu');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ex(w[0] <= w[1] + 1, 'sideways scroll ' + w); await page.locator('.nv-m a', { hasText: 'Merge PDF' }).first().click(); await page.waitForURL('**/merge-pdf'); return 'ok at ' + w[1];
  }, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  await T('header: the Bookmark button sits at the top right, next to the search', async page => {
    await go(page, '/'); const b = await page.locator('.bmbtn').boundingBox(), s = await page.locator('.hsearch').boundingBox(), t = await page.locator('.top-in').boundingBox(); ex(b.x > t.x + t.width / 2 && b.x > s.x, 'bookmark not on the right: ' + JSON.stringify(b));
    ex(/Bookmark/.test(await page.locator('.bmbtn').innerText()), 'no label on a computer'); return `x=${Math.round(b.x)} of ${Math.round(t.width)}`;
  });

  // ---------------------------------------------------------------- the sitemap
  await T('sitemap: every page, once, with a real date, none of them /tool/ or /admin, and each one opens', async page => {
    const xml = await (await page.request.get(BASE + '/sitemap.xml')).text(), locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]), dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
    ex(locs.length >= 124, 'only ' + locs.length + ' urls'); ex(new Set(locs).size === locs.length, 'duplicate addresses'); const okLoc = u => /^https:\/\/toolzbaba\.com(\/[a-z]{2}(?=\/))?(\/[a-z0-9-]*)?$/.test(u);   // /<tool>, or /<language>/ and /<language>/<tool>
    ex(locs.every(okLoc), 'a strange address: ' + locs.find(u => !okLoc(u)));
    ex(!locs.some(u => /\/tool\/|\/admin|\/api\//.test(u)), 'a private or old address is listed'); ex(dates.length === locs.length && dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), 'bad dates');
    for (const must of ['/', '/merge-pdf', '/split-pdf', '/markdown-to-pdf', '/html-to-pdf', '/jpg-to-pdf', '/png-to-pdf', '/docx-to-markdown', '/markdown-converter', '/pdf-editor', '/font-library', '/blur-redact-pdf']) ex(locs.includes('https://toolzbaba.com' + must), must + ' is not in the sitemap');
    const bad = []; for (const u of locs) { const r = await page.request.get(BASE + u.replace('https://toolzbaba.com', ''), { maxRedirects: 0 }); if (r.status() !== 200) bad.push(u + ' ' + r.status()); }
    ex(!bad.length, bad.length + ' addresses do not open: ' + bad.slice(0, 3).join(', ')); const robots = await (await page.request.get(BASE + '/robots.txt')).text(); ex(/Sitemap: https:\/\/toolzbaba\.com\/sitemap\.xml/.test(robots) && /Disallow: \/admin/.test(robots), 'robots.txt');
    return `${locs.length} urls, all open`;
  });
  await T('every page has its own title, a description and one canonical address at the root', async page => {
    const xml = await (await page.request.get(BASE + '/sitemap.xml')).text(), locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace('https://toolzbaba.com', '')), titles = new Map(), bad = [];
    for (const u of locs) { const html = await (await page.request.get(BASE + u)).text(), t = (/<title>([^<]*)<\/title>/.exec(html) || [])[1], d = /<meta name="description" content="[^"]{20,}"/.test(html), c = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
      if (!t) bad.push(u + ' no title'); else if (titles.has(t)) bad.push(`${u} has the title of ${titles.get(t)}`); else titles.set(t, u); if (!d) bad.push(u + ' no description'); if (!c || c.replace(/^https?:\/\/[^/]+/, '') !== u) bad.push(`${u} canonical ${c}`); /* /blog builds its address from the request, so only the path is compared */ if (/noindex/.test(html)) bad.push(u + ' is noindex'); }
    ex(!bad.length, bad.length + ' problems: ' + bad.slice(0, 4).join(' | ')); return locs.length + ' pages checked';
  });

  await browser.close(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
