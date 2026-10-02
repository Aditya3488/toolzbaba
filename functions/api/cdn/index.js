// POST /api/cdn  (multipart: "meta" = JSON [{name, width, height}], files named "<index>.<format>")
import { FORMATS, MAX_FILE_MB, MAX_IMAGES, fail, json, looksLike, randomId, retentionSeconds, sha256 } from '../../../lib/cdn-store.js';

export async function onRequestPost({ request, env }) {
  if (!env.CDN) return fail(503, "Image hosting isn't switched on for this site yet.");
  let form, meta;
  try { form = await request.formData(); meta = JSON.parse(form.get('meta') || '[]'); } catch { return fail(400, 'Bad upload.'); }
  if (!Array.isArray(meta) || !meta.length) return fail(400, 'Please add an image.');
  if (meta.length > MAX_IMAGES) return fail(400, `Upload at most ${MAX_IMAGES} images at once.`);

  // group the uploaded versions by image, checking that each one really is an image
  const groups = meta.map(() => ({}));
  for (const [field, value] of form.entries()) {
    if (field !== 'file' || typeof value === 'string') continue;
    const m = /^(\d+)\.([a-z]+)$/.exec(value.name || '');
    if (!m || !groups[+m[1]] || !FORMATS.includes(m[2])) return fail(400, 'Unsupported file in the upload.');
    const name = meta[+m[1]].name;
    if (value.size > MAX_FILE_MB * 1048576) return fail(413, `'${name}' is larger than ${MAX_FILE_MB} MB.`);
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!looksLike(m[2], bytes)) return fail(400, `'${name}' is not a valid image.`);
    groups[+m[1]][m[2]] = bytes;
  }

  const ttl = retentionSeconds(env), base = new URL(request.url).origin, items = [];
  for (const [i, versions] of groups.entries()) {
    const formats = Object.keys(versions);
    if (!formats.length) return fail(400, `'${meta[i].name}' could not be read as an image.`);
    const id = randomId(10), token = randomId(22);
    for (const fmt of formats) await env.CDN.put(`img:${id}.${fmt}`, versions[fmt], { expirationTtl: ttl });
    const info = { name: String(meta[i].name || 'image').slice(0, 120), width: +meta[i].width || 0, height: +meta[i].height || 0,
      size: Math.max(...formats.map(f => versions[f].length)), formats, created: Date.now(), tokenHash: await sha256(token) };
    await env.CDN.put(`meta:${id}`, JSON.stringify(info), { expirationTtl: ttl });
    items.push({ id, name: info.name, width: info.width, height: info.height, size: info.size, formats, delete_token: token,
      expires: Date.now() + ttl * 1000, links: Object.fromEntries(formats.map(f => [f, `${base}/i/${id}.${f}`])) });
  }
  return json({ items });
}
