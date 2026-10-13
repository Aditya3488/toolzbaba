// Archive tools: convert between ZIP, TAR, TAR.GZ and GZ, open an archive and take files out, and pack files into a new one.
// The work is done by /assets/engine/archive.js, in the browser.
const ARCHIVES = '.zip,.tar,.gz,.tgz,application/zip,application/x-tar,application/gzip,application/x-gzip';
const kbSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

HT.register('archive-converter', root => HT.serverTool(root, {
  slug: 'archive-converter', accept: ARCHIVES, max: 20, action: 'Convert', compare: false,
  hint: 'ZIP, TAR, TAR.GZ (TGZ) and GZ. Converted in your browser: nothing is uploaded.',
  fields: [
    { name: 'format', label: 'Convert to', type: 'select', options: [['zip', 'ZIP'], ['tar-gz', 'TAR.GZ (TGZ)'], ['tar', 'TAR'], ['gz', 'GZ']] },
  ],
}));

// adding an archive lists what is inside right away, each file with its own download button; "Extract all" gives everything at once
HT.register('archive-extractor', root => {
  const el = HT.el;
  let shown = null;
  HT.serverTool(root, {
    slug: 'archive-extractor', accept: ARCHIVES, max: 10, action: 'Extract all', compare: false,
    hint: 'ZIP, TAR, TAR.GZ (TGZ) and GZ. Opened in your browser: nothing is uploaded.',
    onFiles: async (files, { empty }) => {
      const f = files[0]; shown = f; if (!f) return;
      const box = el('div', { class: 'arc-list', style: { marginTop: '12px' } }, el('p', { class: 'help', text: 'Reading the archive...' }));
      empty.append(box);
      try {
        await HT.loadScript('/assets/engine/archive.js');
        const { entries } = await HT.archive.read(f);
        if (shown !== f) return;
        const list = entries.filter(e => !e.dir), total = list.reduce((n, e) => n + e.data.length, 0);
        box.textContent = '';
        box.append(el('p', { class: 'help', text: `${list.length} file(s), ${kbSize(total)} unpacked. Download any file on its own, or press "Extract all".` }));
        const rows = list.slice(0, 500).map(e => el('tr', {},
          el('td', { style: { wordBreak: 'break-all', padding: '4px 8px 4px 0' }, text: e.name }),
          el('td', { style: { whiteSpace: 'nowrap', padding: '4px 8px', textAlign: 'right' }, text: kbSize(e.data.length) }),
          el('td', { style: { padding: '4px 0' } }, el('button', { class: 'btn sec sm', type: 'button', text: 'Download', onclick: () => HT.download(new Blob([e.data]), e.name.split('/').pop()) }))));
        box.append(el('div', { style: { maxHeight: '420px', overflow: 'auto' } }, el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } }, el('tbody', {}, rows))));
        if (list.length > 500) box.append(el('p', { class: 'help', text: `Showing the first 500 of ${list.length} files. "Extract all" gives you every one.` }));
      } catch (e) { box.textContent = ''; box.append(el('p', { class: 'err', text: e.message })); }
    },
  });
});

HT.register('create-zip', root => HT.serverTool(root, {
  slug: 'create-zip', accept: '', max: 500, action: files => 'Pack ' + files.length + ' file(s)', compare: false,
  hint: 'Any files, as many as you like. Packed in your browser: nothing is uploaded.',
  fields: [
    { name: 'format', label: 'Archive format', type: 'select', options: [['zip', 'ZIP'], ['tar-gz', 'TAR.GZ (TGZ)'], ['tar', 'TAR']] },
    { name: 'name', label: 'File name', type: 'text', value: 'archive', placeholder: 'archive' },
  ],
}));
