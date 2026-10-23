// JavaScript errors visitors hit, without a database and without anything personal. The browser (static/assets/common.js,
// HT.errors) sends a few errors per page view; here they are cleaned again and folded into one JSON document in KV,
// grouped by message and place: how often, on which pages, in which browsers and builds, first and last seen, one stack.
//
// Same budget idea as the speed numbers (lib/rum-store.js): KV allows 1,000 writes a day on the free plan, so only
// MAX_WRITES beacons a day are saved and the rest are dropped. Groups older than KEEP_DAYS are forgotten.
export const ERRORS_KEY = 'admin:errors';
export const MAX_WRITES = 300, MAX_GROUPS = 150, MAX_EVENTS = 5, KEEP_DAYS = 14;
const DAY = 86400000;

// browser-extension code and known non-problems
const EXT = /(?:chrome|moz|safari(?:-web)?|ms-browser|opera)-extension:|webkit-masked-url:|^resource:\/\//i;
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /__gCrWeb|__firefox__|instantSearchSDKJSBridge|zaloJSV2|vid_mate_check/i,
  /Non-Error promise rejection captured with value: (?:undefined|null)$/i];
const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'safari', 'samsung', 'other']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

// what may hide something personal is removed: quoted text (file names in our own messages), e-mail addresses, long
// numbers, and the query part of web addresses
export const scrub = s => String(s == null ? '' : s)
  .replace(/https?:\/\/[^\s"')]+/g, u => u.split(/[?#]/)[0])
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\b\d{6,}\b/g, '[number]')
  .replace(/\b(bearer|token|key|secret|password|passwd|auth)(\s*[:=]\s*)\S+/gi, '$1$2[hidden]')
  .replace(/(^|[^A-Za-z0-9])(['"])(?:(?!\2)[^\n]){0,200}\2/g, '$1$2…$2')   // not the apostrophe in "couldn't"
  .replace(/\s+/g, ' ').trim().slice(0, 300);

// a stack is kept only where it points at our own code or a library we serve; extension frames are dropped
export const cleanStack = stack => String(stack == null ? '' : stack).split('\n').map(l => l.trim()).filter(l => l && !EXT.test(l)).slice(0, 8).map(scrub).join('\n').slice(0, 1200);
const onlyExtension = stack => { const framed = String(stack || '').split('\n').filter(l => /:\/\/|@/.test(l)); return framed.length > 0 && framed.every(l => EXT.test(l)); };

const srcPath = src => { src = String(src == null ? '' : src).split(/[?#]/)[0]; if (!src) return ''; try { const u = new URL(src); return (u.hostname + u.pathname).slice(0, 160); } catch { return src.replace(/^\/+/, '/').slice(0, 160); } };

// the beacon: { s: page slug, v: build, b: browser family, m: 0|1 phone, e: [{ msg, src, line, col, stack }] } -> a clean copy, or null
export function sanitize(ev) {
  if (!ev || typeof ev !== 'object' || !Array.isArray(ev.e)) return null;
  const out = { s: SLUG.test(String(ev.s)) ? String(ev.s) : 'other', v: /^[0-9a-f]{0,16}$/.test(String(ev.v || '')) ? String(ev.v || '') : '', b: BROWSERS.has(ev.b) ? ev.b : 'other', m: ev.m ? 1 : 0, e: [] };
  for (const e of ev.e.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object') continue;
    const src = srcPath(e.src), stack = String(e.stack || '');
    if (EXT.test(String(e.src || '')) || onlyExtension(stack)) continue;
    const msg = scrub(e.msg);
    if (!msg || NOISE.some(rx => rx.test(msg))) continue;
    out.e.push({ msg, src, line: Math.max(0, Math.min(1e6, e.line | 0)), col: Math.max(0, Math.min(1e6, e.col | 0)), stack: cleanStack(stack) });
  }
  return out.e.length ? out : null;
}

export const fingerprint = e => `${e.msg.slice(0, 80)}|${e.src}|${e.line}`;
export const emptyErrors = (day, now = Date.now()) => ({ since: now, day, writes: 0, groups: {} });

export function prune(agg, now = Date.now()) {
  const cutoff = now - KEEP_DAYS * DAY;
  for (const [k, g] of Object.entries(agg.groups)) {
    if (g.last < cutoff) { delete agg.groups[k]; continue; }
    for (const d of Object.keys(g.days || {})) if (Date.parse(d) < cutoff) delete g.days[d];
  }
}
const bump = (o, k, max) => { if (o[k] != null) o[k]++; else if (Object.keys(o).length < max) o[k] = 1; };

// folds one clean beacon in; returns how many errors were counted
export function addErrors(agg, ev, now = Date.now()) {
  prune(agg, now);
  const day = new Date(now).toISOString().slice(0, 10); let n = 0;
  for (const e of ev.e) {
    const k = fingerprint(e); let g = agg.groups[k];
    if (!g) {
      if (Object.keys(agg.groups).length >= MAX_GROUPS) continue;   // full: the newest kinds wait until old ones expire
      g = agg.groups[k] = { msg: e.msg, src: e.src, line: e.line, col: e.col, count: 0, first: now, last: now, stack: e.stack, pages: {}, browsers: {}, versions: {}, days: {} };
    }
    g.count++; g.last = now; if (!g.stack && e.stack) g.stack = e.stack;
    bump(g.pages, ev.s, 12); bump(g.browsers, ev.b + (ev.m ? '-phone' : ''), 12); bump(g.versions, ev.v || '?', 6); bump(g.days, day, KEEP_DAYS + 1);
    n++;
  }
  return n;
}
