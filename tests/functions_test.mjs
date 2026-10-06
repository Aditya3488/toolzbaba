// Tests for the Cloudflare Pages Functions without a server: site-colors address checks, and the temporary file share
// (upload limits, blocked types, download headers, deleting). Run:  node tests/functions_test.mjs
import assert from 'node:assert/strict';
import { onRequestGet as siteColors } from '../functions/api/site-colors.js';
import { onRequestPost as upload } from '../functions/api/files/index.js';
import { onRequestDelete as remove } from '../functions/api/files/[id].js';
import { onRequestGet as download } from '../functions/f/[id]/[name].js';
import { onRequestGet as toolStatus } from '../functions/api/tool-status.js';
import { onRequestPost as rumBeacon } from '../functions/api/rum.js';
import { onRequestGet as adminGet, onRequestPost as adminSet } from '../functions/api/admin/status.js';
import { onRequestGet as adminRum, onRequestDelete as adminRumReset } from '../functions/api/admin/rum.js';
import { onRequestGet as labGet, onRequestPost as labPost } from '../functions/api/admin/lab.js';
import { addEvent, emptyAgg, percentile, EDGES } from '../lib/rum-store.js';

globalThis.caches = { default: { match: async () => undefined, put: async () => { }, delete: async () => { } } };
class KV { constructor() { this.m = new Map(); } async put(k, v) { this.m.set(k, v); } async get(k, o) { const v = this.m.get(k); if (v === undefined) return null; if (o && o.type === 'json') return JSON.parse(v); if (o && o.type === 'arrayBuffer') return v; return typeof v === 'string' ? v : new TextDecoder().decode(v); } async delete(k) { this.m.delete(k); } }
let pass = 0; const ok = (name, extra = '') => { console.log('PASS', name.padEnd(54), extra); pass++; };
const req = (url, init) => new Request('https://toolzbaba.com' + url, init);

// ---- site-colors: only public web addresses
for (const bad of ['', 'not a url', 'ftp://example.com', 'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://[::1]/', 'http://intranet/', 'http://box.internal/', 'https://example.com:8443/', 'https://user:pw@example.com/', 'file:///etc/passwd']) {
  const r = await siteColors({ request: req('/api/site-colors?url=' + encodeURIComponent(bad)), env: {} });
  assert.equal(r.status, 400, `${bad} should be refused (got ${r.status})`);
}
ok('site-colors refuses local, private and odd addresses', '12 addresses');

// ---- file share
const env = { CDN: new KV(), ADMIN_KEY: 'secret-admin-key' };
const form = (files, hours) => { const fd = new FormData(); files.forEach(([n, size]) => fd.append('file', new File([new Uint8Array(size).fill(65)], n))); if (hours) fd.append('hours', hours); return fd; };
let r = await upload({ request: req('/api/files', { method: 'POST', body: form([['notes.pdf', 1000]], '24') }), env });
assert.equal(r.status, 200); let j = await r.json(); const it = j.items[0];
assert.match(it.link, /^https:\/\/toolzbaba\.com\/f\/[A-Za-z0-9]{10}\/notes\.pdf$/); assert.ok(it.delete_token.length >= 20); assert.ok(it.expires - Date.now() > 23 * 3600e3 && it.expires - Date.now() < 25 * 3600e3);
ok('upload gives a direct link, a delete token and the expiry', it.link);

for (const [name, size, why] of [['setup.exe', 100, 'a program'], ['page.html', 100, 'a web page'], ['logo.svg', 100, 'an svg'], ['run.sh', 100, 'a script']]) {
  r = await upload({ request: req('/api/files', { method: 'POST', body: form([[name, size]]) }), env }); assert.equal(r.status, 400, why);
}
ok('programs, scripts, web pages and svg are refused');
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['big.zip', 21 * 1048576]]) }), env }); assert.equal(r.status, 413);
r = await upload({ request: req('/api/files', { method: 'POST', body: form(Array.from({ length: 6 }, (_, i) => [`f${i}.txt`, 10])) }), env }); assert.equal(r.status, 400);
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['empty.txt', 0]]) }), env }); assert.equal(r.status, 400);
r = await upload({ request: req('/api/files', { method: 'POST', body: new FormData() }), env }); assert.equal(r.status, 400);
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['a.txt', 5]]) }), env: {} }); assert.equal(r.status, 503);
ok('size, count, empty and "not switched on" are handled', '413 / 400 / 400 / 400 / 503');
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['weird "name"/..\\x.txt', 5]], '999') }), env }); j = await r.json(); assert.ok(!/[\\/:*?"<>|]/.test(j.items[0].name) && j.items[0].link.split('/').length === 6, 'name cleaned: ' + j.items[0].name);
assert.ok(j.items[0].expires - Date.now() < 8 * 86400e3, 'an unknown duration falls back to 7 days'); ok('odd file names are cleaned and a bad duration becomes 7 days');

const id = it.link.split('/')[4];
r = await download({ request: req(`/f/${id}/notes.pdf`), params: { id, name: 'notes.pdf' }, env, waitUntil: () => { } });
assert.equal(r.status, 200); const h = r.headers; assert.match(h.get('Content-Disposition'), /^attachment; filename="notes\.pdf"/); assert.equal(h.get('Content-Type'), 'application/octet-stream');
assert.equal(h.get('X-Content-Type-Options'), 'nosniff'); assert.match(h.get('X-Robots-Tag'), /noindex/); assert.match(h.get('Content-Security-Policy'), /sandbox/); assert.equal((await r.arrayBuffer()).byteLength, 1000);
ok('the link downloads the file, as an attachment with safe headers');
r = await download({ request: req('/f/nope123456/x.txt'), params: { id: 'nope123456', name: 'x.txt' }, env, waitUntil: () => { } }); assert.equal(r.status, 404);
r = await download({ request: req('/f/../x'), params: { id: '../x', name: 'x' }, env, waitUntil: () => { } }); assert.equal(r.status, 404); ok('unknown and malformed ids are 404');

r = await remove({ request: req(`/api/files/${id}?token=wrong`, { method: 'DELETE' }), params: { id }, env }); assert.equal(r.status, 403);
r = await remove({ request: req(`/api/files/${id}`, { method: 'DELETE', headers: { 'X-Admin-Key': 'nope' } }), params: { id }, env }); assert.equal(r.status, 403);
r = await remove({ request: req(`/api/files/${id}?token=${it.delete_token}`, { method: 'DELETE' }), params: { id }, env }); assert.equal(r.status, 200);
r = await download({ request: req(`/f/${id}/notes.pdf`), params: { id, name: 'notes.pdf' }, env, waitUntil: () => { } }); assert.equal(r.status, 404);
ok('delete: wrong token refused, right token deletes the file');
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['b.txt', 5]]) }), env }); const j2 = (await r.json()).items[0], id2 = j2.link.split('/')[4];
r = await remove({ request: req(`/api/files/${id2}`, { method: 'DELETE', headers: { 'X-Admin-Key': 'secret-admin-key' } }), params: { id: id2 }, env }); assert.equal(r.status, 200); ok('the site owner can delete with the admin key');
r = await upload({ request: req('/api/files', { method: 'POST', body: form([['रिपोर्ट 2026.pdf', 20]]) }), env }); const hi = (await r.json()).items[0], hid = hi.link.split('/')[4];
r = await download({ request: req(`/f/${hid}/x`), params: { id: hid, name: 'x' }, env, waitUntil: () => { } }); assert.equal(r.status, 200); const cd = r.headers.get('Content-Disposition');
assert.match(cd, /^attachment; filename="[\x20-\x7e]+\.pdf"; filename\*=UTF-8''%E0%A4%B0/); ok('a Hindi file name downloads with a proper UTF-8 header', cd.slice(0, 70));

// ---- admin panel: key, archive / live, public list, rum, lab
{
  const A = { 'X-Admin-Key': 'secret-admin-key', 'Content-Type': 'application/json' };
  const post = (url, body, headers = A) => req(url, { method: 'POST', headers, body: JSON.stringify(body) });
  let r2 = await adminGet({ request: req('/api/admin/status'), env: { CDN: new KV() } }); assert.equal(r2.status, 503); ok('admin: without ADMIN_KEY set the panel says it is not set up');
  r2 = await adminGet({ request: req('/api/admin/status'), env }); assert.equal(r2.status, 401);
  r2 = await adminSet({ request: post('/api/admin/status', { slugs: ['anime-style'], state: 'archived' }, { 'X-Admin-Key': 'wrong-key-guess-1', 'Content-Type': 'application/json' }), env }); assert.equal(r2.status, 401);
  r2 = await toolStatus({ request: req('/api/tool-status'), env }); assert.deepEqual((await r2.json()).archived, []);
  ok('admin: no key or a wrong key is refused, nothing changes');

  r2 = await adminSet({ request: post('/api/admin/status', { slugs: ['anime-style', 'upscale-image', 'bad slug!', '../x'], state: 'archived', note: 'model too heavy' }), env }); assert.equal(r2.status, 200);
  let doc = await r2.json(); assert.deepEqual(Object.keys(doc.status.tools).sort(), ['anime-style', 'upscale-image']); assert.equal(doc.log.length, 2);
  r2 = await toolStatus({ request: req('/api/tool-status'), env }); const pub = await r2.json(); assert.deepEqual(pub.archived, ['anime-style', 'upscale-image']);
  assert.ok(!JSON.stringify(pub).includes('heavy'), 'notes must stay private'); assert.match(r2.headers.get('Cache-Control'), /max-age=60/);
  ok('admin: archive two tools (bad slugs ignored), public list shows only the slugs', pub.archived.join(', '));

  r2 = await adminSet({ request: post('/api/admin/status', { slugs: ['anime-style'], state: 'live' }), env }); doc = await r2.json();
  assert.deepEqual(Object.keys(doc.status.tools), ['upscale-image']); assert.equal(doc.log[0].to, 'live');
  r2 = await adminSet({ request: post('/api/admin/status', { slugs: ['anime-style'], state: 'live' }), env }); assert.equal((await r2.json()).log.length, 3, 'a no-op change is not logged');
  for (const bad of [{ slugs: [], state: 'live' }, { slugs: ['a'], state: 'gone' }, { slugs: Array.from({ length: 201 }, (_, i) => 't' + i), state: 'live' }]) { r2 = await adminSet({ request: post('/api/admin/status', bad), env }); assert.equal(r2.status, 400); }
  ok('admin: back to live, no-ops are not logged, bad requests get 400');

  // real-user beacons
  const beacon = body => rumBeacon({ request: post('/api/rum', body, { 'Content-Type': 'application/json' }), env });
  for (let i = 0; i < 4; i++) assert.equal((await beacon({ s: 'compress-image', m: i % 2, t: { ttfb: 80, lcp: 1500 + i * 400, load: 900, cls: 0.02, err: 0 }, runs: [{ ms: 3000, ok: 1 }, { ms: 100, ok: 0 }] })).status, 204);
  await beacon({ s: 'Bad Slug', t: {} }); await beacon('not json'); assert.equal((await rumBeacon({ request: req('/api/rum', { method: 'POST', body: 'x'.repeat(5000) }), env })).status, 204);
  r2 = await adminRum({ request: req('/api/admin/rum', { headers: A }), env }); const rum = (await r2.json()).rum, t = rum.tools['compress-image'];
  assert.deepEqual(Object.keys(rum.tools), ['compress-image']); assert.equal(t.views, 4); assert.equal(t.mobile, 2); assert.equal(t.runs, 8); assert.equal(t.runErr, 4); assert.equal(rum.writes, 4);
  const p75 = percentile(t.h.lcp, 0.75); assert.ok(p75 >= 2500 && p75 <= 4000, 'lcp p75 ' + p75);
  ok('rum: beacons are folded into per-tool histograms, junk is dropped', `views ${t.views}, lcp p75 ${p75} ms`);
  const small = emptyAgg('x'); for (let i = 0; i < 250; i++) addEvent(small, { s: 't' + i, t: {} }); assert.ok(Object.keys(small.tools).length <= 200);
  assert.equal(addEvent(small, { s: 'a', t: { lcp: -5, load: 'x', ttfb: Infinity } }), false); assert.equal(percentile([0, 0, 0], 0.5), null); assert.equal(percentile(new Array(EDGES.length + 1).fill(0).map((_, i) => (i === 2 ? 1 : 0)), 0.5), EDGES[2]);
  ok('rum: tool count is capped, bad numbers ignored, percentile maths');
  const full = { CDN: new KV() }; await full.CDN.put('admin:rum', JSON.stringify({ since: 1, day: new Date().toISOString().slice(0, 10), writes: 700, tools: {} }));
  await rumBeacon({ request: post('/api/rum', { s: 'x1', t: {} }, { 'Content-Type': 'application/json' }), env: full }); assert.deepEqual(JSON.parse(await full.CDN.get('admin:rum')).tools, {});
  ok('rum: once the daily KV write budget is used, samples are dropped');
  r2 = await adminRumReset({ request: req('/api/admin/rum', { method: 'DELETE', headers: A }), env }); assert.equal(r2.status, 200); assert.equal((await (await adminRum({ request: req('/api/admin/rum', { headers: A }), env })).json()).rum, null);
  ok('rum: reset clears it');

  r2 = await labPost({ request: post('/api/admin/lab', { results: { 'json-formatter': { ok: true, ready: 400 }, 'bad slug': { ok: true } } }), env }); const lab = (await r2.json()).lab;
  assert.deepEqual(Object.keys(lab), ['json-formatter']); r2 = await labGet({ request: req('/api/admin/lab', { headers: A }), env }); assert.equal((await r2.json()).lab['json-formatter'].ready, 400);
  r2 = await labGet({ request: req('/api/admin/lab'), env }); assert.equal(r2.status, 401);
  ok('lab: results are stored for every admin, only with the key');

  // ID + password, and the lock after too many wrong tries
  {
    const E = { CDN: new KV(), ADMIN_KEY: 'a-good-password-1', ADMIN_USER: 'boss' };
    const h = (user, key, ip) => ({ headers: { ...(user ? { 'X-Admin-User': user } : {}), ...(key ? { 'X-Admin-Key': key } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) } });
    let r3 = await adminGet({ request: req('/api/admin/status', h('boss', 'a-good-password-1')), env: E }); assert.equal(r3.status, 200);
    r3 = await adminGet({ request: req('/api/admin/status', h('someone', 'a-good-password-1')), env: E }); assert.equal(r3.status, 401, 'right password, wrong ID'); assert.match((await r3.json()).detail, /ID or password/);
    r3 = await adminGet({ request: req('/api/admin/status', h('boss', 'wrong-password-xx')), env: E }); assert.equal(r3.status, 401);
    r3 = await adminGet({ request: req('/api/admin/status', h('', 'a-good-password-1')), env: E }); assert.equal(r3.status, 401, 'no ID');
    ok('admin: with ADMIN_USER set both the ID and the password must match');
    for (let i = 0; i < 2; i++) await adminGet({ request: req('/api/admin/status', h('boss', 'nope-nope-' + i, '203.0.113.9')), env: E });   // 2 more wrong tries from another address
    r3 = await adminGet({ request: req('/api/admin/status', h('boss', 'a-good-password-1', '203.0.113.9')), env: E }); assert.equal(r3.status, 200, 'a right try before the limit still works and clears the count');
    for (let i = 0; i < 5; i++) await adminGet({ request: req('/api/admin/status', h('boss', 'guess-' + i, '198.51.100.7')), env: E });
    r3 = await adminGet({ request: req('/api/admin/status', h('boss', 'a-good-password-1', '198.51.100.7')), env: E }); assert.equal(r3.status, 429, 'locked even for the right password');
    r3 = await adminGet({ request: req('/api/admin/status', h('boss', 'a-good-password-1', '192.0.2.44')), env: E }); assert.equal(r3.status, 200, 'another visitor is not locked out');
    ok('admin: 5 wrong tries lock that visitor out, others are not affected');
  }
}

console.log(`\n${pass}/${pass} passed`);
