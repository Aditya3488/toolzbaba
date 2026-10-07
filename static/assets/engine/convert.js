// Document converters that run in the browser: Markdown <-> PDF / HTML / Word, HTML -> PDF / Markdown, Word -> Markdown, PDF -> Markdown.
// Libraries: marked (Markdown -> HTML), turndown (HTML -> Markdown), mammoth (Word -> HTML), MuPDF (HTML -> PDF), pdf.js (reading a PDF), JSZip (the .docx container).
(() => {
  const V = '/assets/vendor/';
  const tick = HT.tick;
  const SIZES = { a4: [595, 842], letter: [612, 792] };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  const loadMarked = async () => { if (!window.marked) await HT.loadScript(V + 'marked-18.1.0/marked.min.js'); return window.marked; };
  const markdownToHtml = async text => (await loadMarked()).parse(String(text), { gfm: true, breaks: false, async: false });
  HT.convert = { markdownToHtml };

  // the look of the PDF made from Markdown / HTML (MuPDF understands basic CSS)
  const pdfCss = o => {
    const font = o.font === 'serif' ? 'serif' : 'sans-serif', pt = Math.max(8, Math.min(18, +o.fontSize || 11)), mg = Math.max(0.5, Math.min(5, +o.margin || 2));
    return `@page{margin:${mg}cm} body{font-family:${font};font-size:${pt}pt;line-height:1.45;color:#111}
      h1{font-size:${pt * 2}pt;margin:14pt 0 6pt} h2{font-size:${pt * 1.6}pt;margin:12pt 0 5pt} h3{font-size:${pt * 1.3}pt;margin:10pt 0 4pt} h4,h5,h6{font-size:${pt * 1.1}pt;margin:8pt 0 4pt}
      p{margin:0 0 8pt} ul,ol{margin:0 0 8pt} li{margin:0 0 2pt} a{color:#0a4ff5}
      code{font-family:monospace;background:#f1f1f1} pre{font-family:monospace;font-size:${pt * 0.88}pt;background:#f4f4f4;padding:6pt;margin:0 0 8pt;white-space:pre-wrap}
      pre code{background:none} blockquote{margin:0 0 8pt 6pt;padding-left:8pt;border-left:2pt solid #bbb;color:#444}
      table{border-collapse:collapse;margin:6pt 0} td,th{border:0.5pt solid #999;padding:3pt 5pt;vertical-align:top} th{background:#ececec}
      img{max-width:100%} hr{border:0;border-top:0.5pt solid #999;margin:8pt 0}`;
  };
  const pageOf = o => SIZES[o.page] || SIZES.a4;

  // ---------------------------------------------------------------- a self-contained web page from Markdown
  const WEB_CSS = `body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:32px auto;padding:0 18px;color:#1f2328}
    h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.3em} h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .6em} a{color:#0969da}
    code{font-family:ui-monospace,Consolas,monospace;background:#eff1f3;padding:.15em .35em;border-radius:5px;font-size:.88em} pre{background:#f6f8fa;padding:14px;border-radius:8px;overflow:auto} pre code{background:none;padding:0}
    blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0} table{border-collapse:collapse} td,th{border:1px solid #d1d9e0;padding:6px 12px} th{background:#f6f8fa} img{max-width:100%} hr{border:0;border-top:1px solid #d1d9e0}`;
  const webPage = (body, title) => `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${WEB_CSS}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  const titleOf = (html, fallback) => { const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html); return m ? m[1].replace(/<[^>]+>/g, '').trim() || fallback : fallback; };
  HT.convert.webCss = WEB_CSS;

  // ---------------------------------------------------------------- HTML -> Word (.docx)
  // Headings, paragraphs, bold / italic / code / links, lists, quotes, code blocks, rules and tables. Pictures become their alt text.
  async function htmlToDocx(html, title) {
    await HT.loadScript(V + 'jszip.min.js');
    const dom = new DOMParser().parseFromString(html, 'text/html'); dom.querySelectorAll('script,style,noscript,head').forEach(n => n.remove());
    const rels = []; let relN = 0;
    const run = (t, f) => `<w:r><w:rPr>${f.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ''}${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.strike ? '<w:strike/>' : ''}${f.link ? '<w:color w:val="0563C1"/>' : ''}${f.u || f.link ? '<w:u w:val="single"/>' : ''}${f.code ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
    const inline = (node, f0 = {}) => {
      const out = [];
      const walk = (n, f, into) => {
        if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t.trim() || t === ' ') into.push(run(t, f)); return; }
        if (n.nodeType !== 1) return; const tag = n.tagName.toLowerCase();
        if (tag === 'br') return void into.push('<w:r><w:br/></w:r>');
        if (tag === 'img') { const alt = n.getAttribute('alt'); if (alt) into.push(run('[' + alt + ']', { ...f, i: true })); return; }
        if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'pre') return;
        const g = { ...f };
        if (tag === 'strong' || tag === 'b') g.b = true; if (tag === 'em' || tag === 'i') g.i = true; if (tag === 'del' || tag === 's') g.strike = true; if (tag === 'u') g.u = true; if (tag === 'code' || tag === 'kbd') g.code = true;
        if (tag === 'a' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) {
          const id = 'rIdL' + (++relN); rels.push({ id, target: n.getAttribute('href') }); const kids = [];
          for (const c of n.childNodes) walk(c, { ...g, link: true }, kids); return void into.push(`<w:hyperlink r:id="${id}" w:history="1">${kids.join('')}</w:hyperlink>`);
        }
        for (const c of n.childNodes) walk(c, g, into);
      };
      for (const c of node.childNodes) walk(c, f0, out);
      return out.join('').replace(/^(<w:r><w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">) +/, '$1');
    };
    const para = (runsXml, { style, left, hanging, border } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>' : ''}${left != null ? `<w:ind w:left="${left}"${hanging ? ` w:hanging="${hanging}"` : ''}/>` : ''}</w:pPr>${runsXml}</w:p>`;
    const body = [];
    const list = (n, depth) => {
      const ordered = n.tagName.toLowerCase() === 'ol'; let k = +(n.getAttribute('start') || 1);
      for (const li of n.children) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const mark = ordered ? (k++) + '. ' : (depth % 2 ? '◦ ' : '• ');
        body.push(para(run(mark, {}) + inline(li), { left: 540 * (depth + 1), hanging: 360 }));
        for (const c of li.children) { const t = c.tagName.toLowerCase(); if (t === 'ul' || t === 'ol') list(c, depth + 1); else if (t === 'pre' || t === 'table' || t === 'blockquote') block(c, depth + 1); }
      }
    };
    const table = n => {
      const rows = [...n.querySelectorAll('tr')]; if (!rows.length) return; const cols = Math.max(...rows.map(r => r.children.length));
      const tr = rows.map(r => `<w:tr>${[...r.children].map(c => { const th = c.tagName.toLowerCase() === 'th';
        return `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/>${th ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EFFF"/>' : ''}</w:tcPr>${para(inline(c, th ? { b: true } : {}))}</w:tc>`; }).join('')}</w:tr>`).join('');
      const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bd}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('')}</w:tblGrid>${tr}</w:tbl>`, '<w:p/>');
    };
    function block(n, depth = 0) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) body.push(para(run(t, {}))); return; }
      if (n.nodeType !== 1) return; const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return void body.push(para(inline(n), { style: 'Heading' + tag[1] }));
      if (tag === 'p') return void body.push(para(inline(n), depth ? { left: 540 * depth } : {}));
      if (tag === 'ul' || tag === 'ol') return list(n, depth);
      if (tag === 'pre') { for (const line of n.textContent.replace(/\n$/, '').split('\n')) body.push(para(run(line, { code: true }), { style: 'Code' })); return; }
      if (tag === 'blockquote') { const start = body.length; for (const c of n.childNodes) block(c, depth); for (let i = start; i < body.length; i++) body[i] = body[i].replace(/^<w:p><w:pPr>/, '<w:p><w:pPr><w:pStyle w:val="Quote"/>'); return; }
      if (tag === 'hr') return void body.push(para('', { border: true }));
      if (tag === 'table') return table(n);
      if (tag === 'img') { const alt = n.getAttribute('alt'); if (alt) body.push(para(run('[' + alt + ']', { i: true }))); return; }
      // anything else (div, section, li ...): its text, then its blocks
      const hasBlocks = [...n.children].some(c => /^(p|h[1-6]|ul|ol|pre|blockquote|table|hr|div|section|article)$/i.test(c.tagName));
      if (hasBlocks) for (const c of n.childNodes) block(c, depth); else { const r = inline(n); if (r) body.push(para(r)); }
    }
    for (const c of dom.body.childNodes) block(c);
    if (!body.length) body.push('<w:p/>');
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const [pw, ph] = [11906, 16838];
    const hs = [[40, 320], [34, 280], [28, 240], [24, 200], [22, 160], [22, 160]];
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + hs.map(([sz, before], i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="100"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`).join('')
      + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BBBBBB"/></w:pBdr><w:ind w:left="480"/></w:pPr><w:rPr><w:color w:val="555555"/></w:rPr></w:style></w:styles>';
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + rels.map(r => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(r.target)}" TargetMode="External"/>`).join('') + '</Relationships>');
    z.file('word/styles.xml', styles);
    z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title || '')}</dc:title></cp:coreProperties>`);
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ---------------------------------------------------------------- HTML -> Markdown
  async function turndown(opts = {}) {
    if (!window.TurndownService) await HT.loadScript(V + 'turndown-7.2.4/turndown.js');
    const t = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---', ...opts });
    try { const g = await import(V + 'turndown-7.2.4/turndown-plugin-gfm.js'); t.use(g.gfm); } catch { /* tables then stay as HTML */ }
    t.addRule('lineBreak', { filter: 'br', replacement: () => '  \n' });
    return t;
  }
  // a table needs a header row to become a Markdown table: the first row is it
  const headTables = root => root.querySelectorAll('table').forEach(tb => {
    if (tb.querySelector('th') || !tb.rows || !tb.rows.length) return;
    const first = tb.rows[0], thead = tb.ownerDocument.createElement('thead');
    [...first.cells].forEach(c => { const th = tb.ownerDocument.createElement('th'); th.innerHTML = c.innerHTML; c.replaceWith(th); });
    thead.append(first); tb.prepend(thead);
  });
  async function htmlToMarkdown(html) {
    const dom = new DOMParser().parseFromString(html, 'text/html'); dom.querySelectorAll('script,style,noscript,head,iframe,svg').forEach(n => n.remove()); headTables(dom.body);
    return (await turndown()).turndown(dom.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ---------------------------------------------------------------- PDF -> Markdown (headings from the font sizes, lists, paragraphs)
  async function pdfToMarkdown(file, o, ctx) {
    await HT.loadScript('/assets/tools/pdf-helpers.js');
    const pdf = await HT.pdf.open(file), pages = [], sizes = new Map(), r1 = v => Math.round(v * 2) / 2;
    for (let n = 1; n <= pdf.numPages; n++) {
      const pg = await pdf.getPage(n), tc = await pg.getTextContent(), items = [];
      for (const it of tc.items) {
        if (!it.str) continue; const st = tc.styles[it.fontName] || {}, fam = (it.fontName + ' ' + (st.fontFamily || '')).toLowerCase();
        items.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height, bold: /bold|black|heavy|semibold/.test(fam) });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const ls = [];
      for (const it of items) { const L = ls.find(l => Math.abs(l.y - it.y) <= Math.max(it.size, l.size) * 0.4); if (L) { L.parts.push(it); L.size = Math.max(L.size, it.size); } else ls.push({ y: it.y, size: it.size, parts: [it] }); }
      const out = [];
      for (const L of ls) {
        L.parts.sort((a, b) => a.x - b.x); let text = '', last = null;
        for (const p of L.parts) { if (last && p.x - (last.x + last.w) > p.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.s)) text += ' '; text += p.s; last = p; }
        L.text = text.replace(/\s+/g, ' ').trim(); if (!L.text) continue;
        L.x = L.parts[0].x; L.bold = L.parts.every(p => p.bold || !p.s.trim());
        sizes.set(r1(L.size), (sizes.get(r1(L.size)) || 0) + L.text.length); out.push(L);
      }
      out.sort((a, b) => b.y - a.y); pages.push(out);
      if (ctx) { ctx.progress(0.9 * n / pdf.numPages); if (n % 3 === 0) await tick(); }
    }
    let body = 11, most = 0; for (const [s, c] of sizes) if (c > most) { most = c; body = s; }
    const heads = [...sizes.keys()].filter(s => s > body * 1.12).sort((a, b) => b - a).slice(0, 3);
    const md = []; let total = 0;
    pages.forEach((ls, pi) => {
      let para = null; const flush = () => { if (para) { md.push(para.text); para = null; } };
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i], lvl = heads.indexOf(r1(l.size)); total += l.text.length;
        const bullet = /^([•●○▪■◦‣▸\-–—*])\s+/.exec(l.text), num = /^(\d{1,3})[.)]\s+/.exec(l.text);
        if (lvl >= 0 && l.text.length < 140) { flush(); md.push('#'.repeat(lvl + 1) + ' ' + l.text); continue; }
        if (bullet) { flush(); md.push('- ' + l.text.slice(bullet[0].length)); continue; }
        if (num) { flush(); md.push(num[1] + '. ' + l.text.slice(num[0].length)); continue; }
        const prev = ls[i - 1], cont = para && prev && prev.y - l.y <= Math.max(l.size, prev.size) * 1.7 && Math.abs(r1(prev.size) - r1(l.size)) < 1;
        if (cont) para.text = para.text.replace(/-$/, '') + (/-$/.test(para.text) ? '' : ' ') + l.text; else { flush(); para = { text: l.bold && l.text.length < 90 ? `**${l.text}**` : l.text }; }
      }
      flush(); if (o.pagebreaks && pi < pages.length - 1) md.push('---');
    });
    // list items follow each other without a blank line
    const joined = md.reduce((acc, line, i) => acc + (i ? (/^(- |\d+\. )/.test(line) && /^(- |\d+\. )/.test(md[i - 1]) ? '\n' : '\n\n') : '') + line, '');
    return { text: joined.trim() + '\n', chars: total };
  }

  // ---------------------------------------------------------------- Word -> Markdown
  async function docxToMarkdown(file, o) {
    await HT.loadScript(V + 'mammoth-1.13.0/mammoth.browser.min.js');
    const pics = []; const mode = o.pictures || 'files';
    const convertImage = mammoth.images.imgElement(async image => {
      if (mode === 'none') return { src: '' };
      const b64 = await image.read('base64'), ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' })[image.contentType] || 'png';
      if (mode === 'embed') return { src: `data:${image.contentType};base64,${b64}` };
      const name = `image-${pics.length + 1}.${ext}`; pics.push({ name: 'images/' + name, b64 }); return { src: 'images/' + name };
    });
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage });
    const dom = new DOMParser().parseFromString('<body>' + res.value + '</body>', 'text/html'); headTables(dom.body);
    dom.querySelectorAll('img').forEach(i => { if (!i.getAttribute('src')) i.remove(); });
    const text = (await turndown()).turndown(dom.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
    return { text, pics, warnings: res.messages.length };
  }

  // ---------------------------------------------------------------- reading the input
  async function textItems(ctx, what) {
    const t = String(ctx.opts.text || '');
    if (t.trim()) return [{ name: HT.stem(String(ctx.opts.name || 'document')), text: t }];
    if (!ctx.files.length) throw new Error(`Type or paste some ${what} first, or load a file.`);
    return Promise.all(ctx.files.map(async f => ({ name: HT.stem(f.name), text: new TextDecoder().decode(await f.arrayBuffer()).replace(/^﻿/, '') })));
  }
  const needFiles = (ctx, what) => { if (!ctx.files.length) throw new Error(`Add a ${what} file first.`); return ctx.files; };
  const blobOf = (text, type) => new Blob([text], { type: type + ';charset=utf-8' });

  const MODES = {
    async md2pdf(ctx) {
      const P = HT.pdfEngine || (await HT.loadScript('/assets/engine/pdf.js'), HT.pdfEngine), o = ctx.opts, [w, h] = pageOf(o), outs = []; let pages = 0;
      for (const it of await textItems(ctx, 'Markdown')) { ctx.status(`Making the PDF of ${it.name}...`); await tick(); const r = await P.htmlToPdf(await markdownToHtml(it.text), { css: pdfCss(o), w, h, em: +o.fontSize || 11 }); pages += r.pages; outs.push({ name: it.name + '.pdf', blob: r.blob }); }
      ctx.info = { summary: `${pages} page(s). Pictures from the web are not added (the PDF is made on your device); pictures inside the Markdown as data addresses are.` }; return outs;
    },
    async html2pdf(ctx) {
      const P = HT.pdfEngine || (await HT.loadScript('/assets/engine/pdf.js'), HT.pdfEngine), o = ctx.opts, [w, h] = pageOf(o), outs = []; let pages = 0;
      for (const it of await textItems(ctx, 'HTML')) { ctx.status(`Making the PDF of ${it.name}...`); await tick(); const r = await P.htmlToPdf(it.text, { css: pdfCss(o), w, h, em: +o.fontSize || 11 }); pages += r.pages; outs.push({ name: it.name + '.pdf', blob: r.blob }); }
      ctx.info = { summary: `${pages} page(s). Scripts do not run and pictures or style sheets from the web are not loaded: use pictures as data addresses and put the CSS inside a <style> tag.` }; return outs;
    },
    async md2html(ctx) {
      const outs = []; let text = '';
      for (const it of await textItems(ctx, 'Markdown')) { const body = await markdownToHtml(it.text), page = webPage(body, titleOf(body, it.name)); text = page; outs.push({ name: it.name + '.html', blob: blobOf(page, 'text/html') }); }
      ctx.info = { summary: 'A complete web page with its own style, ready to open or upload.', text: outs.length === 1 ? text : '' }; return outs;
    },
    async md2docx(ctx) {
      const outs = [];
      for (const it of await textItems(ctx, 'Markdown')) { ctx.status(`Making the Word file of ${it.name}...`); await tick(); const body = await markdownToHtml(it.text); outs.push({ name: it.name + '.docx', blob: await htmlToDocx(body, titleOf(body, it.name)) }); }
      ctx.info = { summary: 'Headings, lists, bold / italic, links, quotes, code and tables are kept. Pictures show as their description.' }; return outs;
    },
    async html2md(ctx) {
      const outs = []; let text = '';
      for (const it of await textItems(ctx, 'HTML')) { text = await htmlToMarkdown(it.text); outs.push({ name: it.name + '.md', blob: blobOf(text, 'text/markdown') }); }
      ctx.info = { summary: 'Tables, lists, links, code and headings are converted. Scripts and styles are left out.', text: outs.length === 1 ? text : '' }; return outs;
    },
    async docx2md(ctx) {
      const outs = []; let text = '', pics = 0;
      for (const f of needFiles(ctx, 'Word (.docx)')) {
        if (HT.ext(f.name) !== 'docx') throw new Error(`'${f.name}' is not a .docx file. Open it in Word and save it as .docx first.`);
        ctx.status(`Reading ${f.name}...`); await tick();
        const r = await docxToMarkdown(f, ctx.opts), stem = HT.stem(f.name); text = r.text; pics += r.pics.length;
        outs.push({ name: stem + '.md', blob: blobOf(r.text, 'text/markdown') });
        for (const p of r.pics) outs.push({ name: p.name, blob: new Blob([Uint8Array.from(atob(p.b64), c => c.charCodeAt(0))]) });
      }
      ctx.info = { summary: pics ? `Pictures are saved in an images folder next to the .md file (everything comes as one ZIP).` : 'Headings, lists, bold / italic, links and tables are converted.', text: outs.length === 1 ? text : '' }; return outs;
    },
    async pdf2md(ctx) {
      const outs = []; let text = '', chars = 0;
      for (const f of needFiles(ctx, 'PDF')) { ctx.status(`Reading ${f.name}...`); const r = await pdfToMarkdown(f, ctx.opts, ctx); text = r.text; chars += r.chars; outs.push({ name: HT.stem(f.name) + '.md', blob: blobOf(r.text, 'text/markdown') }); }
      ctx.info = { summary: chars ? 'Headings come from the bigger letters, lists and paragraphs from the layout. Tables and columns are not rebuilt: check the result.' : 'No text was found: this looks like a scanned PDF. Use Image to Text (OCR) first.', text: outs.length === 1 ? text : '' }; return outs;
    },
  };
  HT.convert.MODES = Object.keys(MODES);
  const SLUG = { 'markdown-to-pdf': 'md2pdf', 'html-to-pdf': 'html2pdf', 'markdown-to-html': 'md2html', 'markdown-to-word': 'md2docx', 'html-to-markdown': 'html2md', 'docx-to-markdown': 'docx2md', 'pdf-to-markdown': 'pdf2md' };
  for (const [slug, mode] of Object.entries(SLUG)) HT.engine(slug, async ctx => { const out = await MODES[mode](ctx); ctx.progress(1); return out; });
  HT.engine('markdown-converter', async ctx => { const m = MODES[ctx.opts.mode]; if (!m) throw new Error('Choose what to convert.'); const out = await m(ctx); ctx.progress(1); return out; });
  HT.convert.SLUG_OF_MODE = Object.fromEntries(Object.entries(SLUG).map(([s, m]) => [m, s]));
})();
