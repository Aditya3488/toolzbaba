// Admin: GET every blog post's summary (drafts too), newest first.
import { json, readIndex } from '../../../../lib/blog-store.js';
import { requireAdmin } from '../../../../lib/admin-store.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  return json({ posts: await readIndex(env) });
}
