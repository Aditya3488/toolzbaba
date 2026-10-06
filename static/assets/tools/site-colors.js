// Website colour palette extractor: the server fetches the page and its style sheets and counts the colours (functions/api/site-colors.js).
HT.register('website-color-palette-extractor', root => {
  const el = HT.el;
  let data = null;
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const plain = c => { const r = hex2rgb(c), l = lum(r); return sat(r) < 0.12 || l > 0.93 || l < 0.012; };  // white, black and greys
  const form = HT.form([
    { name: 'url', label: 'Website address', type: 'text', value: '', placeholder: 'https://example.com' },
    { name: 'plain', label: 'Hide white, black and greys', type: 'checkbox', value: true },
    { name: 'n', label: 'Number of colours', type: 'range', min: 3, max: 16, value: 8 },
  ], () => draw());
  const prog = HT.progress(), go = el('button', { class: 'btn', type: 'button', text: 'Get the colours', onclick: run });
  form.ctl.url.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  const setCard = el('div', { class: 'card' }, HT.stepTitle(1, 'Choose a website'), form.el, el('div', { class: 'actions' }, go), prog.el,
    el('p', { class: 'help', style: { marginTop: '10px' }, text: 'Our server reads the public page and its style sheets and counts the colours; nothing is stored. Sites that build their look only with JavaScript may show few colours.' }));
  const info = el('div', { class: 'tinfo', text: 'The colours of the site appear here.' }), swatches = el('div', { class: 'palgrid' }), exp = el('div', { class: 'actions', style: { margin: 0 } });
  const main = el('div', { class: 'card tmain' }, el('div', { class: 'tbar' }, info, exp), swatches);
  const bench = HT.bench([setCard], main, { keep: true }); bench.classList.add('on'); root.append(bench);
  let shown = [];
  const b = (t, fn, cls = 'btn sec sm') => el('button', { class: cls, type: 'button', text: t, onclick: fn });
  async function run() {
    let u = form.values().url.trim(); if (!u) return prog.error('Type a website address first.'); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    go.disabled = true; swatches.textContent = ''; exp.textContent = ''; prog.set(30, 'Reading the website...');
    try {
      const r = await fetch('/api/site-colors?url=' + encodeURIComponent(u)), j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'Could not read that website (' + r.status + ').');
      data = j; prog.clear(); draw();
    } catch (e) { prog.error(e.message); info.textContent = 'The colours of the site appear here.'; }
    go.disabled = false;
  }
  function draw() {
    if (!data) return; const v = form.values();
    let list = data.colors.filter(c => !v.plain || !plain(c.hex));
    const out = [];  // skip colours that are almost the same as one already chosen
    for (const c of list) { const r = hex2rgb(c.hex); if (!out.some(o => { const q = hex2rgb(o.hex); return Math.abs(q[0] - r[0]) + Math.abs(q[1] - r[1]) + Math.abs(q[2] - r[2]) < 40; })) out.push(c); if (out.length >= +v.n) break; }
    shown = out; swatches.textContent = ''; exp.textContent = '';
    info.textContent = `${out.length} colours from ${data.title ? '"' + data.title + '"' : data.url}` + (data.theme ? ` · theme colour ${data.theme}` : '');
    if (!out.length) { swatches.append(el('p', { class: 'help', text: 'Only white, black and grey were found. Turn off "Hide white, black and greys" to see them.' })); return; }
    out.forEach(c => {
      const r = hex2rgb(c.hex), txt = lum(r) > 0.4 ? '#111' : '#fff';
      swatches.append(el('div', { class: 'psw' }, el('button', { type: 'button', class: 'pcolor', style: { background: c.hex, color: txt }, title: 'Copy ' + c.hex, onclick: () => HT.copy(c.hex, c.hex + ' copied') }, c.hex),
        el('div', { class: 'pmeta' }, el('div', {}, `rgb(${r.join(', ')})`), el('div', {}, `used ${c.count} time${c.count > 1 ? 's' : ''}`), el('div', {}, c.uses.length ? 'in: ' + c.uses.slice(0, 3).join(', ') : ''))));
    });
    exp.append(b('Copy HEX list', () => HT.copy(shown.map(c => c.hex).join(', '), 'HEX codes copied')), b('Copy CSS', () => HT.copy(':root {\n' + shown.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n') + '\n}', 'CSS copied')), b('Copy JSON', () => HT.copy(JSON.stringify(shown.map(c => c.hex)), 'JSON copied')));
  }
  return {};
});
