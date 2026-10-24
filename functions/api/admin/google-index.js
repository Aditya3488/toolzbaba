// Admin: is each page in Google's index? (see lib/gsc.js)
//   GET                       set up or not, the service account's e-mail, and the results kept so far
//   POST { urls: [...] }      inspect up to 40 URLs of this site now (nothing is saved)
//   PUT  { results, used }    keep results (the panel sends them every 200 checks: KV allows 1,000 saves a day)
//   DELETE                    forget every result
import { fail, json, requireAdmin } from '../../../lib/admin-store.js';
import { account, DAILY_LIMIT, INDEX_KEY, inspect, MAX_PER_CALL, readIndex, saveIndex } from '../../../lib/gsc.js';

export async function onRequestGet({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  const acc = account(env);
  return json({ setup: !acc.problem, problem: acc.problem === 'missing' ? null : acc.problem || null, email: acc.email || null, site: env.GSC_SITE || null,
    limit: DAILY_LIMIT, perCall: MAX_PER_CALL, index: await readIndex(env) });
}

export async function onRequestPost({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const host = new URL(request.url).host;
  const urls = [...new Set(Array.isArray(b.urls) ? b.urls : [])].filter(u => {
    try { const x = new URL(u); return x.protocol === 'https:' && x.host.replace(/^www\./, '') === host.replace(/^www\./, ''); } catch { return false; }
  });
  if (!urls.length || urls.length > MAX_PER_CALL) return fail(400, `Send between 1 and ${MAX_PER_CALL} addresses of this site.`);
  try { return json(await inspect(env, host, urls)); }
  catch (e) { return fail(502, e.message || 'Google could not be reached.'); }
}

export async function onRequestPut({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  if (!b.results || typeof b.results !== 'object' || Object.keys(b.results).length > 2500) return fail(400, 'Send up to 2,500 results.');
  const d = await saveIndex(env, b.results, Math.min(DAILY_LIMIT, b.used | 0));
  return json({ ok: true, day: d.day, used: d.used, updated: d.updated });
}

export async function onRequestDelete({ request, env }) {
  const bad = await requireAdmin(request, env); if (bad) return bad;
  await env.CDN.delete(INDEX_KEY); return json({ ok: true });
}
