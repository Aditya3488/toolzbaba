// Colour palette generator: pick one colour, get a matching palette (complementary, analogous, triadic ...) plus a shade scale. Browser only.
HT.register('color-palette-generator', root => {
  const el = HT.el;
  // ---- colour maths
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s * 100, l * 100]; };
  const hsl2rgb = ([h, s, l]) => { h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0) * 255, f(8) * 255, f(4) * 255]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

  const HARMONY = {
    complementary: [0, 180], analogous: [0, 30, -30, 60, -60], triadic: [0, 120, 240], tetradic: [0, 90, 180, 270], split: [0, 150, 210], mono: [0],
  };
  const LSHIFT = [0, 18, -18, 32, -30, 8, -8, 24];
  function build(base, kind, n) {
    const [h, s, l] = rgb2hsl(hex2rgb(base)), offs = HARMONY[kind], out = [];
    if (kind === 'mono') { for (let i = 0; i < n; i++) out.push(hsl2rgb([h, clamp(s - i * 3, 8, 100), clamp(14 + (i + .5) * (78 / n), 8, 94)])); return out; }
    for (let i = 0; out.length < n; i++) { const round = Math.floor(i / offs.length), o = offs[i % offs.length], sh = LSHIFT[round % LSHIFT.length]; out.push(hsl2rgb([h + o, clamp(s - (round ? 4 : 0), 10, 100), clamp(l + sh, 10, 92)])); }
    return out;
  }
  // 50..900 scale of the base colour (light to dark), in the style of design systems
  const scale = base => { const [h, s] = rgb2hsl(hex2rgb(base)); return [97, 93, 85, 75, 64, 54, 45, 35, 26, 17].map((L, i) => ({ k: i === 0 ? 50 : i * 100, c: hsl2rgb([h, clamp(s * (i < 3 ? .9 : 1), 10, 100), L]) })); };

  // ---- UI
  const form = HT.form([
    { name: 'base', label: 'Base colour', type: 'color', value: '#3b6cf6' },
    { name: 'hex', label: 'or type a HEX code', type: 'text', value: '#3B6CF6', placeholder: '#3B6CF6' },
    { name: 'kind', label: 'Colour harmony', type: 'select', value: 'analogous', options: [['analogous', 'Analogous (neighbours: calm)'], ['complementary', 'Complementary (opposites: bold)'], ['triadic', 'Triadic (three even steps)'], ['tetradic', 'Tetradic (square, four colours)'], ['split', 'Split-complementary'], ['mono', 'Monochromatic (one hue)']] },
    { name: 'n', label: 'Number of colours', type: 'range', min: 3, max: 8, value: 5 },
  ], v => {
    // keep the picker and the text box in step
    if (v.hex !== form._hex && /^#?[0-9a-f]{6}$/i.test(v.hex.trim())) { form._hex = v.hex; form.set('base', '#' + v.hex.trim().replace('#', '').toLowerCase()); }
    else if (v.base.toLowerCase() !== (form._base || '').toLowerCase()) { form._base = v.base; form._hex = v.base.toUpperCase(); form.set('hex', v.base.toUpperCase()); }
    draw();
  });
  const rnd = el('button', { class: 'btn sec sm', type: 'button', text: '🎲 Random colour', onclick: () => { const c = rgb2hex(hsl2rgb([Math.random() * 360, 55 + Math.random() * 35, 40 + Math.random() * 20])); form.set('base', c.toLowerCase()); form.set('hex', c); } });
  const setCard = el('div', { class: 'card' }, HT.stepTitle(1, 'Pick a colour'), form.el, el('div', { class: 'actions', style: { marginTop: '4px' } }, rnd),
    el('p', { class: 'help', style: { marginTop: '12px' }, text: 'Click a colour to copy its HEX code. The numbers under each colour show how readable black or white text is on it (4.5 or more is good for body text).' }));
  const swatches = el('div', { class: 'palgrid' }), shades = el('div', { class: 'pscale' }), info = el('div', { class: 'tinfo' });
  const copy = (t, msg) => HT.copy(t, msg);
  const exportBtns = el('div', { class: 'actions' });
  const main = el('div', { class: 'card tmain' }, el('div', { class: 'tbar' }, info, exportBtns), swatches, el('div', { class: 'help', style: { margin: '18px 0 8px' }, text: 'Shades of your base colour (light to dark):' }), shades);
  const bench = HT.bench([setCard], main); bench.classList.add('on'); root.append(bench);
  let colors = [];
  const btn = (t, fn, cls = 'btn sec sm') => el('button', { class: cls, type: 'button', text: t, onclick: fn });
  exportBtns.append(btn('Copy HEX list', () => copy(colors.map(rgb2hex).join(', '), 'HEX codes copied')), btn('Copy CSS', () => copy(':root {\n' + colors.map((c, i) => `  --color-${i + 1}: ${rgb2hex(c)};`).join('\n') + '\n}', 'CSS copied')),
    btn('Copy JSON', () => copy(JSON.stringify(colors.map(rgb2hex)), 'JSON copied')), btn('Copy Tailwind', () => copy("colors: {\n" + colors.map((c, i) => `  brand${i + 1}: '${rgb2hex(c)}',`).join('\n') + '\n}', 'Tailwind colors copied')), btn('Download PNG', savePng, 'btn sm'));
  function draw() {
    const v = form.values(); colors = build(v.base, v.kind, +v.n);
    info.textContent = `${colors.length} colours, ${v.kind === 'mono' ? 'one hue' : v.kind} harmony`;
    swatches.textContent = '';
    colors.forEach(c => {
      const hx = rgb2hex(c), [h, s, l] = rgb2hsl(c), onW = contrast(c, [255, 255, 255]), onB = contrast(c, [0, 0, 0]), txt = onW >= onB ? '#fff' : '#111';
      swatches.append(el('div', { class: 'psw' }, el('button', { type: 'button', class: 'pcolor', style: { background: hx, color: txt }, title: 'Copy ' + hx, onclick: () => copy(hx, hx + ' copied') }, hx),
        el('div', { class: 'pmeta' }, el('div', {}, `rgb(${c.map(Math.round).join(', ')})`), el('div', {}, `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`),
          el('div', { class: 'pcon' }, el('span', { class: onW >= 4.5 ? 'ok' : '', text: 'White text ' + onW.toFixed(1) }), el('span', { class: onB >= 4.5 ? 'ok' : '', text: 'Black text ' + onB.toFixed(1) })))));
    });
    shades.textContent = '';
    scale(v.base).forEach(({ k, c }) => { const hx = rgb2hex(c); shades.append(el('button', { type: 'button', class: 'pstep', style: { background: hx, color: lum(c) > .4 ? '#111' : '#fff' }, title: 'Copy ' + hx, onclick: () => copy(hx, hx + ' copied') }, el('b', { text: String(k) }), el('span', { text: hx }))); });
  }
  async function savePng() {
    const w = 1200, h = 520, c = HT.canvas(w, h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    const cw = w / colors.length; colors.forEach((col, i) => { x.fillStyle = rgb2hex(col); x.fillRect(i * cw, 0, cw, 400); x.fillStyle = '#111'; x.font = '700 28px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.fillText(rgb2hex(col), i * cw + cw / 2, 460); });
    HT.download(await HT.encode(c, 'image/png'), 'color-palette.png');
  }
  draw();
});
