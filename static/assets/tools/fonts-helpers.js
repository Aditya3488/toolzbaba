// The font library, shared by the PDF Editor and the Font Library page: HT.fonts. The fonts are plain TTF files in /assets/fonts (see fonts.json,
// built by scripts/get_fonts.py), so they work offline and can be embedded in a PDF. Loaded on demand with HT.loadScript('/assets/tools/fonts-helpers.js').
(() => {
  const el = HT.el;
  const FONT_URL = '/assets/fonts/';
  let dataP = null; const faces = new Map();
  const CAT = { sans: 'Sans-serif', serif: 'Serif', display: 'Display', handwriting: 'Handwriting', mono: 'Monospace', indic: 'Indian scripts' };
  const SCRIPT = { latin: 'Latin', devanagari: 'Hindi / Devanagari', bengali: 'Bengali', gurmukhi: 'Punjabi', gujarati: 'Gujarati', tamil: 'Tamil', telugu: 'Telugu', kannada: 'Kannada', malayalam: 'Malayalam', cyrillic: 'Cyrillic', greek: 'Greek' };
  const SAMPLE = { latin: 'The quick brown fox jumps over the lazy dog 0123456789', devanagari: 'नमस्ते दुनिया, यह एक छोटा सा परीक्षण है', bengali: 'নমস্কার পৃথিবী, এটি একটি ছোট পরীক্ষা', gurmukhi: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੁਨੀਆ, ਇਹ ਇੱਕ ਛੋਟੀ ਜਾਂਚ ਹੈ', gujarati: 'નમસ્તે દુનિયા, આ એક નાનકડી કસોટી છે', tamil: 'வணக்கம் உலகம், இது ஒரு சிறிய சோதனை', telugu: 'నమస్కారం ప్రపంచం, ఇది ఒక చిన్న పరీక్ష', kannada: 'ನಮಸ್ಕಾರ ಜಗತ್ತು, ಇದು ಒಂದು ಸಣ್ಣ ಪರೀಕ್ಷೆ', malayalam: 'നമസ്കാരം ലോകം, ഇതൊരു ചെറിയ പരീക്ഷണമാണ്', cyrillic: 'Съешь же ещё этих мягких французских булок', greek: 'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία' };

  const F = HT.fonts = {
    list: [], map: {}, CAT, SCRIPT, SAMPLE,
    ready() {
      return dataP || (dataP = fetch(HT.ver(FONT_URL + 'fonts.json')).then(r => { if (!r.ok) throw new Error('The font list could not be loaded.'); return r.json(); })
        .then(d => { F.list = d.fonts; F.map = Object.fromEntries(d.fonts.map(f => [f.id, f])); return F.list; }).catch(e => { dataP = null; throw e; }));
    },
    get: id => F.map[id] || F.map['open-sans'] || F.list[0],
    // which file serves a request for bold / italic (a font without a bold file keeps its regular look, the screen and the PDF agree)
    resolve(id, bold, italic) {
      const f = F.get(id), want = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
      const order = { boldItalic: ['boldItalic', 'bold', 'italic', 'regular'], bold: ['bold', 'regular'], italic: ['italic', 'regular'], regular: ['regular'] }[want];
      const style = order.find(s => f.files[s]);
      return { id: f.id, style, bold: style === 'bold' || style === 'boldItalic', italic: style === 'italic' || style === 'boldItalic', url: FONT_URL + f.files[style].file, size: f.files[style].size };
    },
    has: (id, style) => !!(F.map[id] && F.map[id].files[style]),
    family: id => 'TB ' + F.get(id).name,
    // makes one style usable from CSS and from canvas text: font-family "TB Poppins" with the right weight and style
    load(id, bold = false, italic = false) {
      const r = F.resolve(id, bold, italic), key = r.url;
      if (!faces.has(key)) {
        const ff = new FontFace(F.family(id), `url(${r.url})`, { weight: r.bold ? '700' : '400', style: r.italic ? 'italic' : 'normal' });
        faces.set(key, ff.load().then(() => { document.fonts.add(ff); return r; }).catch(e => { faces.delete(key); throw e; }));
      }
      return faces.get(key);
    },
    async bytes(id, bold, italic) { const r = F.resolve(id, bold, italic), res = await fetch(r.url); if (!res.ok) throw new Error('Could not load the font ' + F.get(id).name + '.'); return { ...r, data: await res.arrayBuffer() }; },
    // can this font draw every letter of the text? (by the scripts it covers)
    scriptsOf(text) {
      const need = new Set();
      for (const ch of text) {
        const c = ch.codePointAt(0);
        if (c < 0x250 || (c >= 0x2000 && c <= 0x206f) || (c >= 0x20a0 && c <= 0x20cf) || c === 0x2122) need.add('latin');
        else if (c >= 0x900 && c <= 0x97f) need.add('devanagari'); else if (c >= 0x980 && c <= 0x9ff) need.add('bengali'); else if (c >= 0xa00 && c <= 0xa7f) need.add('gurmukhi');
        else if (c >= 0xa80 && c <= 0xaff) need.add('gujarati'); else if (c >= 0xb80 && c <= 0xbff) need.add('tamil'); else if (c >= 0xc00 && c <= 0xc7f) need.add('telugu');
        else if (c >= 0xc80 && c <= 0xcff) need.add('kannada'); else if (c >= 0xd00 && c <= 0xd7f) need.add('malayalam'); else if (c >= 0x400 && c <= 0x52f) need.add('cyrillic'); else if (c >= 0x370 && c <= 0x3ff) need.add('greek');
      }
      return need;
    },
    covers(id, text) { const have = new Set(F.get(id).scripts); have.add('latin'); return [...F.scriptsOf(text)].every(s => have.has(s)); },
  };

  // a searchable list of fonts, each shown in its own letters (loaded only when it scrolls into view)
  // F.picker({ value, text, onChange }) -> element with .set(id)
  F.picker = ({ value, text = '', onChange }) => {
    let cur = value, cat = 'all';
    const btn = el('button', { type: 'button', class: 'fpick-btn', 'aria-haspopup': 'listbox' }), name = el('span', { class: 'fpick-name' }), arrow = el('span', { class: 'fpick-arrow', text: '▾' });
    btn.append(name, arrow);
    const search = el('input', { type: 'search', placeholder: 'Search fonts...', 'aria-label': 'Search fonts' });
    const tabs = el('div', { class: 'fpick-tabs' }, [['all', 'All'], ...Object.entries(CAT)].map(([k, t]) => el('button', { type: 'button', class: 'fpick-tab' + (k === 'all' ? ' on' : ''), 'data-k': k, text: t, onclick: () => { cat = k; [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); fill(); } })));
    const list = el('div', { class: 'fpick-list', role: 'listbox' }), panel = el('div', { class: 'fpick-panel hidden' }, search, tabs, list);
    const wrap = el('div', { class: 'fpick' }, btn, panel);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); F.load(e.target.dataset.id).then(() => e.target.classList.add('ready')).catch(() => { }); } }), { root: list, rootMargin: '120px' }) : null;
    function paintBtn() { const f = F.get(cur); name.textContent = f.name; name.style.fontFamily = `"${F.family(f.id)}", system-ui, sans-serif`; F.load(f.id).then(() => { name.style.fontFamily = `"${F.family(f.id)}", system-ui, sans-serif`; }).catch(() => { }); }
    function fill() {
      const q = search.value.trim().toLowerCase(); list.textContent = '';
      const sample = (t => { const s = F.scriptsOf(t); const k = [...s].find(x => x !== 'latin'); return k ? t.slice(0, 22) : t.slice(0, 22) || 'Aa Bb Cc 123'; })(text);
      const items = F.list.filter(f => (cat === 'all' || f.category === cat) && (!q || f.name.toLowerCase().includes(q) || (CAT[f.category] || '').toLowerCase().includes(q)));
      for (const f of items) {
        const ok = !text || F.covers(f.id, text);
        const prev = el('span', { class: 'fpick-prev', 'data-id': f.id, style: { fontFamily: `"${F.family(f.id)}", system-ui, sans-serif` }, text: f.category === 'indic' && !text ? 'नमस्ते Aa' : sample || 'Aa Bb 123' });
        const row = el('button', { type: 'button', role: 'option', class: 'fpick-row' + (f.id === cur ? ' on' : '') + (ok ? '' : ' no'), title: ok ? f.name : f.name + ': cannot draw some of the letters in your text', onclick: () => { cur = f.id; paintBtn(); close(); onChange && onChange(cur); } },
          el('span', { class: 'fpick-fn', text: f.name }), prev, el('small', { text: CAT[f.category] }));
        list.append(row); if (io) io.observe(prev); else F.load(f.id).catch(() => { });
      }
      if (!items.length) list.append(el('div', { class: 'help', style: { padding: '10px' }, text: 'No font matches.' }));
    }
    const open = async () => { await F.ready(); panel.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); fill(); search.focus(); };
    const close = () => { panel.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => (panel.classList.contains('hidden') ? open() : close()));
    search.addEventListener('input', fill);
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
    wrap.set = id => { cur = id; F.ready().then(paintBtn); };
    wrap.setText = t => { text = t; if (!panel.classList.contains('hidden')) fill(); };
    F.ready().then(paintBtn).catch(() => { name.textContent = 'Fonts unavailable'; });
    return wrap;
  };
  // download one family as a ZIP (the TTF files and a licence note)
  F.download = async f => {
    try {
      const entries = [];
      for (const [k, v] of Object.entries(f.files)) { const r = await fetch(FONT_URL + v.file); if (!r.ok) throw new Error('Could not load ' + v.file); entries.push({ name: `${f.name.replace(/\s+/g, '')}-${{ regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'BoldItalic' }[k]}.ttf`, blob: await r.blob() }); }
      entries.push({ name: 'LICENSE.txt', blob: new Blob([`${f.name}\n${f.copyright || ''}\nLicence: ${f.license}\n\nThis font is free to use, also in commercial work. You may not sell the font files on their own.\nOriginal source: https://fonts.google.com/specimen/${encodeURIComponent(f.name).replace(/%20/g, '+')}\n`], { type: 'text/plain' }) });
      HT.download(await HT.zip(entries), f.id + '-fonts.zip'); HT.toast(f.name + ' downloaded');
    } catch (e) { HT.toast(e.message); }
  };

  // The whole font library in a window (used inside the PDF Editor): search, categories, script, a preview in the visitor's own text,
  // "Use this font" and "Download". F.library({ current, text, bold, italic, onPick(id) })
  F.library = ({ current, text = '', bold = false, italic = false, onPick }) => {
    let cat = 'all', script = 'all', cur = current;
    const q = el('input', { type: 'search', placeholder: 'Search fonts, for example "poppins" or "handwriting"', 'aria-label': 'Search fonts' });
    const tIn = el('input', { type: 'text', 'aria-label': 'Preview text', value: text, placeholder: 'Type to preview your own text' });
    const scriptSel = el('select', { 'aria-label': 'Script' }, el('option', { value: 'all', text: 'Any script' }), Object.entries(SCRIPT).map(([k, t]) => el('option', { value: k, text: t })));
    const size = el('input', { type: 'range', min: 16, max: 64, value: 28, 'aria-label': 'Preview size' }), sizeVal = el('span', { class: 'rangeval', text: '28 px' });
    const tabs = el('div', { class: 'tabs', style: { margin: '12px 0 0' } }), count = el('div', { class: 'help', style: { margin: '10px 0 12px' } }), grid = el('div', { class: 'fgrid flib-grid' });
    const body = el('div', { class: 'flib-body' }, count, grid);
    const dlg = el('dialog', { class: 'flib', 'aria-label': 'Font library' },
      el('div', { class: 'flib-head' }, el('div', { class: 'flib-top' }, el('h2', { text: 'Font library' }), el('a', { href: '/tool/font-library', target: '_blank', rel: 'noopener', class: 'help', text: 'Open the full page' }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Close', onclick: () => dlg.close() })),
        q, tabs, el('div', { class: 'flib-row' }, el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Preview text' }), tIn), el('div', { class: 'field' }, el('label', { class: 'lbl', text: 'Script' }), scriptSel), el('div', { class: 'field' }, el('label', { class: 'lbl' }, 'Size ', sizeVal), size))), body);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); F.load(e.target.dataset.id, bold, italic).then(() => e.target.classList.add('ready')).catch(() => { }); } }), { root: body, rootMargin: '300px' }) : null;
    const sampleFor = f => (tIn.value.trim() ? tIn.value : script !== 'all' ? SAMPLE[script] : f.category === 'indic' ? SAMPLE[f.scripts.find(x => x !== 'latin') || 'latin'] : SAMPLE.latin);
    function draw() {
      const term = q.value.trim().toLowerCase(); grid.textContent = ''; if (io) io.disconnect();
      const items = F.list.filter(f => (cat === 'all' || f.category === cat) && (script === 'all' || f.scripts.includes(script)) && (!term || f.name.toLowerCase().includes(term) || CAT[f.category].toLowerCase().includes(term) || f.scripts.some(s => SCRIPT[s].toLowerCase().includes(term))));
      count.textContent = items.length + (items.length === 1 ? ' font' : ' fonts') + '. Click "Use this font" to apply it' + (tIn.value.trim() ? '. Fonts that cannot draw all your letters are marked.' : '.');
      for (const f of items) {
        const ok = !tIn.value.trim() || F.covers(f.id, tIn.value), on = f.id === cur, r = F.resolve(f.id, bold, italic);
        const prev = el('div', { class: 'fprev', 'data-id': f.id, title: 'Click to use this font', style: { fontFamily: `"${F.family(f.id)}", system-ui, sans-serif`, fontSize: size.value + 'px', fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? 'italic' : 'normal' }, text: sampleFor(f) });
        const pick = () => { dlg.close(); cur = f.id; onPick && onPick(f.id); };
        prev.addEventListener('click', pick);
        grid.append(el('article', { class: 'fcard' + (on ? ' on' : '') + (ok ? '' : ' no') },
          el('div', { class: 'fhead' }, el('b', { text: f.name }), el('span', { class: 'tag', text: CAT[f.category] })), prev,
          el('div', { class: 'fmeta' }, f.scripts.map(s => el('span', { class: 'chip', text: SCRIPT[s] })), ok ? null : el('span', { class: 'chip', style: { color: 'var(--err)' }, text: 'Missing some letters' }), el('small', { text: f.license })),
          el('div', { class: 'actions', style: { margin: '10px 0 0' } }, el('button', { class: 'btn sm', type: 'button', disabled: on ? 'disabled' : null, text: on ? 'In use' : 'Use this font', onclick: pick }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Download', onclick: () => F.download(f) }))));
        if (io) io.observe(prev); else F.load(f.id, bold, italic).catch(() => { });
      }
      if (!items.length) grid.append(el('div', { class: 'help', style: { padding: '14px' }, text: 'No font matches.' }));
    }
    [['all', 'All'], ...Object.entries(CAT)].forEach(([k, t]) => tabs.append(el('button', { type: 'button', class: 'tab' + (k === 'all' ? ' on' : ''), 'data-k': k, text: t, onclick: () => { cat = k; [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } })));
    q.addEventListener('input', HT.debounce(draw, 150)); tIn.addEventListener('input', HT.debounce(draw, 200)); scriptSel.addEventListener('change', () => { script = scriptSel.value; draw(); });
    size.addEventListener('input', () => { sizeVal.textContent = size.value + ' px'; grid.querySelectorAll('.fprev').forEach(p => { p.style.fontSize = size.value + 'px'; }); });
    dlg.addEventListener('close', () => { if (io) io.disconnect(); dlg.remove(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg); F.ready().then(() => { draw(); dlg.showModal(); const on = grid.querySelector('.fcard.on'); if (on) on.scrollIntoView({ block: 'center' }); });
    return dlg;
  };
})();
