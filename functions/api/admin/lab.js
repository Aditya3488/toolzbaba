// Admin: the lab test results, so every admin sees the same table. GET all, POST { results: { <slug>: {...} } } to merge new ones in.
import { LAB_KEY, SLUG, fail, json, readDoc, requireAdmin, writeDoc } from '../../../lib/admin-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ lab: await readDoc(env, LAB_KEY, {}) });
}
export async function onRequestPost({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const doc = await readDoc(env, LAB_KEY, {}), r = b && b.results && typeof b.results === 'object' ? b.results : {};
  for (const [slug, v] of Object.entries(r).slice(0, 200)) if (SLUG.test(slug) && v && typeof v === 'object' && JSON.stringify(v).length < 3000) doc[slug] = v;
  await writeDoc(env, LAB_KEY, doc);
  return json({ ok: true, lab: doc });
}
