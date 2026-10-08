// Visual Sitemap Generator: type a website address and get a Miro-style board of its pages, menus, SEO health, tracking
// tags, sales funnel and (for shops) products, plus a chat bot that answers questions about the site. The site_board
// Python package (site_board/ in the repo) runs in the visitor's browser with Pyodide (site-board-worker.js); pages are
// read through /api/site-fetch, since browsers can't read other sites themselves. Nothing is stored on the server.
HT.register('visual-sitemap-generator', root => {
  const el = HT.el;
  const form = HT.form([
    { name: 'url', label: 'Website address', type: 'text', value: '', placeholder: 'https://example.com' },
    { name: 'pages', label: 'Pages to check', type: 'select', value: '200',
      options: [['100', '100 (quickest)'], ['200', '200 (recommended)'], ['300', '300'], ['500', '500 (big sites, slower)']] },
  ]);
  const prog = HT.progress(), go = el('button', { class: 'btn', type: 'button', text: 'Make the sitemap', onclick: run });
  form.ctl.url.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  const setCard = el('div', { class: 'card' }, HT.stepTitle(1, 'Choose a website'), form.el, el('div', { class: 'actions' }, go), prog.el,
    el('p', { class: 'help', style: { marginTop: '10px' }, text: 'Your browser reads the public pages of the site (through our server, which only passes them on) and draws the board. Nothing is saved. A big site takes one to three minutes.' }));
  const info = el('div', { class: 'tinfo', text: 'The board appears here: menu, sections, SEO health, tracking tags and the sales funnel. Then ask the chat about the site.' });
  const acts = el('div', { class: 'actions', style: { margin: 0 } });
  const frame = el('iframe', { title: 'Sitemap board', style: { width: '100%', height: 'min(78vh, 860px)', border: '1px solid var(--line)', borderRadius: '14px', background: '#f7f8fc', display: 'none' } });
  const wrap = el('div', { style: { position: 'relative' } }, frame);
  const main = el('div', { class: 'card tmain' }, el('div', { class: 'tbar' }, info, acts), wrap);
  const bench = HT.bench([setCard], main, { keep: true }); bench.classList.add('on'); root.append(bench);

  let worker = null, seq = 0, busy = false, boardUrl = '', boardName = 'sitemap-board.html', lastPct = 0;
  const waiting = new Map();
  function engine() {
    if (worker) return worker;
    worker = new Worker(HT.ver('/assets/tools/site-board-worker.js'), { type: 'module' });
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'progress') { if (busy) { if (m.f >= 0) lastPct = Math.max(lastPct, m.f * 100); prog.set(lastPct, m.msg); } return; }
      const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id);
      m.type === 'error' ? w.reject(new Error(m.msg)) : w.resolve(m);
    };
    worker.onerror = e => { for (const w of waiting.values()) w.reject(new Error('The sitemap engine stopped' + (e.message ? ': ' + e.message : '.'))); waiting.clear(); worker = null; };
    return worker;
  }
  const call = msg => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); engine().postMessage({ ...msg, id }); });
  const ask = async q => { const m = await call({ type: 'ask', q }); return { answer: m.answer, pages: m.pages || [], highlight: m.highlight || [], follow: m.follow || [] }; };
  const b = (t, fn, cls = 'btn sec sm') => el('button', { class: cls, type: 'button', text: t, onclick: fn });

  async function run() {
    if (busy) return;
    let u = form.values().url.trim(); if (!u) return prog.error('Type a website address first.');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    busy = true; go.disabled = true; acts.textContent = ''; lastPct = 1; prog.set(1, 'Starting...');
    try {
      const m = await call({ type: 'build', url: u, maxPages: +form.values().pages });
      if (m.error) throw new Error(m.error);
      show(m.html, m.summary); prog.clear();
    } catch (e) { prog.error(e.message || 'Could not make the sitemap.'); }
    busy = false; go.disabled = false;
  }

  function show(html, s) {
    if (boardUrl) URL.revokeObjectURL(boardUrl);
    boardUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    boardName = (s.domain || 'site') + '-sitemap-board.html';
    frame.onload = () => { try { frame.contentWindow.SiteBot = ask; } catch { /* the board still works without the chat */ } };
    frame.src = boardUrl; frame.style.display = 'block';
    const bits = [`${s.pages} pages checked`, s.sitemap ? `${s.sitemap.toLocaleString()} in the sitemap` : '', s.products ? `${s.products.toLocaleString()} products` : '',
      `${s.tools} tools and tags`, s.broken ? `${s.broken} broken` : 'no broken links', s.notChecked ? `${s.notChecked} not checked (the site asked us to slow down)` : ''].filter(Boolean);
    info.textContent = `${s.brand || s.domain}${s.platform ? ' (' + s.platform + ')' : ''}: ${bits.join(' · ')}. Made in ${Math.round(s.seconds)} s.`;
    acts.textContent = '';
    acts.append(
      b('Full screen', () => { (wrap.requestFullscreen ? wrap.requestFullscreen() : Promise.reject()).catch(() => { const w = open(boardUrl); if (w) w.addEventListener('load', () => { w.SiteBot = ask; }); }); }),
      b('Download board', () => HT.download(new Blob([html], { type: 'text/html' }), boardName)),
      b('Download report', async () => { const m = await call({ type: 'report' }); HT.download(new Blob([m.json], { type: 'application/json' }), boardName.replace(/-board\.html$/, '-report.json')); }));
  }
  document.addEventListener('fullscreenchange', () => { const full = document.fullscreenElement === wrap; frame.style.height = full ? '100vh' : 'min(78vh, 860px)'; frame.style.borderRadius = full ? '0' : '14px'; });
  return {};
});
