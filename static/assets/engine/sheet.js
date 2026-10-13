// Spreadsheet converter (runs in the browser with SheetJS): XLSX, XLS, ODS, CSV, TSV and Apple Numbers into each other.
// The values, formulas and every sheet move across; colours, fonts and charts do not (SheetJS reads the data, not the look).
(() => {
  const V = '/assets/vendor/sheetjs-0.20.3/';
  const tick = HT.tick;
  const load = async () => { if (!window.XLSX) await HT.loadScript(V + 'xlsx.full.min.js'); return window.XLSX; };
  const loadNumbers = async () => { if (!window.XLSX_ZAHL_PAYLOAD) await HT.loadScript(V + 'xlsx.zahl.js'); return window.XLSX_ZAHL_PAYLOAD; };
  const MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet', numbers: 'application/vnd.apple.numbers',
    csv: 'text/csv;charset=utf-8', tsv: 'text/tab-separated-values;charset=utf-8',
  };
  const BOOK = { xlsx: 'xlsx', xls: 'biff8', ods: 'ods', numbers: 'numbers' };
  const TEXT_IN = ['csv', 'tsv', 'tab', 'txt'];
  // a plain number, written the way a person would type it; a leading zero (PIN codes, phone numbers, IDs) or more than
  // 15 digits (Excel would round it) stays text, and so does anything else, dates included, so nothing is changed by guessing
  const NUM = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Sheet';

  // CSV and TSV are text: read them as UTF-8 (SheetJS would guess an old Windows code page and garble Hindi and other
  // scripts) and keep every value as it was written, turning only plain numbers into numbers
  function readText(X, text, ext) {
    const wb = X.read(text, { type: 'string', raw: true, ...(ext === 'tsv' || ext === 'tab' ? { FS: '\t' } : {}) });
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      for (const k in ws) {
        if (k[0] === '!') continue;
        const c = ws[k];
        if (c.t === 's' && NUM.test(c.v)) { c.t = 'n'; c.v = +c.v; delete c.w; }
      }
    }
    return wb;
  }
  async function read(X, f) {
    const ext = HT.ext(f.name), buf = await f.arrayBuffer();
    if (TEXT_IN.includes(ext)) return readText(X, new TextDecoder().decode(buf).replace(/^﻿/, ''), ext);
    if (!/^(xlsx|xlsm|xlsb|xls|ods|fods|numbers)$/.test(ext)) throw new Error(`'${f.name}' is not a spreadsheet this tool can open (XLSX, XLS, ODS, CSV, TSV or Numbers).`);
    try { return X.read(buf, { cellDates: true }); }
    catch (e) {
      if (/password|encrypt/i.test(String(e && e.message))) throw new Error(`'${f.name}' is password protected. Open it, remove the password, save it and try again.`);
      throw new Error(`'${f.name}' could not be read. It may be damaged, or saved by a program this tool does not understand.`);
    }
  }
  const rangeOf = (X, ws) => ws['!ref'] ? X.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };

  // Apple Numbers counts its dates differently (SheetJS writes them four years late), so they go in as the text you see
  function datesAsText(X, wb) {
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      for (const k in ws) {
        if (k[0] === '!') continue;
        const c = ws[k];
        if (c.t === 'd' || (c.t === 'n' && c.z && X.SSF.is_date(c.z))) { c.v = c.w || X.SSF.format(c.z || 'yyyy-mm-dd', c.v); c.t = 's'; delete c.z; }
      }
    }
  }

  HT.engine('spreadsheet-converter', async ctx => {
    const X = await load(), fmt = String(ctx.opts.format || 'xlsx').toLowerCase();
    if (!MIME[fmt]) throw new Error('Choose the format to convert to.');
    const outs = [];
    let sheets = 0, rows = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(`Reading ${f.name}...`); await tick();
      const wb = await read(X, f), stem = HT.stem(f.name);
      if (!wb.SheetNames.length) throw new Error(`'${f.name}' has no sheets.`);
      for (const name of wb.SheetNames) { const r = rangeOf(X, wb.Sheets[name]); rows += r.e.r - r.s.r + 1; }
      ctx.status(`Writing ${stem}.${fmt}...`); await tick();
      if (fmt === 'csv' || fmt === 'tsv') {
        // a text file holds one table: each sheet becomes its own file
        const names = wb.SheetNames.filter(n => wb.Sheets[n]['!ref']);
        for (const name of names.length ? names : wb.SheetNames.slice(0, 1)) {
          let text = X.utils.sheet_to_csv(wb.Sheets[name], { FS: fmt === 'tsv' ? '\t' : ',', blankrows: true });
          if (fmt === 'csv') text = '﻿' + text;   // the mark Excel needs to open UTF-8 text with Hindi and accents intact
          const label = wb.SheetNames.length > 1 ? stem + '_' + safeName(name) : stem;
          outs.push({ name: `${label}.${fmt}`, blob: new Blob([text], { type: MIME[fmt] }) });
          sheets++;
        }
      } else {
        if (fmt === 'xls') {
          const big = wb.SheetNames.find(n => { const r = rangeOf(X, wb.Sheets[n]); return r.e.r >= 65536 || r.e.c >= 256; });
          if (big) throw new Error(`Sheet '${big}' is too big for the old XLS format (at most 65,536 rows and 256 columns). Convert it to XLSX instead.`);
        }
        const opts = { type: 'array', bookType: BOOK[fmt], compression: true };
        if (fmt === 'numbers') { opts.numbers = await loadNumbers(); datesAsText(X, wb); }
        let data;
        try { data = X.write(wb, opts); }
        catch (e) { console.warn(e); throw new Error(`'${f.name}' could not be written as ${fmt.toUpperCase()}: ${(e && e.message) || 'unknown error'}.`); }
        outs.push({ name: `${stem}.${fmt}`, blob: new Blob([data], { type: MIME[fmt] }) });
        sheets += wb.SheetNames.length;
      }
      ctx.progress((i + 1) / ctx.files.length);
    }
    const kept = fmt === 'csv' || fmt === 'tsv' ? 'One file per sheet, values only (a text file has no formulas or colours).' : 'Values and formulas are kept; colours and fonts are not.';
    ctx.info = { summary: `Converted ${ctx.files.length} file(s) to ${fmt.toUpperCase()}: ${sheets} sheet(s), ${rows.toLocaleString()} row(s). ${kept}` };
    return outs;
  });
})();
