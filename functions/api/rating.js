// "Rate this tool": GET /api/rating?tool=<slug> answers { count, avg }; POST { tool, stars: 1-5 } records a vote.
// Votes live in D1 (bound as DB, table `ratings`): one row per tool and visitor, so a visitor can change their vote but not
// vote twice. The visitor is a salted hash of their IP address (the address itself is never stored). Only real tool and
// tab-page slugs are accepted. The summary is cached in this data centre for 5 minutes; a vote clears that copy.
import { fail, json, sha256 } from '../../lib/cdn-store.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SCHEMA = 'CREATE TABLE IF NOT EXISTS ratings (tool TEXT NOT NULL, voter TEXT NOT NULL, stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), at INTEGER NOT NULL, PRIMARY KEY (tool, voter))';
let ready = null, slugs = null;
const setup = env => ready || (ready = env.DB.prepare(SCHEMA).run().catch(e => { ready = null; throw e; }));
async function known(env, request, slug) {
  if (!slugs) {
    try {
      const d = await (await env.ASSETS.fetch(new URL('/assets/tools.json', request.url))).json();
      slugs = new Set([...d.tools.filter(t => !t.href).map(t => t.slug), ...(d.variants || []).map(v => v.slug)]);
    } catch { return SLUG.test(slug); }   // the list could not be read: fall back to the address check
  }
  return slugs.has(slug);
}
const cacheKey = (request, slug) => new Request(new URL('/api/rating?tool=' + slug, request.url).href);
async function summary(env, slug) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(stars) AS a FROM ratings WHERE tool = ?').bind(slug).first();
  return { tool: slug, count: r ? r.n : 0, avg: r && r.n ? Math.round(r.a * 10) / 10 : null };
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DB) return json({ count: 0, avg: null });
  const slug = new URL(request.url).searchParams.get('tool') || '';
  if (!SLUG.test(slug)) return fail(400, 'Unknown tool.');
  const hit = await caches.default.match(cacheKey(request, slug)); if (hit) return hit;
  await setup(env);
  const res = new Response(JSON.stringify(await summary(env, slug)), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  waitUntil(caches.default.put(cacheKey(request, slug), res.clone()));
  return res;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(503, 'Ratings are not switched on.');
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const slug = String(b.tool || ''), stars = Number(b.stars);
  if (!SLUG.test(slug) || !(await known(env, request, slug))) return fail(400, 'Unknown tool.');
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail(400, 'Stars must be 1 to 5.');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const voter = (await sha256(`${env.RATING_SALT || env.ADMIN_KEY || 'toolzbaba'}|${ip}`)).slice(0, 32);
  await setup(env);
  await env.DB.prepare('INSERT INTO ratings (tool, voter, stars, at) VALUES (?, ?, ?, ?) ON CONFLICT (tool, voter) DO UPDATE SET stars = excluded.stars, at = excluded.at')
    .bind(slug, voter, stars, Date.now()).run();
  try { await caches.default.delete(cacheKey(request, slug)); } catch { /* the copy expires within 5 minutes anyway */ }
  return json({ ok: true, ...(await summary(env, slug)) });
}
