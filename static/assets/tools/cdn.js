HT.register('image-cdn', root => {
  const el = HT.el;
  const FORMATS = ['jpg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'ico'];
  const KEY = 'ht_cdn_uploads';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 200))); } catch { } };
  let items = load();

  const prog = HT.progress();
  const listBox = el('div');
  const optsForm = HT.form([
    { name: 'w', label: 'Width (px)', type: 'number', min: 0, max: 4096, placeholder: 'original', help: 'Optional. Adds ?w=... to every link.' },
    { name: 'h', label: 'Height (px)', type: 'number', min: 0, max: 4096, placeholder: 'original' },
    { name: 'fit', label: 'Resize mode', type: 'select', options: [['inside', 'Fit inside (keep proportions)'], ['cover', 'Crop to fill'], ['fill', 'Stretch']], showIf: v => v.w && v.h },
    { name: 'q', label: 'Quality', type: 'range', min: 30, max: 100, value: 85, unit: '%', help: 'For JPG, WebP and AVIF links.' },
  ], () => render());

  const dz = HT.dropzone({ accept: 'image/*,.heic,.heif,.avif', multiple: true, label: 'Drop images here or click to upload', hint: 'Up to 10 images, 25 MB each. You get a link for every format.', onFiles: upload });
  root.append(el('div', { class: 'notice', text: 'Every image gets links like /i/abc123.webp, /i/abc123.png, /i/abc123.avif ... The server converts on the fly and caches the result. Add ?w=800 to any link to resize.' }),
    dz, prog.el, el('div', { class: 'card' }, el('h2', { text: 'Link options' }), optsForm.el), listBox);

  const query = () => {
    const v = optsForm.values(), p = [];
    if (v.w) p.push('w=' + v.w); if (v.h) p.push('h=' + v.h); if (v.w && v.h && v.fit !== 'inside') p.push('fit=' + v.fit);
    if (v.q !== 85) p.push('q=' + v.q);
    return p.length ? '?' + p.join('&') : '';
  };

  async function upload(files) {
    prog.set(5, 'Uploading...');
    const fd = new FormData(); files.forEach(f => fd.append('files', f, f.name));
    try {
      const data = await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('POST', '/api/cdn');
        x.upload.onprogress = e => e.lengthComputable && prog.set(5 + e.loaded / e.total * 90, 'Uploading ' + Math.round(e.loaded / e.total * 100) + '%');
        x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { } x.status < 300 ? res(j) : rej(new Error(typeof j.detail === 'string' ? j.detail : 'Upload failed')); };
        x.onerror = () => rej(new Error('Could not reach the server.')); x.send(fd);
      });
      items = data.items.map(i => ({ id: i.id, name: i.name, width: i.width, height: i.height, size: i.size, token: i.delete_token, base: i.links.jpg.replace(/\/i\/.*$/, ''), ts: Date.now() })).concat(items);
      save(items); prog.clear(); render();
    } catch (e) { prog.error(e.message); }
  }

  async function remove(it) {
    if (!confirm('Delete this image? Its links will stop working for everyone.')) return;
    const r = await fetch(`/api/cdn/${it.id}?token=${encodeURIComponent(it.token)}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) { items = items.filter(x => x.id !== it.id); save(items); render(); HT.toast('Deleted'); } else HT.toast('Could not delete');
  }

  function linkRow(label, url) {
    return el('div', { class: 'linkrow' }, el('b', { text: label }), el('input', { type: 'text', readonly: true, value: url, onfocus: e => e.target.select() }), el('button', { class: 'btn sec sm', type: 'button', text: 'Copy', onclick: () => HT.copy(url) }));
  }

  function render() {
    listBox.textContent = '';
    if (!items.length) return;
    const q = query();
    listBox.append(el('div', { class: 'cat', text: 'Your uploads (saved in this browser)' }));
    items.forEach(it => {
      const url = f => `${it.base}/i/${it.id}.${f}${q}`;
      const alt = HT.stem(it.name || 'image').replace(/"/g, '');
      const snippets = el('div', {}, linkRow('HTML', `<img src="${url('webp')}" alt="${alt}">`), linkRow('MD', `![${alt}](${url('webp')})`));
      listBox.append(el('div', { class: 'card' },
        el('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
          el('div', { class: 'pv', style: { width: '120px', flex: 'none' } }, el('img', { src: `${it.base}/i/${it.id}.webp?w=240`, alt: '', loading: 'lazy' })),
          el('div', { class: 'col' }, el('b', { text: it.name }), el('div', { class: 'help', text: `${it.width} × ${it.height} px · ${HT.fmtBytes(it.size)} · ${new Date(it.ts).toLocaleString()}` }),
            el('div', { class: 'actions', style: { marginTop: '8px' } }, el('button', { class: 'btn ghost sm', type: 'button', text: 'Delete', onclick: () => remove(it) })))),
        el('div', { style: { marginTop: '12px' } }, FORMATS.map(f => linkRow(f, url(f))), snippets)));
    });
  }
  render();
});
