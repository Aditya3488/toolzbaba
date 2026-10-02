// DELETE /api/cdn/<id>?token=...  The uploader deletes with the token from upload time; the site owner can delete
// anything with the X-Admin-Key header (ADMIN_KEY secret in the Pages project settings).
import { FORMATS, fail, json, sameSecret, sha256 } from '../../../lib/cdn-store.js';

export async function onRequestDelete({ request, params, env }) {
  if (!env.CDN) return fail(503, "Image hosting isn't switched on for this site yet.");
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return fail(404, 'Not found.');
  const raw = await env.CDN.get(`meta:${id}`);
  if (!raw) return fail(404, 'Not found.');
  const info = JSON.parse(raw), token = new URL(request.url).searchParams.get('token') || '';
  const admin = !!env.ADMIN_KEY && sameSecret(request.headers.get('X-Admin-Key') || '', env.ADMIN_KEY);
  if (!admin && !sameSecret(await sha256(token), info.tokenHash)) return fail(403, 'Wrong delete token.');
  const base = new URL(request.url).origin;
  for (const fmt of info.formats || FORMATS) {
    await env.CDN.delete(`img:${id}.${fmt}`);
    await caches.default.delete(new Request(`${base}/i/${id}.${fmt}`)); // this data centre's copy; others expire within a day
  }
  await env.CDN.delete(`meta:${id}`);
  return json({ deleted: true });
}
