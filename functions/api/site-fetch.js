// GET /api/site-fetch?url=https://example.com/page&max=1800000&accept=html : read one public web page for the
// Visual Sitemap Generator (static/assets/tools/site-board.js). The crawler and the chat bot run in the visitor's browser
// (the site_board Python package, in Pyodide), but browsers can't read other sites, so this passes pages through.
// Rules: public addresses only and every redirect re-checked (lib/public-url.js), only from this site's own pages,
// text answers only, size and time limits, and the answer is an inert download, never shown as a page of this site.
// What the site said comes back in headers: X-Upstream-Status, X-Final-Url, X-Redirected, X-Upstream-Type, X-Retry-After.
import { fail } from '../../lib/cdn-store.js';
import { checkUrl } from '../../lib/public-url.js';

const MAX = 12_000_000, TIMEOUT = 30000, HOPS = 5;
const UA = 'Mozilla/5.0 (compatible; ToolzBabaSiteBoard/1.0; +https://toolzbaba.com/visual-sitemap-generator)';
const ACCEPT = {
  html: 'text/html,application/xhtml+xml,*/*;q=0.8', xml: 'application/xml,text/xml,*/*;q=0.5',
  json: 'application/json,*/*;q=0.5', text: 'text/plain,*/*;q=0.5', any: '*/*',
};
const BINARY = /^(image|video|audio|font)\/|^application\/(pdf|zip|gzip|octet-stream|msword|vnd\.|x-(zip|rar|7z|tar|gzip|msdownload|shockwave))/i;

// stop passing bytes on after `max` (the rest of the page is dropped and the site's connection closed)
function cap(max) {
  let n = 0;
  return new TransformStream({
    transform(chunk, c) {
      const left = max - n;
      if (left <= 0) return;
      n += chunk.byteLength;
      c.enqueue(chunk.byteLength > left ? chunk.slice(0, left) : chunk);
      if (n >= max) c.terminate();
    },
  });
}

export async function onRequestGet({ request, env }) {
  const here = new URL(request.url), q = here.searchParams;
  const from = request.headers.get('Sec-Fetch-Site');  // browsers send it; only the tool's own page may use this
  if (from && from !== 'same-origin') return fail(403, 'This only works from the Visual Sitemap Generator on toolzbaba.com.');
  let cur = checkUrl(q.get('url') || '', env);
  if (!cur || cur.hostname === here.hostname) return fail(400, 'Enter a full public web address, like https://example.com');
  const max = Math.min(MAX, Math.max(10_000, Number(q.get('max')) || 2_000_000));
  const accept = ACCEPT[q.get('accept')] || ACCEPT.html;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let redirected = false;
  try {
    for (let hop = 0; hop < HOPS; hop++) {  // follow redirects ourselves so every hop is checked
      const r = await fetch(cur.href, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en;q=0.9,*;q=0.5' } });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        if (r.body) r.body.cancel();
        const next = checkUrl(new URL(loc, cur).href, env);
        if (!next || next.hostname === here.hostname) { clearTimeout(timer); return fail(422, 'The page redirects somewhere that cannot be read.'); }
        cur = next; redirected = true;
        continue;
      }
      const type = (r.headers.get('content-type') || '').slice(0, 200);
      const h = new Headers({
        'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'no-store', 'X-Upstream-Status': String(r.status), 'X-Final-Url': cur.href, 'X-Redirected': redirected ? '1' : '0', 'X-Upstream-Type': type,
      });
      const ra = r.headers.get('retry-after');
      if (ra) h.set('X-Retry-After', ra.slice(0, 40));
      if (!r.body || BINARY.test(type)) {  // pictures, videos and files are not passed on
        if (r.body) r.body.cancel();
        clearTimeout(timer);
        h.set('X-Skipped', '1');
        return new Response(null, { status: 200, headers: h });
      }
      return new Response(r.body.pipeThrough(cap(max)), { status: 200, headers: h });  // the timer keeps guarding the download
    }
    clearTimeout(timer);
    return fail(422, 'The page redirects too many times.');
  } catch (e) {
    clearTimeout(timer);
    return fail(e && e.name === 'AbortError' ? 504 : 502, e && e.name === 'AbortError' ? 'The site took too long to answer.' : `Could not reach ${cur.hostname}.`);
  }
}
