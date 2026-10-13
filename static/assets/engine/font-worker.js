// Web Worker for the Font Converter (engine/font.js): Python's fontTools in Pyodide, with Brotli for WOFF2.
// Messages in: {id, files: [{name, data: ArrayBuffer}], format}
// Messages out: {id, type: 'progress', msg} | {id, type: 'done', outs: [{name, data}], summary} | {id, type: 'error', msg}
import { loadPyodide } from '/assets/vendor/pyodide-314.0.7/pyodide.mjs';

const PY = '/assets/vendor/pyodide-314.0.7/', V = new URL(self.location.href).searchParams.get('v') || '';
let ready = null;

async function boot(say) {
  say('Downloading the font engine (first time only, about 15 MB)...');
  const py = await loadPyodide({ indexURL: PY });
  say('Loading fontTools...');
  await py.loadPackage(['fonttools', 'brotli']);
  const r = await fetch('/assets/engine/fontconv.py' + (V ? '?v=' + V : ''));
  if (!r.ok) throw new Error('Could not load the font converter (' + r.status + ').');
  py.FS.mkdirTree('/home/pyodide/fc');
  py.FS.writeFile('/home/pyodide/fc/fontconv.py', await r.text());
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/fc')");
  return py.pyimport('fontconv');
}

// a Python error ends with "SomeError: message"; anything else is shown as it is
const friendly = e => {
  const s = String((e && e.message) || e || ''), last = s.trim().split('\n').pop() || '';
  return /Error:/.test(last) ? 'The font could not be converted: ' + last.replace(/^\w+Error:\s*/, '').slice(0, 240) : s.slice(0, 240) || 'Something went wrong.';
};

self.onmessage = async ({ data: m }) => {
  const say = msg => postMessage({ id: m.id, type: 'progress', msg });
  try {
    if (!ready) ready = boot(say).catch(e => { ready = null; throw e; });
    const fc = await ready;
    say(m.files.length > 1 ? `Converting ${m.files.length} fonts...` : `Converting ${m.files[0].name}...`);
    const res = fc.convert_js(m.files.map(f => [f.name, new Uint8Array(f.data)]), m.format);
    const out = res.toJs({ dict_converter: Object.fromEntries }); res.destroy();
    if (out.error) return postMessage({ id: m.id, type: 'error', msg: out.error });
    const outs = out.outs.map(o => ({ name: o.name, data: o.data.buffer.slice(o.data.byteOffset, o.data.byteOffset + o.data.byteLength) }));
    postMessage({ id: m.id, type: 'done', outs, summary: out.summary }, outs.map(o => o.data));
  } catch (e) {
    postMessage({ id: m.id, type: 'error', msg: friendly(e) });
  }
};
