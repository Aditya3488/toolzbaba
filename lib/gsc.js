// Google Search Console, read only: is a URL in Google's index? (the URL Inspection API, used by the admin panel's
// "Google index" tab through functions/api/admin/google-index.js).
// Sign-in is a Google service account: its JSON key is the Cloudflare Pages secret GSC_SERVICE_ACCOUNT, and its e-mail
// address is added as a user (Restricted is enough) of the site in Search Console. The key never leaves the server.
// Optional secret GSC_SITE names the property ("sc-domain:toolzbaba.com" or "https://toolzbaba.com/"); without it both
// forms are tried. Google allows 2,000 inspections a day and 600 a minute per site.
import { readDoc, writeDoc } from './admin-store.js';

export const INDEX_KEY = 'admin:index', DAILY_LIMIT = 2000, MAX_PER_CALL = 40;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// the service account, or why it can't be used
export function account(env) {
  const raw = env.GSC_SERVICE_ACCOUNT;
  if (!raw) return { problem: 'missing' };
  try {
    const a = JSON.parse(raw);
    if (!a.client_email || !a.private_key) return { problem: 'The secret GSC_SERVICE_ACCOUNT is not a service-account key (client_email or private_key is missing). Paste the whole JSON file.' };
    return { email: a.client_email, key: a.private_key };
  } catch { return { problem: 'The secret GSC_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file, from { to }.' }; }
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(new TextEncoder().encode(s));

// a signed JWT swapped for an access token (kept for the hour it is valid, per server instance)
let cached = null;
export async function accessToken(acc) {
  if (cached && cached.email === acc.email && cached.exp > Date.now() + 60000) return cached.token;
  const pem = acc.key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const body = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlText(JSON.stringify({ iss: acc.email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + body + '.' + b64url(sig) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google refused the service account: ' + (j.error_description || j.error || r.status) + '. Check the key in GSC_SERVICE_ACCOUNT.');
  cached = { email: acc.email, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// the few fields the panel shows (googleCanonical / userCanonical only when they differ from the URL)
export function compact(url, r) {
  const x = (r && r.indexStatusResult) || {}, out = { v: x.verdict || 'VERDICT_UNSPECIFIED', s: x.coverageState || '', at: Date.now() };
  if (x.lastCrawlTime) out.c = x.lastCrawlTime;
  if (x.pageFetchState && x.pageFetchState !== 'SUCCESSFUL') out.f = x.pageFetchState;
  if (x.indexingState && x.indexingState !== 'INDEXING_ALLOWED') out.i = x.indexingState;
  if (x.robotsTxtState === 'DISALLOWED') out.r = 'DISALLOWED';
  if (x.googleCanonical && x.googleCanonical !== url) out.g = x.googleCanonical;
  if (x.userCanonical && x.userCanonical !== url) out.u = x.userCanonical;
  return out;
}

const sites = env => (env.GSC_SITE ? [env.GSC_SITE] : null);
let knownSite = null;   // the property form that worked, per server instance

async function inspectOne(token, site, url) {
  const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionUrl: url, siteUrl: site }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

// inspect up to MAX_PER_CALL URLs of this site, a few at a time; returns { results: { url: compact | { e } }, site, quota }
export async function inspect(env, host, urls) {
  const acc = account(env); if (acc.problem) throw new Error(acc.problem === 'missing' ? 'Not set up yet.' : acc.problem);
  const token = await accessToken(acc), bare = host.replace(/^www\./, '');
  const candidates = sites(env) || (knownSite ? [knownSite] : ['sc-domain:' + bare, 'https://' + host + '/']);
  // the property form: the first URL tells which one this service account may use
  let site = candidates[0], first = null;
  for (const c of candidates) {
    first = await inspectOne(token, c, urls[0]);
    if (first.status !== 403 && first.status !== 404) { site = c; break; }
  }
  if (first.status === 403 || first.status === 404) {
    throw new Error(`Search Console said no (${first.status}) for ${candidates.join(' and ')}: add ${acc.email} as a user of the site in Search Console (Settings, Users and permissions; Restricted is enough), or set GSC_SITE to the exact property name.`);
  }
  knownSite = site;
  const results = {}, take = (url, res) => {
    if (res.status === 200) results[url] = compact(url, res.j.inspectionResult);
    else results[url] = { e: (res.j.error && res.j.error.message) || 'HTTP ' + res.status, q: res.status === 429 ? 1 : undefined, at: Date.now() };
  };
  take(urls[0], first);
  let quota = first.status === 429, i = 1;
  const worker = async () => {
    while (i < urls.length && !quota) {
      const url = urls[i++], res = await inspectOne(token, site, url);
      if (res.status === 429) quota = true;
      take(url, res);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { results, site, quota };
}

// results kept between visits: { results: { url: ... }, day: 'YYYY-MM-DD', used, updated }
const today = () => new Date().toISOString().slice(0, 10);
export async function readIndex(env) {
  const d = await readDoc(env, INDEX_KEY, { results: {}, day: today(), used: 0 });
  if (d.day !== today()) { d.day = today(); d.used = 0; }   // Google's daily allowance starts again (Pacific time, roughly)
  return d;
}
export async function saveIndex(env, results, used) {
  const d = await readIndex(env);
  for (const [u, r] of Object.entries(results || {})) if (typeof u === 'string' && u.length < 600 && r && typeof r === 'object') d.results[u] = r;
  d.used = Math.max(0, (d.used || 0) + (used | 0)); d.updated = Date.now();
  await writeDoc(env, INDEX_KEY, d);
  return d;
}
