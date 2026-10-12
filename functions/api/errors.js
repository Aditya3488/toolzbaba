// POST /api/errors : one small beacon from a visitor's browser with the JavaScript errors it hit on a page (HT.errors in
// static/assets/common.js). Cleaned and grouped in lib/error-store.js, shown on /admin (Errors tab). Always answers 204:
// a visitor's page must never wait on, or hear about, the monitoring.
// Abuse: only this site's pages may post (Sec-Fetch-Site), bodies over 8 KB are dropped, at most 5 errors a beacon, and
// only MAX_WRITES beacons a day are saved (the KV write budget), after which the rest are dropped on the floor.
import { ERRORS_KEY, MAX_WRITES, addErrors, emptyErrors, sanitize } from '../../lib/error-store.js';
import { readDoc, writeDoc } from '../../lib/admin-store.js';
import { today } from '../../lib/rum-store.js';

export async function onRequestPost({ request, env }) {
  const none = new Response(null, { status: 204 });
  const from = request.headers.get('Sec-Fetch-Site');
  if (from && from !== 'same-origin') return none;
  if (!env.CDN) return none;
  let ev; try { const text = await request.text(); if (text.length > 8000) return none; ev = sanitize(JSON.parse(text)); } catch { return none; }
  if (!ev) return none;
  const day = today(); let agg = await readDoc(env, ERRORS_KEY, null);
  if (!agg || typeof agg !== 'object' || !agg.groups) agg = emptyErrors(day);
  if (agg.day !== day) { agg.day = day; agg.writes = 0; }
  if (agg.writes >= MAX_WRITES) return none;
  if (!addErrors(agg, ev)) return none;
  agg.writes++;
  try { await writeDoc(env, ERRORS_KEY, agg); } catch { /* over the KV limit: ignore */ }
  return none;
}
