// Web Worker for the Visual Sitemap Generator (site-board.js): runs the site_board Python package in Pyodide.
// Python decides what to read; sbFetch() below reads it through /api/site-fetch, several pages at a time, slowing down when
// a site answers "429 Too Many Requests", stopping after the first </h1> when asked, and decoding the page's character set.
// Messages in: {type: 'build', id, url, maxPages} | {type: 'ask', id, q} | {type: 'report', id}
// Messages out: {type: 'progress', msg, f} | {type: 'done' | 'answer' | 'report', id, ...} | {type: 'error', id, msg}
import { loadPyodide } from '/assets/vendor/pyodide-314.0.7/pyodide.mjs';

const PY = '/assets/vendor/pyodide-314.0.7/', ZIP = '/assets/site-board/site_board.zip', V = new URL(self.location.href).searchParams.get('v') || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const host = u => { try { return new URL(u).hostname; } catch { return 'the site'; } };

// one shared pace for all requests: a pause when the site asks for one, and a gap that grows on 429s and shrinks again
const pace = { until: 0, gap: 0, last: 0, streak: 0, probe: 0 };
async function slot() {
  for (;;) {
    const now = Date.now(), wait = Math.max(pace.until - now, pace.last + pace.gap - now);
    if (wait <= 0) { pace.last = now; return; }
    await sleep(Math.min(wait, 2000));
  }
}
const charset = (type, head) => ((/charset=([\w-]+)/i.exec(type) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1] || 'utf-8');

// when a site refuses page after page even after waiting (it has blocked us for now), stop asking: one test request every
// 15 s, and the rest come back as "429" at once so the board is drawn with what was read (they show as not checked)
const BLOCKED_AFTER = 8, PROBE_MS = 15000;
const blocked = () => pace.streak >= BLOCKED_AFTER && Date.now() - pace.probe < PROBE_MS;
const note429 = final => { if (final) { pace.streak = (pace.streak || 0) + 1; if (pace.streak >= BLOCKED_AFTER) pace.probe = Date.now(); } };

self.sbFetch = async (url, max, stopH1, accept, retries) => {
  let tries = 0, limited = 0;
  if (blocked()) return { status: 429, url, text: '', redirected: false, truncated: false, tries, limited };
  for (let attempt = 0; attempt <= retries; attempt++) {
    await slot(); tries++;
    let r;
    try { r = await fetch('/api/site-fetch?' + new URLSearchParams({ url, max: String(max), accept })); }
    catch { if (attempt < 1) { await sleep(1000); continue; } return { error: `Could not reach ${host(url)}.`, tries, limited }; }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if ((r.status === 502 || r.status === 504) && attempt < 1) { await sleep(1500); continue; }
      return { error: (j && j.detail) || `Could not read the page (${r.status}).`, tries, limited };
    }
    const status = Number(r.headers.get('X-Upstream-Status')) || 0;
    if (status === 429 && attempt < retries && !blocked()) {
      const ra = r.headers.get('X-Retry-After') || '', secs = /^\d+$/.test(ra) ? Math.min(60, +ra) : 4 * (attempt + 1);
      pace.until = Math.max(pace.until, Date.now() + secs * 1000); pace.gap = Math.min(2500, pace.gap ? pace.gap + 400 : 600); limited++;
      if (r.body) r.body.cancel();
      continue;
    }
    if (status === 429) note429(true); else pace.streak = 0;
    if ([502, 503, 504].includes(status) && attempt < 1) { if (r.body) r.body.cancel(); await sleep(1500); continue; }
    if (pace.gap) pace.gap = Math.max(0, pace.gap - 20);
    const parts = []; let n = 0, truncated = false, tail = '';
    if (r.body) {
      const rd = r.body.getReader(), look = new TextDecoder('latin1');
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); n += value.length;
        if (stopH1) { const s = tail + look.decode(value); if (/<\/h1>/i.test(s)) { truncated = true; rd.cancel(); break; } tail = s.slice(-8); }
        if (n >= max) { truncated = true; rd.cancel(); break; }
      }
    }
    const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    const cs = charset(r.headers.get('X-Upstream-Type') || '', new TextDecoder('latin1').decode(buf.subarray(0, 4096)));
    let text; try { text = new TextDecoder(cs).decode(buf); } catch { text = new TextDecoder().decode(buf); }
    return { status, url: r.headers.get('X-Final-Url') || url, text, redirected: r.headers.get('X-Redirected') === '1', truncated, tries, limited };
  }
  return { error: 'The site kept asking us to slow down. Try again in a few minutes.', tries, limited };
};
self.sbProgress = (msg, f) => postMessage({ type: 'progress', msg, f });

let web;
async function boot() {
  postMessage({ type: 'progress', msg: 'Starting Python in your browser (first time only takes a few seconds)', f: 0.005 });
  const py = await loadPyodide({ indexURL: PY });
  const r = await fetch(ZIP + (V ? '?v=' + V : ''));
  if (!r.ok) throw new Error('Could not load the sitemap engine (' + r.status + ').');
  py.unpackArchive(await r.arrayBuffer(), 'zip', { extractDir: '/home/pyodide/sb' });
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/sb')");
  return py.pyimport('site_board.web');
}
const friendly = e => {
  const s = String((e && e.message) || e || '');
  const last = s.trim().split('\n').pop() || '';  // a Python error ends with "SomeError: message"
  return /Error:/.test(last) ? 'Something went wrong while reading the site: ' + last.replace(/^\w+Error:\s*/, '').slice(0, 200) : s.slice(0, 200) || 'Something went wrong.';
};
let booting;
self.onmessage = async ({ data: m }) => {
  try {
    web = web || await (booting = booting || boot());
    if (m.type === 'build') postMessage({ type: 'done', id: m.id, ...JSON.parse(await web.build(m.url, m.maxPages)) });
    else if (m.type === 'ask') postMessage({ type: 'answer', id: m.id, ...JSON.parse(web.ask(m.q)) });
    else if (m.type === 'report') postMessage({ type: 'report', id: m.id, json: web.report_json() });
  } catch (e) {
    booting = web ? booting : null;
    postMessage({ type: 'error', id: m.id, msg: friendly(e) });
  }
};
