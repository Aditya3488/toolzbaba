// POST /api/files  (multipart: "file" x N, "hours" = how long to keep it)
import { BLOCKED, HOURS, MAX_FILES, MAX_FILE_MB, cleanName, extOf, fail, json, randomId, sha256 } from '../../../lib/file-store.js';

export async function onRequestPost({ request, env }) {
  if (!env.CDN) return fail(503, "File sharing isn't switched on for this site yet.");
  let form; try { form = await request.formData(); } catch { return fail(400, 'Bad upload.'); }
  const files = form.getAll('file').filter(f => typeof f !== 'string');
  if (!files.length) return fail(400, 'Please add a file.');
  if (files.length > MAX_FILES) return fail(400, `Upload at most ${MAX_FILES} files at once.`);
  const hours = HOURS.includes(+form.get('hours')) ? +form.get('hours') : 168, ttl = hours * 3600, base = new URL(request.url).origin, items = [];
  for (const f of files) {
    const name = cleanName(f.name);
    if (BLOCKED.has(extOf(name))) return fail(400, `'${name}': programs, scripts and web pages can't be shared here.`);
    if (f.size > MAX_FILE_MB * 1048576) return fail(413, `'${name}' is larger than ${MAX_FILE_MB} MB.`);
    if (!f.size) return fail(400, `'${name}' is empty.`);
    const id = randomId(10), token = randomId(22);
    await env.CDN.put(`file:${id}`, await f.arrayBuffer(), { expirationTtl: Math.max(60, ttl) });
    await env.CDN.put(`fmeta:${id}`, JSON.stringify({ name, size: f.size, created: Date.now(), tokenHash: await sha256(token) }), { expirationTtl: Math.max(60, ttl) });
    items.push({ id, name, size: f.size, delete_token: token, expires: Date.now() + ttl * 1000, link: `${base}/f/${id}/${encodeURIComponent(name)}` });
  }
  return json({ items });
}
