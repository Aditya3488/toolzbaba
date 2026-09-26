const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`; };
const luma = (r, g, b) => (r * .299 + g * .587 + b * .114);

// ------------------------------------------------------------------ Colour palette
HT.register('color-palette', root => {
  const el = HT.el;
  let bmp = null, colors = [], picked = [];
  const view = HT.canvas(10, 10), vx = view.getContext('2d');
  const sw = el('div', { class: 'swatches' }), pickedBox = el('div', { class: 'swatches' });
  const form = HT.form([{ name: 'k', label: 'Number of colours', type: 'range', min: 2, max: 12, value: 6 }], () => extract());
  const out = el('div', { class: 'hidden' },
    el('div', { class: 'card' }, el('div', { style: { textAlign: 'center' } }, el('div', { class: 'stage' }, view)), el('div', { class: 'help', text: 'Tip: click anywhere on the image to pick an exact colour.' }), pickedBox),
    el('div', { class: 'card' }, form.el, sw, el('div', { class: 'actions' },
      el('button', { class: 'btn sec sm', type: 'button', text: 'Copy HEX list', onclick: () => HT.copy(colors.map(c => c.hex).join(', ')) }),
      el('button', { class: 'btn sec sm', type: 'button', text: 'Copy CSS variables', onclick: () => HT.copy(':root {\n' + colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n') + '\n}') }),
      el('button', { class: 'btn sec sm', type: 'button', text: 'Copy JSON', onclick: () => HT.copy(JSON.stringify(colors.map(c => c.hex))) }),
      el('button', { class: 'btn sm', type: 'button', text: 'Download palette image', onclick: saveImage }))));
  root.append(HT.dropzone({ accept: 'image/*', hint: 'Runs in your browser: nothing is uploaded.', onFiles: async fs => { try { bmp = await HT.loadBitmap(fs[0]); } catch (e) { return HT.toast(e.message); } const s = Math.min(1, 720 / bmp.width, 480 / bmp.height); view.width = Math.round(bmp.width * s); view.height = Math.round(bmp.height * s); vx.drawImage(bmp, 0, 0, view.width, view.height); out.classList.remove('hidden'); picked = []; extract(); renderPicked(); } }), out);
  view.style.cursor = 'crosshair';
  view.addEventListener('click', e => { const b = view.getBoundingClientRect(), px = Math.floor((e.clientX - b.left) * view.width / b.width), py = Math.floor((e.clientY - b.top) * view.height / b.height), d = vx.getImageData(px, py, 1, 1).data; picked.unshift(card(d[0], d[1], d[2])); picked = picked.slice(0, 6); renderPicked(); HT.copy(hex(d[0], d[1], d[2]), 'Picked ' + hex(d[0], d[1], d[2]) + ' (copied)'); });

  function card(r, g, b, pct) {
    const h = hex(r, g, b);
    return { hex: h, rgb: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, hsl: hsl(r, g, b), pct, dark: luma(r, g, b) < 140 };
  }
  const swEl = c => el('div', { class: 'sw', title: 'Click to copy', onclick: () => HT.copy(c.hex) }, el('i', { style: { background: c.hex } }), el('div', {}, el('b', { text: c.hex.toUpperCase() }), el('span', { text: c.rgb }), el('br'), el('span', { text: c.hsl + (c.pct != null ? ' · ' + c.pct + '%' : '') })));
  function renderPicked() { pickedBox.textContent = ''; picked.forEach(c => pickedBox.append(swEl(c))); }
  function extract() {
    if (!bmp) return;
    const s = Math.min(1, 160 / Math.max(bmp.width, bmp.height)), c = HT.canvas(bmp.width * s, bmp.height * s), x = c.getContext('2d'); x.drawImage(bmp, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data, px = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
    const k = Math.min(form.values().k, Math.max(1, px.length)); if (!px.length) return;
    // k-means++ seeding (deterministic) then Lloyd iterations
    let cent = [px[Math.floor(px.length / 2)]];
    while (cent.length < k) { let best = null, bd = -1; for (let i = 0; i < px.length; i += 3) { const p = px[i]; let m = Infinity; for (const q of cent) m = Math.min(m, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2); if (m > bd) { bd = m; best = p; } } cent.push(best); }
    let cnt = [];
    for (let it = 0; it < 14; it++) {
      const sum = cent.map(() => [0, 0, 0, 0]);
      for (const p of px) { let bi = 0, bd = Infinity; for (let j = 0; j < cent.length; j++) { const q = cent[j], dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } } const s2 = sum[bi]; s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; s2[3]++; }
      cnt = sum.map(s2 => s2[3]); cent = sum.map((s2, j) => s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : cent[j]);
    }
    colors = cent.map((c2, i) => card(c2[0], c2[1], c2[2], Math.round(cnt[i] / px.length * 100))).map((c2, i) => ({ ...c2, n: cnt[i] })).sort((a, b) => b.n - a.n);
    sw.textContent = ''; colors.forEach(c2 => sw.append(swEl(c2)));
  }
  async function saveImage() {
    const w = 160, c = HT.canvas(w * colors.length, 220), x = c.getContext('2d');
    colors.forEach((col, i) => { x.fillStyle = col.hex; x.fillRect(i * w, 0, w, 170); x.fillStyle = '#fff'; x.fillRect(i * w, 170, w, 50); x.fillStyle = '#111'; x.font = '600 16px ui-monospace, monospace'; x.textAlign = 'center'; x.fillText(col.hex.toUpperCase(), i * w + w / 2, 202); });
    HT.download(await HT.encode(c, 'image/png'), 'palette.png');
  }
});

// ------------------------------------------------------------------ QR code
HT.register('qr-code', root => {
  const el = HT.el;
  const TYPES = [['text', 'Text / URL'], ['wifi', 'Wi-Fi'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['phone', 'Phone'], ['sms', 'SMS'], ['vcard', 'Contact card']];
  let type = 'text', logo = null, lastText = '';
  const esc = s => String(s).replace(/([\\;,:"])/g, '\\$1');
  const content = el('div');
  const cf = {
    text: HT.form([{ name: 'text', label: 'Text or link', type: 'textarea', value: 'https://example.com' }], () => draw()),
    wifi: HT.form([{ name: 'ssid', label: 'Network name (SSID)', type: 'text' }, { name: 'pass', label: 'Password', type: 'text' }, { name: 'sec', label: 'Security', type: 'select', options: [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'None']] }, { name: 'hidden', label: 'Hidden network', type: 'checkbox' }], () => draw()),
    whatsapp: HT.form([{ name: 'num', label: 'Phone number with country code', type: 'text', placeholder: '919876543210' }, { name: 'msg', label: 'Pre-filled message (optional)', type: 'text' }], () => draw()),
    email: HT.form([{ name: 'to', label: 'Email address', type: 'text' }, { name: 'sub', label: 'Subject', type: 'text' }, { name: 'body', label: 'Message', type: 'textarea' }], () => draw()),
    phone: HT.form([{ name: 'num', label: 'Phone number', type: 'text', placeholder: '+91 98765 43210' }], () => draw()),
    sms: HT.form([{ name: 'num', label: 'Phone number', type: 'text' }, { name: 'msg', label: 'Message', type: 'text' }], () => draw()),
    vcard: HT.form([{ name: 'first', label: 'First name', type: 'text' }, { name: 'last', label: 'Last name', type: 'text' }, { name: 'org', label: 'Company', type: 'text' }, { name: 'title', label: 'Job title', type: 'text' }, { name: 'tel', label: 'Phone', type: 'text' }, { name: 'mail', label: 'Email', type: 'text' }, { name: 'url', label: 'Website', type: 'text' }], () => draw()),
  };
  const tabs = el('div', { class: 'tabs' }, TYPES.map(([k, t]) => el('button', { class: 'tab' + (k === type ? ' on' : ''), type: 'button', text: t, 'data-k': k, onclick: () => setType(k) })));
  const style = HT.form([
    { name: 'size', label: 'Size (px)', type: 'select', value: 512, options: [[256, '256'], [512, '512'], [1024, '1024'], [2048, '2048 (print)']] },
    { name: 'ec', label: 'Error correction', type: 'select', value: 'M', options: [['L', 'Low (7%)'], ['M', 'Medium (15%)'], ['Q', 'Quartile (25%)'], ['H', 'High (30%)']], help: 'Higher survives damage or a logo. Larger code.' },
    { name: 'dots', label: 'Dot style', type: 'select', options: [['square', 'Square'], ['round', 'Rounded'], ['dot', 'Dots']] },
    { name: 'margin', label: 'Quiet zone (modules)', type: 'range', min: 0, max: 8, value: 3 },
    { name: 'fg', label: 'Foreground', type: 'color', value: '#111111' },
    { name: 'bg', label: 'Background', type: 'color', value: '#ffffff' },
    { name: 'clear', label: 'Transparent background', type: 'checkbox' },
  ], () => draw());
  const logoIn = el('input', { type: 'file', accept: 'image/*', onchange: async e => { const f = e.target.files[0]; logo = f ? await HT.loadBitmap(f) : null; draw(); } });
  const pv = el('div', { class: 'pv', style: { padding: '16px' } }), msg = el('div', { class: 'status' });
  root.append(el('div', { class: 'card' }, tabs, content), el('div', { class: 'card' }, style.el, el('div', { class: 'field', style: { marginTop: '14px' } }, el('label', { class: 'lbl', text: 'Logo in the centre (optional)' }), logoIn)),
    el('div', { class: 'card' }, el('h2', { text: 'Your QR code' }), pv, msg, el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: 'Download PNG', onclick: () => savePng() }), el('button', { class: 'btn sec', type: 'button', text: 'Download SVG', onclick: saveSvg }), el('button', { class: 'btn ghost', type: 'button', text: 'Copy image', onclick: copyImg }))));

  function setType(k) { type = k; [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); content.textContent = ''; content.append(cf[k].el); draw(); }
  function text() {
    const v = cf[type].values();
    switch (type) {
      case 'text': return v.text;
      case 'wifi': return v.ssid ? `WIFI:T:${v.sec};S:${esc(v.ssid)};${v.sec === 'nopass' ? '' : 'P:' + esc(v.pass) + ';'}H:${v.hidden};;` : '';
      case 'whatsapp': return v.num ? `https://wa.me/${v.num.replace(/\D/g, '')}` + (v.msg ? '?text=' + encodeURIComponent(v.msg) : '') : '';
      case 'email': return v.to ? `mailto:${v.to}?` + [v.sub && 'subject=' + encodeURIComponent(v.sub), v.body && 'body=' + encodeURIComponent(v.body)].filter(Boolean).join('&') : '';
      case 'phone': return v.num ? 'tel:' + v.num.replace(/[^\d+]/g, '') : '';
      case 'sms': return v.num ? `SMSTO:${v.num.replace(/[^\d+]/g, '')}:${v.msg}` : '';
      case 'vcard': return (v.first || v.last) ? ['BEGIN:VCARD', 'VERSION:3.0', `N:${v.last};${v.first}`, `FN:${(v.first + ' ' + v.last).trim()}`, v.org && 'ORG:' + v.org, v.title && 'TITLE:' + v.title, v.tel && 'TEL:' + v.tel, v.mail && 'EMAIL:' + v.mail, v.url && 'URL:' + v.url, 'END:VCARD'].filter(Boolean).join('\n') : '';
    }
  }
  async function model() {
    await HT.loadScript('/assets/vendor/qrcode.js'); qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const t = text(); if (!t) return null; const v = style.values();
    const qr = qrcode(0, logo ? 'H' : v.ec); qr.addData(t); qr.make(); return qr;
  }
  async function draw() {
    try {
      const qr = await model(); if (!qr) { pv.textContent = ''; msg.textContent = 'Fill in the fields above.'; msg.className = 'status'; return; }
      pv.textContent = ''; pv.append(render(qr, style.values().size > 512 ? 512 : style.values().size, false)); msg.textContent = ''; lastText = text();
    } catch (e) { msg.className = 'status err'; msg.textContent = /overflow/i.test(e.message) ? 'That is too much data for a QR code. Shorten it.' : e.message; }
  }
  function render(qr, size, forExport = true) {
    const v = style.values(), n = qr.getModuleCount(), m = v.margin, cell = Math.max(1, Math.floor((forExport ? v.size : size) / (n + 2 * m))), S = cell * (n + 2 * m);
    const c = HT.canvas(S, S), x = c.getContext('2d'); if (!v.clear) { x.fillStyle = v.bg; x.fillRect(0, 0, S, S); }
    x.fillStyle = v.fg;
    const skip = logo ? Math.floor(n * .22) : 0, lo = Math.floor((n - skip) / 2), hi = lo + skip;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      if (!qr.isDark(r, q)) continue; if (logo && r >= lo - 1 && r <= hi && q >= lo - 1 && q <= hi) continue;
      const px = (q + m) * cell, py = (r + m) * cell;
      if (v.dots === 'dot') { x.beginPath(); x.arc(px + cell / 2, py + cell / 2, cell * .46, 0, 7); x.fill(); }
      else if (v.dots === 'round') { HT.roundRect(x, px, py, cell, cell, cell * .35); x.fill(); }
      else x.fillRect(px, py, cell, cell);
    }
    if (logo) { const box = skip * cell, bx = (m + lo) * cell, by = (m + lo) * cell; x.fillStyle = v.clear ? '#fff' : v.bg; HT.roundRect(x, bx - cell, by - cell, box + cell * 2, box + cell * 2, cell); x.fill(); const s = Math.min(box / logo.width, box / logo.height); x.imageSmoothingQuality = 'high'; x.drawImage(logo, bx + (box - logo.width * s) / 2, by + (box - logo.height * s) / 2, logo.width * s, logo.height * s); }
    return c;
  }
  async function savePng() { const qr = await model(); if (!qr) return HT.toast('Nothing to encode yet.'); HT.download(await HT.encode(render(qr, 0, true)), 'qr-code.png'); }
  async function copyImg() { try { const qr = await model(); const b = await HT.encode(render(qr, 0, true)); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); HT.toast('Image copied'); } catch { HT.toast('Your browser blocked image copy. Use Download instead.'); } }
  async function saveSvg() {
    const qr = await model(); if (!qr) return HT.toast('Nothing to encode yet.'); const v = style.values(), n = qr.getModuleCount(), m = v.margin, S = n + 2 * m; let d = '';
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.isDark(r, q) && !(logo && Math.abs(r - n / 2) < n * .13 && Math.abs(q - n / 2) < n * .13)) d += `M${q + m},${r + m}h1v1h-1z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">` + (v.clear ? '' : `<rect width="${S}" height="${S}" fill="${v.bg}"/>`) + `<path d="${d}" fill="${v.fg}"/></svg>`;
    HT.download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
    if (logo) HT.toast('SVG has a clear area for your logo. Add it in your editor (PNG includes it).');
  }
  setType('text');
});

// ------------------------------------------------------------------ Base64
HT.register('base64', root => {
  const el = HT.el;
  const tabs = [['text', 'Text'], ['file', 'File → Base64'], ['decode', 'Base64 → File']];
  const panes = {}, bar = el('div', { class: 'tabs' });
  const show = k => { Object.entries(panes).forEach(([n, p]) => p.classList.toggle('hidden', n !== k)); [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); };
  tabs.forEach(([k, t]) => bar.append(el('button', { class: 'tab', type: 'button', text: t, 'data-k': k, onclick: () => show(k) })));
  const toB64 = (u8, urlsafe) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); s = btoa(s); return urlsafe ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s; };
  const fromB64 = str => { str = str.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

  // --- text
  const tin = el('textarea', { placeholder: 'Type or paste text here...', style: { minHeight: '130px' } }), tout = el('textarea', { readonly: true, placeholder: 'Result appears here', style: { minHeight: '130px' } });
  const safe = el('input', { type: 'checkbox' }), tmsg = el('div', { class: 'status' });
  const run = enc => { tmsg.textContent = ''; tmsg.className = 'status'; try { tout.value = enc ? toB64(new TextEncoder().encode(tin.value), safe.checked) : new TextDecoder('utf-8', { fatal: true }).decode(fromB64(tin.value)); } catch { tmsg.className = 'status err'; tmsg.textContent = enc ? 'Could not encode that.' : 'That is not valid Base64 text (or it is binary data: use the "Base64 → File" tab).'; } };
  panes.text = el('div', { class: 'card' }, el('div', { class: 'two' }, el('div', {}, el('label', { class: 'lbl', text: 'Input' }), tin), el('div', {}, el('label', { class: 'lbl', text: 'Output' }), tout)),
    el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: 'Encode →', onclick: () => run(true) }), el('button', { class: 'btn sec', type: 'button', text: '← Decode', onclick: () => run(false) }), el('label', { class: 'chk' }, safe, 'URL-safe'), el('button', { class: 'btn ghost sm', type: 'button', text: 'Copy output', onclick: () => HT.copy(tout.value) }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Swap', onclick: () => { [tin.value, tout.value] = [tout.value, tin.value]; } })), tmsg);

  // --- file -> base64
  const fout = el('div');
  panes.file = el('div', {}, HT.dropzone({ hint: 'Any file up to ~25 MB. Nothing is uploaded.', onFiles: async fs => {
    const f = fs[0]; if (f.size > 25 * 1024 * 1024) return HT.toast('That file is large; pick one under 25 MB.');
    const u8 = new Uint8Array(await f.arrayBuffer()), b64 = toB64(u8), mime = f.type || 'application/octet-stream', uri = `data:${mime};base64,${b64}`;
    const ta = (label, val) => el('div', { style: { marginTop: '12px' } }, el('label', { class: 'lbl' }, label, el('button', { class: 'btn ghost sm', type: 'button', style: { marginLeft: '10px' }, text: 'Copy', onclick: () => HT.copy(val) })), el('textarea', { readonly: true, value: val, style: { minHeight: '90px' } }));
    fout.textContent = ''; fout.append(el('div', { class: 'card' }, el('div', { class: 'sum', text: `${f.name} · ${HT.fmtBytes(f.size)} → ${HT.fmtBytes(b64.length)} of Base64` }),
      f.type.startsWith('image/') ? el('div', { class: 'pv', style: { marginBottom: '8px' } }, el('img', { src: uri, alt: '' })) : null,
      ta('Base64', b64), ta('Data URI', uri), f.type.startsWith('image/') ? ta('HTML <img>', `<img src="${uri}" alt="">`) : null, f.type.startsWith('image/') ? ta('CSS background', `background-image: url("${uri}");`) : null));
  } }), fout);

  // --- base64 -> file
  const bin = el('textarea', { placeholder: 'Paste Base64 or a data: URI here...', style: { minHeight: '130px' } }), fname = el('input', { type: 'text', placeholder: 'file name (optional)' }), dmsg = el('div', { class: 'status' }), dprev = el('div');
  const sniff = u => { const h = [...u.subarray(0, 12)].map(b => b.toString(16).padStart(2, '0')).join(''); if (h.startsWith('89504e47')) return ['image/png', 'png']; if (h.startsWith('ffd8ff')) return ['image/jpeg', 'jpg']; if (h.startsWith('47494638')) return ['image/gif', 'gif']; if (h.startsWith('25504446')) return ['application/pdf', 'pdf']; if (h.startsWith('504b0304')) return ['application/zip', 'zip']; if (h.startsWith('52494646') && h.slice(16, 24) === '57454250') return ['image/webp', 'webp']; if (h.startsWith('494433') || h.startsWith('fffb')) return ['audio/mpeg', 'mp3']; if (h.startsWith('1a45dfa3')) return ['video/webm', 'webm']; return ['application/octet-stream', 'bin']; };
  const decode = () => { dmsg.className = 'status'; dmsg.textContent = ''; dprev.textContent = ''; try { const u8 = fromB64(bin.value), m = /^data:([^;,]+)/.exec(bin.value.trim()), [mime, ext] = sniff(u8); return { u8, mime: m ? m[1] : mime, ext }; } catch { dmsg.className = 'status err'; dmsg.textContent = 'That is not valid Base64.'; return null; } };
  panes.decode = el('div', { class: 'card' }, bin, el('div', { class: 'row', style: { marginTop: '12px' } }, el('div', { class: 'col' }, fname), el('button', { class: 'btn', type: 'button', text: 'Preview', onclick: () => { const d = decode(); if (!d) return; const url = URL.createObjectURL(new Blob([d.u8], { type: d.mime })); dprev.append(el('div', { class: 'sum', style: { marginTop: '12px' }, text: `${d.mime} · ${HT.fmtBytes(d.u8.length)}` }), d.mime.startsWith('image/') ? el('div', { class: 'pv' }, el('img', { src: url })) : d.mime.startsWith('audio/') ? el('audio', { src: url, controls: true }) : null); } }), el('button', { class: 'btn sec', type: 'button', text: 'Download file', onclick: () => { const d = decode(); if (!d) return; HT.download(new Blob([d.u8], { type: d.mime }), fname.value.trim() || 'decoded.' + d.ext); } })), dmsg, dprev);

  Object.values(panes).forEach(p => root.append(p)); root.prepend(bar); show('text');
});

// ------------------------------------------------------------------ Favicon generator
HT.register('favicon-generator', root => {
  const el = HT.el; let bmp = null, file = null;
  const form = HT.form([
    { name: 'shape', label: 'Shape', type: 'select', options: [['square', 'Square'], ['rounded', 'Rounded square'], ['circle', 'Circle']] },
    { name: 'bgc', label: 'Background', type: 'select', options: [['transparent', 'Transparent'], ['color', 'Solid colour']] },
    { name: 'bg', label: 'Background colour', type: 'color', value: '#ffffff', showIf: v => v.bgc === 'color' },
    { name: 'pad', label: 'Padding', type: 'range', min: 0, max: 35, value: 8, unit: '%' },
    { name: 'name', label: 'App / site name (for manifest)', type: 'text', value: 'My Site' },
    { name: 'theme', label: 'Theme colour (manifest)', type: 'color', value: '#4f46e5' },
  ], () => draw());
  const previews = el('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '14px' } }), prog = HT.progress();
  const card = el('div', { class: 'hidden' }, el('div', { class: 'card' }, form.el), el('div', { class: 'card' }, el('h2', { text: 'Preview' }), previews, el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: 'Download favicon package (ZIP)', onclick: build })), prog.el,
    el('div', { class: 'help', style: { marginTop: '10px' }, text: 'The ZIP has favicon.ico, PNGs (16, 32, 180, 192, 512), site.webmanifest and a ready-to-paste HTML snippet.' })));
  root.append(HT.dropzone({ accept: 'image/*', hint: 'Square PNG, SVG or JPG works best (512×512 or larger). Runs in your browser.', onFiles: async fs => { file = fs[0]; try { bmp = await HT.loadBitmap(file); } catch (e) { return prog.error(e.message); } card.classList.remove('hidden'); draw(); } }), card);

  function icon(size, opaque) {
    const v = form.values(), c = HT.canvas(size, size), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.save(); if (v.shape === 'circle') { x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, 7); x.clip(); } else if (v.shape === 'rounded') { HT.roundRect(x, 0, 0, size, size, size * .22); x.clip(); }
    if (v.bgc === 'color') { x.fillStyle = v.bg; x.fillRect(0, 0, size, size); } else if (opaque) { x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); }
    const inner = size * (1 - v.pad * 2 / 100), s = Math.min(inner / bmp.width, inner / bmp.height), w = bmp.width * s, h = bmp.height * s;
    x.drawImage(HT.resample(bmp, Math.max(1, Math.round(w)), Math.max(1, Math.round(h))), (size - w) / 2, (size - h) / 2, w, h); x.restore(); return c;
  }
  function draw() { if (!bmp) return; previews.textContent = ''; [16, 32, 48, 64, 180].forEach(s => previews.append(el('figure', { style: { margin: 0, textAlign: 'center' } }, el('div', { class: 'pv', style: { width: Math.max(s, 40) + 'px', minHeight: 0 } }, icon(s, false)), el('figcaption', { class: 'help', text: s + '×' + s })))); }
  const png = async (s, opaque = false) => HT.encode(icon(s, opaque), 'image/png');
  async function ico(sizes) { // ICO container with PNG-compressed images
    const imgs = await Promise.all(sizes.map(async s => new Uint8Array(await (await png(s)).arrayBuffer())));
    const head = 6 + 16 * imgs.length, total = head + imgs.reduce((a, b) => a + b.length, 0), buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint16(2, 1, true); dv.setUint16(4, imgs.length, true); let off = head;
    imgs.forEach((d, i) => { const p = 6 + i * 16, s = sizes[i]; u8[p] = s >= 256 ? 0 : s; u8[p + 1] = s >= 256 ? 0 : s; dv.setUint16(p + 4, 1, true); dv.setUint16(p + 6, 32, true); dv.setUint32(p + 8, d.length, true); dv.setUint32(p + 12, off, true); u8.set(d, off); off += d.length; });
    return new Blob([buf], { type: 'image/x-icon' });
  }
  async function build() {
    const v = form.values();
    try {
      prog.set(20, 'Building icons...');
      const files = [
        { name: 'favicon.ico', blob: await ico([16, 32, 48]) }, { name: 'favicon-16x16.png', blob: await png(16) }, { name: 'favicon-32x32.png', blob: await png(32) },
        { name: 'apple-touch-icon.png', blob: await png(180, true) }, { name: 'android-chrome-192x192.png', blob: await png(192, true) }, { name: 'android-chrome-512x512.png', blob: await png(512, true) },
      ];
      const manifest = { name: v.name, short_name: v.name, icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }], theme_color: v.theme, background_color: '#ffffff', display: 'standalone' };
      files.push({ name: 'site.webmanifest', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/manifest+json' }) });
      files.push({ name: 'favicon-snippet.html', blob: new Blob([`<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="${v.theme}">\n`], { type: 'text/html' }) });
      HT.download(await HT.zip(files), 'favicons.zip'); prog.clear(); HT.toast('Favicon package saved');
    } catch (e) { prog.error(e.message); }
  }
});
