// Text & developer tools. Everything runs in the browser.
const $el = HT.el;
const area = (attrs = {}) => $el('textarea', { spellcheck: 'false', ...attrs });
const half = (left, right) => { const b = HT.bench([left], right, { half: true }); b.classList.add('on'); return b; };  // two equal halves
const copyBtn = (get, label = 'Copy') => $el('button', { class: 'btn sec sm', type: 'button', text: label, onclick: () => HT.copy(typeof get === 'function' ? get() : get) });

// ------------------------------------------------------------------ JSON formatter
HT.register('json-formatter', root => {
  const inp = area({ placeholder: 'Paste JSON here...', style: { minHeight: '340px' } }), out = area({ readonly: true, placeholder: 'Formatted JSON appears here', style: { minHeight: '340px' } });
  const status = $el('div', { class: 'status' }), indent = $el('select', { style: { width: 'auto' } }, [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']].map(([v, t]) => $el('option', { value: v, text: t })));
  const sortKeys = $el('input', { type: 'checkbox' });
  const sortDeep = v => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortDeep(v[k])])) : v;
  // Small JSON checker that reports WHERE the first mistake is (browsers' own messages no longer include a position)
  function jsonError(t) {
    let i = 0; const n = t.length;
    const fail = m => { const e = new Error(m); e.pos = i; throw e; };
    const ws = () => { while (i < n && ' \t\n\r'.includes(t[i])) i++; };
    const str = () => { i++; while (i < n) { const c = t[i]; if (c === '"') { i++; return; } if (c === '\\') { i += 2; continue; } if (c === '\n') fail('Unterminated string'); i++; } fail('Unterminated string'); };
    const val = () => {
      ws(); const c = t[i];
      if (c === '{') { i++; ws(); if (t[i] === '}') { i++; return; } for (;;) { ws(); if (t[i] !== '"') fail('Expected a property name in double quotes'); str(); ws(); if (t[i] !== ':') fail("Expected ':' after the property name"); i++; val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === '}') { i++; return; } fail("Expected ',' or '}'"); } }
      if (c === '[') { i++; ws(); if (t[i] === ']') { i++; return; } for (;;) { val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === ']') { i++; return; } fail("Expected ',' or ']'"); } }
      if (c === '"') return str();
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i)); if (m) { i += m[0].length; return; }
      for (const lit of ['true', 'false', 'null']) if (t.startsWith(lit, i)) { i += lit.length; return; }
      fail(i >= n ? 'Unexpected end of the text' : 'Unexpected character ' + JSON.stringify(c));
    };
    try { val(); ws(); if (i < n) fail('Unexpected content after the JSON value'); return null; } catch (e) { return { pos: e.pos ?? i, msg: e.message }; }
  }
  function parse() {
    const t = inp.value; if (!t.trim()) { status.className = 'status'; status.textContent = ''; return null; }
    try { return { v: JSON.parse(t) }; }
    catch (e) {
      const err = jsonError(t) || { pos: 0, msg: e.message }, before = t.slice(0, err.pos).split('\n');
      status.className = 'status err'; status.textContent = `Invalid JSON at line ${before.length}, column ${before[before.length - 1].length + 1}: ${err.msg}`; return null;
    }
  }
  const validate = () => { const r = parse(); if (r) { status.className = 'status'; status.style.color = 'var(--ok)'; status.textContent = '✓ Valid JSON'; } else status.style.color = ''; return r; };
  const format = () => { const r = validate(); if (r) out.value = JSON.stringify(sortKeys.checked ? sortDeep(r.v) : r.v, null, indent.value === 'tab' ? '\t' : +indent.value); };
  const minify = () => { const r = validate(); if (r) out.value = JSON.stringify(sortKeys.checked ? sortDeep(r.v) : r.v); };
  inp.addEventListener('input', HT.debounce(validate, 250));
  root.append($el('div', { class: 'card' }, $el('div', { class: 'two' }, $el('div', {}, $el('label', { class: 'lbl', text: 'Input' }), inp), $el('div', {}, $el('label', { class: 'lbl', text: 'Result' }), out)),
    $el('div', { class: 'actions' }, $el('button', { class: 'btn', type: 'button', text: 'Format', onclick: format }), $el('button', { class: 'btn sec', type: 'button', text: 'Minify', onclick: minify }), indent,
      $el('label', { class: 'chk' }, sortKeys, 'Sort keys'), copyBtn(() => out.value, 'Copy result'),
      $el('button', { class: 'btn ghost sm', type: 'button', text: 'Download', onclick: () => out.value && HT.download(new Blob([out.value], { type: 'application/json' }), 'data.json') }),
      $el('button', { class: 'btn ghost sm', type: 'button', text: 'Sample', onclick: () => { inp.value = '{"name":"Toolz Baba","tools":["resize","ocr"],"free":true,"stats":{"count":54,"rating":4.8}}'; format(); } }),
      $el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { inp.value = out.value = ''; validate(); } })), status));
});

// ------------------------------------------------------------------ Word counter
HT.register('word-counter', root => {
  const STOP = new Set('the a an and or but if then of to in on at by for with as is are was were be been it this that these those i you he she we they not from have has had do does did will would can could so than too very just about into over out up down our your their its my me him her them what which who whom'.split(' '));
  const ta = area({ placeholder: 'Type or paste your text here...', style: { minHeight: '260px', fontFamily: 'inherit', fontSize: '1rem' } });
  const limit = $el('input', { type: 'number', min: 0, placeholder: 'e.g. 280', style: { width: '120px' } });
  const grid = $el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '12px', marginTop: '14px' } }), kw = $el('div', { style: { marginTop: '14px' } });
  const stat = (label, val, sub) => $el('div', { class: 'sidecard', style: { padding: '14px' } }, $el('div', { style: { fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-.02em' }, text: val }), $el('div', { class: 'help', text: label }), sub ? $el('div', { class: 'help', text: sub }) : null);
  function update() {
    const t = ta.value, words = (t.trim().match(/\S+/g) || []), chars = [...t].length, noSpace = [...t.replace(/\s/g, '')].length;
    const sentences = (t.match(/[^.!?।\n]+[.!?।]+|[^.!?।\n]+$/g) || []).filter(s => s.trim()).length, paras = t.split(/\n\s*\n/).filter(s => s.trim()).length;
    const mins = words.length / 200, secs = words.length / 130 * 60, lim = +limit.value;
    grid.textContent = ''; grid.append(...[stat('Words', words.length), stat('Characters', chars, noSpace + ' without spaces'), stat('Sentences', sentences), stat('Paragraphs', paras),
      stat('Reading time', mins < 1 ? Math.max(words.length ? 1 : 0, Math.round(mins * 60)) + ' sec' : Math.round(mins * 10) / 10 + ' min'), stat('Speaking time', secs < 60 ? Math.round(secs) + ' sec' : Math.round(secs / 6) / 10 + ' min'),
      lim ? stat('Characters left', lim - chars, lim - chars < 0 ? 'over the limit' : 'of ' + lim) : null].filter(Boolean));
    const freq = new Map(); words.forEach(w => { const k = w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); if (k.length > 2 && !STOP.has(k)) freq.set(k, (freq.get(k) || 0) + 1); });
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    kw.textContent = ''; if (top.length) { kw.append($el('h2', { text: 'Most used words' })); kw.append($el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, top.map(([w, n]) => $el('span', { class: 'chip' }, w, $el('b', { style: { color: 'var(--accent)' }, text: ' ×' + n }), $el('span', { class: 'help', text: ' ' + (n / words.length * 100).toFixed(1) + '%' }))))); }
  }
  ta.addEventListener('input', update); limit.addEventListener('input', update);
  root.append(half($el('div', { class: 'card' }, ta, $el('div', { class: 'actions' }, $el('label', { class: 'lbl', style: { margin: 0 }, text: 'Character limit (optional)' }), limit, $el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { ta.value = ''; update(); } }))), $el('div', { class: 'card tmain' }, grid, kw))); update();
});

// ------------------------------------------------------------------ Case converter
HT.register('text-case-converter', root => {
  const ta = area({ placeholder: 'Type or paste your text here...', style: { minHeight: '240px', fontFamily: 'inherit', fontSize: '1rem' } });
  // split on anything that isn't a letter/number, and at real camelCase joins (helloWorld, XMLHttpRequest) but not in odd casing like "wORLD"
  const words = s => s.replace(/([a-z0-9])([A-Z][a-z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const SMALL = new Set('a an the and but or for nor on at to by of in as vs via'.split(' '));
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const CONVERT = [
    ['UPPERCASE', s => s.toUpperCase()], ['lowercase', s => s.toLowerCase()],
    ['Title Case', s => s.toLowerCase().replace(/(^|[\s\-–—("'])(\p{L}[\p{L}\p{N}']*)/gu, (m, sp, w, off) => sp + (off > 0 && SMALL.has(w) ? w : cap(w)))],
    ['Sentence case', s => s.toLowerCase().replace(/(^\s*|[.!?।]\s+|\n\s*)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase())],
    ['Capitalize Each Word', s => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase())],
    ['camelCase', s => words(s).map((w, i) => i ? cap(w) : w.toLowerCase()).join('')], ['PascalCase', s => words(s).map(cap).join('')],
    ['snake_case', s => words(s).map(w => w.toLowerCase()).join('_')], ['kebab-case', s => words(s).map(w => w.toLowerCase()).join('-')],
    ['CONSTANT_CASE', s => words(s).map(w => w.toUpperCase()).join('_')], ['dot.case', s => words(s).map(w => w.toLowerCase()).join('.')],
    ['aLtErNaTiNg', s => [...s].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join('')], ['iNVERSE', s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')],
  ];
  const history = [];
  const apply = f => { history.push(ta.value); ta.value = f(ta.value); };
  const tools = $el('div', { class: 'actions', style: { marginTop: '0' } }, CONVERT.map(([t, f]) => $el('button', { class: 'btn sec sm', type: 'button', text: t, onclick: () => apply(f) })));
  root.append(half($el('div', { class: 'card' }, HT.stepTitle(1, 'Choose a case'), tools), $el('div', { class: 'card tmain' }, ta, $el('div', { class: 'actions' }, copyBtn(() => ta.value, 'Copy text'), $el('button', { class: 'btn ghost sm', type: 'button', text: 'Undo', onclick: () => { if (history.length) ta.value = history.pop(); } }), $el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { history.push(ta.value); ta.value = ''; } })))));
});

// ------------------------------------------------------------------ Password generator
HT.register('password-generator', root => {
  const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/' };
  const form = HT.form([
    { name: 'length', label: 'Length', type: 'range', min: 6, max: 64, value: 16 },
    { name: 'count', label: 'How many', type: 'range', min: 1, max: 20, value: 5 },
    { name: 'lower', label: 'Lowercase (a-z)', type: 'checkbox', value: true }, { name: 'upper', label: 'Uppercase (A-Z)', type: 'checkbox', value: true },
    { name: 'digits', label: 'Numbers (0-9)', type: 'checkbox', value: true }, { name: 'symbols', label: 'Symbols (!@#$...)', type: 'checkbox', value: true },
    { name: 'noamb', label: 'Skip look-alike characters (I l 1 O 0 o)', type: 'checkbox' },
  ], () => gen());
  const list = $el('div'), meter = $el('div', { class: 'help', style: { marginTop: '10px' } }), status = $el('div', { class: 'status err' });
  const rnd = n => { const lim = Math.floor(2 ** 32 / n) * n, b = new Uint32Array(1); do crypto.getRandomValues(b); while (b[0] >= lim); return b[0] % n; };
  function gen() {
    const v = form.values(), amb = /[Il1O0o]/g; status.textContent = '';
    const sets = ['lower', 'upper', 'digits', 'symbols'].filter(k => v[k]).map(k => v.noamb ? SETS[k].replace(amb, '') : SETS[k]);
    list.textContent = ''; if (!sets.length) { status.textContent = 'Choose at least one kind of character.'; return; }
    const pool = sets.join(''), len = Math.max(v.length, sets.length), bits = len * Math.log2(pool.length);
    for (let i = 0; i < v.count; i++) {
      const chars = sets.map(s => s[rnd(s.length)]); while (chars.length < len) chars.push(pool[rnd(pool.length)]);
      for (let j = chars.length - 1; j > 0; j--) { const k = rnd(j + 1); [chars[j], chars[k]] = [chars[k], chars[j]]; }
      const pw = chars.join('');
      list.append($el('div', { class: 'linkrow' }, $el('input', { type: 'text', readonly: true, value: pw, style: { fontSize: '1rem' }, onfocus: e => e.target.select() }), copyBtn(pw)));
    }
    const label = bits < 40 ? 'Weak' : bits < 60 ? 'OK' : bits < 80 ? 'Strong' : 'Very strong';
    meter.textContent = `Strength: ${label} (about ${Math.round(bits)} bits). Passwords are created in your browser and never sent anywhere.`;
  }
  root.append(half($el('div', { class: 'card' }, form.el, $el('div', { class: 'actions' }, $el('button', { class: 'btn', type: 'button', text: 'Generate new', onclick: gen })), status), $el('div', { class: 'card tmain' }, list, meter))); gen();
});

// ------------------------------------------------------------------ Hash & UUID generator
function md5(bytes) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const len = bytes.length, total = Math.floor((len + 8) / 64) * 64 + 64, buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 8, (len * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(len / 536870912) >>> 0, true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B; B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer); o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true);
  return [...out].map(b => b.toString(16).padStart(2, '0')).join('');
}
window.__md5 = md5; // exposed for the self-check test
async function digestAll(bytes) {
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''), r = { MD5: md5(bytes) };
  if (!crypto.subtle) throw new Error('SHA hashes need a secure (https) page. MD5 still works.');
  for (const [n, a] of [['SHA-1', 'SHA-1'], ['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512']]) r[n] = hex(await crypto.subtle.digest(a, bytes));
  return r;
}
HT.register('hash-uuid-generator', root => {
  const tabs = [['uuid', 'UUID'], ['text', 'Hash text'], ['file', 'Hash a file']], panes = {}, bar = $el('div', { class: 'tabs' });
  const show = k => { Object.entries(panes).forEach(([n, p]) => p.classList.toggle('hidden', n !== k)); [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); };
  tabs.forEach(([k, t]) => bar.append($el('button', { class: 'tab', type: 'button', text: t, 'data-k': k, onclick: () => show(k) })));

  // UUIDs
  const uf = HT.form([{ name: 'ver', label: 'Version', type: 'select', options: [['4', 'v4 (random)'], ['7', 'v7 (time-ordered)']] }, { name: 'n', label: 'How many', type: 'number', value: 5, min: 1, max: 200 },
    { name: 'up', label: 'Uppercase', type: 'checkbox' }, { name: 'nodash', label: 'Remove hyphens', type: 'checkbox' }], () => gen());
  const uout = area({ readonly: true, style: { minHeight: '260px' } });
  const fmt = b => { const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
  const v4 = () => { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 0x40; b[8] = (b[8] & 63) | 0x80; return fmt(b); };
  const v7 = () => { const b = crypto.getRandomValues(new Uint8Array(16)); let t = Date.now(); for (let i = 5; i >= 0; i--) { b[i] = t % 256; t = Math.floor(t / 256); } b[6] = (b[6] & 15) | 0x70; b[8] = (b[8] & 63) | 0x80; return fmt(b); };
  function gen() { const v = uf.values(), n = Math.max(1, Math.min(200, v.n || 1)); let l = Array.from({ length: n }, () => (v.ver === '7' ? v7() : v4())); if (v.nodash) l = l.map(x => x.replace(/-/g, '')); if (v.up) l = l.map(x => x.toUpperCase()); uout.value = l.join('\n'); }
  panes.uuid = half($el('div', { class: 'card' }, uf.el, $el('div', { class: 'actions' }, $el('button', { class: 'btn', type: 'button', text: 'Generate', onclick: gen }))), $el('div', { class: 'card tmain' }, $el('div', { class: 'tbar' }, $el('div', { class: 'tinfo', text: 'Your UUIDs' }), $el('div', { class: 'actions' }, copyBtn(() => uout.value, 'Copy all'))), uout));

  // text hash
  const tin = area({ placeholder: 'Type or paste text to hash...', style: { minHeight: '120px' } }), tres = $el('div', { style: { marginTop: '12px' } }), upper = $el('input', { type: 'checkbox' });
  const rows = (r, up) => { const box = $el('div'); Object.entries(r).forEach(([k, v]) => { const val = up ? v.toUpperCase() : v; box.append($el('div', { class: 'linkrow' }, $el('b', { text: k, style: { width: '70px' } }), $el('input', { type: 'text', readonly: true, value: val, onfocus: e => e.target.select() }), copyBtn(val))); }); return box; };
  let tk = 0;
  const hashText = async () => { const my = ++tk; try { const r = await digestAll(new TextEncoder().encode(tin.value)); if (my === tk) { tres.textContent = ''; tres.append(rows(r, upper.checked)); } } catch (e) { tres.textContent = e.message; } };
  tin.addEventListener('input', hashText); upper.addEventListener('change', hashText);
  panes.text = half($el('div', { class: 'card' }, tin, $el('div', { class: 'actions', style: { marginTop: '10px' } }, $el('label', { class: 'chk' }, upper, 'Uppercase hex'))), $el('div', { class: 'card tmain' }, $el('div', { class: 'tinfo', text: 'Hashes of your text' }), tres));
  panes.text.classList.add('hidden');

  // file hash
  const fres = $el('div', { style: { marginTop: '14px' } }), fstat = HT.progress();
  panes.file = half($el('div', { class: 'card' }, HT.dropzone({ multiple: false, hint: 'Any file up to 500 MB. Read in your browser, never uploaded.', onFiles: async fs => {
    const f = fs[0]; fres.textContent = ''; if (f.size > 500 * 1024 * 1024) return fstat.error('That file is larger than 500 MB.');
    try { fstat.set(30, 'Reading ' + f.name + '...'); const bytes = new Uint8Array(await f.arrayBuffer()); fstat.set(60, 'Calculating...'); await new Promise(r => setTimeout(r, 20)); const r = await digestAll(bytes); fstat.clear(); fres.append($el('div', { class: 'sum', text: `${f.name} · ${HT.fmtBytes(f.size)}` }), rows(r, false)); } catch (e) { fstat.error(e.message); }
  } }), fstat.el), $el('div', { class: 'card tmain' }, $el('div', { class: 'tinfo', text: 'The fingerprints of your file' }), fres));
  panes.file.classList.add('hidden');
  Object.values(panes).forEach(p => root.append(p)); root.prepend(bar); show('uuid'); gen(); hashText();
});

// ------------------------------------------------------------------ URL encoder / decoder
HT.register('url-encoder', root => {
  const tabs = [['enc', 'Encode / decode'], ['parse', 'Take a URL apart']], panes = {}, bar = $el('div', { class: 'tabs' });
  const show = k => { Object.entries(panes).forEach(([n, p]) => p.classList.toggle('hidden', n !== k)); [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); };
  tabs.forEach(([k, t]) => bar.append($el('button', { class: 'tab', type: 'button', text: t, 'data-k': k, onclick: () => show(k) })));
  const inp = area({ placeholder: 'Text or URL...', style: { minHeight: '130px' } }), out = area({ readonly: true, placeholder: 'Result', style: { minHeight: '130px' } });
  const mode = $el('select', { style: { width: 'auto' } }, [['component', 'Encode everything (query values, parts)'], ['full', 'Keep it a working URL (keep : / ? & =)']].map(([v, t]) => $el('option', { value: v, text: t })));
  const plus = $el('input', { type: 'checkbox' }), status = $el('div', { class: 'status err' });
  const enc = () => { status.textContent = ''; const e = mode.value === 'full' ? encodeURI : encodeURIComponent; out.value = e(inp.value); if (plus.checked) out.value = out.value.replace(/%20/g, '+'); };
  const dec = () => { status.textContent = ''; try { const t = plus.checked ? inp.value.replace(/\+/g, ' ') : inp.value; out.value = mode.value === 'full' ? decodeURI(t) : decodeURIComponent(t); } catch { status.textContent = 'That is not valid percent-encoded text.'; } };
  panes.enc = $el('div', { class: 'card' }, $el('div', { class: 'two' }, $el('div', {}, $el('label', { class: 'lbl', text: 'Input' }), inp), $el('div', {}, $el('label', { class: 'lbl', text: 'Result' }), out)),
    $el('div', { class: 'actions' }, $el('button', { class: 'btn', type: 'button', text: 'Encode →', onclick: enc }), $el('button', { class: 'btn sec', type: 'button', text: '← Decode', onclick: dec }), mode, $el('label', { class: 'chk' }, plus, 'Space as +'), copyBtn(() => out.value, 'Copy result'),
      $el('button', { class: 'btn ghost sm', type: 'button', text: 'Swap', onclick: () => { [inp.value, out.value] = [out.value, inp.value]; } })), status);

  const uin = $el('input', { type: 'text', placeholder: 'https://example.com/path?name=Toolz+Baba&lang=hi#top' }), parts = $el('div', { style: { marginTop: '12px' } });
  const row = (k, v) => $el('tr', {}, $el('td', { text: k, style: { width: '120px', color: 'var(--faint)' } }), $el('td', { text: v, style: { wordBreak: 'break-all' } }), $el('td', {}, v ? copyBtn(v) : null));
  function parse() {
    parts.textContent = ''; const t = uin.value.trim(); if (!t) return;
    let u; try { u = new URL(t); } catch { parts.append($el('div', { class: 'status err', text: 'That does not look like a full URL (it needs https:// or similar at the start).' })); return; }
    const tb = $el('table', { class: 'ftable' }); [['Protocol', u.protocol], ['Username', u.username], ['Host', u.hostname], ['Port', u.port], ['Path', decodeURIComponent(u.pathname)], ['Hash', u.hash]].forEach(([k, v]) => tb.append(row(k, v)));
    parts.append(tb); const ps = [...u.searchParams.entries()];
    if (ps.length) { parts.append($el('h2', { text: 'Query parameters' })); const t2 = $el('table', { class: 'ftable' }); ps.forEach(([k, v]) => t2.append(row(k, v))); t2.querySelectorAll('td:first-child').forEach(td => { td.style.color = 'var(--text)'; td.style.fontWeight = 600; }); parts.append(t2); }
  }
  uin.addEventListener('input', parse);
  panes.parse = half($el('div', { class: 'card' }, $el('label', { class: 'lbl', text: 'Full URL' }), uin), $el('div', { class: 'card tmain' }, parts));
  panes.parse.classList.add('hidden');
  Object.values(panes).forEach(p => root.append(p)); root.prepend(bar); show('enc');
});
