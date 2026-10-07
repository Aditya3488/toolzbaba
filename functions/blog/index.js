// GET /blog: the list of published posts, newest first (?page=2 for older ones, ?tag=<name> for one topic).
import { PER_PAGE, card, escapeHtml, page, publishedPosts, siteUrl } from '../../lib/blog-store.js';

// before the first post: a way on to the tools instead of a dead end
const POPULAR = [['compress-image', 'Compress Image'], ['resize-image-to-kb', 'Resize Photo to KB'], ['compress-pdf', 'Compress PDF'], ['merge-pdf', 'Merge PDF'],
  ['remove-background', 'Background Remover'], ['passport-size-photo-maker', 'Passport Photo Maker'], ['pdf-to-jpg', 'PDF to JPG'], ['image-to-text', 'Image to Text (OCR)']];
const EMPTY = '<div class="blog-empty"><p>The first guides are on their way. Meanwhile, these are the tools people use most:</p><div class="chips">' +
  POPULAR.map(([s, n]) => `<a class="chip" href="/${s}">${n}</a>`).join('') + '</div><p style="margin-top:18px"><a class="btn" href="/">See all tools</a></p></div>';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), base = siteUrl(request);
  const tag = (url.searchParams.get('tag') || '').trim().slice(0, 30);
  let posts = env.CDN ? await publishedPosts(env) : [];
  if (tag) posts = posts.filter(p => (p.tags || []).some(t => t.toLowerCase() === tag.toLowerCase()));
  const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const n = Math.min(pages, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const shown = posts.slice((n - 1) * PER_PAGE, n * PER_PAGE);
  const link = p => { const s = new URLSearchParams({ ...(tag ? { tag } : {}), ...(p > 1 ? { page: p } : {}) }).toString(); return s ? '/blog?' + s : '/blog'; };
  const nav = pages > 1 ? `<nav class="blog-pages" aria-label="Pages">${n > 1 ? `<a class="btn sec sm" href="${escapeHtml(link(n - 1))}" rel="prev">← Newer posts</a>` : '<span></span>'}` +
    `<span class="bmeta">Page ${n} of ${pages}</span>${n < pages ? `<a class="btn sec sm" href="${escapeHtml(link(n + 1))}" rel="next">Older posts →</a>` : '<span></span>'}</nav>` : '';
  const title = tag ? `Posts about ${tag}` : 'Blog';
  const main = `<section class="blog-hero"><h1>${escapeHtml(title)}</h1><p>Guides, tips and how-tos for images, PDFs, video and everyday files.</p>` +
    (tag ? '<p><a href="/blog">← All posts</a></p>' : '') + `<p class="blog-rss"><a href="/blog/feed.xml">RSS feed</a></p></section>` +
    (shown.length ? `<div class="blog-grid">${shown.map(card).join('')}</div>${nav}` : EMPTY);
  const path = n > 1 && !tag ? `/blog?page=${n}` : '/blog';
  return page(request, env, {
    title: `${title}${n > 1 ? ` (page ${n})` : ''} – Toolz Baba`, path, noindex: !!tag || !shown.length,
    desc: 'Guides, tips and how-tos from Toolz Baba: compress and convert images, edit PDFs, convert video and more, free and in your browser.',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: 'Toolz Baba Blog', url: base + '/blog',
      blogPost: shown.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${base}/blog/${p.slug}`, datePublished: new Date(p.published).toISOString() })) }],
  }, main);
}
