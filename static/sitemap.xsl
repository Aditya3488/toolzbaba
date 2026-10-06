<?xml version="1.0" encoding="UTF-8"?>
<!-- Shows the sitemaps (/sitemap.xml, /blog/sitemap.xml) as a readable page in a browser. Search engines ignore it. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9" exclude-result-prefixes="s">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap – Toolz Baba</title>
        <style>
          :root { --bg:#f6f8fc; --card:#fff; --text:#141a2e; --muted:#5b6478; --border:#e3e8f2; --accent:#0a4ff5; }
          @media (prefers-color-scheme: dark) { :root { --bg:#0b0e1a; --card:#141a2e; --text:#e8ecf7; --muted:#9aa3ba; --border:#252d45; --accent:#6b9bff; } }
          * { box-sizing:border-box; }
          body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
          .wrap { max-width:1000px; margin:0 auto; padding:28px 16px 48px; }
          h1 { font-size:1.6rem; margin:0 0 6px; }
          p { color:var(--muted); margin:0 0 18px; }
          a { color:var(--accent); text-decoration:none; word-break:break-all; } a:hover { text-decoration:underline; }
          .box { background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:auto; }
          table { border-collapse:collapse; width:100%; }
          th, td { padding:10px 14px; text-align:left; border-bottom:1px solid var(--border); }
          th { font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
          tr:last-child td { border-bottom:0; }
          td.n { color:var(--muted); white-space:nowrap; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>Toolz Baba sitemap</h1>
          <p>
            This sitemap lists <xsl:value-of select="count(s:urlset/s:url) + count(s:sitemapindex/s:sitemap)"/> page(s) for search engines.
            <a href="https://toolzbaba.com/">Back to the site</a>
          </p>
          <div class="box">
            <table>
              <tr><th>Page</th><th>Last changed</th><th>Priority</th></tr>
              <xsl:for-each select="s:urlset/s:url | s:sitemapindex/s:sitemap">
                <tr>
                  <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
                  <td class="n"><xsl:value-of select="s:lastmod"/></td>
                  <td class="n"><xsl:value-of select="s:priority"/></td>
                </tr>
              </xsl:for-each>
            </table>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
