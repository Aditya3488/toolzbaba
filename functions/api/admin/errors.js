// Admin: GET the JavaScript errors visitors reported (admin:errors), DELETE to clear the list.
import { json, readDoc, requireAdmin } from '../../../lib/admin-store.js';
import { ERRORS_KEY, KEEP_DAYS, MAX_WRITES } from '../../../lib/error-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ errors: await readDoc(env, ERRORS_KEY, null), maxWrites: MAX_WRITES, keepDays: KEEP_DAYS });
}
export async function onRequestDelete({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  await env.CDN.delete(ERRORS_KEY); return json({ ok: true });
}
