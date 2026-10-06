// Admin: one blog post. GET it, PUT { title, desc, body, cover, coverAlt, tags, status, published, slug, isNew } to save it
// (a different `slug` renames it; a renamed published post keeps its old address as a redirect), DELETE to remove it.
import { INDEX_KEY, SLUG, fail, json, movedKey, normalizePost, postKey, readDoc, readIndex, sortIndex, summary, writeDoc } from '../../../../lib/blog-store.js';
import { requireAdmin } from '../../../../lib/admin-store.js';

const slugOf = params => String(params.slug || '');

export async function onRequestGet({ request, params, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  const post = SLUG.test(slugOf(params)) ? await readDoc(env, postKey(slugOf(params)), null) : null;
  return post ? json({ post }) : fail(404, 'No post with this address.');
}

export async function onRequestPut({ request, params, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  const from = slugOf(params);
  if (!SLUG.test(from)) return fail(400, 'Bad post address.');
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const to = String(b.slug || from);
  const old = await readDoc(env, postKey(from), null);
  if (b.isNew && old) return fail(409, `A post at /blog/${from} already exists. Choose another address.`);
  if (!b.isNew && !old) return fail(404, 'This post no longer exists (deleted in another tab?).');
  if (to !== from && await env.CDN.get(postKey(to))) return fail(409, `A post at /blog/${to} already exists. Choose another address.`);
  const { post, error } = normalizePost(b, to, old);
  if (error) return fail(400, error);
  await writeDoc(env, postKey(to), post);
  await env.CDN.delete(movedKey(to));
  if (old && to !== from) {
    await env.CDN.delete(postKey(from));
    if (old.published) await env.CDN.put(movedKey(from), to);
  }
  const index = (await readIndex(env)).filter(p => p.slug !== from && p.slug !== to);
  index.push(summary(post));
  await writeDoc(env, INDEX_KEY, sortIndex(index));
  return json({ ok: true, post });
}

export async function onRequestDelete({ request, params, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  const slug = slugOf(params);
  if (!SLUG.test(slug)) return fail(400, 'Bad post address.');
  await env.CDN.delete(postKey(slug));
  await writeDoc(env, INDEX_KEY, (await readIndex(env)).filter(p => p.slug !== slug));
  return json({ ok: true });
}
