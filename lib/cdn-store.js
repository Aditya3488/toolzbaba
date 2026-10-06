// Image hosting for "Image to CDN Link" on Cloudflare Pages Functions. Images live in a KV namespace bound as CDN
// (Cloudflare dashboard > the Pages project > Settings > Bindings). Without it the tool answers that hosting is off.
// The visitor's browser makes the WebP / JPG / PNG versions before uploading, because Functions can't convert images.

export const FORMATS = ['jpg', 'png', 'webp', 'avif', 'gif'];
export const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
export const MAX_FILE_MB = 10;
export const MAX_IMAGES = 10;

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
export const fail = (status, detail) => json({ detail }, status);

// does the file really start like the format it claims? (only images are ever stored and served)
export function looksLike(fmt, b) {
  const s = (o, t) => [...t].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (fmt === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (fmt === 'png') return b[0] === 0x89 && s(1, 'PNG');
  if (fmt === 'gif') return s(0, 'GIF8');
  if (fmt === 'webp') return s(0, 'RIFF') && s(8, 'WEBP');
  if (fmt === 'avif') return s(4, 'ftyp') && (s(8, 'avif') || s(8, 'avis'));
  return false;
}

export function randomId(n) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map(v => abc[v % abc.length]).join('');
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function sameSecret(a, b) { // constant-time comparison
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const retentionSeconds = env => Math.max(1, parseInt(env.CDN_RETENTION_DAYS || '90', 10)) * 86400;
