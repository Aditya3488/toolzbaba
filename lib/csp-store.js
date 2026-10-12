// Content-Security-Policy violation reports (the site runs the policy in report-only mode, see deploy/pages/_headers),
// folded into one JSON document in KV, grouped by directive, what was blocked and the page: nothing that could identify a
// visitor is kept. Addresses are cut to their host (or path, for this site's own pages), never a query string.
//
// Browsers send reports in two shapes: the old `report-uri` body { "csp-report": {...} } and the Reporting API's
// [{ type: "csp-violation", body: {...} }]. Both are accepted. Reports caused by browser extensions are noise and dropped.
export const CSP_KEY = 'admin:csp';
export const MAX_WRITES = 300, MAX_GROUPS = 200, KEEP_DAYS = 14;
const DAY = 86400000;
const EXT = /^(?:chrome|moz|safari(?:-web)?|ms-browser|opera)-extension|^webkit-masked-url|^resource:|^about:|^blob:about/i;
const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'data', 'blob', 'self', 'unsafe-inline']);

const pathOf = u => { try { const x = new URL(u); return x.pathname.slice(0, 120); } catch { return String(u || '').split(/[?#]/)[0].slice(0, 120) || '/'; } };
const placeOf = (u, site) => {   // this site's pages by path, other sites by host only
  if (!u) return '';
  if (KEYWORDS.has(u)) return u;
  try { const x = new URL(u); return x.origin === site ? x.pathname.slice(0, 120) : x.hostname.slice(0, 120); } catch { return String(u).split(/[?#]/)[0].slice(0, 60); }
};

// one report (either shape) -> { directive, blocked, doc, source, line, sample } or null when it is noise or malformed
export function normalize(rep) {
  const b = rep && typeof rep === 'object' ? (rep['csp-report'] || rep.body || rep) : null;
  if (!b || typeof b !== 'object') return null;
  const docUrl = String(b['document-uri'] || b.documentURL || b.documentURI || '');
  const directive = String(b['effective-directive'] || b.effectiveDirective || b['violated-directive'] || b.violatedDirective || '').split(' ')[0].slice(0, 40);
  if (!/^[a-z-]+$/.test(directive) || !docUrl) return null;
  let site = ''; try { site = new URL(docUrl).origin; } catch { return null; }
  const blockedRaw = String(b['blocked-uri'] || b.blockedURL || ''), sourceRaw = String(b['source-file'] || b.sourceFile || '');
  if (EXT.test(blockedRaw) || EXT.test(sourceRaw)) return null;
  const blocked = blockedRaw ? placeOf(blockedRaw, site) : 'inline';
  return { directive, blocked, doc: pathOf(docUrl), source: sourceRaw ? placeOf(sourceRaw, site) : '', line: Math.max(0, Math.min(1e6, Number(b['line-number'] || b.lineNumber) | 0)),
    sample: String(b['script-sample'] || b.sample || '').replace(/\s+/g, ' ').slice(0, 60) };
}

// the body of a POST to the report endpoint -> the reports in it (0..n)
export function parseReports(text) {
  let j; try { j = JSON.parse(text); } catch { return []; }
  return (Array.isArray(j) ? j : [j]).slice(0, 10).map(normalize).filter(Boolean);
}

export const emptyCsp = (day, now = Date.now()) => ({ since: now, day, writes: 0, groups: {} });

export function prune(agg, now = Date.now()) {
  const cutoff = now - KEEP_DAYS * DAY;
  for (const [k, g] of Object.entries(agg.groups)) if (g.last < cutoff) delete agg.groups[k];
}

// folds reports in; returns how many were counted
export function addReports(agg, reports, now = Date.now()) {
  prune(agg, now); let n = 0;
  for (const r of reports) {
    const k = `${r.directive}|${r.blocked}|${r.doc}`; let g = agg.groups[k];
    if (!g) { if (Object.keys(agg.groups).length >= MAX_GROUPS) continue; g = agg.groups[k] = { ...r, count: 0, first: now, last: now }; }
    g.count++; g.last = now; if (!g.source && r.source) { g.source = r.source; g.line = r.line; } if (!g.sample && r.sample) g.sample = r.sample;
    n++;
  }
  return n;
}
