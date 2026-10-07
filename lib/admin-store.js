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

// ------------------------------------------------------------------ who may use the admin panel
// Defences, outermost first (Cloudflare Access in front of /admin and /api/admin/* adds one more, see README):
// - both secrets must be set, ADMIN_USER (the ID) and ADMIN_KEY (16+ characters); until then the panel stays shut
// - signing in swaps the password for a session cookie (HttpOnly, Secure, SameSite=Strict, 8 hours) that no page script can
//   read, so the password is never kept in the browser; changing either secret ends every session
// - wrong passwords: 5 per visitor per 15 minutes, and 50 per hour from everyone together (a spread-out attack locks the
//   panel, you included, for up to an hour); each wrong try is answered after a pause
// - every admin request must carry X-Requested-With: toolzbaba-admin, a header other websites can't add, so a forged
//   form or link can't act with your session
export const MIN_KEY = 16, MAX_FAILS = 5, LOCK_SECONDS = 900, MAX_FAILS_ALL = 50, LOCK_ALL_SECONDS = 3600, SESSION_SECONDS = 8 * 3600;
export const COOKIE = '__Host-tz_admin', CSRF_HEADER = 'X-Requested-With', CSRF_VALUE = 'toolzbaba-admin';
const ALL_FAILS_KEY = 'admin:fail:all';

export function setupProblem(env) {
  if (!env.CDN) return fail(503, "The admin panel needs the KV namespace bound as CDN.");
  if (!env.ADMIN_USER || !env.ADMIN_KEY) return fail(503, 'The admin panel is not set up yet. Add the secrets ADMIN_USER and ADMIN_KEY in the Cloudflare Pages settings.');
  if (env.ADMIN_KEY.length < MIN_KEY) return fail(503, `The admin password (ADMIN_KEY) is too short. Set one with ${MIN_KEY} or more characters.`);
  return null;
}
const sameText = async (a, b) => sameSecret(await sha256(String(a)), await sha256(String(b))); // equal-length digests: no timing hints
const ipFailsKey = async request => 'admin:fail:' + (await sha256(request.headers.get('CF-Connecting-IP') || 'local')).slice(0, 20);
const readCount = async (env, key) => { try { return parseInt((await env.CDN.get(key)) || '0', 10) || 0; } catch { return 0; } };

// null when the ID and password are right, otherwise the Response to send back (wrong tries are counted and slowed down)
export async function checkPassword(request, env, user, key) {
  const bad = setupProblem(env); if (bad) return bad;
  const mineKey = await ipFailsKey(request);
  const [mine, all] = await Promise.all([readCount(env, mineKey), readCount(env, ALL_FAILS_KEY)]);
  if (all >= MAX_FAILS_ALL) return fail(429, 'Too many wrong passwords recently. The admin panel is locked for up to an hour.');
  if (mine >= MAX_FAILS) return fail(429, 'Too many wrong tries. Wait 15 minutes and try again.');
  const userOk = await sameText(user, env.ADMIN_USER), keyOk = await sameText(key, env.ADMIN_KEY);
  if (userOk && keyOk && key) { if (mine) { try { await env.CDN.delete(mineKey); } catch { } } return null; }
  try {
    await Promise.all([env.CDN.put(mineKey, String(mine + 1), { expirationTtl: LOCK_SECONDS }),
      env.CDN.put(ALL_FAILS_KEY, String(all + 1), { expirationTtl: LOCK_ALL_SECONDS })]);
  } catch { }
  await new Promise(r => setTimeout(r, 1000));
  return fail(401, 'Wrong ID or password.');
}

// session cookie value: <expiry>.<random>.<signature>, signed with a key made from both secrets
async function signingKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('toolzbaba-admin-session\n' + env.ADMIN_USER + '\n' + env.ADMIN_KEY));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = async (env, text) => b64url(await crypto.subtle.sign('HMAC', await signingKey(env), new TextEncoder().encode(text)));
export async function newSession(env) {
  const body = (Math.floor(Date.now() / 1000) + SESSION_SECONDS) + '.' + b64url(crypto.getRandomValues(new Uint8Array(18)));
  return `${COOKIE}=${body}.${await sign(env, body)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}
export const endSession = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
async function validSession(request, env) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([0-9]+)\\.([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)').exec(request.headers.get('Cookie') || '');
  if (!m || +m[1] < Date.now() / 1000) return false;
  return sameText(m[3], await sign(env, m[1] + '.' + m[2]));
}
export const fromAdminPage = request => request.headers.get(CSRF_HEADER) === CSRF_VALUE;

// null when the request comes from a signed-in admin (session cookie), or from a script sending X-Admin-User + X-Admin-Key
// (wrong ones count as wrong tries); otherwise the Response to send back. Every admin request needs the X-Requested-With header.
export async function requireAdmin(request, env) {
  const bad = setupProblem(env); if (bad) return bad;
  if (!fromAdminPage(request)) return fail(403, `Admin requests need the header ${CSRF_HEADER}: ${CSRF_VALUE}.`);
  if (await validSession(request, env)) return null;
  const key = request.headers.get('X-Admin-Key');
  if (key) return checkPassword(request, env, request.headers.get('X-Admin-User') || '', key);
  return fail(401, 'Please sign in.');
}

// for endpoints that also serve the public (deleting a hosted image or file): true only for a real admin; a wrong
// X-Admin-Key counts as a wrong try, so these can't be used to guess the password
export async function isAdmin(request, env) {
  if (!request.headers.get('X-Admin-Key') && !(request.headers.get('Cookie') || '').includes(COOKIE)) return false;
  return (await requireAdmin(request, env)) === null;
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
