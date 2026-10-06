// GET /i/<id>.<format>: a hosted image. Kept in Cloudflare's edge cache so most views don't read KV again.
import { TYPES } from '../../lib/cdn-store.js';

export async function onRequestGet({ request, params, env, waitUntil }) {
  const m = /^([A-Za-z0-9]{6,20})\.(jpg|jpeg|png|webp|avif|gif)$/.exec(String(params.name || ''));
  if (!m || !env.CDN) return new Response('Not found', { status: 404 });
  const fmt = m[2] === 'jpeg' ? 'jpg' : m[2];
  const key = new Request(new URL(`/i/${m[1]}.${fmt}`, request.url)), cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const data = await env.CDN.get(`img:${m[1]}.${fmt}`, { type: 'arrayBuffer' });
  if (!data) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const res = new Response(data, { headers: {
    'Content-Type': TYPES[fmt], 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'", 'Access-Control-Allow-Origin': '*',
  } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
