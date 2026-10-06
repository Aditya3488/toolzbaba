// A small, safe Markdown renderer for blog posts, shared by the blog pages (Pages Functions) and the admin preview.
// Everything is escaped first, raw HTML in a post is shown as text, and links/images only accept http(s), site paths,
// #anchors and mailto, so a post can never run a script.
// Supports: # headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`, ``` code blocks ```, [links](url),
// ![images](url "title"), - and 1. lists, > quotes, --- lines and | tables |.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export function safeUrl(u) {
  u = String(u || '').trim();
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^(\/(?!\/)|#)/.test(u)) return u;
  return '';
}

export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');

// inline text: code spans first (their insides are left alone), then images, links, emphasis
function inline(text) {
  const parts = String(text).split(/(`+[^`]*?`+)/);
  return parts.map((p, i) => {
    if (i % 2) return '<code>' + escapeHtml(p.replace(/^`+|`+$/g, '')) + '</code>';
    let s = escapeHtml(p);
    s = s.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, (m, alt, url, title) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      return href ? `<img src="${escapeHtml(href)}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" decoding="async">` : alt;
    });
    s = s.replace(/\[([^\]]+)\]\(\s*([^\s)]+)\s*\)/g, (m, label, url) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      if (!href) return label;
      const ext = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?toolzbaba\.com(\/|$)/i.test(href);
      return `<a href="${escapeHtml(href)}"${ext ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (m, pre, url) => `${pre}<a href="${url}" rel="noopener" target="_blank">${url}</a>`);
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>').replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    return s;
  }).join('');
}

const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

// returns { html, headings: [{ level, text, id }], text } (text: plain words, for descriptions and reading time)
export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [], headings = [], used = new Set(), plain = [];
  let i = 0;
  const isBlockStart = l => /^(#{1,6}\s|```|>\s?|\s*([-*+]|\d+[.)])\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l) || /^\|.*\|\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^```\s*([\w+-]*)\s*$/.exec(line))) {           // code block
      const code = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code${m[1] ? ` class="lang-${escapeHtml(m[1])}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {     // heading (a post's own # becomes h2: the page title is the h1)
      const level = Math.min(6, Math.max(2, m[1].length + (m[1].length === 1 ? 1 : 0)));
      let id = slugify(m[2].replace(/[*_`~]/g, '')) || 'section', n = 2;
      while (used.has(id)) id = slugify(m[2]) + '-' + n++;
      used.add(id);
      const text = m[2].replace(/[*_`~]/g, '');
      headings.push({ level, text, id }); plain.push(text);
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {                                 // quote
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      const inner = renderMarkdown(q.join('\n')); plain.push(inner.text);
      out.push('<blockquote>' + inner.html + '</blockquote>');
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) { // table
      const head = cells(line), align = cells(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c, k) => td('th', c, k)).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + head.map((_, k) => td('td', r[k] || '', k)).join('') + '</tr>').join('') + '</tbody></table></div>');
      plain.push(head.join(' '), ...rows.map(r => r.join(' ')));
      continue;
    }
    if ((m = /^\s*([-*+]|\d+[.)])\s+/.exec(line))) {         // list
      const ordered = /\d/.test(m[1]), items = [];
      const start = ordered ? parseInt(m[1], 10) : 1;
      while (i < lines.length) {
        const lm = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (lm && /\d/.test(lm[1]) === ordered) { items.push(lm[2]); i++; continue; }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      plain.push(...items);
      out.push((ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>` : '<ul>') + items.map(t => '<li>' + inline(t) + '</li>').join('') + (ordered ? '</ol>' : '</ul>'));
      continue;
    }
    const para = [];                                          // paragraph
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
    plain.push(para.join(' '));
    // a paragraph that is only an image becomes a figure (its title, if any, is the caption)
    const body = para.length === 1 ? inline(para[0].trim()) : '';
    if (/^<img [^>]*>$/.test(body)) {
      const t = /title="([^"]*)"/.exec(body);
      out.push('<figure>' + body + (t ? `<figcaption>${t[1]}</figcaption>` : '') + '</figure>');
    } else out.push('<p>' + para.map(inline).join(' ') + '</p>');
  }
  const text = plain.join(' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~#>|]/g, '').replace(/\s+/g, ' ').trim();
  return { html: out.join('\n'), headings, text };
}

export const readingMinutes = text => Math.max(1, Math.round(String(text || '').split(/\s+/).filter(Boolean).length / 220));
