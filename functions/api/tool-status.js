// GET /api/tool-status : which tools the admin has archived, e.g. { "archived": ["anime-style"] }. Public and tiny.
// The browsers keep the answer for 10 minutes (see HT.status in common.js) and Cloudflare keeps one copy for a minute, so this costs almost nothing.
import { archivedSlugs, publicCacheKey } from '../../lib/admin-store.js';

export async function onRequestGet({ request, env }) {
  const key = publicCacheKey(request), hit = await caches.default.match(key);
  if (hit) return hit;
  const res = new Response(JSON.stringify({ archived: env.CDN ? await archivedSlugs(env) : [] }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
  await caches.default.put(key, res.clone());
  return res;
}
