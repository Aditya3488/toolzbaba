// Admin: GET the archived list with notes and the history, POST { slugs: [...], state: 'live' | 'archived', note } to change it.
import { LOG_KEY, SLUG, STATUS_KEY, fail, json, publicCacheKey, readDoc, requireAdmin, writeDoc } from '../../../lib/admin-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ status: await readDoc(env, STATUS_KEY, { tools: {} }), log: await readDoc(env, LOG_KEY, []) });
}

export async function onRequestPost({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const slugs = [...new Set(Array.isArray(b.slugs) ? b.slugs : [])].filter(s => typeof s === 'string' && SLUG.test(s));
  if (!slugs.length || slugs.length > 200) return fail(400, 'Choose between 1 and 200 tools.');
  if (b.state !== 'live' && b.state !== 'archived') return fail(400, 'State must be "live" or "archived".');
  const note = String(b.note || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200), at = Date.now();
  const doc = await readDoc(env, STATUS_KEY, { tools: {} }); doc.tools = doc.tools || {};
  const log = await readDoc(env, LOG_KEY, []);
  for (const s of slugs) {
    const was = doc.tools[s] ? doc.tools[s].state : 'live';
    if (b.state === 'archived') doc.tools[s] = { state: 'archived', at, note }; else delete doc.tools[s];
    if (was !== b.state) log.unshift({ at, slug: s, to: b.state, note });
  }
  doc.updated = at;
  await writeDoc(env, STATUS_KEY, doc); await writeDoc(env, LOG_KEY, log.slice(0, 100));
  try { await caches.default.delete(publicCacheKey(request)); } catch { /* the copy expires within a minute anyway */ }
  return json({ ok: true, status: doc, log: log.slice(0, 100) });
}
