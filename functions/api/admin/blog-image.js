// Admin: POST an image (the raw file as the body, with its Content-Type) for a blog post. Answers { url: '/blog/images/<id>.<ext>' }.
// The admin panel shrinks photos to WebP in the browser first; only real JPG, PNG, WebP, AVIF and GIF files are kept (never SVG).
import { IMAGE_TYPES, MAX_IMAGE_MB, fail, json } from '../../../lib/blog-store.js';
import { looksLike, randomId } from '../../../lib/cdn-store.js';
import { requireAdmin } from '../../../lib/admin-store.js';

export async function onRequestPost({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = Object.keys(IMAGE_TYPES).find(k => IMAGE_TYPES[k] === type);
  if (!ext) return fail(415, 'Upload a JPG, PNG, WebP, AVIF or GIF image.');
  if (+(request.headers.get('Content-Length') || 0) > MAX_IMAGE_MB * 1048576) return fail(413, `Images can be ${MAX_IMAGE_MB} MB at most.`);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_MB * 1048576) return fail(413, `Images can be ${MAX_IMAGE_MB} MB at most.`);
  if (!looksLike(ext, bytes)) return fail(415, "This file isn't the image type it claims to be.");
  const id = randomId(14);
  await env.CDN.put(`blogimg:${id}.${ext}`, bytes, { metadata: { at: Date.now(), size: bytes.length } });
  return json({ url: `/blog/images/${id}.${ext}` });
}
