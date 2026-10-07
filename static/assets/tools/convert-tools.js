// Markdown and HTML converters: Markdown to PDF / HTML / Word, HTML to PDF / Markdown, Word to Markdown, PDF to Markdown. Everything runs in the browser.
// One screen for all of them: type or load Markdown / HTML and watch the preview, or add a Word / PDF file; the settings are on the left, the result on top of the preview.
const el = HT.el;
const V = '/assets/vendor/';
const MD_FILES = '.md,.markdown,.mdown,.txt,text/markdown,text/plain', HTML_FILES = '.html,.htm,text/html';
const MODES = {
  md2pdf: { label: 'Markdown to PDF', kind: 'md', action: 'Create PDF', slug: 'markdown-to-pdf', accept: MD_FILES, pdf: true },
  md2html: { label: 'Markdown to HTML', kind: 'md', action: 'Create HTML page', slug: 'markdown-to-html', accept: MD_FILES },
  md2docx: { label: 'Markdown to Word', kind: 'md', action: 'Create Word file', slug: 'markdown-to-word', accept: MD_FILES },
  html2md: { label: 'HTML to Markdown', kind: 'html', action: 'Convert to Markdown', slug: 'html-to-markdown', accept: HTML_FILES },
  docx2md: { label: 'Word to Markdown', kind: 'docx', action: 'Convert to Markdown', slug: 'docx-to-markdown', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf2md: { label: 'PDF to Markdown', kind: 'pdf', action: 'Convert to Markdown', slug: 'pdf-to-markdown', accept: '.pdf,application/pdf' },
  html2pdf: { label: 'HTML to PDF', kind: 'html', action: 'Create PDF', slug: 'html-to-pdf', accept: HTML_FILES, pdf: true },
};
const PICKABLE = ['md2pdf', 'md2html', 'md2docx', 'html2md', 'docx2md', 'pdf2md'];
const SAMPLE_MD = `# My notes\n\nA short example of **Markdown**: *italic*, \`code\` and a [link](https://example.com).\n\n## To do\n\n- [x] Write the text\n- [ ] Make a PDF\n- [ ] Share it\n\n| Item | Price |\n|------|-------|\n| Tea  | 20    |\n| Cake | 60    |\n\n> Keep it simple.\n\n\`\`\`js\nconsole.log("Hello");\n\`\`\`\n`;
const SAMPLE_HTML = `<h1>My page</h1>\n<p>Some <b>bold</b> and <i>italic</i> text with a <a href="https://example.com">link</a>.</p>\n<ul><li>One</li><li>Two</li></ul>\n<table border="1"><tr><th>Item</th><th>Price</th></tr><tr><td>Tea</td><td>20</td></tr></table>\n`;
const PREVIEW_CSS = 'body{font:15px/1.55 system-ui,sans-serif;margin:14px;color:#1f2328}h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.25em}code{background:#eff1f3;padding:.1em .3em;border-radius:4px}pre{background:#f6f8fa;padding:10px;border-radius:6px;overflow:auto}pre code{background:none}blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}table{border-collapse:collapse}td,th{border:1px solid #c9d1d9;padding:4px 10px}th{background:#f6f8fa}img{max-width:100%}';

HT.register('markdown-tool', (root, meta) => {
  const pick = !!meta.pickMode;                       // the first page of the family lets the visitor choose the converter
  let mode = MODES[meta.mode] ? meta.mode : 'md2pdf', current = null;
  const holder = el('div');
  if (pick) {
    const sel = el('select', { 'aria-label': 'What do you want to convert?', onchange: e => { mode = e.target.value; build(); } }, PICKABLE.map(k => el('option', { value: k, text: MODES[k].label, selected: k === mode ? 'selected' : null })));
    root.append(el('div', { class: 'card', style: { marginBottom: '14px' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', { class: 'lbl', text: 'Convert' }), sel)));
  }
  root.append(holder);

  function build() {
    holder.textContent = ''; const M = MODES[mode], text = M.kind === 'md' || M.kind === 'html', htmlIn = M.kind === 'html';
    let fileName = '', timer = 0;
    // ---- left: the file, the settings, the button
    const list = text ? null : HT.fileList({ onChange: fs => { run.disabled = !fs.length; bench.set(fs.length > 0); } });
    const dz = HT.dropzone({ accept: M.accept, multiple: !text, label: text ? 'Load a file' : (M.kind === 'docx' ? 'Drop your Word file here' : 'Drop your PDF here'),
      hint: text ? 'or type / paste in the box on the right' : 'Runs in your browser. Nothing is uploaded.',
      onFiles: async fs => { if (text) { const f = fs[0]; fileName = HT.stem(f.name); input.value = new TextDecoder().decode(await f.arrayBuffer()).replace(/^﻿/, ''); changed(); } else list.add(fs, true); } });
    const fields = [];
    if (M.pdf) fields.push({ name: 'page', label: 'Page size', type: 'select', options: [['a4', 'A4'], ['letter', 'US Letter']] }, { name: 'font', label: 'Letters', type: 'select', options: [['sans', 'Sans-serif (modern)'], ['serif', 'Serif (like a book)']] },
      { name: 'fontSize', label: 'Text size', type: 'range', min: 9, max: 16, value: 11, unit: ' pt' }, { name: 'margin', label: 'Margin', type: 'range', min: 1, max: 4, step: 0.5, value: 2, unit: ' cm' });
    if (mode === 'docx2md') fields.push({ name: 'pictures', label: 'Pictures in the Word file', type: 'select', options: [['files', 'Save them as files (everything in one ZIP)'], ['embed', 'Put them inside the Markdown'], ['none', 'Leave them out']] });
    if (mode === 'pdf2md') fields.push({ name: 'pagebreaks', label: 'Put a line between pages', type: 'checkbox', value: false });
    const form = HT.form(fields, () => { });
    const prog = HT.progress(), resultBox = el('div');
    const run = el('button', { class: 'btn', type: 'button', text: M.action, disabled: text ? null : 'disabled', onclick: go });
    const optCard = el('div', { class: 'card' }, HT.stepTitle(2, fields.length ? 'Settings' : 'Ready'), fields.length ? form.el : el('p', { class: 'help', style: { margin: '0 0 10px' }, text: text ? 'Nothing to set: type or load your text, then convert it.' : 'Nothing to set: add your file, then convert it.' }), el('div', { class: 'actions' }, run), prog.el);

    // ---- right: the text and its preview, and the result on top
    const input = el('textarea', { class: 'cv-in', spellcheck: 'false', 'aria-label': htmlIn ? 'Your HTML' : 'Your Markdown', placeholder: htmlIn ? 'Paste your HTML here...' : 'Type or paste your Markdown here...', oninput: () => changed() });
    const frame = el('iframe', { class: 'cv-prev', title: 'Preview', sandbox: '' });
    const example = el('button', { class: 'btn ghost sm', type: 'button', text: 'Insert an example', onclick: () => { input.value = htmlIn ? SAMPLE_HTML : SAMPLE_MD; changed(); } });
    const clear = el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { input.value = ''; fileName = ''; changed(); } });
    const editor = text ? el('div', { class: 'card tmain' }, el('div', { class: 'cv-bar' }, el('b', { text: htmlIn ? 'Your HTML' : 'Your Markdown' }), el('span', { class: 'sp' }), example, clear),
      el('div', { class: 'cv-split' }, input, el('div', {}, el('div', { class: 'cv-cap', text: 'Preview' }), frame))) : null;
    const note = !text ? el('div', { class: 'card tmain' }, el('p', { class: 'help', style: { margin: 0 }, text: M.kind === 'docx' ? 'Add a .docx file on the left. Headings, lists, bold / italic, links and tables become Markdown. Old .doc files need to be saved as .docx in Word first.' : 'Add a PDF on the left. Headings come from the bigger letters, and lists and paragraphs from the layout. Tables and columns are not rebuilt, so check the result. Scans (photos of pages) have no text: use Image to Text (OCR) for those.' })) : null;
    const main = el('div', {}, resultBox, editor || note);
    const bench = HT.bench([dz, list && list.el, optCard], main, { keep: text }); holder.textContent = ''; holder.append(bench); bench.set(true);

    async function paint() {
      const v = input.value; if (!v.trim()) { frame.srcdoc = `<style>${PREVIEW_CSS}</style><p style="color:#888">The preview appears here as you type.</p>`; return; }
      let body = v;
      if (!htmlIn) { if (!window.marked) await HT.loadScript(V + 'marked-18.1.0/marked.min.js'); body = window.marked.parse(v, { gfm: true, async: false }); }
      frame.srcdoc = `<style>${PREVIEW_CSS}</style>${htmlIn ? v.replace(/<script[\s\S]*?<\/script>/gi, '') : body}`;
    }
    function changed() { run.disabled = !input.value.trim(); clearTimeout(timer); timer = setTimeout(paint, 180); resultBox.textContent = ''; }
    if (text) { run.disabled = true; paint(); }

    async function go() {
      run.disabled = true; resultBox.textContent = ''; prog.set(2, 'Starting...');
      try {
        const opts = { ...form.values(), mode, text: text ? input.value : '', name: fileName || 'document' };
        const { id } = await HT.upload(M.slug, text ? [] : list.files, opts), job = await HT.poll(id, s => prog.set(s.progress || 4, s.speed || 'Converting...'));
        prog.clear(); const box = HT.showResult(job, id, [], { compare: false }); resultBox.append(box);
        if (job.info && job.info.text) {   // the answer is text: show it, with a copy button
          const out = el('textarea', { class: 'cv-out', readonly: 'readonly', 'aria-label': 'Result', value: job.info.text });
          box.append(el('div', { class: 'cv-outwrap' }, out, el('div', { class: 'actions' }, el('button', { class: 'btn sec sm', type: 'button', text: 'Copy', onclick: () => HT.copy(job.info.text, 'Copied') }))));
        }
      } catch (e) { prog.error(e.message); }
      run.disabled = text ? !input.value.trim() : !list.files.length;
    }
    current = list ? { list, accept: M.accept } : null;
  }
  build();
  return { get list() { return current && current.list; }, get accept() { return current && current.accept; } };
});
