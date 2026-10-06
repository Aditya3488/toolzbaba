// GET /sitemap.xml: the site's pages (dist/sitemap.xml, made by build.py) plus every published blog post, so one sitemap
// lists everything and a new post is in it the moment it is published.
import { publishedPosts } from '../lib/blog-store.js';

export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url));
  let xml = await res.text();
  if (res.ok && env.CDN && xml.includes('</urlset>')) {
    const site = (/<loc>(https?:\/\/[^/<]+)\//.exec(xml) || [, new URL(request.url).origin])[1];
    const posts = await publishedPosts(env).catch(() => []), day = t => new Date(t).toISOString().slice(0, 10);
    if (posts.length) {
      xml = xml.replace(new RegExp(`(<loc>${site}/blog</loc><lastmod>)[^<]*`), `$1${day(Math.max(...posts.map(p => p.updated)))}`);
      xml = xml.replace('</urlset>', posts.map(p => `<url><loc>${site}/blog/${p.slug}</loc><lastmod>${day(p.updated)}</lastmod><priority>0.6</priority></url>`).join('') + '</urlset>');
    }
  }
  return new Response(xml, { status: res.status, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
