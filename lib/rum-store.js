// "Real user monitoring" without a database. Visitors' browsers (a sample of them) send ONE small beacon per page view; here it is folded into a
// single JSON document, per tool: counters and histograms, never anything about a person (no IP, no file names, no text).
//
// KV allows 1,000 writes a day on the free plan, so the document is only written while a daily budget lasts (MAX_WRITES), and the browsers
// send only a sample of their page views. Updates are read-modify-write, so two beacons at the same moment can lose one: the numbers are
// estimates, which is plenty for "which tool is slow". For exact numbers move this to D1 or Workers Analytics Engine.
export const EDGES = [100, 200, 300, 500, 800, 1200, 1800, 2500, 4000, 6000, 10000, 20000, 60000]; // ms; one more bucket for "slower than that"
export const MAX_WRITES = 700, MAX_TOOLS = 200;
export const METRICS = ['ttfb', 'fcp', 'lcp', 'load', 'inp', 'ready'];

const bucket = ms => { let i = 0; while (i < EDGES.length && ms > EDGES[i]) i++; return i; };
const num = (v, max) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.min(v, max) : null);
const blank = () => ({ views: 0, mobile: 0, errors: 0, cls: 0, clsN: 0, runs: 0, runErr: 0, h: Object.fromEntries([...METRICS, 'run'].map(m => [m, new Array(EDGES.length + 1).fill(0)])) });

export const emptyAgg = day => ({ since: Date.now(), day, writes: 0, tools: {} });

// beacon: { s: slug, m: 0|1, t: { ttfb, fcp, lcp, load, inp, ready, cls, err }, runs: [ { ms, ok } ] }
export function addEvent(agg, ev) {
  if (!ev || typeof ev.s !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(ev.s)) return false;
  if (!agg.tools[ev.s] && Object.keys(agg.tools).length >= MAX_TOOLS) return false;
  const t = agg.tools[ev.s] || (agg.tools[ev.s] = blank()), m = ev.t || {};
  if (ev.v !== 0) { t.views++; if (ev.m) t.mobile++; }   // v: 0 marks a message that only carries tool runs (not a page view)
  for (const k of METRICS) { const v = num(m[k], 600000); if (v != null) t.h[k][bucket(v)]++; }
  const cls = num(m.cls, 10); if (cls != null) { t.cls += cls; t.clsN++; }
  t.errors += Math.min(5, Math.max(0, m.err | 0));
  for (const r of (Array.isArray(ev.runs) ? ev.runs : []).slice(0, 10)) {
    const ms = num(r && r.ms, 3600000); if (ms == null) continue;
    t.runs++; if (!r.ok) t.runErr++; else t.h.run[bucket(ms)]++;
  }
  return true;
}

// the value below which `q` of the samples fall (the upper edge of its bucket), or null with no samples
export function percentile(hist, q) {
  const n = hist.reduce((a, b) => a + b, 0); if (!n) return null;
  let acc = 0; for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= q * n) return i < EDGES.length ? EDGES[i] : EDGES[EDGES.length - 1] * 2; }
  return null;
}

export const today = () => new Date().toISOString().slice(0, 10);
