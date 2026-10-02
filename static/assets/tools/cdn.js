HT.register('image-cdn', root => {
  const el = HT.el;
  const KEY = 'ht_cdn_uploads', MAX_MB = 10;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 200))); } catch { } };
  let items = load().filter(i => !i.expires || i.expires > Date.now());

  const prog = HT.progress();
  const listBox = el('div');
  const dz = HT.dropzone({ accept: 'image/*,.heic,.heif,.avif', multiple: true, label: 'Drop images here or click to upload', hint: `Up to 10 images, ${MAX_MB} MB each. You get WebP, JPG/PNG and original-format links.`, onFiles: upload });
  root.append(el('div', { class: 'notice', text: 'Every image gets links like /i/abc123.webp and /i/abc123.jpg, ready for websites, emails and forums. Links work for 90 days. Anyone with a link can see the image, so don\'t upload anything private.' }),
    dz, prog.el, listBox);

  // The links are plain files, so the versions are made here before uploading: WebP (small) and JPG or PNG
  // (works everywhere). Re-saving also drops camera metadata such as the GPS location, which would otherwise be
  // public, and turns sideways phone photos upright. Only GIFs are kept as they are (they may be animated).
  async function versions(f) {
    await HT.loadScript('/assets/engine/image.js');
    const c = await HT.img.load(f), alpha = HT.img.hasAlpha(c), src = HT.img.srcFormat(f), out = {};
    if (src === 'gif') out.gif = f;
    else {
      out.webp = await HT.img.encode(c, 'webp', { quality: 85 }).catch(() => null);
      out[alpha ? 'png' : 'jpg'] = await HT.img.encode(c, alpha ? 'png' : 'jpg', { quality: 90 });
      if (src === 'png' && !alpha) out.png = await HT.img.encode(c, 'png');
    }
    for (const k of Object.keys(out)) if (!out[k] || out[k].size > MAX_MB * 1048576) delete out[k];
    if (!Object.keys(out).length) throw new Error(`'${f.name}' is too large (max ${MAX_MB} MB).`);
    return { width: c.width, height: c.height, files: out };
  }

  async function upload(files) {
    if (files.length > 10) files = files.slice(0, 10);
    const fd = new FormData(), meta = [];
    try {
      for (const [i, f] of files.entries()) {
        prog.set(i / files.length * 30, `Preparing ${f.name}...`);
        const v = await versions(f);
        meta.push({ name: f.name, width: v.width, height: v.height });
        for (const [fmt, b] of Object.entries(v.files)) fd.append('file', b, `${i}.${fmt}`);
      }
      fd.append('meta', JSON.stringify(meta));
      const data = await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('POST', '/api/cdn');
        x.upload.onprogress = e => e.lengthComputable && prog.set(30 + e.loaded / e.total * 65, 'Uploading ' + Math.round(e.loaded / e.total * 100) + '%');
        x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { } x.status < 300 ? res(j) : rej(new Error(typeof j.detail === 'string' ? j.detail : 'Upload failed (' + x.status + ')')); };
        x.onerror = () => rej(new Error('Could not reach the server.')); x.send(fd);
      });
      items = data.items.map(i => ({ id: i.id, name: i.name, width: i.width, height: i.height, size: i.size, token: i.delete_token, formats: i.formats, expires: i.expires,
        base: Object.values(i.links)[0].replace(/\/i\/.*$/, ''), ts: Date.now() })).concat(items);
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
    listBox.append(el('div', { class: 'cat', text: 'Your uploads (saved in this browser)' }));
    items.forEach(it => {
      const formats = it.formats || ['webp', 'jpg'], url = f => `${it.base}/i/${it.id}.${f}`;
      const best = formats.includes('webp') ? 'webp' : formats[0], alt = HT.stem(it.name || 'image').replace(/"/g, '');
      const snippets = el('div', {}, linkRow('HTML', `<img src="${url(best)}" alt="${alt}">`), linkRow('MD', `![${alt}](${url(best)})`));
      const until = it.expires ? ' · until ' + new Date(it.expires).toLocaleDateString() : '';
      listBox.append(el('div', { class: 'card' },
        el('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
          el('div', { class: 'pv', style: { width: '120px', flex: 'none' } }, el('img', { src: url(best), alt: '', loading: 'lazy' })),
          el('div', { class: 'col' }, el('b', { text: it.name }), el('div', { class: 'help', text: `${it.width} × ${it.height} px · ${HT.fmtBytes(it.size)} · ${new Date(it.ts).toLocaleString()}${until}` }),
            el('div', { class: 'actions', style: { marginTop: '8px' } }, el('button', { class: 'btn ghost sm', type: 'button', text: 'Delete', onclick: () => remove(it) })))),
        el('div', { style: { marginTop: '12px' } }, formats.map(f => linkRow(f, url(f))), snippets)));
    });
  }
  render();
});
