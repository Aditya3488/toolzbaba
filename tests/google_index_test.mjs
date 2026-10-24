// Tests for the admin panel's "Google index" check (functions/api/admin/google-index.js, lib/gsc.js) without Google:
// a throwaway RSA key stands in for the service account and a fake Google answers. Run:  node tests/google_index_test.mjs
import assert from 'node:assert/strict';
import { onRequestGet as gGet, onRequestPost as gPost, onRequestPut as gPut, onRequestDelete as gDelete } from '../functions/api/admin/google-index.js';

class KV { constructor() { this.m = new Map(); } async put(k, v) { this.m.set(k, v); } async get(k, o) { const v = this.m.get(k); if (v === undefined) return null; return o && o.type === 'json' ? JSON.parse(v) : v; } async delete(k) { this.m.delete(k); } }
let pass = 0; const ok = (name, extra = '') => { console.log('PASS', name.padEnd(60), extra); pass++; };
const req = (url, init) => new Request('https://toolzbaba.com' + url, init);

const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const b64 = Buffer.from(new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
const pem = '-----BEGIN PRIVATE KEY-----\n' + b64.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
const EMAIL = 'reader@proj.iam.gserviceaccount.com';
const E = { CDN: new KV(), ADMIN_USER: 'boss-admin', ADMIN_KEY: 'secret-admin-key', GSC_SERVICE_ACCOUNT: JSON.stringify({ type: 'service_account', client_email: EMAIL, private_key: pem }) };
const A = { 'X-Requested-With': 'toolzbaba-admin', 'X-Admin-User': 'boss-admin', 'X-Admin-Key': 'secret-admin-key', 'Content-Type': 'application/json' };

// the fake Google: checks the signed token, answers 403 for the domain property (this site is a URL-prefix property)
const seen = { token: 0, inspected: 0 };
let busyAfter = Infinity;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://oauth2.googleapis.com/token') {
    seen.token++;
    const jwt = new URLSearchParams(init.body).get('assertion'), [h, p, sig] = jwt.split('.');
    assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(h + '.' + p)), 'the JWT is signed with the key');
    const c = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.equal(c.iss, EMAIL); assert.equal(c.scope, 'https://www.googleapis.com/auth/webmasters.readonly'); assert.equal(c.aud, 'https://oauth2.googleapis.com/token'); assert.equal(c.exp - c.iat, 3600);
    return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
  }
  assert.equal(String(url), 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect');
  assert.equal(init.headers.Authorization, 'Bearer tok');
  const b = JSON.parse(init.body);
  if (b.siteUrl.startsWith('sc-domain:')) return new Response(JSON.stringify({ error: { message: 'User does not have sufficient permission' } }), { status: 403 });
  if (++seen.inspected > busyAfter) return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 });
  if (b.inspectionUrl.endsWith('/merge-pdf')) return new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' } } }));
  return new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-10-20T10:00:00Z', pageFetchState: 'SUCCESSFUL', indexingState: 'INDEXING_ALLOWED', robotsTxtState: 'ALLOWED', googleCanonical: b.inspectionUrl, userCanonical: b.inspectionUrl } } }));
};
const get = env => gGet({ request: req('/api/admin/google-index', { headers: A }), env });
const post = (body, env = E) => gPost({ request: req('/api/admin/google-index', { method: 'POST', headers: A, body: JSON.stringify(body) }), env });

// ---- set up or not
{
  let j = await (await get({ ...E, GSC_SERVICE_ACCOUNT: undefined })).json();
  assert.equal(j.setup, false); assert.equal(j.problem, null, 'not set up yet is not an error');
  j = await (await get({ ...E, GSC_SERVICE_ACCOUNT: '{oops' })).json(); assert.equal(j.setup, false); assert.match(j.problem, /not valid JSON/);
  j = await (await get({ ...E, GSC_SERVICE_ACCOUNT: '{"client_email":"x@y"}' })).json(); assert.match(j.problem, /private_key is missing/);
  const r = await get(E), raw = await r.text(); j = JSON.parse(raw);
  assert.equal(j.setup, true); assert.equal(j.email, EMAIL); assert.equal(raw.includes('PRIVATE KEY'), false, 'the key never reaches the browser');
  assert.equal(j.limit, 2000); assert.equal(j.perCall, 40);
  assert.equal((await gGet({ request: req('/api/admin/google-index'), env: E })).status, 403, 'admin only');
  assert.equal((await gGet({ request: req('/api/admin/google-index', { headers: { 'X-Requested-With': 'toolzbaba-admin' } }), env: E })).status, 401, 'signed-in admin only');
  ok('google index: set-up states, admin only, key stays on the server');
}

// ---- inspecting
const urls = ['https://toolzbaba.com/', 'https://toolzbaba.com/merge-pdf', 'https://toolzbaba.com/hi/compress-image'];
let results;
{
  const r = await post({ urls: [...urls, 'https://evil.example/x', 'http://toolzbaba.com/insecure'] }), j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.site, 'https://toolzbaba.com/', 'the domain property was refused, so the URL-prefix one is used');
  assert.deepEqual(Object.keys(j.results).sort(), urls.slice().sort(), 'addresses of other sites are dropped');
  const home = j.results['https://toolzbaba.com/'];
  assert.equal(home.v, 'PASS'); assert.equal(home.s, 'Submitted and indexed'); assert.equal(home.c, '2026-10-20T10:00:00Z');
  for (const k of ['g', 'u', 'f', 'i', 'r', 'e']) assert.equal(home[k], undefined, `${k} only when it says something`);
  assert.equal(j.results['https://toolzbaba.com/merge-pdf'].v, 'NEUTRAL'); assert.equal(j.results['https://toolzbaba.com/merge-pdf'].s, 'Discovered - currently not indexed');
  assert.equal(seen.token, 1, 'one token');
  await post({ urls: urls.slice(0, 1) }); assert.equal(seen.token, 1, 'the token is reused while valid');
  assert.equal((await post({ urls: Array.from({ length: 41 }, (_, i) => 'https://toolzbaba.com/p' + i) })).status, 400, 'at most 40 per call');
  assert.equal((await post({ urls: [] })).status, 400);
  results = j.results;
  ok('google index: signed token, property fallback, compact results', '3 addresses');
}

// ---- Google's daily allowance runs out in the middle
{
  busyAfter = seen.inspected + 5;
  const j = await (await post({ urls: Array.from({ length: 20 }, (_, i) => 'https://toolzbaba.com/q' + i) })).json();
  assert.equal(j.quota, true, 'the panel is told to stop');
  const failed = Object.values(j.results).filter(r => r.e);
  assert.ok(failed.length >= 1 && failed.every(r => r.q === 1), 'quota answers are marked');
  busyAfter = Infinity;
  ok('google index: a 429 stops the run and is marked');
}

// ---- refused on both property forms: a message that names the account to add
{
  const r = await post({ urls: urls.slice(0, 1) }, { ...E, GSC_SITE: 'sc-domain:toolzbaba.com' });
  assert.equal(r.status, 502); const d = (await r.json()).detail;
  assert.ok(d.includes(EMAIL) && d.includes('Users and permissions'), d);
  ok('google index: refused property explains what to do');
}

// ---- keeping results
{
  let r = await gPut({ request: req('/api/admin/google-index', { method: 'PUT', headers: A, body: JSON.stringify({ results, used: 3 }) }), env: E });
  assert.equal((await r.json()).used, 3);
  r = await gPut({ request: req('/api/admin/google-index', { method: 'PUT', headers: A, body: JSON.stringify({ results: { 'https://toolzbaba.com/merge-pdf': { v: 'PASS', s: 'Submitted and indexed', at: 1 } }, used: 1 }) }), env: E });
  let j = await (await get(E)).json();
  assert.equal(Object.keys(j.index.results).length, 3); assert.equal(j.index.used, 4); assert.equal(j.index.results['https://toolzbaba.com/merge-pdf'].v, 'PASS', 'newer result wins');
  // a new day starts the allowance again
  const doc = JSON.parse(E.CDN.m.get('admin:index')); doc.day = '2000-01-01'; E.CDN.m.set('admin:index', JSON.stringify(doc));
  j = await (await get(E)).json(); assert.equal(j.index.used, 0); assert.equal(Object.keys(j.index.results).length, 3, 'results stay');
  assert.equal((await gPut({ request: req('/api/admin/google-index', { method: 'PUT', headers: A, body: '{"results":"x"}' }), env: E })).status, 400);
  await gDelete({ request: req('/api/admin/google-index', { method: 'DELETE', headers: A }), env: E });
  j = await (await get(E)).json(); assert.equal(Object.keys(j.index.results).length, 0);
  ok('google index: results kept and merged, daily count resets, forget all');
}

console.log(`\n${pass}/${pass} passed`);
