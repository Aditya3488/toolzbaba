// Shared bits of the admin panel: who may use it, and the small JSON documents it keeps in KV (the same namespace as the image
// hosting, bound as CDN):
//   admin:status  which tools are archived        { tools: { <slug>: { state: 'archived', at, note } }, updated }
//   admin:log     the last changes                [ { at, slug, to, note } ]
//   admin:rum     what real visitors experienced  (see rum-store.js)
//   admin:lab     the last result of each lab test { <slug>: { ... } }
import { fail, json, sameSecret, sha256 } from './cdn-store.js';
export { fail, json };

export const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const STATUS_KEY = 'admin:status', LOG_KEY = 'admin:log', RUM_KEY = 'admin:rum', LAB_KEY = 'admin:lab';

// null when the request carries the right password (and the right ID, when ADMIN_USER is set), otherwise the Response to send back.
// Wrong tries are counted per visitor (a hash of the IP address, kept 15 minutes): after MAX_FAILS the door stays shut until the count expires.
// A wrong try is also answered after a short pause, which makes guessing slow.
export const MAX_FAILS = 5, LOCK_SECONDS = 900;
export async function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) return fail(503, 'The admin panel is not set up yet. Add a secret called ADMIN_KEY in the Cloudflare Pages settings.');
  const user = request.headers.get('X-Admin-User') || '', given = request.headers.get('X-Admin-Key') || '';
  const lockKey = 'admin:fail:' + (await sha256(request.headers.get('CF-Connecting-IP') || 'local')).slice(0, 20);
  let fails = 0; try { fails = parseInt((await env.CDN.get(lockKey)) || '0', 10) || 0; } catch { }
  if (fails >= MAX_FAILS) return fail(429, 'Too many wrong tries. Wait 15 minutes and try again.');
  const userOk = !env.ADMIN_USER || sameSecret(user, env.ADMIN_USER), keyOk = !!given && sameSecret(given, env.ADMIN_KEY);
  if (userOk && keyOk) { if (fails) { try { await env.CDN.delete(lockKey); } catch { } } return null; }
  if (given || user) {
    try { await env.CDN.put(lockKey, String(fails + 1), { expirationTtl: LOCK_SECONDS }); } catch { }
    await new Promise(r => setTimeout(r, 700));
  }
  return fail(401, env.ADMIN_USER ? 'Wrong ID or password.' : 'Wrong admin key.');
}

export async function readDoc(env, key, fallback) {
  try { const v = await env.CDN.get(key, { type: 'json' }); return v == null ? fallback : v; } catch { return fallback; }
}
export const writeDoc = (env, key, value) => env.CDN.put(key, JSON.stringify(value));

// the public list: only the slugs, never the notes
export async function archivedSlugs(env) {
  const doc = await readDoc(env, STATUS_KEY, { tools: {} });
  return Object.keys(doc.tools || {}).filter(s => doc.tools[s].state === 'archived').sort();
}

// the edge copy of the public list lasts a minute: after a change the admin clears it so the next visitor in this data centre sees it at once
export const publicCacheKey = request => new Request(new URL('/api/tool-status', request.url).href);
