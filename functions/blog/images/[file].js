// GET /blog/images/<id>.<ext>: an image uploaded for a blog post. Never changes under the same name, so it is cached for a year.
import { IMAGE_TYPES } from '../../../lib/blog-store.js';

export async function onRequestGet({ request, params, env, waitUntil }) {
  const m = /^([A-Za-z0-9]{8,24})\.(jpg|png|webp|avif|gif)$/.exec(String(params.file || ''));
  if (!m || !env.CDN) return new Response('Not found', { status: 404 });
  const key = new Request(new URL(`/blog/images/${m[1]}.${m[2]}`, request.url)), cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const data = await env.CDN.get(`blogimg:${m[1]}.${m[2]}`, { type: 'arrayBuffer' });
  if (!data) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const res = new Response(data, { headers: {
    'Content-Type': IMAGE_TYPES[m[2]], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
