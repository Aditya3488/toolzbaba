// GET /api/site-colors?url=https://example.com : fetch a public web page and its style sheets and count the colours they use.
// Only the colour list goes back to the visitor, never the page itself. The browser can't do this alone (sites don't allow other
// sites to read them), and Cloudflare Functions can only reach the public internet.
import { fail, json } from '../../lib/cdn-store.js';

const MAX_PAGE = 1_500_000, MAX_SHEET = 800_000, MAX_SHEETS = 8, TIMEOUT = 9000;
const UA = 'Mozilla/5.0 (compatible; ToolzBabaColorBot/1.0; +https://toolzbaba.com)';

// public web addresses only: no IP numbers, no local names, standard ports
function checkUrl(u, env) {
  let url; try { url = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (env.ALLOW_PRIVATE_HOSTS === '1') return url;  // local testing only (.dev.vars), never set on the live site
  const h = url.hostname.toLowerCase();
  if (!h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(h)) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  if (url.username || url.password) return null;
  return url;
}
async function get(url, env, max, accept) {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {  // follow a few redirects ourselves so every hop is checked
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
    let r; try { r = await fetch(cur.href, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: accept } }); } finally { clearTimeout(t); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { const next = checkUrl(new URL(r.headers.get('location'), cur).href, env); if (!next) throw new Error('The page redirects somewhere that cannot be read.'); cur = next; continue; }
    if (!r.ok) throw new Error(`The site answered with an error (${r.status}).`);
    const reader = r.body.getReader(), dec = new TextDecoder(), parts = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; parts.push(dec.decode(value, { stream: true })); if (n > max) { reader.cancel(); break; } }
    return { text: parts.join(''), url: cur };
  }
  throw new Error('The page redirects too many times.');
}

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function hslToHex(h, s, l) { h = ((h % 360) + 360) % 360; s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return '#' + [f(0), f(8), f(4)].map(v => hex2(v * 255)).join(''); }
// every colour found in a piece of CSS or HTML, with a weight: colours set on important properties count more
function collect(text, add, source) {
  const decl = /([a-zA-Z-]+)\s*:\s*([^;{}]*)/g; let m;
  while ((m = decl.exec(text))) {
    const prop = m[1].toLowerCase(), val = m[2], strong = /^(--.*(primary|brand|accent|theme|main|secondary|cta|highlight)|background(-color)?|color|fill|stop-color|border(-[a-z]+)?-color)$/.test(prop) ? 3 : 1;
    for (const c of val.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) { let h = c[1].toLowerCase(); if (h.length <= 4) h = [...h].map(x => x + x).join(''); add('#' + h.slice(0, 6), strong, prop, source); }
    for (const c of val.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) add('#' + [c[1], c[2], c[3]].map(hex2).join(''), strong, prop, source);
    for (const c of val.matchAll(/hsla?\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?[\s,]+(\d{1,3}(?:\.\d+)?)%[\s,]+(\d{1,3}(?:\.\d+)?)%/gi)) add(hslToHex(+c[1], +c[2], +c[3]), strong, prop, source);
  }
}

export async function onRequestGet({ request, env }) {
  const target = checkUrl(new URL(request.url).searchParams.get('url') || '', env);
  if (!target) return fail(400, 'Enter a full public web address, like https://example.com');
  try {
    const page = await get(target, env, MAX_PAGE, 'text/html,*/*;q=0.5'), html = page.text;
    const found = new Map(); let sheets = 0, styles = 0;
    const add = (hex, w, prop, src) => { const e = found.get(hex) || { hex, score: 0, count: 0, uses: new Set(), from: new Set() }; e.score += w; e.count++; if (e.uses.size < 4) e.uses.add(prop); e.from.add(src); found.set(hex, e); };
    const theme = (/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i.exec(html) || [])[1];
    let themeHex = null; if (theme) { const t = []; collect(`color:${theme}`, (h) => t.push(h), 'x'); if (t[0]) { themeHex = t[0]; add(t[0], 12, 'theme-color', 'page'); } }
    for (const s of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) { styles++; collect(s[1], add, 'page'); }
    for (const s of html.matchAll(/\sstyle=["']([^"']*)["']/gi)) collect(s[1], add, 'page');
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]).filter(t => /rel=["']?stylesheet/i.test(t)).map(t => (/href=["']([^"']+)/i.exec(t) || [])[1]).filter(Boolean).slice(0, MAX_SHEETS);
    await Promise.all(links.map(async href => { try { const u = checkUrl(new URL(href, page.url).href, env); if (!u) return; const css = await get(u, env, MAX_SHEET, 'text/css,*/*;q=0.5'); sheets++; collect(css.text, add, 'css'); } catch { /* one broken style sheet does not matter */ } }));
    const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const colors = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 80).map(e => ({ hex: e.hex.toUpperCase(), count: e.count, score: e.score, uses: [...e.uses] }));
    if (!colors.length) return fail(422, 'No colours were found in the page or its style sheets. The site may build its look with JavaScript.');
    return json({ url: page.url.href, title, theme: themeHex && themeHex.toUpperCase(), colors, sheets, styles });
  } catch (e) {
    return fail(502, e && e.name === 'AbortError' ? 'The site took too long to answer.' : (e && e.message) || 'Could not read that site.');
  }
}
