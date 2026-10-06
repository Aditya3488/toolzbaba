// GET /blog/<slug>: one published post. Also /blog/feed.xml (RSS) and /blog/sitemap.xml (for search engines).
import { card, escapeHtml, fmtDate, movedKey, notFound, page, postKey, publishedPosts, readDoc, renderMarkdown, siteUrl } from '../../lib/blog-store.js';

const xml = (body, type) => new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=300' } });
const x = s => escapeHtml(s);

export async function onRequestGet({ request, params, env }) {
  const slug = String(params.slug || ''), base = siteUrl(request);
  if (!env.CDN) return notFound(request, env);

  if (slug === 'feed.xml') {
    const posts = (await publishedPosts(env)).slice(0, 20);
    return xml(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
      `<title>Toolz Baba Blog</title><link>${base}/blog</link><description>Guides, tips and how-tos from Toolz Baba.</description><language>en</language>` +
      `<atom:link href="${base}/blog/feed.xml" rel="self" type="application/rss+xml"/>` +
      posts.map(p => `<item><title>${x(p.title)}</title><link>${base}/blog/${p.slug}</link><guid>${base}/blog/${p.slug}</guid>` +
        `<pubDate>${new Date(p.published).toUTCString()}</pubDate><description>${x(p.desc || '')}</description></item>`).join('') +
      '</channel></rss>', 'application/rss+xml');
  }
  if (slug === 'sitemap.xml') {
    const posts = await publishedPosts(env), day = t => new Date(t).toISOString().slice(0, 10);
    const urls = [[`${base}/blog`, posts[0] ? day(posts[0].updated) : day(Date.now()), '0.6'], ...posts.map(p => [`${base}/blog/${p.slug}`, day(p.updated), '0.6'])];
    return xml('<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map(([u, d, pr]) => `<url><loc>${x(u)}</loc><lastmod>${d}</lastmod><priority>${pr}</priority></url>`).join('') + '</urlset>', 'application/xml');
  }

  const post = /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ? await readDoc(env, postKey(slug), null) : null;
  if (!post || post.status !== 'published' || post.published > Date.now()) {
    const to = /^[a-z0-9-]+$/.test(slug) ? await env.CDN.get(movedKey(slug)) : null;
    if (to) return Response.redirect(`${base}/blog/${to}`, 301);
    return notFound(request, env);
  }

  const md = renderMarkdown(post.body), url = `${base}/blog/${post.slug}`;
  const toc = md.headings.filter(h => h.level <= 3);
  const others = (await publishedPosts(env)).filter(p => p.slug !== post.slug);
  const related = [...others.filter(p => (p.tags || []).some(t => (post.tags || []).includes(t))), ...others].filter((p, i, a) => a.indexOf(p) === i).slice(0, 3);
  const updated = post.updated - post.published > 86400000 ? ` · Updated ${fmtDate(post.updated)}` : '';
  const main = `<article class="post"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span>›</span> <a href="/blog">Blog</a></nav>` +
    `<h1>${x(post.title)}</h1><p class="bmeta">${fmtDate(post.published)}${updated} · ${post.minutes || 1} min read</p>` +
    (post.cover ? `<img class="post-cover" src="${x(post.cover)}" alt="${x(post.coverAlt || '')}" width="1200" height="630" fetchpriority="high">` : '') +
    (toc.length >= 3 ? `<details class="post-toc" open><summary>In this post</summary><ol>${toc.map(h => `<li class="l${h.level}"><a href="#${h.id}">${x(h.text)}</a></li>`).join('')}</ol></details>` : '') +
    `<div class="post-body">${md.html}</div>` +
    ((post.tags || []).length ? `<p class="post-tags">${post.tags.map(t => `<a href="/blog?tag=${encodeURIComponent(t)}">#${x(t)}</a>`).join(' ')}</p>` : '') +
    `<aside class="post-cta"><b>Try the tools for free</b><span>Every Toolz Baba tool runs in your browser, so your files stay on your device.</span><a class="btn sm" href="/">See all tools</a></aside>` +
    `</article>` + (related.length ? `<section class="blog-more"><h2>More from the blog</h2><div class="blog-grid">${related.map(card).join('')}</div></section>` : '');
  const image = post.cover ? (post.cover.startsWith('/') ? base + post.cover : post.cover) : `${base}/assets/og.png`;
  return page(request, env, {
    title: `${post.title} – Toolz Baba Blog`, desc: post.desc, path: `/blog/${post.slug}`, image: post.cover || '', type: 'article',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.desc, image, url, mainEntityOfPage: url,
        datePublished: new Date(post.published).toISOString(), dateModified: new Date(post.updated).toISOString(), keywords: (post.tags || []).join(', '),
        author: { '@type': 'Organization', name: 'Toolz Baba', url: base + '/' },
        publisher: { '@type': 'Organization', name: 'Toolz Baba', logo: { '@type': 'ImageObject', url: base + '/assets/brand/icon-512.png' } } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Toolz Baba', item: base + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: base + '/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: url }] },
    ],
  }, main);
}
