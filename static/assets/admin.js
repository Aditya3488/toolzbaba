// Admin panel: archive / go live, the blog, what real visitors experience, lab tests that open every tool and try it, history.
// Signing in (POST /api/admin/login) gives this browser a session cookie that page scripts can't read; the password itself is
// never stored. Every call sends X-Requested-With so other websites can't act with that cookie. Nothing here is loaded by the public pages.
(() => {
  const el = HT.el, $app = document.getElementById('app');
  const S = { tools: [], cats: [], rows: [], status: { tools: {} }, log: [], rum: null, edges: [], maxWrites: 700, lab: {}, tab: 'tools', q: '', cat: '', show: 'all', size: false, sort: 'order', dir: 1, sel: new Set(), labBusy: false, labStop: false };

  const api = async (path, method = 'GET', body) => {
    const r = await fetch('/api/admin/' + path, { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'toolzbaba-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.detail || 'Error ' + r.status); e.status = r.status; throw e; }
    return j;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmtMs = v => (v == null ? '–' : v < 1000 ? Math.round(v) + ' ms' : (v / 1000).toFixed(v < 10000 ? 1 : 0) + ' s');
  const fmtKB = b => (b == null ? '–' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const pill = (cls, text, title) => el('span', { class: 'adm-pill ' + cls, text, title: title || null });
  // good / needs work / poor, with the limits Google uses for the Core Web Vitals
  const LIMITS = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000], load: [3000, 6000], inp: [200, 500], ready: [2500, 5000], cls: [0.1, 0.25], weight: [1.2e6, 3.5e6] };
  const rate = (k, v) => (v == null ? '' : v <= LIMITS[k][0] ? 'good' : v <= LIMITS[k][1] ? 'mid' : 'poor');
  const rated = (k, v, text) => (v == null ? el('span', { text: '–', style: { color: 'var(--faint)' } }) : pill(rate(k, v), text));
  const pctl = (h, q) => { const n = h.reduce((a, b) => a + b, 0); if (!n) return null; let acc = 0; for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= q * n) return i < S.edges.length ? S.edges[i] : S.edges[S.edges.length - 1] * 2; } return null; };
  const heavyEngine = e => ['ai', 'video', 'speech'].includes(e);
  const toast = m => HT.toast(m);

  // ------------------------------------------------------------------ sign in
  function login(msg) {
    $app.textContent = '';
    const id = el('input', { type: 'text', placeholder: 'ID', autocomplete: 'username', 'aria-label': 'ID', autocapitalize: 'off', spellcheck: 'false' });
    const input = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' }), err = el('div', { class: 'adm-msg', text: msg || '' });
    const go = async e => {
      e && e.preventDefault(); const key = input.value, user = id.value.trim(); if (!key) return;
      try { await api('login', 'POST', { user, key }); input.value = ''; try { localStorage.setItem('tz_admin', '1'); } catch { } boot(); }
      catch (x) { input.value = ''; err.textContent = x.status === 503 || x.status === 429 || x.status === 401 || x.status === 403 ? x.message : 'Could not reach the server: ' + x.message; }
    };
    $app.append(el('form', { class: 'adm-login', onsubmit: go }, el('h1', { text: 'Toolz Baba admin' }), el('p', { text: 'Sign in to continue.' }), id, input, err, el('button', { class: 'btn', type: 'submit', text: 'Sign in' })));
    id.focus();
  }
  async function logout() { try { await api('logout', 'POST'); } catch { } try { localStorage.removeItem('tz_admin'); } catch { } login(); }

  // ------------------------------------------------------------------ data
  async function boot() {
    $app.textContent = ''; $app.append(el('div', { class: 'adm-wrap' }, el('p', { class: 'adm-note', text: 'Loading...' })));
    try {
      const [tools, st, rum, lab, errs, csp] = await Promise.all([fetch('/assets/tools.json', { cache: 'no-cache' }).then(r => r.json()), api('status'), api('rum'), api('lab'), api('errors'), api('csp')]);
      S.cats = tools.categories; S.tools = tools.tools; S.variants = tools.variants || [];
      S.status = st.status || { tools: {} }; S.log = st.log || []; S.rum = rum.rum; S.edges = rum.edges; S.maxWrites = rum.maxWrites; S.errors = errs.errors; S.errMax = errs.maxWrites; S.errKeep = errs.keepDays; S.csp = csp.csp; S.cspMax = csp.maxWrites; S.cspKeep = csp.keepDays; S.lab = lab.lab || {};
      buildRows(); draw();
    } catch (e) { if (e.status === 401) return login(e.message === 'Please sign in.' ? '' : e.message); if (e.status === 503 || e.status === 429) return login(e.message); $app.textContent = ''; $app.append(el('div', { class: 'adm-wrap' }, el('p', { class: 'adm-note', text: 'Could not load: ' + e.message }), el('button', { class: 'btn sm', text: 'Try again', onclick: boot }))); }
  }
  function buildRows() {
    const rows = [];
    S.tools.filter(t => !t.href).forEach((t, i) => {
      rows.push({ slug: t.slug, name: t.name, cat: t.cat, icon: t.slug, kind: t.kind, engine: t.engine, heavy: heavyEngine(t.engine), href: '/' + t.slug, level: 0, order: rows.length, base: null, codeArchived: !!t.archived, js: t.js, ui: t.ui, accept: null });
      for (const v of S.variants.filter(v => v.base === t.slug)) rows.push({ slug: v.slug, name: v.name, cat: t.cat, icon: t.slug, kind: t.kind, engine: v.engine || t.engine, heavy: heavyEngine(v.engine || t.engine), href: '/' + v.slug, level: 1, order: rows.length, base: t.slug, size: v.group === 'size', codeArchived: !!(t.archived || v.archived) });
    });
    S.rows = rows;
  }
  const kv = slug => S.status.tools[slug];
  const stateOf = r => (kv(r.slug) ? { arch: true, by: 'admin', note: kv(r.slug).note, at: kv(r.slug).at } : r.base && kv(r.base) ? { arch: true, by: 'parent', note: kv(r.base).note } : r.codeArchived ? { arch: true, by: 'code' } : { arch: false });
  const rumOf = slug => (S.rum && S.rum.tools[slug]) || null;

  // ------------------------------------------------------------------ the page
  function draw() {
    $app.textContent = '';
    const asAdmin = (() => { try { return !!localStorage.getItem('tz_admin'); } catch { return true; } })();
    const view = el('button', { class: 'btn sec sm', type: 'button', title: 'In this browser: see the site the way visitors see it (archived tools hidden), or the way you see it (everything)', text: asAdmin ? 'Viewing site as admin' : 'Viewing site as visitor', onclick: () => { try { asAdmin ? localStorage.removeItem('tz_admin') : localStorage.setItem('tz_admin', '1'); } catch { } toast(asAdmin ? 'Now you see the site like a visitor' : 'Now you see everything'); draw(); } });
    $app.append(el('div', { class: 'adm-top' }, el('div', { class: 'adm-top-in' }, el('h1', {}, el('img', { src: '/assets/brand/mark-64.png', alt: '' }), 'Toolz Baba admin'), el('span', { class: 'sp' }),
      el('a', { class: 'btn sec sm', href: '/', target: '_blank', rel: 'noopener', text: 'Open the site' }), view, el('button', { class: 'btn ghost sm', type: 'button', text: 'Sign out', onclick: logout }))));
    const wrap = el('div', { class: 'adm-wrap' }); $app.append(wrap);
    const live = S.rows.filter(r => !r.level && !stateOf(r).arch).length, arch = S.rows.filter(r => !r.level && stateOf(r).arch).length, labRows = S.rows.filter(r => S.lab[r.slug]);
    const failing = labRows.filter(r => labState(S.lab[r.slug]) === 'fail').length, views = S.rum ? Object.values(S.rum.tools).reduce((a, t) => a + t.views, 0) : 0;
    const slow = S.rum && Object.entries(S.rum.tools).filter(([, t]) => t.views >= 3).map(([s, t]) => [s, pctl(t.h.lcp, 0.75)]).filter(x => x[1]).sort((a, b) => b[1] - a[1])[0];
    const card = (n, l) => el('div', { class: 'adm-card' }, el('b', { text: String(n) }), el('span', { text: l }));
    wrap.append(el('div', { class: 'adm-cards' }, card(live, 'tools live'), card(arch, 'tools archived'), card(labRows.length ? labRows.length : '–', 'tested in the lab'), card(labRows.length ? failing : '–', 'failing their last test'), card(views || '–', 'visitor page views measured'), card(slow ? slow[0] + ' (' + fmtMs(slow[1]) + ')' : '–', 'slowest to show (LCP, 75% of visits)')));
    const tabs = [['tools', 'Tools'], ['blog', 'Blog'], ['rum', 'Real visitors'], ['index', 'Google index'], ['errors', 'Errors'], ['csp', 'CSP reports'], ['lab', 'Lab tests'], ['log', 'History'], ['help', 'Help']];
    wrap.append(el('div', { class: 'adm-tabs', role: 'tablist' }, tabs.map(([id, t]) => el('button', { class: 'adm-tab' + (S.tab === id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': S.tab === id ? 'true' : 'false', text: t, onclick: () => { S.tab = id; draw(); } }))));
    const body = el('div', { id: 'adm-body' }); wrap.append(body);
    ({ tools: drawTools, blog: drawBlog, rum: drawRum, index: drawIndex, errors: drawErrors, csp: drawCsp, lab: drawLab, log: drawLog, help: drawHelp })[S.tab](body);
  }

  // ---- tools: archive / go live
  const labState = l => (!l ? '' : l.errors && l.errors.length ? 'fail' : l.run && l.run.state === 'fail' ? 'fail' : l.ready == null ? 'fail' : l.run && l.run.state === 'warn' ? 'warn' : 'ok');
  function filtered() {
    const q = S.q.trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
    let rows = S.rows.filter(r => (S.size || !r.size) && (!S.cat || r.cat === S.cat) && words.every(w => (r.name + ' ' + r.slug).toLowerCase().includes(w)));
    if (S.show === 'live') rows = rows.filter(r => !stateOf(r).arch); else if (S.show === 'arch') rows = rows.filter(r => stateOf(r).arch);
    else if (S.show === 'fail') rows = rows.filter(r => labState(S.lab[r.slug]) === 'fail'); else if (S.show === 'slow') rows = rows.filter(r => { const t = rumOf(r.slug); return t && rate('lcp', pctl(t.h.lcp, 0.75)) === 'poor'; });
    else if (S.show === 'untested') rows = rows.filter(r => !S.lab[r.slug]);
    const val = r => ({ order: r.order, name: r.name.toLowerCase(), views: (rumOf(r.slug) || { views: -1 }).views, ready: (S.lab[r.slug] || {}).ready ?? -1, weight: (S.lab[r.slug] || {}).bytes ?? -1, lcp: (rumOf(r.slug) ? pctl(rumOf(r.slug).h.lcp, 0.75) : null) ?? -1 })[S.sort];
    return S.sort === 'order' ? rows : rows.slice().sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * S.dir);
  }
  function drawTools(body) {
    const search = el('input', { type: 'search', placeholder: 'Search tools...', value: S.q, 'aria-label': 'Search tools', oninput: e => { S.q = e.target.value; list(); } });
    const cat = el('select', { 'aria-label': 'Category', onchange: e => { S.cat = e.target.value; list(); } }, el('option', { value: '', text: 'All categories' }), S.cats.map(c => el('option', { value: c.id, text: c.name, selected: S.cat === c.id ? 'selected' : null })));
    const show = el('select', { 'aria-label': 'Show', onchange: e => { S.show = e.target.value; list(); } }, [['all', 'All'], ['live', 'Live'], ['arch', 'Archived'], ['fail', 'Failing last test'], ['slow', 'Slow for visitors'], ['untested', 'Never tested']].map(([v, t]) => el('option', { value: v, text: t, selected: S.show === v ? 'selected' : null })));
    const size = el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: S.size, onchange: e => { S.size = e.target.checked; list(); } }), 'Include the "under X KB" size pages');
    body.append(el('p', { class: 'adm-note', text: 'Archive hides a tool from the home page, search and menus, and its address shows "taking a break". It takes effect for visitors within about 10 minutes (browsers keep the list that long). Tabs of an archived tool are hidden with it. You always see everything while "Viewing site as admin" is on.' }),
      el('div', { class: 'adm-bar' }, search, cat, show, size));
    const holder = el('div'); body.append(holder);
    const selBar = el('div', { class: 'adm-sel', style: { display: 'none' } }); body.append(selBar);
    function list() {
      const rows = filtered(); holder.textContent = '';
      const th = (t, key, cls = '') => el('th', { class: 's ' + cls, title: 'Sort', onclick: () => { if (S.sort === key) S.dir = -S.dir; else { S.sort = key; S.dir = key === 'name' ? 1 : -1; } list(); } }, t + (S.sort === key ? (S.dir > 0 ? ' ▲' : ' ▼') : ''));
      const all = el('input', { type: 'checkbox', 'aria-label': 'Select all shown', checked: rows.length && rows.every(r => S.sel.has(r.slug)), onchange: e => { rows.forEach(r => (e.target.checked ? S.sel.add(r.slug) : S.sel.delete(r.slug))); list(); } });
      const table = el('table', { class: 'adm-t' }, el('thead', {}, el('tr', {}, el('th', {}, all), th('Tool', 'name'), el('th', { text: 'Runs' }), th('Weight', 'weight', 'num'), th('Ready', 'ready', 'num'), el('th', { text: 'Last test' }), th('Visits', 'views', 'num'), th('LCP', 'lcp', 'num'), el('th', { text: 'Status' }), el('th', { text: '' }))));
      const tb = el('tbody'); table.append(tb);
      for (const r of rows) {
        const st = stateOf(r), lab = S.lab[r.slug], t = rumOf(r.slug), lcp = t ? pctl(t.h.lcp, 0.75) : null, cb = el('input', { type: 'checkbox', 'aria-label': 'Select ' + r.name, checked: S.sel.has(r.slug), onchange: e => { e.target.checked ? S.sel.add(r.slug) : S.sel.delete(r.slug); sel(); } });
        const stCell = st.arch ? pill('arch', st.by === 'code' ? 'Archived (in code)' : st.by === 'parent' ? 'Archived (with its tool)' : 'Archived', st.note || '') : pill('live', 'Live');
        const act = st.by === 'admin' ? el('button', { class: 'btn sm', type: 'button', text: 'Make live', onclick: () => change([r.slug], 'live') }) : st.arch ? el('span', { class: 'adm-small', text: st.by === 'code' ? 'set in tools.json' : 'via its tool' }) : el('button', { class: 'btn sec sm', type: 'button', text: 'Archive', onclick: () => change([r.slug], 'archived') });
        tb.append(el('tr', { class: (st.arch ? 'arch ' : '') + (r.level ? 'sub' : '') }, el('td', {}, cb),
          el('td', { class: 'l' }, el('div', { class: 'nm' }, el('span', { class: 'ic', style: { width: '26px', height: '26px', flex: 'none' } }, HT.toolIcon(r.icon)), el('div', {}, el('b', { text: (r.level ? '↳ ' : '') + r.name }), el('small', {}, el('a', { href: r.href, target: '_blank', rel: 'noopener', text: r.href }), st.note ? '  ·  ' + st.note : '')))),
          el('td', {}, pill('', r.heavy ? 'Heavy (AI / video)' : r.kind === 'client' ? 'Browser' : 'Server')),
          el('td', { class: 'num' }, lab && lab.bytes != null ? rated('weight', lab.bytes, fmtKB(lab.bytes)) : '–'),
          el('td', { class: 'num' }, lab && lab.ready != null ? rated('ready', lab.ready, fmtMs(lab.ready)) : '–'),
          el('td', {}, lab ? labBadge(lab) : el('span', { text: 'never', style: { color: 'var(--faint)' } })),
          el('td', { class: 'num', text: t ? String(t.views) : '–' }),
          el('td', { class: 'num' }, rated('lcp', lcp, fmtMs(lcp))),
          el('td', {}, stCell), el('td', { class: 'act' }, el('div', { class: 'adm-btns' }, act, el('button', { class: 'btn ghost sm', type: 'button', text: 'Test', title: 'Open it in the lab and try it', onclick: () => { S.tab = 'lab'; S.labPick = [r.slug]; draw(); } })))));
      }
      if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: 10, text: 'Nothing matches.', style: { padding: '24px', textAlign: 'center', color: 'var(--muted)' } })));
      holder.append(el('div', { class: 'adm-tablewrap' }, table)); sel();
    }
    function sel() {
      const n = S.sel.size; selBar.style.display = n ? 'flex' : 'none'; selBar.textContent = ''; if (!n) return;
      const note = el('input', { type: 'text', placeholder: 'Why? (only you see this)', maxlength: 200, 'aria-label': 'Note' });
      selBar.append(el('b', { text: n + ' selected' }), note, el('button', { class: 'btn sm', type: 'button', text: 'Archive', onclick: () => change([...S.sel], 'archived', note.value) }), el('button', { class: 'btn sec sm', type: 'button', text: 'Make live', onclick: () => change([...S.sel], 'live') }),
        el('button', { class: 'btn sec sm', type: 'button', text: 'Test them', onclick: () => { S.tab = 'lab'; S.labPick = [...S.sel]; draw(); } }), el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { S.sel.clear(); list(); } }));
    }
    list();
  }
  function labBadge(l) {
    const s = labState(l), run = l.run, txt = s === 'fail' ? (l.errors && l.errors.length ? 'Errors' : run && run.state === 'fail' ? 'Run failed' : 'Did not load') : s === 'warn' ? 'OK (note)' : run && run.state === 'ok' ? 'Passed' : run && run.state === 'skip' ? 'Loads OK' : 'Loads OK';
    return el('span', {}, pill(s === 'fail' ? 'fail' : s === 'warn' ? 'warn' : 'ok', txt, [l.errors && l.errors.join(' | '), run && run.msg].filter(Boolean).join('\n') || null), ' ', el('span', { class: 'adm-small', text: ago(l.at) }));
  }
  async function change(slugs, state, note) {
    const dependants = state === 'archived' ? S.rows.filter(r => r.base && slugs.includes(r.base)).length : 0;
    const ok = await ask(state === 'archived' ? 'Archive ' + (slugs.length === 1 ? (S.rows.find(r => r.slug === slugs[0]) || { name: slugs[0] }).name : slugs.length + ' tools') + '?' : 'Make ' + (slugs.length === 1 ? (S.rows.find(r => r.slug === slugs[0]) || { name: slugs[0] }).name : slugs.length + ' tools') + ' live again?',
      state === 'archived' ? 'Visitors will see "taking a break" at its address and it disappears from the home page and search' + (dependants ? ' (also ' + dependants + ' tab page' + (dependants > 1 ? 's' : '') + ')' : '') + '. You can undo this at any time.' : 'It comes back for visitors within about 10 minutes.', state === 'archived' ? (note || '') : undefined);
    if (!ok) return;
    try { const j = await api('status', 'POST', { slugs, state, note: ok.note ?? note }); S.status = j.status; S.log = j.log; S.sel.clear(); toast(state === 'archived' ? 'Archived' : 'Live again'); draw(); }
    catch (e) { toast(e.message); }
  }
  function ask(title, text, note) {
    return new Promise(res => {
      const input = note !== undefined ? el('input', { type: 'text', placeholder: 'Why? (only you see this)', value: note || '', maxlength: 200, 'aria-label': 'Note' }) : null;
      const d = el('dialog', { class: 'adm-dlg' }, el('h3', { text: title }), el('div', { class: 'help', text: text }), input, el('div', { class: 'actions', style: { justifyContent: 'flex-end', margin: 0 } }, el('button', { class: 'btn ghost sm', type: 'button', text: 'Cancel', onclick: () => d.close('no') }), el('button', { class: 'btn sm', type: 'button', text: 'Yes', onclick: () => d.close('yes') })));
      d.addEventListener('close', () => { const yes = d.returnValue === 'yes'; d.remove(); res(yes ? { note: input ? input.value : undefined } : null); }); document.body.append(d); d.showModal();
    });
  }

  // ---- real visitors
  function drawRum(body) {
    const r = S.rum;
    body.append(el('p', { class: 'adm-note', text: 'What visitors really experienced. About 1 page view in 10 sends one small message with the speed numbers the browser measured, when the visitor leaves (no IP address, no file names, nothing typed). Numbers are estimates: "75% of visits were faster than this". LCP = how long until the main content shows, INP = how quickly the page answers clicks, CLS = how much the layout jumps.' }));
    if (!r || !Object.keys(r.tools).length) { body.append(el('div', { class: 'adm-card' }, el('b', { text: 'No data yet' }), el('span', { text: 'Visitors\' browsers send their first numbers soon after the site is live. Visit a few tool pages in a normal (not admin) browser to see them appear.' }))); return; }
    const rows = Object.entries(r.tools).map(([slug, t]) => ({ slug, t, name: (S.rows.find(x => x.slug === slug) || { name: slug === 'home' ? 'Home page' : slug }).name }));
    const total = rows.reduce((a, x) => a + x.t.views, 0);
    body.append(el('div', { class: 'adm-bar' }, el('span', { class: 'adm-small', text: 'Counting since ' + new Date(r.since).toLocaleString() + ' · ' + total + ' page views · saved ' + r.writes + ' of ' + S.maxWrites + ' times today (daily limit)' }), el('span', { class: 'sp' }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Start counting again', onclick: async () => { if (!(await ask('Reset the visitor numbers?', 'This deletes all collected numbers. New ones start collecting at once.'))) return; await api('rum', 'DELETE'); S.rum = null; draw(); } })));
    const sortKey = S.rumSort || 'views'; const dirn = S.rumDir || -1;
    const val = x => ({ views: x.t.views, lcp: pctl(x.t.h.lcp, 0.75) ?? -1, inp: pctl(x.t.h.inp, 0.75) ?? -1, ttfb: pctl(x.t.h.ttfb, 0.75) ?? -1, err: x.t.views ? x.t.errors / x.t.views : 0, fail: x.t.runs ? x.t.runErr / x.t.runs : 0, name: x.name.toLowerCase() })[sortKey];
    rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dirn);
    const th = (t, key, cls) => el('th', { class: 's ' + (cls || ''), onclick: () => { if (S.rumSort === key) S.rumDir = -dirn; else { S.rumSort = key; S.rumDir = key === 'name' ? 1 : -1; } draw(); } }, t + (sortKey === key ? (dirn > 0 ? ' ▲' : ' ▼') : ''));
    const tb = el('tbody');
    for (const { slug, t, name } of rows) {
      const p = (k, q = 0.75) => pctl(t.h[k], q), runOk = t.runs - t.runErr, cls = t.clsN ? t.cls / t.clsN : null;
      tb.append(el('tr', {}, el('td', { class: 'l' }, el('b', { text: name }), el('small', { class: 'adm-small', text: '  ' + slug })), el('td', { class: 'num', text: String(t.views) }), el('td', { class: 'num', text: t.views ? Math.round(100 * t.mobile / t.views) + '%' : '–' }),
        el('td', {}, rated('ttfb', p('ttfb'), fmtMs(p('ttfb')))), el('td', {}, rated('fcp', p('fcp'), fmtMs(p('fcp')))), el('td', {}, rated('lcp', p('lcp'), fmtMs(p('lcp')))), el('td', {}, rated('ready', p('ready'), fmtMs(p('ready')))), el('td', {}, rated('inp', p('inp'), fmtMs(p('inp')))), el('td', {}, rated('cls', cls, cls == null ? '' : cls.toFixed(2))),
        el('td', { class: 'num', text: t.views ? (100 * t.errors / t.views).toFixed(0) + '' : '–', title: 'JS errors per 100 page views' }), el('td', { class: 'num', text: String(t.runs || '–') }), el('td', {}, t.runs ? pill(t.runErr / t.runs > 0.2 ? 'poor' : t.runErr / t.runs > 0.05 ? 'mid' : 'good', Math.round(100 * runOk / t.runs) + '% ok') : '–'), el('td', { class: 'num', text: fmtMs(pctl(t.h.run, 0.5)) })));
    }
    body.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t', style: { minWidth: '1100px' } }, el('thead', {}, el('tr', {}, th('Page / tool', 'name'), th('Views', 'views', 'num'), el('th', { class: 'num', text: 'Phone' }), th('Server', 'ttfb'), el('th', { text: 'First paint' }), th('LCP', 'lcp'), el('th', { text: 'Tool ready' }), th('INP', 'inp'), el('th', { text: 'CLS' }), th('Errors', 'err', 'num'), el('th', { class: 'num', text: 'Runs' }), th('Run success', 'fail'), el('th', { class: 'num', text: 'Typical run' }))), tb)));
  }

  // ---- JavaScript errors visitors reported (functions/api/errors.js, lib/error-store.js)
  const top3 = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ') || '–';
  function drawErrors(body) {
    const r = S.errors;
    body.append(el('p', { class: 'adm-note', text: 'JavaScript errors visitors hit, grouped by message and place. A browser sends at most 5 kinds per page view, after removing quoted text (file names), e-mails, long numbers and the query part of addresses; errors from browser extensions are left out. Kept ' + S.errKeep + ' days.' }));
    if (!r || !Object.keys(r.groups || {}).length) { body.append(el('div', { class: 'adm-card' }, el('b', { text: 'No errors recorded' }), el('span', { text: 'Either none happened, or the site was deployed a moment ago: browsers report errors as they happen.' }))); return; }
    const rows = Object.values(r.groups).sort((a, b) => b.last - a.last);
    body.append(el('div', { class: 'adm-bar' }, el('span', { class: 'adm-small', text: `Since ${new Date(r.since).toLocaleString()} · ${rows.length} kind(s) · saved ${r.writes} of ${S.errMax} times today` }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear the list', onclick: async () => { if (!(await ask('Clear the error list?', 'New errors are recorded at once.'))) return; await api('errors', 'DELETE'); S.errors = null; draw(); } })));
    const tb = el('tbody');
    for (const g of rows) tb.append(el('tr', {}, el('td', { class: 'l' }, el('b', { text: g.msg }), el('small', { class: 'adm-small', text: ' ' + (g.src || 'inline') + (g.line ? ':' + g.line + ':' + g.col : '') }),
      g.stack ? el('details', {}, el('summary', { class: 'adm-small', text: 'stack' }), el('pre', { class: 'adm-small', style: { whiteSpace: 'pre-wrap' }, text: g.stack })) : null),
      el('td', { class: 'num', text: String(g.count) }), el('td', { text: top3(g.pages) }), el('td', { text: top3(g.browsers) }), el('td', { text: top3(g.versions) }), el('td', { text: ago(g.last), title: new Date(g.last).toLocaleString() })));
    body.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t' }, el('thead', {}, el('tr', {}, el('th', { text: 'Error' }), el('th', { class: 'num', text: 'Times' }), el('th', { text: 'Pages' }), el('th', { text: 'Browsers' }), el('th', { text: 'Builds' }), el('th', { text: 'Last' }))), tb)));
  }

  // ---- Content-Security-Policy reports (the policy is report-only: deploy/pages/_headers, functions/api/csp-report.js)
  function drawCsp(body) {
    const r = S.csp;
    body.append(el('p', { class: 'adm-note', text: 'What the Content-Security-Policy would have blocked if it were enforced (it only reports for now). Each row is one directive, one blocked source and one page. Entries from this site itself or "inline" need a fix before the policy can be enforced; unknown hosts are usually tags Google Tag Manager injects, or browser extensions. Kept ' + S.cspKeep + ' days.' }));
    if (!r || !Object.keys(r.groups || {}).length) { body.append(el('div', { class: 'adm-card' }, el('b', { text: 'No reports' }), el('span', { text: 'Nothing would have been blocked, or the policy was deployed a moment ago.' }))); return; }
    const rows = Object.values(r.groups).sort((a, b) => b.count - a.count);
    body.append(el('div', { class: 'adm-bar' }, el('span', { class: 'adm-small', text: `Since ${new Date(r.since).toLocaleString()} · ${rows.length} kind(s) · saved ${r.writes} of ${S.cspMax} times today` }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Clear the list', onclick: async () => { if (!(await ask('Clear the CSP reports?', 'New reports are recorded at once.'))) return; await api('csp', 'DELETE'); S.csp = null; draw(); } })));
    const kind = g => (g.blocked === 'inline' || g.blocked === 'eval' || g.blocked.startsWith('/') ? pill('bad', 'ours', 'From this site: fix before enforcing') : /google|doubleclick|gstatic|clarity|hotjar|facebook/.test(g.blocked) ? pill('warn', 'tag', 'A tag or its helper') : pill('', 'other', 'Unknown host: an extension or an injected script'));
    const tb = el('tbody');
    for (const g of rows) tb.append(el('tr', {}, el('td', {}, kind(g)), el('td', { text: g.directive }), el('td', { class: 'l', text: g.blocked }), el('td', { text: g.doc }), el('td', { text: (g.source || '') + (g.line ? ':' + g.line : '') }), el('td', { class: 'adm-small', text: g.sample || '' }), el('td', { class: 'num', text: String(g.count) }), el('td', { text: ago(g.last) })));
    body.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t' }, el('thead', {}, el('tr', {}, el('th', { text: '' }), el('th', { text: 'Directive' }), el('th', { text: 'Blocked' }), el('th', { text: 'Page' }), el('th', { text: 'Source' }), el('th', { text: 'Sample' }), el('th', { class: 'num', text: 'Times' }), el('th', { text: 'Last' }))), tb)));
  }

  // ---- Google index: which pages of the sitemap Google has in its index (URL Inspection API, functions/api/admin/google-index.js)
  const LANGS = ['hi', 'bn', 'es', 'pt', 'id', 'fr', 'de', 'ru', 'ja', 'tr', 'vi', 'it', 'ar', 'pl'];
  const langOf = u => { const p = new URL(u).pathname.split('/')[1]; return LANGS.includes(p) ? p : 'en'; };
  const I = { loaded: false, busy: false, stop: false, urls: [], results: {}, filter: 'all', lang: '', q: '', logLines: [], recheckIndexed: (() => { try { return !!localStorage.getItem('tz_idx_recheck'); } catch { return false; } })() };
  const idxState = r => (!r ? 'none' : r.e ? 'error' : r.v === 'PASS' ? 'yes' : 'no');
  const idxPill = r => { const s = idxState(r); return s === 'yes' ? pill('good', 'Indexed') : s === 'no' ? pill(r.v === 'FAIL' ? 'poor' : 'mid', 'Not indexed') : s === 'error' ? pill('poor', 'Check failed', r.e) : pill('', 'Not checked'); };
  const gscLink = u => 'https://search.google.com/search-console/inspect?resource_id=' + encodeURIComponent(I.site || 'sc-domain:' + location.host.replace(/^www\./, '')) + '&id=' + encodeURIComponent(u);
  async function loadIndex() {
    const [st, xml] = await Promise.all([api('google-index'), fetch('/sitemap.xml', { cache: 'no-cache' }).then(r => r.text())]);
    Object.assign(I, { setup: st.setup, problem: st.problem, email: st.email, site: st.site || I.site, limit: st.limit, perCall: st.perCall, results: st.index.results || {}, used: st.index.used || 0, updated: st.index.updated });
    const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()))];
    // English pages first (the home page and the tools lead), then each language
    I.urls = urls.map((u, i) => [u, i]).sort((a, b) => (langOf(a[0]) === 'en' ? 0 : 1) - (langOf(b[0]) === 'en' ? 0 : 1) || a[1] - b[1]).map(x => x[0]);
    I.loaded = true;
  }
  function drawIndex(body) {
    if (!I.loaded) {
      body.append(el('p', { class: 'adm-note', text: 'Loading the sitemap and the results kept so far...' }));
      loadIndex().then(() => S.tab === 'index' && draw()).catch(e => { body.textContent = ''; body.append(el('p', { class: 'adm-note', text: 'Could not load: ' + e.message }), el('button', { class: 'btn sm', type: 'button', text: 'Try again', onclick: () => draw() })); });
      return;
    }
    body.append(el('p', { class: 'adm-note', text: 'Asks Google itself, for every address in /sitemap.xml, whether it is in Google\'s index and if not, why (the same answer as "URL inspection" in Search Console). Google allows ' + I.limit + ' checks a day, so the whole sitemap takes a few days: results are kept here and "Continue checking" always carries on where the last run stopped. Pages already indexed are not checked again (unless you tick "Also re-check indexed pages"), so no check is wasted. English pages are checked first.' }));
    if (!I.setup) { body.append(indexSetup()); return; }
    const all = I.urls.map(u => [u, I.results[u]]), count = s => all.filter(([, r]) => idxState(r) === s).length;
    const yes = count('yes'), no = count('no'), none = count('none'), err = count('error'), left = Math.max(0, I.limit - I.used);
    const card = (n, l, f) => el('button', { type: 'button', class: 'adm-card', 'data-k': f, style: { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', outline: I.filter === f ? '2px solid var(--accent)' : null }, onclick: () => { I.filter = I.filter === f ? 'all' : f; draw(); } }, el('b', { text: String(n) }), el('span', { text: l }));
    body.append(el('div', { class: 'adm-cards' }, card(I.urls.length, 'addresses in the sitemap', 'all'), card(yes, 'indexed by Google', 'yes'), card(no, 'not indexed', 'no'), card(none, 'not checked yet', 'none'), card(err, 'checks that failed', 'error'),
      el('div', { class: 'adm-card', 'data-k': 'left' }, el('b', { text: String(left) }), el('span', { text: 'checks left today (of ' + I.limit + ')' }))));
    // why pages are not indexed, as Google words it
    const reasons = {}; for (const [, r] of all) if (idxState(r) === 'no') reasons[r.s || 'Unknown'] = (reasons[r.s || 'Unknown'] || 0) + 1;
    const rlist = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
    if (rlist.length) body.append(el('div', { class: 'adm-bar' }, el('span', { class: 'adm-small', text: 'Why not indexed:' }), rlist.map(([s, n]) => el('button', { type: 'button', class: 'btn ' + (I.filter === 'r:' + s ? '' : 'ghost') + ' sm', text: `${s} (${n})`, onclick: () => { I.filter = I.filter === 'r:' + s ? 'all' : 'r:' + s; draw(); } }))));
    // checking
    const howMany = el('select', { 'aria-label': 'How many' }, [[200, '200'], [500, '500'], [1000, '1,000'], [2000, 'all I can today']].map(([v, t]) => el('option', { value: v, text: t, selected: v === 500 ? 'selected' : null })));
    const progress = el('div', { class: 'adm-bar2', style: { flex: '1', maxWidth: '260px' } }, el('i', { style: { width: '0%' } })), status = el('span', { class: 'adm-small' });
    // what "Continue" checks, in this order, so the daily allowance is never spent twice on the same answer:
    //   1. pages never checked (a run stopped by the daily limit carries on from here the next day)
    //   2. pages not indexed or whose check failed, last checked 3+ days ago (oldest first)
    //   3. only when allowed: indexed pages last checked 7+ days ago (does Google still have them?)
    const DAY = 864e5, ageOf = u => Date.now() - ((I.results[u] || {}).at || 0), oldest = (a, b) => ageOf(b) - ageOf(a);
    const queue = () => {
      const fresh = I.urls.filter(u => !I.results[u]);
      const retry = I.urls.filter(u => ['no', 'error'].includes(idxState(I.results[u])) && ageOf(u) >= 3 * DAY).sort(oldest);
      const kept = I.recheckIndexed ? I.urls.filter(u => idxState(I.results[u]) === 'yes' && ageOf(u) >= 7 * DAY).sort(oldest) : [];
      return fresh.concat(retry, kept);
    };
    const pick = kind => {
      const n = +howMany.value;
      if (kind === 'no') return I.urls.filter(u => ['no', 'error'].includes(idxState(I.results[u]))).sort(oldest).slice(0, n);
      return queue().slice(0, n);
    };
    const go = kind => runIndex(pick(kind));
    const waiting = queue().length;
    const recheck = el('label', { class: 'chk', title: 'Off: an indexed page is never checked again. On: indexed pages last checked a week or more ago are checked again, after everything else.' },
      el('input', { type: 'checkbox', checked: !!I.recheckIndexed, onchange: e => { I.recheckIndexed = e.target.checked; try { localStorage.setItem('tz_idx_recheck', e.target.checked ? '1' : ''); } catch { } draw(); } }),
      'Also re-check indexed pages (weekly)');
    body.append(el('div', { class: 'adm-bar' },
      el('button', { class: 'btn sm', type: 'button', text: waiting ? `Continue checking (${waiting} waiting)` : 'Nothing waiting', title: 'Pages never checked first, then pages not indexed (last checked 3+ days ago). Indexed pages are skipped unless the box is ticked.', disabled: I.busy || !waiting || null, onclick: () => go('next') }),
      el('button', { class: 'btn sec sm', type: 'button', text: 'Check again now: not indexed', disabled: I.busy || !(no + err) || null, onclick: () => go('no') }),
      recheck,
      el('label', { class: 'chk' }, 'How many: ', howMany),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Stop', disabled: !I.busy || null, onclick: () => { I.stop = true; } }),
      progress, status));
    if (I.logLines.length) body.append(el('div', { class: 'adm-log', style: { height: '90px' } }, I.logLines.slice(-30).map(([c, t]) => el('div', { class: c, text: t }))));
    // the list
    const search = el('input', { type: 'search', placeholder: 'Search addresses...', value: I.q, 'aria-label': 'Search addresses', oninput: e => { I.q = e.target.value; list(); } });
    const lang = el('select', { 'aria-label': 'Language', onchange: e => { I.lang = e.target.value; list(); } }, el('option', { value: '', text: 'All languages' }), ['en', ...LANGS].map(l => el('option', { value: l, text: l === 'en' ? 'English' : l, selected: I.lang === l ? 'selected' : null })));
    const show = el('select', { 'aria-label': 'Show', onchange: e => { I.filter = e.target.value; draw(); } }, [['all', 'All'], ['yes', 'Indexed'], ['no', 'Not indexed'], ['none', 'Not checked yet'], ['error', 'Check failed']].map(([v, t]) => el('option', { value: v, text: t, selected: I.filter === v ? 'selected' : null })));
    const holder = el('div');
    const rows = () => {
      const q = I.q.trim().toLowerCase();
      return all.filter(([u, r]) => (!I.lang || langOf(u) === I.lang) && (!q || u.toLowerCase().includes(q)) &&
        (I.filter === 'all' || (I.filter.startsWith('r:') ? idxState(r) === 'no' && (r.s || 'Unknown') === I.filter.slice(2) : idxState(r) === I.filter)));
    };
    const csv = () => {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [['Address', 'Indexed', 'Google says', 'Last crawl', 'Google canonical', 'Checked'].join(',')].concat(rows().map(([u, r]) => [u, idxState(r), r ? r.s || r.e || '' : '', r && r.c ? r.c.slice(0, 10) : '', r && r.g || '', r && r.at ? new Date(r.at).toISOString().slice(0, 10) : ''].map(esc).join(',')));
      HT.download(URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), 'google-index-' + new Date().toISOString().slice(0, 10) + '.csv');
    };
    function list() {
      holder.textContent = '';
      const rs = rows(), shown = rs.slice(0, 400), tb = el('tbody');
      for (const [u, r] of shown) {
        const path = new URL(u).pathname;
        tb.append(el('tr', {}, el('td', { class: 'l' }, el('a', { href: u, target: '_blank', rel: 'noopener', text: path })),
          el('td', {}, idxPill(r)), el('td', { class: 'l', text: r ? (r.e || r.s || '') + (r.f ? ' · ' + r.f : '') + (r.i ? ' · ' + r.i : '') + (r.r ? ' · robots.txt blocks it' : '') : '' }),
          el('td', { text: r && r.c ? ago(Date.parse(r.c)) : '–', title: r && r.c ? r.c : null }),
          el('td', { class: 'l adm-small', text: r && r.g ? 'Google chose ' + new URL(r.g).pathname : '' }),
          el('td', { text: r && r.at ? ago(r.at) : '–' }),
          el('td', {}, el('a', { class: 'btn ghost sm', href: gscLink(u), target: '_blank', rel: 'noopener', text: 'Search Console', title: 'Open this address in Search Console (there you can ask Google to index it)' }))));
      }
      holder.append(el('div', { class: 'adm-bar' }, el('span', { class: 'adm-small', text: rs.length > shown.length ? `Showing ${shown.length} of ${rs.length}` : `${rs.length} address(es)` }), el('span', { class: 'sp' }),
        el('button', { class: 'btn ghost sm', type: 'button', text: 'Download as CSV', onclick: csv })),
        el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t' }, el('thead', {}, el('tr', {}, ['Page', 'Indexed', 'Google says', 'Last crawl', 'Canonical', 'Checked', ''].map(t => el('th', { text: t })))), tb)));
    }
    body.append(el('div', { class: 'adm-bar' }, search, lang, show), holder); list();
    body.append(el('p', { class: 'adm-small', text: 'Service account: ' + I.email + (I.updated ? ' · results saved ' + ago(I.updated) : '') }),
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Forget all results', onclick: async () => { if (!(await ask('Forget every result?', 'The checks start again from the beginning.'))) return; await api('google-index', 'DELETE'); I.results = {}; draw(); } }));
  }
  // 8 calls at once (each server call may keep only 6 connections to Google open), 12 addresses each so the counters move
  // every few seconds, at most 560 addresses a minute (Google allows 600); results saved every 60 checks
  function paintIdxCounts() {
    const c = { all: I.urls.length, yes: 0, no: 0, none: 0, error: 0, left: Math.max(0, I.limit - (I.busy ? I.liveUsed : I.used)) };
    for (const u of I.urls) c[idxState(I.results[u])]++;
    for (const b of document.querySelectorAll('#adm-body [data-k]')) if (b.dataset.k in c) b.querySelector('b').textContent = String(c[b.dataset.k]);
  }
  async function runIndex(list) {
    if (!list.length) return toast('Nothing to check');
    I.busy = true; I.stop = false; draw();
    const say = (c, t) => { I.logLines.push([c, new Date().toLocaleTimeString() + '  ' + t]); };
    const startUsed = I.used, launches = [], t0 = Date.now();
    let pending = {}, done = 0, sent = 0, next = 0, halt = false, saving = Promise.resolve();
    I.pendingUsed = 0;
    const flush = () => (saving = saving.then(async () => {
      if (!I.pendingUsed) return;
      const batch = pending, used = I.pendingUsed; pending = {}; I.pendingUsed = 0;
      try { const r = await api('google-index', 'PUT', { results: batch, used }); I.used = r.used; I.updated = r.updated; }
      catch (e) { Object.assign(pending, batch); I.pendingUsed += used; say('e', 'Could not save: ' + e.message); }
    }));
    // no more than 560 addresses started in any minute
    const gate = async n => { for (;;) { const now = Date.now(); while (launches.length && launches[0][0] < now - 60000) launches.shift(); if (launches.reduce((a, x) => a + x[1], 0) + n <= 560) { launches.push([now, n]); return; } await sleep(300); } };
    const show = () => {
      I.liveUsed = startUsed + done;
      const p = document.querySelector('#adm-body .adm-bar2 i'); if (p) p.style.width = Math.max(1, Math.round(done / list.length * 100)) + '%';
      const s = document.querySelector('#adm-body .adm-bar2 + .adm-small'), secs = Math.round((Date.now() - t0) / 1000), mins = secs / 60;
      if (s) s.textContent = `${done} of ${list.length} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` + (!done ? ' · asking Google...' : mins > 0.2 ? ` · ${Math.round(Math.min(done / mins, 560))} a minute` : '') + ' · keep this page open (a refresh stops it)';
      paintIdxCounts();
    };
    const ticker = setInterval(() => { if (I.busy) show(); }, 1000);
    // leaving during a run: ask first, and send what is not saved yet on the way out (those checks count for today)
    const stay = e => { e.preventDefault(); e.returnValue = ''; };
    const leave = () => { if (!I.pendingUsed) return; try { fetch('/api/admin/google-index', { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'X-Requested-With': 'toolzbaba-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ results: pending, used: I.pendingUsed }) }); I.pendingUsed = 0; } catch { } };
    addEventListener('beforeunload', stay); addEventListener('pagehide', leave);
    say('', `Checking ${list.length} address(es)...`);
    const lane = async () => {
      while (!halt && !I.stop && next < list.length) {
        const room = I.limit - startUsed - sent;
        if (room <= 0) { if (!halt) say('y', "Today's " + I.limit + ' checks are used up: run it again tomorrow, it continues from here.'); halt = true; break; }
        const n = Math.min(12, I.perCall, room, list.length - next), batch = list.slice(next, next + n); next += n; sent += n;
        await gate(n);
        if (I.stop || halt) break;
        let r;
        try { r = await api('google-index', 'POST', { urls: batch }); }
        catch (e) { if (!halt) say('e', e.message); halt = true; break; }
        if (r.site) I.site = r.site;
        Object.assign(I.results, r.results); Object.assign(pending, r.results); I.pendingUsed += n; done += n;
        show();
        if (Object.keys(pending).length >= 60) flush();
        if (r.quota) { if (!halt) say('y', 'Google says: too many checks for now. Try again later (the daily allowance may be used up).'); halt = true; }
      }
    };
    show();
    await Promise.all(Array.from({ length: 8 }, lane));
    clearInterval(ticker);
    await flush(); await saving;
    removeEventListener('beforeunload', stay); removeEventListener('pagehide', leave);
    const yes = list.filter(u => idxState(I.results[u]) === 'yes').length, mins = Math.max(0.01, (Date.now() - t0) / 60000);
    say('g', `Done: ${done} checked in ${mins < 1 ? Math.round(mins * 60) + ' s' : mins.toFixed(1) + ' min'}, ${yes} of them indexed.`);
    I.used = Math.max(I.used, startUsed + done); I.busy = false; if (S.tab === 'index') draw();
  }
  function indexSetup() {
    const step = (n, title, ...rest) => el('li', {}, el('b', { text: title }), el('div', { class: 'adm-small', style: { color: 'var(--muted)', margin: '2px 0 10px' } }, ...rest));
    const code = t => el('code', { text: t });
    return el('div', { class: 'adm-help' },
      el('h3', { text: 'Set it up once (about 10 minutes)' }),
      I.problem ? el('p', { class: 'adm-msg', text: I.problem }) : null,
      el('p', { text: 'Google answers these questions only to someone who may see the site in Search Console. A "service account" is a robot Google user made for this: you create it, give it read-only access to toolzbaba.com in Search Console, and hand its key to the site as a secret. The key stays on the server; this page never sees it.' }),
      el('ol', {},
        step(1, 'Google Cloud: switch on the Search Console API', 'Open ', el('a', { href: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com', target: '_blank', rel: 'noopener', text: 'console.cloud.google.com → Google Search Console API' }), ', choose or create a project (any name, e.g. "toolzbaba"), and press Enable.'),
        step(2, 'Create the service account and its key', 'In the same project: ', el('a', { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts', target: '_blank', rel: 'noopener', text: 'IAM & Admin → Service accounts' }), ' → Create service account (name: "search-console-reader", no roles needed) → open it → Keys → Add key → Create new key → JSON. A .json file downloads: keep it private.'),
        step(3, 'Give it read access in Search Console', 'Open ', el('a', { href: 'https://search.google.com/search-console/users', target: '_blank', rel: 'noopener', text: 'Search Console → Settings → Users and permissions' }), ' for toolzbaba.com → Add user → paste the e-mail from the file (the line ', code('"client_email"'), ', ending in ', code('.iam.gserviceaccount.com'), ') → Permission: Restricted → Add.'),
        step(4, 'Give the key to the site', 'Cloudflare dashboard → Workers & Pages → toolzbaba → Settings → Variables and Secrets → Add → type "Secret", name ', code('GSC_SERVICE_ACCOUNT'), ', value: the whole contents of the .json file (open it in Notepad, select all, copy). Save. If your Search Console property is a URL prefix rather than a domain property, also add ', code('GSC_SITE'), ' = ', code('https://toolzbaba.com/'), '.'),
        step(5, 'Deploy once', 'Secrets reach the site with the next deploy: push any change, or in GitHub open Actions → "Deploy to Cloudflare Pages" → Run workflow. Then come back here.')),
      el('button', { class: 'btn sm', type: 'button', text: 'I have done it: check again', onclick: () => { I.loaded = false; draw(); } }));
  }

  // ---- the lab: open every tool in a hidden frame, measure it, try it with a sample file
  const HEAVY_MS = 180000, RUN_MS = 60000;
  const canvasBlob = (w, h, draw, type = 'image/png') => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); c.toBlob(r, type, 0.9); });
  const sampleImage = type => canvasBlob(960, 640, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2b6cff'); g.addColorStop(1, '#ff8a2b'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(80 + i * 75, 160 + (i % 4) * 90, 28 + (i % 3) * 10, 0, 7); x.fill(); }
    x.fillStyle = '#111'; x.font = 'bold 64px sans-serif'; x.fillText('Toolz Baba lab', 150, 540);
  }, type);
  function samplePdf(n = 2) {
    const o = [], kids = Array.from({ length: n }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
    o[1] = '<< /Type /Catalog /Pages 2 0 R >>'; o[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`; o[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    for (let i = 0; i < n; i++) { const c = `BT /F1 28 Tf 72 700 Td (Lab sample page ${i + 1}) Tj ET\nBT /F1 14 Tf 72 660 Td (Toolz Baba admin lab test.) Tj ET`; o[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`; o[5 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`; }
    let out = '%PDF-1.4\n'; const off = []; for (let i = 1; i < o.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${o[i]}\nendobj\n`; }
    const x = out.length; out += `xref\n0 ${o.length}\n0000000000 65535 f \n` + off.slice(1).map(v => String(v).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${o.length} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  }
  function sampleWav(sec = 3) {
    const rate = 16000, n = rate * sec, b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, rate, true); d.setUint32(28, rate * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 440) * 9000, true);
    return new Blob([b], { type: 'audio/wav' });
  }
  async function sampleVideo() {
    if (!window.MediaRecorder) return null;
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'), stream = c.captureStream(15), type = ['video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)); if (!type) return null;
    const rec = new MediaRecorder(stream, { mimeType: type }), parts = []; rec.ondataavailable = e => e.data.size && parts.push(e.data); const done = new Promise(r => (rec.onstop = r)); rec.start(100);
    const t0 = performance.now(); while (performance.now() - t0 < 2200) { const k = (performance.now() - t0) / 2200; x.fillStyle = `hsl(${k * 300},80%,50%)`; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillRect(20 + k * 220, 90, 50, 50); await sleep(40); }
    rec.stop(); await done; return new Blob(parts, { type: 'video/webm' });
  }
  // a file the tool will take, or null (and why)
  async function sampleFor(accept, heavy) {
    const a = (accept || '').toLowerCase(), any = !a;
    const want = k => any || a.includes(k);
    if (want('pdf') && !/image|\.jpe?g|\.png/.test(a) && !any) return { blob: samplePdf(), name: 'lab-sample.pdf' };
    if (/audio|\.mp3|\.wav/.test(a)) return { blob: sampleWav(), name: 'lab-sample.wav' };
    if (/video|\.mp4|\.mov|\.webm/.test(a)) { if (!heavy) return { why: 'video tool (switch on "Include heavy tools")' }; const v = await sampleVideo(); return v ? { blob: v, name: 'lab-sample.mp4', type: 'video/mp4' } : { why: 'this browser cannot make a sample video' }; }
    // the picture format the tool asks for (a "Compress WebP" page takes only WebP): PNG for any picture, else the first one named
    if (/gif/.test(a) && !/png|jpe?g|webp|avif|image\/\*/.test(a)) return { why: 'needs a GIF file' };
    if (/svg/.test(a) && !/png|jpe?g|webp|avif|image\/\*/.test(a)) return { blob: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="#4f46e5"/><circle cx="160" cy="160" r="90" fill="#fbbf24"/><text x="270" y="175" font-family="sans-serif" font-size="40" fill="#fff">lab</text></svg>'], { type: 'image/svg+xml' }), name: 'lab-sample.svg' };
    if (/image|\.jpe?g|\.png|\.webp|\.avif/.test(a) || any) {
      const want = any || /image\/\*|png/.test(a) ? 'image/png' : /jpe?g/.test(a) ? 'image/jpeg' : /webp/.test(a) ? 'image/webp' : /avif/.test(a) ? 'image/avif' : 'image/png';
      const blob = await sampleImage(want);
      if (!blob || blob.type !== want) return { why: 'this browser can not make a sample ' + want.split('/')[1].toUpperCase() + ' picture' };
      return { blob, name: 'lab-sample.' + (want === 'image/jpeg' ? 'jpg' : want.split('/')[1]) };
    }
    return { why: 'needs a ' + a.split(',')[0] + ' file' };
  }
  function labFrame() { const f = el('iframe', { title: 'lab', style: { position: 'fixed', left: '-12000px', top: '0', width: '1100px', height: '800px', border: '0' } }); document.body.append(f); return f; }
  async function waitFor(fn, ms, step = 100) { const t0 = performance.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (performance.now() - t0 > ms) return null; await sleep(step); } }
  const PRIMARY = /compress|convert|make|create|generate|merge|split|resize|crop|remove|apply|run|start|protect|unlock|blur|redact|sign|turn|extract|rotate|trim|speed|build|number|watermark|pixelate|download|save|format|transform|remove|change|add/i;
  function findAction(doc) {
    const c = [...doc.querySelectorAll('#tool button.btn, #tool .actions button')].filter(b => b.offsetParent && !b.disabled && !b.closest('.drop') && !b.closest('.files') && !/\b(sec|ghost)\b/.test(b.className) && !/^(choose|browse|clear|cancel|reset|copy|add more|×)/i.test(b.textContent.trim()));
    return c.find(b => PRIMARY.test(b.textContent)) || c[0] || null;
  }
  async function labOne(row, o, log) {
    const url = row.href, res = { at: Date.now(), ready: null, load: null, bytes: null, reqs: null, errors: [], big: null, run: null }, errs = res.errors;
    const f = labFrame(), t0 = performance.now(); let loaded = false; f.addEventListener('load', () => { loaded = true; res.load = Math.round(performance.now() - t0); });
    f.src = url + (url.includes('?') ? '&' : '?') + 'lab=' + Date.now();
    try {
      // catch the page's errors as early as the browser lets us
      await waitFor(() => { const w = f.contentWindow; if (!w || !w.location || w.location.href === 'about:blank' || !w.document || !w.document.body) return null; if (!w.__labHooked) { w.__labHooked = true; w.addEventListener('error', e => errs.push(String(e.message || 'error').slice(0, 160))); w.addEventListener('unhandledrejection', e => errs.push(String((e.reason && e.reason.message) || e.reason || 'rejected').slice(0, 160))); const ce = w.console.error; w.console.error = (...a) => { errs.push(a.map(x => (x && x.message) || String(x)).join(' ').slice(0, 160)); ce.apply(w.console, a); }; } return true; }, 8000, 5);
      const w = f.contentWindow, doc = () => f.contentDocument;
      const ready = await waitFor(() => doc() && doc().querySelector('#tool .drop, #tool .tbench, #tool textarea, #tool input:not([type=file]), #tool .card, #tool h1'), 45000);
      if (!ready) { res.ready = null; errs.push('The tool did not appear within 45 s.'); return res; }
      res.ready = Math.round(performance.now() - t0);
      const h1 = doc().querySelector('#tool h1'); if (h1 && /not found/i.test(h1.textContent)) { errs.push('The page says "Tool not found".'); return res; }
      if (h1 && /taking a break/i.test(h1.textContent)) { res.run = { state: 'skip', msg: 'archived (the visitor notice is showing)' }; }
      await waitFor(() => loaded, 15000); await sleep(400);
      try { const rs = w.performance.getEntriesByType('resource'), nav = w.performance.getEntriesByType('navigation')[0]; let sum = nav ? nav.encodedBodySize || 0 : 0, big = null, third = 0;
        for (const e of rs) { const b = e.transferSize || e.encodedBodySize || 0; if (!e.name.startsWith(location.origin)) { third += b; continue; } sum += b; if (!big || b > big.b) big = { b, n: e.name.split('/').pop().split('?')[0] }; } res.bytes = sum; res.third = third; res.reqs = rs.length + 1; res.big = big ? big.n + ' (' + fmtKB(big.b) + ')' : null; } catch { }
      if (!o.run || (res.run && res.run.state === 'skip')) return res;
      if (row.heavy && !o.heavy) { res.run = { state: 'skip', msg: 'heavy tool (switch on "Include heavy tools")' }; return res; }
      res.run = await tryRun(f, row, o, log, errs); return res;
    } finally { f.remove(); }
  }
  // Tools that cannot be driven the generic way. skip = why it is not tried here; steps = extra things to do after the sample file is in.
  const LAB_SKIP = {
    'esign-pdf': 'needs a signature drawn by hand (the whole flow is in tests/browser_tools.js)',
    'unlock-pdf': 'needs a password-protected PDF (the whole flow is in tests/browser_tools.js)',
    'image-cdn': 'stores files on the server', 'temporary-file-upload-direct-link-share': 'stores files on the server',
  };
  const fire = (w, el, type, x, y) => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
  const LAB_STEPS = {
    // mark an area on the first page, as a visitor would
    'blur-redact-pdf': async (d, w) => { const st = await waitFor(() => { const s = d().querySelector('.rdstage'); return s && s.querySelector('canvas') && s.getBoundingClientRect().height > 50 ? s : null; }, 20000); if (!st) return; const r = st.getBoundingClientRect();
      fire(w, st, 'pointerdown', r.left + r.width * 0.15, r.top + r.height * 0.12); fire(w, st, 'pointermove', r.left + r.width * 0.6, r.top + r.height * 0.3); fire(w, st, 'pointerup', r.left + r.width * 0.6, r.top + r.height * 0.3); await sleep(400); },
  };
  // fill what the tool still asks for (a password, a web address, some text) with harmless test values
  function fillAsked(d, w) {
    for (const i of d().querySelectorAll('#tool input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=search]), #tool textarea')) {
      if (!i.offsetParent || i.value || i.readOnly || i.disabled) continue;
      const lab = i.closest('.field') && i.closest('.field').querySelector('label'), hint = [i.getAttribute('aria-label'), i.placeholder, i.name, i.id, lab && lab.textContent].join(' ').toLowerCase(); let v = null;
      if (i.type === 'password' || /password/.test(hint)) v = 'lab-test-1234'; else if (i.type === 'url' || /website address|url|https?:/.test(hint)) v = 'https://example.com/';
      else if (i.type === 'number') v = i.min || '1'; else if (i.tagName === 'TEXTAREA') v = '{"name":"Toolz Baba","list":[1,2,3]}'; else if (i.type === 'text') v = 'Toolz Baba lab test';
      if (v != null) { i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); i.dispatchEvent(new w.Event('change', { bubbles: true })); }
    }
  }
  async function tryRun(f, row, o, log, errs) {
    const doc = f.contentDocument, w = f.contentWindow, d = () => f.contentDocument, tStart = performance.now(), limit = row.heavy ? HEAVY_MS : RUN_MS, before = errs.length;
    if (LAB_SKIP[row.slug]) return { state: 'skip', msg: LAB_SKIP[row.slug] };
    const fileIn = doc.querySelector('#tool input[type=file]'), textIn = doc.querySelector('#tool textarea, #tool input[type=text], #tool input[type=url]');
    let lastMut = performance.now(), muts = 0; const mo = new w.MutationObserver(() => { lastMut = performance.now(); muts++; }); mo.observe(doc.getElementById('tool'), { childList: true, subtree: true, characterData: true, attributes: true });
    try {
      if (fileIn) {
        const s = await sampleFor(fileIn.getAttribute('accept'), o.heavy); if (!s.blob) return { state: 'skip', msg: s.why };
        const dt = new w.DataTransfer(); const mk = (n, i) => new w.File([s.blob], i ? n.replace('.', i + '.') : n, { type: s.type || s.blob.type }); dt.items.add(mk(s.name, 0)); if (fileIn.multiple) dt.items.add(mk(s.name, 2));
        fileIn.files = dt.files; fileIn.dispatchEvent(new w.Event('change', { bubbles: true }));
      } else if (textIn) { fillAsked(d, w); }
      else return { state: 'skip', msg: 'nothing to try (no file or text box)' };
      await sleep(900);
      if (LAB_STEPS[row.slug]) await LAB_STEPS[row.slug](d, w);
      fillAsked(d, w); const afterInput = performance.now(); muts = 0;
      let downloaded = false; try { w.HT.download = () => { downloaded = true; }; } catch { }
      const result = () => d().querySelector('#tool .result, #tool .card.result') || (downloaded && {});
      const dlReady = () => [...d().querySelectorAll('#tool button, #tool a')].find(b => /^download\b/i.test(b.textContent.trim()) && !b.disabled && !b.classList.contains('hidden') && b.offsetParent);
      const filledOut = () => [...d().querySelectorAll('#tool textarea[readonly], #tool pre, #tool output, #tool .out')].some(e => ((e.value || e.textContent || '').trim().length > 3));
      const errText = () => { const e = d().querySelector('#tool .status.err'); return e && e.textContent.trim(); };
      const busy = () => [...d().querySelectorAll('#tool .bar')].some(b => b.style.display === 'block');
      // a full-screen editor (the PDF Editor) opens outside #tool: the file is showing in it, ready to edit
      const editorOpen = () => { const a = d().querySelector('.v2app:not(.hidden)'); return a && a.querySelector('canvas, img') ? a : null; };
      let clicked = false;
      const outcome = await waitFor(() => {
        fillAsked(d, w);
        const e = errText(); if (e) return { state: 'err', msg: e };
        if (result()) return { state: 'ok' };
        if (editorOpen()) return { state: 'ok', msg: 'the editor opened the file' };
        if (!clicked) { const b = findAction(d()); if (b && (performance.now() - tStart > 1500 || !fileIn)) { clicked = true; muts = 0; b.click(); } }
        if (clicked && dlReady()) return { state: 'ok' };
        if (filledOut() && performance.now() - lastMut > 800 && !busy()) return { state: 'ok', msg: 'the answer is on the page' };
        // the tool answered by itself (no button) and has been quiet for 2 s without an error: it worked
        if (muts > 0 && !busy() && performance.now() - lastMut > 2000 && performance.now() - afterInput > 3000) return { state: 'ok', msg: clicked ? 'finished, no error' : 'ran by itself, no error' };
        if (!fileIn && performance.now() - tStart > 3500 && performance.now() - lastMut > 1500) return { state: 'ok', msg: 'no error' };
        return null;
      }, limit, 250);
      const ms = Math.round(performance.now() - tStart);
      if (!outcome) return { state: 'fail', ms, msg: clicked ? 'No result within ' + Math.round(limit / 1000) + ' s.' : 'Nothing happened and no button to press was found.' };
      if (outcome.state === 'err') return { state: /face|no (text|sound|speech)|nothing (found|to)|sample|public web address|network/i.test(outcome.msg) ? 'warn' : 'fail', ms, msg: outcome.msg };
      const newErrs = errs.slice(before); if (newErrs.length) return { state: 'fail', ms, msg: 'Finished but the page reported: ' + newErrs[0] };
      return { state: 'ok', ms, msg: outcome.msg || '' };
    } finally { try { mo.disconnect(); } catch { } }
  }
  function drawLab(body) {
    const pick = S.labPick; S.labPick = null;
    const scope = el('select', { 'aria-label': 'What to test' }, [['all', 'Every tool'], ['sel', 'Selected tools (' + S.sel.size + ')'], ['fail', 'Only tools that failed last time'], ['new', 'Only tools never tested'], ['pick', pick ? 'Chosen from the list (' + pick.length + ')' : 'Chosen from the list']].filter(([v]) => v !== 'pick' || pick).map(([v, t]) => el('option', { value: v, text: t })));
    if (pick) scope.value = 'pick'; else if (S.sel.size) scope.value = 'sel';
    const heavy = el('input', { type: 'checkbox' }), run = el('input', { type: 'checkbox', checked: true }), sizes = el('input', { type: 'checkbox' }), tabs = el('input', { type: 'checkbox', checked: true });
    const bar = el('i', { style: { width: '0%' } }), status = el('span', { class: 'adm-small' }), logEl = el('div', { class: 'adm-log' }), results = el('div');
    const start = el('button', { class: 'btn', type: 'button', text: 'Start the test', onclick: go }), stop = el('button', { class: 'btn sec', type: 'button', text: 'Stop', disabled: 'disabled', onclick: () => { S.labStop = true; stop.disabled = true; } });
    const say = (t, c) => { const d = el('div', { class: c || '', text: t }); logEl.append(d); logEl.scrollTop = logEl.scrollHeight; };
    body.append(el('p', { class: 'adm-note', text: 'The lab opens each tool in a hidden frame in THIS browser, measures how long it takes to appear and how much it downloads, listens for errors, and (with "Try it") gives it a small generated sample file and waits for a result. It is a quick health check, not a replacement for the full test files in /tests. Times are warm-cache numbers (files shared by earlier tools are already downloaded), and AI tools run without the extra CPU threads, so real visitors may see slower first visits. Keep this tab open while it runs.' }),
      el('div', { class: 'adm-opts' }, el('label', { class: 'chk' }, 'Test: ', scope), el('label', { class: 'chk' }, run, 'Try it with a sample file'), el('label', { class: 'chk', title: 'AI, video and speech tools download big models and take minutes' }, heavy, 'Include heavy tools (AI, video, speech)'), el('label', { class: 'chk' }, tabs, 'Include tab pages'), el('label', { class: 'chk' }, sizes, 'Include the "under X KB" pages')),
      el('div', { class: 'adm-bar' }, start, stop, el('div', { class: 'adm-bar2', style: { flex: 1, maxWidth: '320px' } }, bar), status), logEl, el('h3', { text: 'Latest results', style: { margin: '18px 0 8px' } }), results);
    async function go() {
      if (S.labBusy) return; let rows = S.rows.filter(r => (tabs.checked || !r.level) && (sizes.checked || !r.size));
      const v = scope.value; if (v === 'sel') rows = S.rows.filter(r => S.sel.has(r.slug)); else if (v === 'pick') rows = S.rows.filter(r => pick.includes(r.slug)); else if (v === 'fail') rows = rows.filter(r => labState(S.lab[r.slug]) === 'fail'); else if (v === 'new') rows = rows.filter(r => !S.lab[r.slug]);
      if (!rows.length) return toast('Nothing to test with those choices.');
      S.labBusy = true; S.labStop = false; start.disabled = true; stop.disabled = false; logEl.textContent = ''; const opts = { heavy: heavy.checked, run: run.checked }, batch = {}; let i = 0, bad = 0;
      say(`Testing ${rows.length} page${rows.length > 1 ? 's' : ''}...`);
      for (const r of rows) {
        if (S.labStop) { say('Stopped.', 'y'); break; }
        status.textContent = `${i + 1} / ${rows.length}: ${r.name}`; bar.style.width = (100 * i / rows.length) + '%'; i++;
        let res; try { res = await labOne(r, opts, say); } catch (e) { res = { at: Date.now(), ready: null, errors: ['The test itself crashed: ' + e.message], run: null }; }
        S.lab[r.slug] = res; batch[r.slug] = res; const s = labState(res); if (s === 'fail') bad++;
        say(`${s === 'fail' ? '✗' : '✓'} ${r.name.padEnd(34)} ready ${fmtMs(res.ready).padEnd(8)} ${fmtKB(res.bytes).padEnd(9)} ${res.run ? res.run.state + (res.run.ms ? ' ' + fmtMs(res.run.ms) : '') + (res.run.msg ? ' – ' + res.run.msg : '') : ''}${res.errors.length ? '  ERRORS: ' + res.errors[0] : ''}`, s === 'fail' ? 'e' : s === 'warn' ? 'y' : 'g');
        if (Object.keys(batch).length >= 5) { await save(batch); }
      }
      await save(batch); bar.style.width = '100%'; status.textContent = `Done. ${bad} of ${i} need a look.`; say(`Done: ${i - bad} fine, ${bad} to look at.`, bad ? 'y' : 'g');
      S.labBusy = false; start.disabled = false; stop.disabled = true; drawResults();
    }
    async function save(batch) { const b = { ...batch }; for (const k of Object.keys(batch)) delete batch[k]; if (!Object.keys(b).length) return; try { await api('lab', 'POST', { results: b }); } catch (e) { say('Could not save to the server: ' + e.message, 'y'); } }
    function drawResults() {
      results.textContent = ''; const rows = S.rows.filter(r => S.lab[r.slug] && (S.size || !r.size));
      if (!rows.length) return results.append(el('p', { class: 'adm-note', text: 'No tests yet.' }));
      rows.sort((a, b) => ((labState(S.lab[b.slug]) === 'fail') - (labState(S.lab[a.slug]) === 'fail')) || ((S.lab[b.slug].ready || 0) - (S.lab[a.slug].ready || 0)));
      const tb = el('tbody');
      for (const r of rows) { const l = S.lab[r.slug]; tb.append(el('tr', {}, el('td', { class: 'l' }, el('b', { text: r.name }), el('small', { class: 'adm-small', text: '  ' + r.href })), el('td', {}, rated('ready', l.ready, fmtMs(l.ready))), el('td', { class: 'num', text: fmtMs(l.load) }), el('td', {}, l.bytes != null ? rated('weight', l.bytes, fmtKB(l.bytes)) : '–'), el('td', { class: 'num', text: l.third != null ? fmtKB(l.third) : '-' }), el('td', { class: 'num', text: l.reqs ?? '–' }), el('td', { class: 'adm-small', text: l.big || '' }), el('td', {}, labBadge(l)), el('td', { class: 'l adm-small', style: { maxWidth: '380px' }, text: [l.errors && l.errors[0], l.run && (l.run.state + (l.run.ms ? ' ' + fmtMs(l.run.ms) : '') + (l.run.msg ? ': ' + l.run.msg : ''))].filter(Boolean).join(' — ') }))); }
      results.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t', style: { minWidth: '1000px' } }, el('thead', {}, el('tr', {}, ['Tool', 'Ready', 'Loaded', 'Our files', 'Ads / analytics', 'Requests', 'Biggest file', 'Result', 'Details'].map(t => el('th', { text: t })))), tb)));
    }
    drawResults();
  }

  // ---- history
  function drawLog(body) {
    body.append(el('p', { class: 'adm-note', text: 'The last 100 archive / live changes.' }));
    if (!S.log.length) return body.append(el('div', { class: 'adm-card' }, el('span', { text: 'No changes yet.' })));
    const tb = el('tbody'); for (const e of S.log) tb.append(el('tr', {}, el('td', { text: new Date(e.at).toLocaleString() }), el('td', { class: 'l' }, el('b', { text: (S.rows.find(r => r.slug === e.slug) || { name: e.slug }).name }), el('small', { class: 'adm-small', text: '  ' + e.slug })), el('td', {}, pill(e.to === 'live' ? 'live' : 'arch', e.to === 'live' ? 'Made live' : 'Archived')), el('td', { class: 'l', text: e.note || '' })));
    body.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t', style: { minWidth: '600px' } }, el('thead', {}, el('tr', {}, ['When', 'Tool', 'Change', 'Note'].map(t => el('th', { text: t })))), tb)));
  }

  // ---- blog: write, publish and manage the posts at /blog (stored in KV, see lib/blog-store.js)
  const B = { posts: null, edit: null, dirty: false, md: null };
  const mdLib = () => B.md || (B.md = import(HT.ver('/assets/blog/markdown.js')));
  const dateIn = t => (t ? new Date(t).toISOString().slice(0, 10) : '');
  const postState = p => (p.status !== 'published' ? ['arch', 'Draft'] : p.published > Date.now() ? ['warn', 'Scheduled'] : ['live', 'Published']);
  window.addEventListener('beforeunload', e => { if (B.edit && B.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // shrinks a photo to at most 1600 px wide WebP in the browser (GIFs are kept as they are, to keep their animation)
  async function shrink(file) {
    if (file.type === 'image/gif' || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / bmp.width), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise(r => c.toBlob(r, 'image/webp', 0.85));
      return out && out.type === 'image/webp' && (out.size < file.size || k < 1) ? out : file;
    } catch { return file; }
  }
  async function uploadImage(file) {
    const blob = await shrink(file);
    if (blob.size > 5 * 1048576) throw new Error('This image is over 5 MB even after shrinking it. Use a smaller one.');
    const r = await fetch('/api/admin/blog-image', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'toolzbaba-admin', 'Content-Type': blob.type }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'Error ' + r.status);
    return j.url;
  }
  const pickImage = () => new Promise(res => { const i = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif,image/gif' }); i.onchange = () => res(i.files[0] || null); i.click(); });

  async function drawBlog(body) {
    if (B.edit) return drawEditor(body);
    if (!B.posts) {
      body.append(el('p', { class: 'adm-note', text: 'Loading posts...' }));
      try { B.posts = (await api('blog')).posts || []; } catch (e) { body.textContent = ''; body.append(el('p', { class: 'adm-note', text: 'Could not load the posts: ' + e.message }), el('button', { class: 'btn sm', type: 'button', text: 'Try again', onclick: () => draw() })); return; }
      if (S.tab === 'blog' && !B.edit) draw();
      return;
    }
    const open = async slug => { try { B.edit = (await api('blog/' + slug)).post; B.dirty = false; draw(); } catch (e) { toast('Could not open: ' + e.message); } };
    const del = async p => {
      if (!confirm(`Delete "${p.title}"? Its address /blog/${p.slug} will stop working. This can't be undone.`)) return;
      try { await api('blog/' + p.slug, 'DELETE'); B.posts = B.posts.filter(x => x.slug !== p.slug); toast('Deleted'); draw(); } catch (e) { toast('Could not delete: ' + e.message); }
    };
    const pub = B.posts.filter(p => postState(p)[1] === 'Published').length;
    body.append(el('div', { class: 'adm-bar' },
      el('button', { class: 'btn sm', type: 'button', text: '+ New post', onclick: () => { B.edit = { isNew: true, slug: '', title: '', desc: '', body: '', cover: '', coverAlt: '', tags: [], status: 'draft' }; B.dirty = false; draw(); } }),
      el('a', { class: 'btn sec sm', href: '/blog', target: '_blank', rel: 'noopener', text: 'Open the blog' }),
      el('span', { class: 'sp' }), el('span', { class: 'adm-small', text: `${pub} published, ${B.posts.length - pub} other` })));
    body.append(el('p', { class: 'adm-note', text: 'Posts appear at toolzbaba.com/blog as soon as you publish them, with their own page, search-engine details, an entry in the sitemap (/sitemap.xml) and an RSS feed (/blog/feed.xml). Drafts are only visible here.' }));
    if (!B.posts.length) return body.append(el('div', { class: 'adm-card' }, el('span', { text: 'No posts yet. Press "New post" to write the first one.' })));
    const tb = el('tbody');
    for (const p of B.posts) {
      const [cls, label] = postState(p);
      tb.append(el('tr', {},
        el('td', { class: 'l' }, el('div', { class: 'nm' }, p.cover ? el('img', { src: p.cover, alt: '', width: 64, height: 36, style: { objectFit: 'cover', borderRadius: '6px' } }) : null,
          el('div', {}, el('b', { text: p.title }), el('small', { text: '/blog/' + p.slug })))),
        el('td', {}, pill(cls, label)),
        el('td', { text: p.published ? new Date(p.published).toLocaleDateString() : '–' }),
        el('td', { text: ago(p.updated) }),
        el('td', { class: 'act' }, el('div', { class: 'adm-btns' },
          el('button', { class: 'btn sm', type: 'button', text: 'Edit', onclick: () => open(p.slug) }),
          label === 'Published' ? el('a', { class: 'btn sec sm', href: '/blog/' + p.slug, target: '_blank', rel: 'noopener', text: 'View' }) : null,
          el('button', { class: 'btn ghost sm', type: 'button', text: 'Delete', onclick: () => del(p) })))));
    }
    body.append(el('div', { class: 'adm-tablewrap' }, el('table', { class: 'adm-t', style: { minWidth: '760px' } }, el('thead', {}, el('tr', {}, ['Post', 'Status', 'Date', 'Last saved', ''].map(t => el('th', { text: t })))), tb)));
  }

  function drawEditor(body) {
    const p = B.edit, wasPublished = !p.isNew && p.status === 'published';
    let slugTouched = !p.isNew;
    const mark = () => { B.dirty = true; };
    const title = el('input', { type: 'text', value: p.title, maxlength: 140, placeholder: 'Post title', class: 'be-title', 'aria-label': 'Title' });
    const slug = el('input', { type: 'text', value: p.slug, maxlength: 80, placeholder: 'post-address', 'aria-label': 'Address', spellcheck: 'false', autocapitalize: 'off' });
    const desc = el('textarea', { rows: 2, maxlength: 300, placeholder: 'Short summary shown on Google and on the blog list (about 150 characters). Left empty, the start of the post is used.', 'aria-label': 'Description' }); desc.value = p.desc || '';
    const descN = el('span', { class: 'adm-small' });
    const cover = el('input', { type: 'text', value: p.cover || '', placeholder: 'Upload an image or paste https://...', 'aria-label': 'Cover image' });
    const coverAlt = el('input', { type: 'text', value: p.coverAlt || '', maxlength: 200, placeholder: 'What the cover image shows (for screen readers and Google)', 'aria-label': 'Cover description' });
    const coverImg = el('img', { class: 'be-cover', alt: '' });
    const tags = el('input', { type: 'text', value: (p.tags || []).join(', '), placeholder: 'pdf, images, how-to', 'aria-label': 'Tags' });
    const date = el('input', { type: 'date', value: dateIn(p.published), 'aria-label': 'Publish date' });
    const text = el('textarea', { class: 'be-body', spellcheck: 'true', placeholder: 'Write the post here. Use the buttons above, or Markdown: ## Heading, **bold**, *italic*, [link](https://...), - list', 'aria-label': 'Post text' }); text.value = p.body || '';
    const preview = el('div', { class: 'post-body be-preview' }), stats = el('span', { class: 'adm-small' }), msg = el('div', { class: 'adm-msg' });

    const showCover = () => { coverImg.hidden = !cover.value.trim(); if (cover.value.trim()) coverImg.src = cover.value.trim(); };
    const showDesc = () => { descN.textContent = desc.value.length + ' / 160 suggested'; descN.style.color = desc.value.length > 165 ? 'var(--err, #b3261e)' : ''; };
    let tmr = 0;
    const render = () => { clearTimeout(tmr); tmr = setTimeout(async () => {
      const { renderMarkdown, readingMinutes } = await mdLib(), r = renderMarkdown(text.value);
      preview.innerHTML = r.html || '<p class="adm-small">The preview shows up here.</p>'; // the renderer escapes everything (safe)
      const words = r.text.split(/\s+/).filter(Boolean).length; stats.textContent = `${words} words · ${readingMinutes(r.text)} min read`;
    }, 120); };
    title.oninput = async () => { mark(); if (!slugTouched) slug.value = (await mdLib()).slugify(title.value); };
    slug.oninput = () => { mark(); slugTouched = true; };
    slug.onblur = async () => { slug.value = (await mdLib()).slugify(slug.value); };
    desc.oninput = () => { mark(); showDesc(); };
    cover.oninput = () => { mark(); showCover(); };
    [coverAlt, tags, date].forEach(i => { i.oninput = mark; });
    text.oninput = () => { mark(); render(); };

    // toolbar: wraps the selection or puts a line start in front of it
    const wrap = (pre, post = pre, ph = 'text') => { const s = text.selectionStart, e = text.selectionEnd, sel = text.value.slice(s, e) || ph; text.setRangeText(pre + sel + post, s, e, 'end'); text.focus(); text.selectionStart = s + pre.length; text.selectionEnd = s + pre.length + sel.length; text.oninput(); };
    const line = pre => { const s = text.selectionStart, start = text.value.lastIndexOf('\n', s - 1) + 1; text.setRangeText(pre, start, start, 'end'); text.focus(); text.oninput(); };
    const insert = t => { text.setRangeText(t, text.selectionStart, text.selectionEnd, 'end'); text.focus(); text.oninput(); };
    const tb = (label, title, fn) => el('button', { class: 'btn ghost sm', type: 'button', title, text: label, onclick: fn });
    const imgBtn = async () => {
      const f = await pickImage(); if (!f) return;
      toast('Uploading the image...');
      try { const url = await uploadImage(f), alt = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); insert(`\n![${alt}](${url})\n`); toast('Image added'); } catch (e) { toast(e.message); }
    };
    const toolbar = el('div', { class: 'be-tools' },
      tb('H2', 'Heading', () => line('## ')), tb('H3', 'Smaller heading', () => line('### ')), tb('B', 'Bold (Ctrl+B)', () => wrap('**')), tb('I', 'Italic (Ctrl+I)', () => wrap('*')),
      tb('Link', 'Link (Ctrl+K)', () => { const u = prompt('Link address (https://... or a page of this site like /compress-image)'); if (u) wrap('[', `](${u.trim()})`, 'link text'); }),
      tb('Image', 'Upload an image into the post', imgBtn), tb('• List', 'Bulleted list', () => line('- ')), tb('1. List', 'Numbered list', () => line('1. ')),
      tb('Quote', 'Quote', () => line('> ')), tb('Code', 'Code', () => wrap('`')), tb('Table', 'Table', () => insert('\n| Column 1 | Column 2 |\n|---|---|\n| A | B |\n')), tb('Line', 'Divider', () => insert('\n---\n')));
    text.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrap('**'); } else if (k === 'i') { e.preventDefault(); wrap('*'); } else if (k === 'k') { e.preventDefault(); toolbar.children[4].click(); }
    });

    const save = async status => {
      msg.textContent = '';
      const s = (await mdLib()).slugify(slug.value || title.value); slug.value = s;
      if (!title.value.trim()) { msg.textContent = 'Give the post a title.'; title.focus(); return; }
      if (!s) { msg.textContent = 'Give the post an address.'; slug.focus(); return; }
      if (wasPublished && s !== p.slug && !confirm(`Change the address from /blog/${p.slug} to /blog/${s}? The old address will redirect to the new one.`)) return;
      const data = { slug: s, title: title.value, desc: desc.value, body: text.value, cover: cover.value.trim(), coverAlt: coverAlt.value, tags: tags.value.split(','), status, published: date.value || null, isNew: !!p.isNew };
      try {
        const r = await api('blog/' + (p.isNew ? s : p.slug), 'PUT', data);
        B.edit = r.post; B.dirty = false; B.posts = null;
        toast(status === 'published' ? (wasPublished ? 'Updated. The live post shows the changes now.' : 'Published! It is live at /blog/' + s) : 'Saved as a draft');
        draw();
      } catch (e) { msg.textContent = e.message; }
    };
    const back = () => { if (B.dirty && !confirm('Leave without saving your changes?')) return; B.edit = null; B.dirty = false; B.posts = null; draw(); };
    const uploadCover = async () => { const f = await pickImage(); if (!f) return; toast('Uploading the image...'); try { cover.value = await uploadImage(f); if (!coverAlt.value) coverAlt.value = title.value; mark(); showCover(); toast('Cover image added'); } catch (e) { toast(e.message); } };

    const field = (label, input, extra) => el('label', { class: 'be-field' }, el('span', { class: 'be-lab' }, label, extra || null), input);
    body.append(el('div', { class: 'adm-bar' },
      el('button', { class: 'btn ghost sm', type: 'button', text: '← All posts', onclick: back }),
      el('b', { text: p.isNew ? 'New post' : 'Editing' }), !p.isNew ? pill(...postState(p)) : null,
      el('span', { class: 'sp' }),
      wasPublished ? el('a', { class: 'btn sec sm', href: '/blog/' + p.slug, target: '_blank', rel: 'noopener', text: 'View live' }) : null,
      wasPublished ? el('button', { class: 'btn ghost sm', type: 'button', text: 'Unpublish', title: 'Take it off the blog and keep it as a draft', onclick: () => save('draft') }) : el('button', { class: 'btn sec sm', type: 'button', text: 'Save draft', onclick: () => save('draft') }),
      el('button', { class: 'btn sm', type: 'button', text: wasPublished ? 'Update' : 'Publish', onclick: () => save('published') })));
    body.append(msg);
    body.append(el('div', { class: 'be' },
      el('div', { class: 'be-main' },
        title,
        el('div', { class: 'be-slug' }, el('span', { class: 'adm-small', text: 'toolzbaba.com/blog/' }), slug),
        toolbar, text, el('div', { class: 'be-foot' }, stats, el('span', { class: 'adm-small', text: 'Ctrl+B bold · Ctrl+I italic · Ctrl+K link' }))),
      el('div', { class: 'be-side' },
        el('div', { class: 'adm-card be-card' },
          field('Description', desc, descN),
          field('Cover image', el('div', { class: 'be-row' }, cover, el('button', { class: 'btn sec sm', type: 'button', text: 'Upload', onclick: uploadCover }))),
          coverImg, field('Cover image description', coverAlt),
          field('Tags (comma separated)', tags),
          field('Publish date', date, el('span', { class: 'adm-small', text: ' empty: when you publish' }))),
        el('div', { class: 'adm-card be-card' }, el('b', { class: 'be-lab', text: 'Preview' }), preview))));
    showCover(); showDesc(); render();
    (p.isNew ? title : text).focus();
  }

  function drawHelp(body) {
    const h = el('div', { class: 'adm-help' });
    h.innerHTML = `<h3>Setting it up (once)</h3><p>The panel needs two secrets in the Cloudflare Pages project (Settings, Variables and Secrets): <code>ADMIN_USER</code> (your ID) and <code>ADMIN_KEY</code> (your password, 16 or more characters, used nowhere else). Signing in gives this browser a session cookie for 8 hours that page scripts can't read; the password is never stored. After 5 wrong tries from one visitor, or 50 from everyone within an hour, the door stays shut for a while. Scripts can also send the headers <code>X-Requested-With: toolzbaba-admin</code>, <code>X-Admin-User</code> and <code>X-Admin-Key</code> (e.g. to delete a hosted file). For one more lock, put Cloudflare Access in front of <code>/admin</code> and <code>/api/admin/*</code> (see README). Archive / history / lab results live in the KV namespace called CDN.</p>
<h3>Archive and go live</h3><p>Archiving a tool puts its slug on a list at <code>/api/tool-status</code>. Every page keeps that list for 10 minutes and refreshes it when the browser is idle, so it never delays a page. The tool disappears from the home page, search and menus; its address shows "taking a break" (not indexed). A tool with tabs takes its tab pages with it; a single tab page can be archived on its own. For a permanent archive put <code>"archived": true</code> on the tool in <code>tools.json</code>: that also removes it from the sitemap. Until the next deploy the sitemap still lists tools archived here.</p>
<h3>Blog</h3><p>Write posts in the Blog tab. "Save draft" keeps a post private; "Publish" puts it live at <code>/blog/your-post</code> straight away, with its own title and description for Google, a cover image for social media, and an entry in the site's one sitemap <code>/sitemap.xml</code> (also in <code>/blog/sitemap.xml</code>) and the RSS feed <code>/blog/feed.xml</code>. Images you upload are shrunk to WebP in your browser and kept for good at <code>/blog/images/</code>. Changing a published post's address keeps the old one working as a redirect. Posts are written in Markdown (the toolbar buttons type it for you): <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[text](https://...)</code>, <code>- list</code>, <code>&gt; quote</code>; HTML in a post is shown as text, never run. Free KV allows 1,000 saves a day, far more than a blog needs.</p>
<h3>Real visitors</h3><p>The speed numbers come from the visitors' own browsers: a sample (1 in 10) sends one small message per page view. Free KV allows 1,000 writes a day, so at most ${S.maxWrites} messages a day are saved. Counts are estimates. If the site grows, move this to D1 or Analytics Engine.</p>
<h3>Google index</h3><p>The Google index tab asks Google, page by page, whether each address in <code>/sitemap.xml</code> is in its index, and if not why ("Discovered – currently not indexed", "Crawled – currently not indexed", a redirect, a different canonical...). It is the same answer as URL inspection in Search Console, read through the URL Inspection API with a service account (the key is the Pages secret <code>GSC_SERVICE_ACCOUNT</code>; the tab shows how to set it up). Google allows 2,000 checks a day, so the whole sitemap takes two or three days; results are kept in KV (one save per 60 checks) and every run continues where the last one stopped. Use "Download as CSV" for the list of pages to send to Google with "Request indexing" in Search Console (Google allows about 10 such requests a day there).</p>
<h3>Lab tests</h3><p>Run them after every deploy: "Every tool" without heavy tools takes a few minutes. Anything red is worth a look. The full browser test files in <code>/tests</code> remain the real safety net.</p>
<h3>Keeping the site fast</h3><p>Tools load their code only when used, models only when a button is pressed, and the admin code is never loaded on public pages. Watch "Weight", "Ready" and "LCP": a tool that turns red after a change is the one to fix. The limits used for the colours are Google's: LCP 2.5 s / 4 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25.</p>`;
    body.append(h);
  }

  boot(); // shows the sign-in form if this browser has no valid session
})();
