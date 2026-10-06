// Temporary file share: upload up to 5 files (20 MB each), get a direct download link that stops working by itself. See functions/api/files.
HT.register('temporary-file-upload-direct-link-share', root => {
  const el = HT.el, KEY = 'ht_shared_files', MAX_MB = 20, MAX_FILES = 5;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const store = v => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 100))); } catch { } };
  let items = load().filter(i => !i.expires || i.expires > Date.now()), picked = [];

  const list = HT.fileList({ onChange: fs => { picked = fs; go.disabled = !fs.length; go.textContent = fs.length ? 'Upload ' + (fs.length > 1 ? fs.length + ' files' : '1 file') : 'Upload'; } });
  const dz = HT.dropzone({ multiple: true, label: 'Drop files here or click to choose', hint: `Up to ${MAX_FILES} files, ${MAX_MB} MB each. Documents, pictures, audio, video, ZIP files...`, onFiles: fs => list.add(fs.slice(0, MAX_FILES - list.files.length), true) });
  const form = HT.form([{ name: 'hours', label: 'Keep the link working for', type: 'select', value: '168', options: [['1', '1 hour'], ['24', '1 day'], ['168', '7 days'], ['720', '30 days']] }], () => { });
  const prog = HT.progress(), go = el('button', { class: 'btn', type: 'button', text: 'Upload', disabled: true, onclick: upload });
  const setCard = el('div', { class: 'card' }, HT.stepTitle(2, 'Share'), form.el, el('div', { class: 'actions' }, go), prog.el,
    el('p', { class: 'help', style: { marginTop: '10px' }, text: 'Anyone who has the link can download the file, so do not share anything private. Programs, scripts and web pages are not allowed. The link and the file are deleted automatically when the time is up, and you can delete them earlier.' }));
  const box = el('div'), main = el('div', { class: 'card tmain' }, el('div', { class: 'tbar' }, el('div', { class: 'tinfo', text: 'Your links' })), box);
  const bench = HT.bench([dz, list.el, setCard], main, { keep: true }); bench.classList.add('on'); root.append(bench);

  async function upload() {
    if (!picked.length) return; go.disabled = true;
    const fd = new FormData();
    for (const f of picked) { if (f.size > MAX_MB * 1048576) { prog.error(`'${f.name}' is larger than ${MAX_MB} MB.`); go.disabled = false; return; } fd.append('file', f, f.name); }
    fd.append('hours', form.values().hours);
    try {
      const data = await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('POST', '/api/files');
        x.upload.onprogress = e => e.lengthComputable && prog.set(e.loaded / e.total * 100, 'Uploading ' + Math.round(e.loaded / e.total * 100) + '%');
        x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { } x.status < 300 ? res(j) : rej(new Error(typeof j.detail === 'string' ? j.detail : 'Upload failed (' + x.status + ')')); };
        x.onerror = () => rej(new Error('Could not reach the server.')); x.send(fd);
      });
      items = data.items.map(i => ({ id: i.id, name: i.name, size: i.size, token: i.delete_token, expires: i.expires, link: i.link, ts: Date.now() })).concat(items); store(items);
      prog.clear(); list.clear(); render(); HT.toast(data.items.length > 1 ? 'Links ready' : 'Link ready');
    } catch (e) { prog.error(e.message); }
    go.disabled = !picked.length;
  }
  async function remove(it) {
    if (!confirm('Delete this file? Its link will stop working for everyone.')) return;
    const r = await fetch(`/api/files/${it.id}?token=${encodeURIComponent(it.token)}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) { items = items.filter(x => x.id !== it.id); store(items); render(); HT.toast('Deleted'); } else HT.toast('Could not delete');
  }
  function render() {
    box.textContent = '';
    if (!items.length) { box.append(el('p', { class: 'help', text: 'The links to your uploads appear here. They are remembered in this browser, so you can find them again.' })); return; }
    items.forEach(it => {
      const left = it.expires ? Math.max(0, it.expires - Date.now()) : 0, until = it.expires ? ' · ' + (left > 86400000 ? Math.ceil(left / 86400000) + ' days left' : left > 3600000 ? Math.ceil(left / 3600000) + ' hours left' : Math.max(1, Math.ceil(left / 60000)) + ' minutes left') : '';
      box.append(el('div', { class: 'sharerow' }, el('div', {}, el('b', { text: it.name }), el('div', { class: 'help', text: HT.fmtBytes(it.size) + until })),
        el('div', { class: 'linkrow' }, el('input', { type: 'text', readonly: true, value: it.link, 'aria-label': 'Link to ' + it.name, onfocus: e => e.target.select() }), el('button', { class: 'btn sec sm', type: 'button', text: 'Copy', onclick: () => HT.copy(it.link, 'Link copied') }),
          el('a', { class: 'btn sec sm', href: it.link, text: 'Open' }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Delete', onclick: () => remove(it) }))));
    });
  }
  render();
  return {};
});
