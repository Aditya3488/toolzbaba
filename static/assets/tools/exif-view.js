// "What is hidden in this photo": every tag and value that is attached to an image (EXIF, GPS, XMP, IPTC, ICC, PNG text), shown before it is removed.
// HT.exifPanel(file) -> element. The reading is done by exifr (vendored, runs in the browser: the photo never leaves the device).
const el = HT.el;
const CODECS = '/assets/vendor/img-codecs/';
// tags that can say who you are, where you were, or which device you own
const RISK = {
  gps: 'Where the photo was taken', Make: 'Camera or phone brand', Model: 'Camera or phone model', Software: 'Program that edited or made the file', HostComputer: 'Name of the device', SerialNumber: 'Serial number of the device',
  BodySerialNumber: 'Serial number of the camera', LensSerialNumber: 'Serial number of the lens', InternalSerialNumber: 'Serial number of the device', CameraOwnerName: 'Owner name', OwnerName: 'Owner name', Artist: 'Author name', Copyright: 'Copyright holder',
  DateTimeOriginal: 'When the photo was taken', CreateDate: 'When the photo was made', ModifyDate: 'When it was last changed', ImageUniqueID: 'A unique ID of this photo', LensModel: 'Lens model', UserComment: 'A comment someone wrote',
  creator: 'Author name', Creator: 'Author name', By_line: 'Author name', Credit: 'Credit line', Caption_Abstract: 'A caption someone wrote', City: 'Place name', Country_PrimaryLocationName: 'Place name', Province_State: 'Place name',
  Location: 'Place name', Sub_location: 'Place name', CreatorTool: 'Program that made the file', ImageDescription: 'A description someone wrote', XPAuthor: 'Author name', XPComment: 'A comment someone wrote', Keywords: 'Keywords someone added',
};
const GROUPS = [['gps', 'Location (GPS)'], ['ifd0', 'Camera and file info'], ['exif', 'Exposure and settings'], ['xmp', 'XMP (editing programs, authors)'], ['iptc', 'IPTC (captions, credits, places)'], ['interop', 'Interoperability'], ['ifd1', 'Thumbnail info'], ['icc', 'Colour profile (ICC)'], ['png', 'PNG text notes']];

const pretty = v => {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? String(v) : v.toLocaleString();
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return `(${v.byteLength} bytes of binary data)`;
  if (Array.isArray(v)) return v.length > 12 ? v.slice(0, 12).map(pretty).join(', ') + ` ... (${v.length} values)` : v.map(pretty).join(', ');
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  return String(v).replace(/\u0000/g, '').trim();
};
// "ExposureTime" -> "Exposure Time"
const nice = k => String(k).replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^GPS /, 'GPS ');

// PNG: the text notes (tEXt and iTXt) are plain text anyone can read
async function pngText(file) {
  const out = {}; try {
    const d = new Uint8Array(await file.arrayBuffer()); if (d[0] !== 0x89 || d[1] !== 0x50) return out; let i = 8; const dv = new DataView(d.buffer);
    while (i + 8 < d.length) {
      const len = dv.getUint32(i), type = String.fromCharCode(d[i + 4], d[i + 5], d[i + 6], d[i + 7]), s = i + 8;
      if (type === 'tEXt') { const z = d.indexOf(0, s); if (z > s && z < s + len) out[new TextDecoder('latin1').decode(d.subarray(s, z))] = new TextDecoder('latin1').decode(d.subarray(z + 1, s + len)); }
      else if (type === 'iTXt') { const z = d.indexOf(0, s); if (z > s && z < s + len && d[z + 1] === 0) { const k = new TextDecoder().decode(d.subarray(s, z)), skip = d.indexOf(0, z + 3) + 1, skip2 = d.indexOf(0, skip) + 1; if (!/^XML:com\.adobe\.xmp$/.test(k)) out[k] = new TextDecoder().decode(d.subarray(skip2, s + len)); } }
      else if (type === 'zTXt') { const z = d.indexOf(0, s); if (z > s) out[new TextDecoder('latin1').decode(d.subarray(s, z))] = '(compressed text)'; }
      else if (type === 'IEND') break;
      i = s + len + 4;
    }
  } catch { }
  return out;
}

HT.exifPanel = async file => {
  const box = el('div', { class: 'exv' });
  box.append(el('p', { class: 'help', text: 'Reading the hidden information...' }));
  try {
    await HT.loadScript(CODECS + 'exifr-7.1.3.full.umd.js');
    const opts = { tiff: true, exif: true, gps: true, interop: true, ifd1: true, xmp: true, iptc: true, icc: true, jfif: true, ihdr: true, makerNote: false, userComment: true, mergeOutput: false, translateKeys: true, translateValues: true, reviveValues: true, sanitize: false, multiSegment: true };
    let m = null; try { m = await exifr.parse(file, opts); } catch { }
    m = m || {}; let gps = null; try { gps = await exifr.gps(file); } catch { }
    const png = await pngText(file); if (Object.keys(png).length) m.png = png;
    if (gps && typeof gps.latitude === 'number') m.gpsPoint = gps;
    // flatten into rows
    const rows = []; let risky = 0;
    for (const [g, gl] of GROUPS) {
      const part = m[g]; if (!part || typeof part !== 'object') continue;
      for (const [k, v] of Object.entries(part)) {
        if (/IFD$|IFDPointer|^ExifOffset$|^GPSInfo$|^InteropOffset$/i.test(k)) continue;   // internal pointers, not information
        const text = pretty(v); if (!text && text !== '0') continue;
        const risk = g === 'gps' ? RISK.gps : RISK[k] || null; if (risk) risky++;
        rows.push({ g, gl, k, text, risk });
      }
    }
    box.textContent = '';
    const base = el('div', { class: 'exv-base' }, el('b', { text: file.name }), el('span', { text: ' \u00b7 ' + (file.size < 1048576 ? Math.round(file.size / 1024) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB') + ' \u00b7 ' + (file.type || 'image') }));
    if (!rows.length) {
      box.append(base, el('div', { class: 'exv-sum ok' }, el('b', { text: 'No hidden information found.' }), ' This photo carries no camera details, location or author notes. Nothing needs to be removed, but you can still run the tool.'));
      return box;
    }
    const sum = el('div', { class: 'exv-sum' + (risky ? ' warn' : '') }, el('b', { text: rows.length + ' hidden tag' + (rows.length === 1 ? '' : 's') + ' found. ' }),
      risky ? `${risky} of them could say who you are, where you were or what device you own.` : 'None of them look personal, but they are still extra data.');
    const q = el('input', { type: 'search', placeholder: 'Search the tags...', 'aria-label': 'Search tags' });
    const copy = el('button', { class: 'btn ghost sm', type: 'button', text: 'Copy all', onclick: () => HT.copy(rows.map(r => `${r.gl} / ${nice(r.k)}: ${r.text}`).join('\n'), 'All tags copied') });
    const body = el('div', { class: 'exv-body' });
    const map = m.gpsPoint ? el('div', { class: 'exv-map' }, el('b', { text: 'Location: ' }), `${m.gpsPoint.latitude.toFixed(5)}, ${m.gpsPoint.longitude.toFixed(5)} `,
      el('a', { href: `https://www.openstreetmap.org/?mlat=${m.gpsPoint.latitude}&mlon=${m.gpsPoint.longitude}#map=16/${m.gpsPoint.latitude}/${m.gpsPoint.longitude}`, target: '_blank', rel: 'noopener noreferrer', text: 'Show on a map' }), ' (opens openstreetmap.org)') : null;
    function draw() {
      const term = q.value.trim().toLowerCase(); body.textContent = '';
      for (const [g, gl] of GROUPS) {
        const part = rows.filter(r => r.g === g && (!term || (r.k + ' ' + nice(r.k) + ' ' + r.text).toLowerCase().includes(term))); if (!part.length) continue;
        const tb = el('tbody'); part.sort((a, b) => !!b.risk - !!a.risk);
        for (const r of part) {
          const long = r.text.length > 160, cell = el('td', { class: 'v' }, long ? r.text.slice(0, 160) + '... ' : r.text);
          if (long) cell.append(el('button', { class: 'linkbtn', type: 'button', text: 'show all', onclick: () => { cell.textContent = r.text; } }));
          tb.append(el('tr', { class: r.risk ? 'risk' : '' }, el('td', { class: 'k' }, nice(r.k), r.risk ? el('span', { class: 'rk', title: r.risk, text: r.risk }) : null), cell));
        }
        body.append(el('details', { open: g === 'gps' || g === 'ifd0' || !!term || null }, el('summary', {}, gl, el('span', { class: 'cnt', text: String(part.length) })), el('table', { class: 'exv-t' }, tb)));
      }
      if (!body.children.length) body.append(el('p', { class: 'help', text: 'No tag matches.' }));
    }
    q.addEventListener('input', HT.debounce(draw, 120)); draw();
    box.append(base, sum, map, el('div', { class: 'exv-bar' }, q, copy), body);
  } catch (e) { box.textContent = ''; box.append(el('p', { class: 'help', text: 'Could not read the hidden information of this file (' + (e && e.message || e) + '). You can still remove it.' })); }
  return box;
};
