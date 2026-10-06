// GET /f/<id>/<file name>: a shared file, always as a download. Kept in Cloudflare's edge cache for five minutes so repeat downloads don't read KV again.
import { cleanName } from '../../../lib/file-store.js';

export async function onRequestGet({ request, params, env, waitUntil }) {
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9]{6,20}$/.test(id) || !env.CDN) return new Response('Not found', { status: 404 });
  const key = new Request(new URL(`/f/${id}`, request.url)), cache = caches.default;
  let res = await cache.match(key);
  if (!res) {
    const meta = await env.CDN.get(`fmeta:${id}`, { type: 'json' }), data = meta && await env.CDN.get(`file:${id}`, { type: 'arrayBuffer' });
    if (!data) return new Response('This file was not found. It may have expired or been deleted.', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
    const name = cleanName(meta.name);
    res = new Response(data, { headers: {
      'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
    waitUntil(cache.put(key, res.clone()));
  }
  return res;
}
