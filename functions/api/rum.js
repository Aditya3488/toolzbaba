// POST /api/rum : one beacon per page view from a sample of visitors (see HT.rum in common.js). Folded into admin:rum, see lib/rum-store.js.
import { RUM_KEY, readDoc, writeDoc } from '../../lib/admin-store.js';
import { MAX_WRITES, addEvent, emptyAgg, today } from '../../lib/rum-store.js';

export async function onRequestPost({ request, env }) {
  const none = new Response(null, { status: 204 });
  if (!env.CDN) return none;
  let ev; try { const text = await request.text(); if (text.length > 4000) return none; ev = JSON.parse(text); } catch { return none; }
  const day = today(); let agg = await readDoc(env, RUM_KEY, null);
  if (!agg || typeof agg !== 'object' || !agg.tools) agg = emptyAgg(day);
  if (agg.day !== day) { agg.day = day; agg.writes = 0; }
  if (agg.writes >= MAX_WRITES) return none;           // today's write budget is used up: drop the sample
  if (!addEvent(agg, ev)) return none;
  agg.writes++;
  try { await writeDoc(env, RUM_KEY, agg); } catch { /* over the KV limit: ignore */ }
  return none;
}
