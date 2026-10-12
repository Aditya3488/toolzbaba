// POST /api/csp-report : Content-Security-Policy violation reports from visitors' browsers (the policy is report-only,
// see deploy/pages/_headers: `report-uri` sends the old shape, `report-to csp` the Reporting API shape). Grouped in
// lib/csp-store.js, shown on /admin (CSP tab). Always 204. Abuse: bodies over 16 KB dropped, at most 10 reports a body,
// reports caused by browser extensions dropped, and only MAX_WRITES bodies a day saved (the KV write budget).
import { CSP_KEY, MAX_WRITES, addReports, emptyCsp, parseReports } from '../../lib/csp-store.js';
import { readDoc, writeDoc } from '../../lib/admin-store.js';
import { today } from '../../lib/rum-store.js';

const TYPES = /application\/(?:csp-report|reports\+json|json)/i;

export async function onRequestPost({ request, env }) {
  const none = new Response(null, { status: 204 });
  if (!TYPES.test(request.headers.get('Content-Type') || '')) return none;
  if (!env.CDN) return none;
  let reports; try { const text = await request.text(); if (text.length > 16000) return none; reports = parseReports(text); } catch { return none; }
  if (!reports.length) return none;
  const day = today(); let agg = await readDoc(env, CSP_KEY, null);
  if (!agg || typeof agg !== 'object' || !agg.groups) agg = emptyCsp(day);
  if (agg.day !== day) { agg.day = day; agg.writes = 0; }
  if (agg.writes >= MAX_WRITES) return none;
  if (!addReports(agg, reports)) return none;
  agg.writes++;
  try { await writeDoc(env, CSP_KEY, agg); } catch { /* over the KV limit: ignore */ }
  return none;
}
