// Admin: GET the Content-Security-Policy reports visitors' browsers sent (admin:csp), DELETE to clear them.
import { json, readDoc, requireAdmin } from '../../../lib/admin-store.js';
import { CSP_KEY, KEEP_DAYS, MAX_WRITES } from '../../../lib/csp-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ csp: await readDoc(env, CSP_KEY, null), maxWrites: MAX_WRITES, keepDays: KEEP_DAYS });
}
export async function onRequestDelete({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  await env.CDN.delete(CSP_KEY); return json({ ok: true });
}
