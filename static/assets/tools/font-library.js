// Font Library: browse, search and preview the free fonts that the PDF Editor uses, and download them (TTF, with their licence note).
const $f = HT.el;
HT.register('font-library', root => {
  const helpers = HT.loadScript('/assets/tools/fonts-helpers.js');
  let F = null, cat = 'all', script = 'all', custom = false, bold = false, italic = false;
  const q = $f('input', { type: 'search', placeholder: 'Search fonts, for example "poppins" or "handwriting"', 'aria-label': 'Search fonts' });
  const text = $f('input', { type: 'text', 'aria-label': 'Preview text', value: '' });
  const size = $f('input', { type: 'range', min: 14, max: 96, value: 36, 'aria-label': 'Preview size' }), sizeVal = $f('span', { class: 'rangeval', text: '36 px' });
  const scriptSel = $f('select', { 'aria-label': 'Script' });
  const tabs = $f('div', { class: 'tabs', style: { marginBottom: '12px' } });
  const cbBold = $f('input', { type: 'checkbox' }), cbItalic = $f('input', { type: 'checkbox' });
  const count = $f('div', { class: 'help', style: { margin: '2px 0 14px' } }), grid = $f('div', { class: 'fgrid' });
  const controls = $f('div', { class: 'card' }, $f('div', { class: 'fl-top' }, q), tabs,
    $f('div', { class: 'fl-row' }, $f('div', { class: 'field' }, $f('label', { class: 'lbl', text: 'Preview text' }), text), $f('div', { class: 'field' }, $f('label', { class: 'lbl', text: 'Script' }), scriptSel),
      $f('div', { class: 'field' }, $f('label', { class: 'lbl' }, 'Size ', sizeVal), size), $f('div', { class: 'fl-chk' }, $f('label', { class: 'chk' }, cbBold, 'Bold'), $f('label', { class: 'chk' }, cbItalic, 'Italic'))));
  const note = $f('p', { class: 'help', style: { marginTop: '18px' }, text: 'All fonts here are free to use, also for commercial work (most are under the SIL Open Font License; each card shows its licence). You may not sell the font files on their own. The PDF Editor can use every one of them.' });
  root.append(controls, count, grid, note);

  const sampleFor = f => (custom && text.value.trim() ? text.value : script !== 'all' ? F.SAMPLE[script] : f.category === 'indic' ? F.SAMPLE[f.scripts.find(x => x !== 'latin') || 'latin'] : F.SAMPLE.latin);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); const id = e.target.dataset.id; F.load(id, bold, italic).then(() => e.target.classList.add('ready')).catch(() => { }); } }), { rootMargin: '300px' }) : null;

  function draw() {
    const term = q.value.trim().toLowerCase(); grid.textContent = '';
    const items = F.list.filter(f => (cat === 'all' || f.category === cat) && (script === 'all' || f.scripts.includes(script)) && (!term || f.name.toLowerCase().includes(term) || F.CAT[f.category].toLowerCase().includes(term) || f.scripts.some(s => F.SCRIPT[s].toLowerCase().includes(term))));
    count.textContent = items.length + (items.length === 1 ? ' font' : ' fonts') + (cat !== 'all' || script !== 'all' || term ? ' match' : ' in the library') + '. Click a preview to type your own text.';
    for (const f of items) {
      const r = F.resolve(f.id, bold, italic), prev = $f('div', { class: 'fprev', 'data-id': f.id, tabindex: 0, title: 'Click to type your own text', style: { fontFamily: `"${F.family(f.id)}", system-ui, sans-serif`, fontSize: size.value + 'px', fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? 'italic' : 'normal' }, text: sampleFor(f) });
      prev.addEventListener('click', () => { text.focus(); text.select(); });
      const styles = Object.keys(f.files).map(k => ({ regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'Bold Italic' }[k])).join(' · ');
      grid.append($f('article', { class: 'fcard' },
        $f('div', { class: 'fhead' }, $f('b', { text: f.name }), $f('span', { class: 'tag', text: F.CAT[f.category] })), prev,
        $f('div', { class: 'fmeta' }, f.scripts.map(s => $f('span', { class: 'chip', text: F.SCRIPT[s] })), $f('small', { text: styles + ' · ' + f.license })),
        $f('div', { class: 'actions', style: { margin: '10px 0 0' } }, $f('button', { class: 'btn sm', type: 'button', text: 'Download', onclick: () => F.download(f) }),
          $f('a', { class: 'btn sec sm', href: '/pdf-editor?font=' + f.id, text: 'Use in PDF Editor' }), $f('button', { class: 'btn ghost sm', type: 'button', text: 'Copy CSS', onclick: () => HT.copy(css(f), 'CSS copied') }))));
      if (io) io.observe(prev); else F.load(f.id, bold, italic).catch(() => { });
    }
  }
  const css = f => Object.entries(f.files).map(([k, v]) => `@font-face {\n  font-family: "${f.name}";\n  src: url("${v.file}") format("truetype");\n  font-weight: ${k.startsWith('bold') ? 700 : 400};\n  font-style: ${/talic/.test(k) ? 'italic' : 'normal'};\n}`).join('\n') + `\n\nbody { font-family: "${f.name}", ${f.category === 'serif' ? 'serif' : f.category === 'mono' ? 'monospace' : 'sans-serif'}; }`;
  (async () => {
    try { await helpers; F = HT.fonts; await F.ready(); } catch (e) { grid.append($f('div', { class: 'status err', text: e.message })); return; }
    [['all', 'All'], ...Object.entries(F.CAT)].forEach(([k, t]) => tabs.append($f('button', { type: 'button', class: 'tab' + (k === 'all' ? ' on' : ''), 'data-k': k, text: t, onclick: () => { cat = k; [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); } })));
    scriptSel.append($f('option', { value: 'all', text: 'Any script' }), ...Object.entries(F.SCRIPT).map(([k, t]) => $f('option', { value: k, text: t })));
    const want = new URLSearchParams(location.search).get('q'); if (want) q.value = want;
    draw();
  })();
  q.addEventListener('input', HT.debounce(() => F && draw(), 150));
  text.addEventListener('input', () => { custom = true; F && draw(); });
  scriptSel.addEventListener('change', () => { script = scriptSel.value; if (!text.value.trim()) custom = false; F && draw(); });
  size.addEventListener('input', () => { sizeVal.textContent = size.value + ' px'; grid.querySelectorAll('.fprev').forEach(p => { p.style.fontSize = size.value + 'px'; }); });
  cbBold.addEventListener('change', () => { bold = cbBold.checked; F && draw(); }); cbItalic.addEventListener('change', () => { italic = cbItalic.checked; F && draw(); });
  return {};
});
