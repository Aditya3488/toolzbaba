// Admin: GET what real visitors experienced (admin:rum), DELETE to start counting again.
import { RUM_KEY, json, readDoc, requireAdmin } from '../../../lib/admin-store.js';
import { EDGES, MAX_WRITES } from '../../../lib/rum-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ rum: await readDoc(env, RUM_KEY, null), edges: EDGES, maxWrites: MAX_WRITES });
}
export async function onRequestDelete({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  await env.CDN.delete(RUM_KEY); return json({ ok: true });
}
