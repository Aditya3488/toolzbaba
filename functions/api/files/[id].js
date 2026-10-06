// DELETE /api/files/<id>?token=...  The uploader deletes with the token from upload time; the site owner can delete anything with the
// X-Admin-Key header (ADMIN_KEY secret in the Pages project settings), e.g. after a report.
import { fail, json, sameSecret, sha256 } from '../../../lib/file-store.js';

export async function onRequestDelete({ request, params, env }) {
  if (!env.CDN) return fail(503, "File sharing isn't switched on for this site yet.");
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return fail(404, 'Not found.');
  const raw = await env.CDN.get(`fmeta:${id}`);
  if (!raw) return fail(404, 'Not found.');
  const info = JSON.parse(raw), token = new URL(request.url).searchParams.get('token') || '';
  const admin = !!env.ADMIN_KEY && sameSecret(request.headers.get('X-Admin-Key') || '', env.ADMIN_KEY);
  if (!admin && !sameSecret(await sha256(token), info.tokenHash)) return fail(403, 'Wrong delete token.');
  await env.CDN.delete(`file:${id}`); await env.CDN.delete(`fmeta:${id}`);
  await caches.default.delete(new Request(`${new URL(request.url).origin}/f/${id}`)); // this data centre's copy; others expire within five minutes
  return json({ deleted: true });
}
