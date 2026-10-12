// GET /sitemap.xml: the site's pages (dist/sitemap.xml, made by build.py) plus every published blog post, so one sitemap
// lists everything and a new post is in it the moment it is published.
import { publishedPosts } from '../lib/blog-store.js';
import { archivedSlugs } from '../lib/admin-store.js';

// a tool the admin has switched off (its page says "taking a break" and asks not to be indexed) leaves the sitemap in every language
export function withoutArchived(xml, slugs) {
  for (const s of slugs) xml = xml.replace(new RegExp(`<url><loc>https?://[^<]*?(?:/[a-z]{2})?/${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}</loc>.*?</url>\\n?`, 'g'), '');
  return xml;
}

export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url));
  let xml = await res.text();
  if (res.ok && env.CDN && xml.includes('</urlset>')) xml = withoutArchived(xml, await archivedSlugs(env).catch(() => []));
  if (res.ok && env.CDN && xml.includes('</urlset>')) {
    const site = (/<loc>(https?:\/\/[^/<]+)\//.exec(xml) || [, new URL(request.url).origin])[1];
    const posts = await publishedPosts(env).catch(() => []), day = t => new Date(t).toISOString().slice(0, 10);
    if (posts.length) {
      xml = xml.replace(new RegExp(`(<loc>${site}/blog</loc><lastmod>)[^<]*`), `$1${day(Math.max(...posts.map(p => p.updated)))}`);
      xml = xml.replace('</urlset>', posts.map(p => `<url><loc>${site}/blog/${p.slug}</loc><lastmod>${day(p.updated)}</lastmod><priority>0.6</priority></url>`).join('') + '</urlset>');
    }
  }
  if (res.ok && env.CDN && xml.includes('</urlset>') && !(await publishedPosts(env).catch(() => [])).length) xml = xml.replace(/<url><loc>[^<]*\/blog<\/loc>[^\n]*?<\/url>\n?/, '');
  return new Response(xml, { status: res.status, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
