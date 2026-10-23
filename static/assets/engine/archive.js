// Archives in the browser: ZIP (JSZip), TAR (read and written here), and GZ / TAR.GZ (the browser's own gzip streams).
// Opens ZIP, TAR, TAR.GZ / TGZ and GZ; writes ZIP, TAR, TAR.GZ and GZ. RAR, 7z, XZ, BZ2, ISO and CAB are recognised and
// refused with a clear message: the browser has nothing to read them with.
(() => {
  const V = '/assets/vendor/';
  const tick = HT.tick;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const loadZip = async () => { if (!window.JSZip) await HT.loadScript(V + 'jszip.min.js'); return window.JSZip; };
  const MIME = { zip: 'application/zip', tar: 'application/x-tar', 'tar-gz': 'application/gzip', gz: 'application/gzip' };
  const EXT = { zip: 'zip', tar: 'tar', 'tar-gz': 'tar.gz', gz: 'gz' };
  // the archive's own name without .zip / .tar / .tar.gz / .tgz / .gz
  const baseName = n => String(n).replace(/\.(tar\.gz|tgz|tar|zip|gz)$/i, '') || 'archive';

  const gunzip = async blob => new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const gzip = blob => new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const has = (u, at, bytes) => bytes.every((b, i) => u[at + i] === b);

  // ---------------------------------------------------------------- what kind of archive is this (by its first bytes, not its name)
  function sniff(u) {
    if (has(u, 0, [0x50, 0x4b, 0x03, 0x04]) || has(u, 0, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
    if (has(u, 0, [0x1f, 0x8b])) return 'gz';
    if (u.length > 262 && dec.decode(u.subarray(257, 262)) === 'ustar') return 'tar';
    if (has(u, 0, [0x52, 0x61, 0x72, 0x21])) return 'rar';
    if (has(u, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z';
    if (has(u, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'xz';
    if (has(u, 0, [0x42, 0x5a, 0x68])) return 'bz2';
    if (has(u, 0, [0x4d, 0x53, 0x43, 0x46])) return 'cab';
    if (u.length > 32774 && dec.decode(u.subarray(32769, 32774)) === 'CD001') return 'iso';
    if (u.length >= 512 && tarChecksumOk(u)) return 'tar';   // an old tar without the "ustar" mark
    return null;
  }
  const NOT_YET = { rar: 'RAR', '7z': '7z', xz: 'XZ', bz2: 'BZ2', cab: 'CAB', iso: 'ISO' };

  // ---------------------------------------------------------------- TAR
  const octal = (u, at, len) => {
    if (u[at] & 0x80) { let n = 0; for (let i = 1; i < len; i++) n = n * 256 + u[at + i]; return n; }   // base-256 for files over 8 GB
    const s = dec.decode(u.subarray(at, at + len)).replace(/\0.*$/s, '').trim(); return s ? parseInt(s, 8) : 0;
  };
  const str = (u, at, len) => { const s = u.subarray(at, at + len), z = s.indexOf(0); return dec.decode(z < 0 ? s : s.subarray(0, z)); };
  function tarChecksumOk(u) {
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : u[i];
    return sum > 256 && sum === octal(u, 148, 8);
  }
  function readTar(u) {
    const out = []; let at = 0, longName = null, pax = {};
    while (at + 512 <= u.length) {
      if (u.subarray(at, at + 512).every(b => b === 0)) break;   // two empty blocks end the archive
      if (!tarChecksumOk(u.subarray(at, at + 512))) throw new Error('This TAR file is damaged (a header does not add up).');
      const type = String.fromCharCode(u[at + 156] || 48), size = pax.size != null ? +pax.size : octal(u, at + 124, 12);
      let name = str(u, at, 100); const prefix = dec.decode(u.subarray(at + 257, at + 262)) === 'ustar' ? str(u, at + 345, 155) : '';
      if (prefix) name = prefix + '/' + name;
      const mtime = octal(u, at + 136, 12), data = u.subarray(at + 512, at + 512 + size);
      at += 512 + Math.ceil(size / 512) * 512;
      if (type === 'L') { longName = str(data, 0, data.length); continue; }                 // GNU: the next entry's long name
      if (type === 'x') { pax = parsePax(data); continue; }                                    // POSIX: the next entry's long name / size
      if (type === 'g') continue;
      const full = (pax.path || longName || name).replace(/^\.\//, ''); longName = null; pax = {};
      if (!full) continue;
      if (type === '5') { out.push({ name: full.replace(/\/?$/, '/'), dir: true, date: new Date(mtime * 1000) }); continue; }
      if (type !== '0' && type !== '\0' && type !== '7') continue;                            // links and devices are not files
      out.push({ name: full, data, size, date: new Date(mtime * 1000) });
    }
    return out;
  }
  function parsePax(data) {
    const o = {}, s = dec.decode(data); let i = 0;
    while (i < s.length) {
      const sp = s.indexOf(' ', i); if (sp < 0) break; const len = +s.slice(i, sp); if (!len) break;
      const rec = s.slice(sp + 1, i + len - 1), eq = rec.indexOf('='); if (eq > 0) o[rec.slice(0, eq)] = rec.slice(eq + 1);
      i += len;
    }
    return o;
  }
  function tarHeader(name, size, mtime, type) {
    const h = new Uint8Array(512), put = (s, at, len) => h.set(enc.encode(s).subarray(0, len), at);
    const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
    put(name, 0, 100); put(type === '5' ? '0000755\0' : '0000644\0', 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
    put(oct(size, 12), 124, 12); put(oct(Math.max(0, Math.floor(mtime / 1000)), 12), 136, 12); put('        ', 148, 8); put(type, 156, 1);
    put('ustar\0', 257, 6); put('00', 263, 2);
    let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    return h;
  }
  // entries -> one TAR. A name longer than 100 bytes goes first as a GNU long-name record, which GNU tar, bsdtar and 7-Zip all read.
  async function writeTar(entries) {
    const parts = [], pad = n => new Uint8Array((512 - n % 512) % 512);
    for (const e of entries) {
      const type = e.dir ? '5' : '0', name = e.dir ? e.name.replace(/\/?$/, '/') : e.name, bytes = enc.encode(name);
      const data = e.dir ? new Uint8Array(0) : e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer());
      const t = (e.date && +e.date) || Date.now();
      if (bytes.length > 100) { const ln = new Uint8Array(bytes.length + 1); ln.set(bytes); parts.push(tarHeader('././@LongLink', ln.length, t, 'L'), ln, pad(ln.length)); }
      parts.push(tarHeader(name, data.length, t, type), data, pad(data.length));
    }
    parts.push(new Uint8Array(1024));
    return new Blob(parts, { type: MIME.tar });
  }

  // ---------------------------------------------------------------- read any supported archive -> { kind, entries }
  async function read(file) {
    const u = new Uint8Array(await file.arrayBuffer()), kind = sniff(u);
    if (NOT_YET[kind]) throw new Error(`'${file.name}' is a ${NOT_YET[kind]} archive. This tool opens ZIP, TAR, TAR.GZ and GZ; ${NOT_YET[kind]} cannot be opened in the browser yet.`);
    if (kind === 'zip') {
      const Z = await loadZip(); let z;
      try { z = await Z.loadAsync(u); }
      catch (e) { throw new Error(/encrypt/i.test(String(e && e.message)) ? `'${file.name}' is password protected, which this tool cannot open.` : `'${file.name}' is not a ZIP this tool can read: ${(e && e.message) || 'damaged file'}.`); }
      const entries = [];
      for (const f of Object.values(z.files)) {
        if (f.dir) { entries.push({ name: f.name, dir: true, date: f.date }); continue; }
        entries.push({ name: f.name, data: await f.async('uint8array'), date: f.date });
        if (entries.length % 50 === 0) await tick();
      }
      return { kind, entries };
    }
    if (kind === 'tar') return { kind, entries: readTar(u) };
    if (kind === 'gz') {
      let inner; try { inner = await gunzip(new Blob([u])); } catch { throw new Error(`'${file.name}' is not a gzip file this tool can read (it may be damaged).`); }
      if (inner.length > 262 && dec.decode(inner.subarray(257, 262)) === 'ustar' || (inner.length >= 512 && tarChecksumOk(inner))) return { kind: 'tar-gz', entries: readTar(inner) };
      // a single gzipped file: its name is the archive's name without .gz (the gzip header's own name when there is one)
      const flg = u[3]; let name = file.name.replace(/\.gz$/i, '').replace(/\.tgz$/i, '.tar') || 'file';
      if (flg & 8) { let at = 10; if (flg & 4) at += 2 + (u[10] | (u[11] << 8)); const z = u.indexOf(0, at); if (z > at) name = dec.decode(u.subarray(at, z)).split(/[\\/]/).pop() || name; }
      return { kind: 'gz', entries: [{ name, data: inner, date: new Date(((u[4] | u[5] << 8 | u[6] << 16 | u[7] << 24) >>> 0) * 1000 || Date.now()) }] };
    }
    throw new Error(`'${file.name}' is not a ZIP, TAR, TAR.GZ or GZ archive.`);
  }

  // ---------------------------------------------------------------- write entries as one archive
  async function write(entries, fmt, stem) {
    const files = entries.filter(e => !e.dir);
    if (fmt === 'zip') {
      const Z = await loadZip(), z = new Z();
      for (const e of entries) e.dir ? z.folder(e.name.replace(/\/$/, '')) : z.file(e.name, e.data, { date: e.date || new Date(), binary: true });
      return { name: `${stem}.zip`, blob: await z.generateAsync({ type: 'blob', mimeType: MIME.zip, compression: 'DEFLATE', compressionOptions: { level: 6 } }) };
    }
    if (fmt === 'tar') return { name: `${stem}.tar`, blob: await writeTar(entries) };
    if (fmt === 'tar-gz') return { name: `${stem}.tar.gz`, blob: new Blob([await gzip(await writeTar(entries))], { type: MIME['tar-gz'] }) };
    if (fmt === 'gz') {
      // gzip holds exactly one file: one file becomes file.gz, more than one go into a TAR first (the usual .tar.gz)
      if (files.length === 1) { const f = files[0]; return { name: `${f.name.split('/').pop()}.gz`, blob: new Blob([await gzip(new Blob([f.data]))], { type: MIME.gz }), single: true }; }
      return { name: `${stem}.tar.gz`, blob: new Blob([await gzip(await writeTar(entries))], { type: MIME.gz }) };
    }
    throw new Error('Choose the archive format.');
  }
  const total = es => es.reduce((n, e) => n + (e.dir ? 0 : (e.data.length != null ? e.data.length : e.data.size)), 0);
  HT.archive = { read, write, baseName };

  // ZIP <-> TAR <-> TAR.GZ <-> GZ: every file and folder is moved across, names and dates kept
  HT.engine('archive-converter', async ctx => {
    const fmt = String(ctx.opts.format || 'zip'), outs = [];
    if (!EXT[fmt]) throw new Error('Choose the archive format.');
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Opening ${f.name}...`); await tick();
      const { kind, entries } = await read(f);
      if (!entries.some(e => !e.dir)) throw new Error(`'${f.name}' has no files in it.`);
      ctx.status(`Writing ${EXT[fmt].toUpperCase()}...`); await tick();
      const out = await write(entries, fmt, baseName(f.name));
      out.note = kind;
      outs.push(out);
      ctx.progress((i + 1) / ctx.files.length);
    }
    const n = outs.length, gzMany = fmt === 'gz' && outs.some(o => !o.single);
    ctx.info = { summary: `Converted ${n} archive(s) to ${EXT[fmt].toUpperCase()}.` + (gzMany ? ' A .gz file holds one file, so archives with several files were packed into a TAR first (.tar.gz).' : '') };
    return outs.map(({ name, blob }) => ({ name, blob }));
  });

  // every file out of the archives (the screen lists them for one-by-one download too)
  HT.engine('archive-extractor', async ctx => {
    const outs = []; let count = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Opening ${f.name}...`); await tick();
      const { entries } = await read(f), files = entries.filter(e => !e.dir);
      const prefix = ctx.files.length > 1 ? baseName(f.name) + '/' : '';
      for (const e of files) outs.push({ name: prefix + e.name, blob: new Blob([e.data]) });
      count += files.length;
      ctx.progress((i + 1) / ctx.files.length);
    }
    if (!outs.length) throw new Error('There are no files in this archive.');
    ctx.info = { summary: `Extracted ${count} file(s). ${outs.length > 1 ? 'They are all in one ZIP, which every computer and phone opens.' : ''}` };
    if (outs.length === 1) outs[0].name = outs[0].name.split('/').pop();
    return outs.length > 1 ? [await write(outs.map(o => ({ name: o.name, data: o.blob, date: new Date() })), 'zip', ctx.files.length > 1 ? 'extracted' : baseName(ctx.files[0].name))].map(({ name, blob }) => ({ name, blob })) : outs;
  });

  // any files -> a new ZIP, TAR.GZ or TAR
  HT.engine('create-zip', async ctx => {
    const fmt = String(ctx.opts.format || 'zip');
    if (!['zip', 'tar-gz', 'tar'].includes(fmt)) throw new Error('Choose the archive format.');
    const name = String(ctx.opts.name || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(zip|tar|tar\.gz|tgz)$/i, '') || 'archive';
    const used = new Set(), entries = [];
    for (const f of ctx.files) {
      let n = f.name, k = 1; while (used.has(n)) n = HT.stem(f.name) + '_' + k++ + (HT.ext(f.name) ? '.' + HT.ext(f.name) : ''); used.add(n);
      entries.push({ name: n, data: f, date: new Date(f.lastModified || Date.now()) });
    }
    ctx.status('Packing...'); await tick();
    const out = await write(entries, fmt, name);
    ctx.progress(1);
    const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
    ctx.info = { summary: `${entries.length} file(s), ${kb(total(entries))} packed into ${out.name} (${kb(out.blob.size)}).` };
    return [{ name: out.name, blob: out.blob }];
  });
})();
