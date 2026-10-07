// The blog: posts written in the admin panel (Blog tab), kept in the KV namespace bound as CDN and shown at /blog.
//   blog:index          every post's summary, newest first      [ { slug, title, desc, cover, coverAlt, tags, status, published, updated, minutes } ]
//   blog:post:<slug>    one post                                  { ...summary, body (Markdown), created }
//   blog:moved:<old>    a renamed post's new slug (the old address keeps working with a permanent redirect)
//   blogimg:<id>.<ext>  an image uploaded for a post (kept for good, unlike the image hosting tool's)
// The pages are built from dist/blog-shell.html (made by build.py from static/blog.html, so they get the site's head, Tag
// Manager, header and footer), with the post filled in here. Post bodies go through the safe Markdown renderer.
import { SLUG, fail, json, readDoc, writeDoc } from './admin-store.js';
import { escapeHtml, readingMinutes, renderMarkdown, safeUrl, slugify } from '../static/assets/blog/markdown.js';
export { SLUG, escapeHtml, fail, json, readDoc, renderMarkdown, slugify, writeDoc };

export const INDEX_KEY = 'blog:index', postKey = s => `blog:post:${s}`, movedKey = s => `blog:moved:${s}`;
export const RESERVED = new Set(['images', 'page', 'tag', 'feed', 'rss', 'sitemap', 'admin', 'new']);
export const LIMITS = { title: 140, desc: 300, body: 200000, alt: 200, tags: 8, tag: 30 };
export const MAX_IMAGE_MB = 5, PER_PAGE = 12;
export const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const oneLine = (s, n) => clean(s, n * 2).replace(/\s+/g, ' ').slice(0, n);
export const clip = (s, n = 158) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

// checks and tidies what the admin panel sends; returns { post } or { error }
export function normalizePost(b, slug, old) {
  if (!b || typeof b !== 'object') return { error: 'Send the post as JSON.' };
  if (!SLUG.test(slug) || RESERVED.has(slug)) return { error: 'The address (slug) may use a-z, 0-9 and dashes, and cannot be one of: ' + [...RESERVED].join(', ') + '.' };
  const title = oneLine(b.title, LIMITS.title);
  if (!title) return { error: 'Give the post a title.' };
  const body = clean(b.body, LIMITS.body + 1);
  if (body.length > LIMITS.body) return { error: `The post is too long (${LIMITS.body.toLocaleString('en')} characters at most).` };
  const status = b.status === 'published' ? 'published' : 'draft';
  const cover = safeUrl(clean(b.cover, 500));
  if (b.cover && !cover) return { error: 'The cover image must be an uploaded image or an https:// address.' };
  const tags = [...new Set((Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(','))
    .map(t => oneLine(t, LIMITS.tag)).filter(Boolean))].slice(0, LIMITS.tags);
  const md = renderMarkdown(body), now = Date.now();
  const desc = oneLine(b.desc, LIMITS.desc) || clip(md.text, 158);
  let published = old && old.published || null;
  if (status === 'published' && !published) published = now;
  if (b.published && /^\d{4}-\d{2}-\d{2}$/.test(String(b.published))) {   // the admin may set the date shown on the post
    const t = Date.parse(b.published + 'T09:00:00Z'); if (t && t <= now + 86400000) published = t;
  }
  return { post: { slug, title, desc, body, cover, coverAlt: oneLine(b.coverAlt, LIMITS.alt), tags, status, published,
    updated: now, created: old && old.created || now, minutes: readingMinutes(md.text) } };
}

export const summary = p => ({ slug: p.slug, title: p.title, desc: p.desc, cover: p.cover, coverAlt: p.coverAlt, tags: p.tags,
  status: p.status, published: p.published, updated: p.updated, minutes: p.minutes });
export const sortIndex = list => list.sort((a, b) => (b.published || b.updated) - (a.published || a.updated));
export const readIndex = env => readDoc(env, INDEX_KEY, []);
export const publishedPosts = async env => (await readIndex(env)).filter(p => p.status === 'published' && p.published <= Date.now());

// ------------------------------------------------------------------ pages
const SITE = 'https://toolzbaba.com';
export const siteUrl = request => (new URL(request.url).hostname.endsWith('toolzbaba.com') ? SITE : new URL(request.url).origin);
export const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoDate = t => new Date(t).toISOString();

const absUrl = (base, u) => (u && u.startsWith('/') ? base + u : u);

// fills dist/blog-shell.html: %%TITLE%% %%DESC%% %%PATH%% and the main content; meta = { title, desc, path, image, type, noindex, jsonld }
export async function page(request, env, meta, main, status = 200) {
  const base = siteUrl(request);
  let shell = '';
  try { const r = await env.ASSETS.fetch(new URL('/blog-shell', request.url)); if (r.ok) shell = await r.text(); } catch { /* falls back below */ }
  if (!shell.includes('<!--MAIN-->')) shell = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>%%TITLE%%</title><link rel="stylesheet" href="/assets/app.css"></head><body><main class="blog" id="content"><!--MAIN--></main></body></html>';
  const fill = (s, k, v) => s.split(k).join(v);
  let html = fill(fill(fill(shell, '%%TITLE%%', escapeHtml(meta.title)), '%%DESC%%', escapeHtml(clip(meta.desc || ''))), '%%PATH%%', escapeHtml(meta.path));
  // build.py put the site address in front of %%PATH%%; on a preview address use that address instead
  if (base !== SITE) html = fill(html, SITE + escapeHtml(meta.path), base + escapeHtml(meta.path));
  if (meta.image) html = fill(html, SITE + '/assets/og.png', escapeHtml(absUrl(base, meta.image)));
  if (meta.type) html = html.replace('<meta property="og:type" content="website">', `<meta property="og:type" content="${meta.type}">`);
  if (meta.noindex) html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,follow">');
  const ld = (meta.jsonld || []).map(b => '<script type="application/ld+json">' + JSON.stringify(b).replace(/</g, '\\u003c') + '</script>').join('\n');
  html = html.replace('<!--JSONLD-->', ld).replace('<!--MAIN-->', main);
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate',
    ...(meta.noindex ? { 'X-Robots-Tag': 'noindex' } : {}) } });
}

export function card(p) {
  const img = p.cover
    ? `<img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.coverAlt || '')}" loading="lazy" decoding="async" width="640" height="360">`
    : `<span class="bcard-ph" aria-hidden="true">${escapeHtml(p.title.slice(0, 1).toUpperCase())}</span>`;
  return `<a class="bcard" href="/blog/${p.slug}"><div class="bcard-img">${img}</div><div class="bcard-txt">` +
    `<span class="bmeta">${fmtDate(p.published || p.updated)} · ${p.minutes || 1} min read</span>` +
    `<h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.desc || '')}</p></div></a>`;
}

export const notFound = (request, env) => page(request, env, { title: 'Post not found – Toolz Baba', desc: 'This blog post does not exist.', path: '/blog', noindex: true },
  '<div class="blog-empty"><h1>Post not found</h1><p>This post was moved or removed.</p><p><a class="btn" href="/blog">See all posts</a></p></div>', 404);
