// Admin panel: archive / go live, what real visitors experience, lab tests that open every tool and try it, history.
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
      const [tools, st, rum, lab] = await Promise.all([fetch('/assets/tools.json', { cache: 'no-cache' }).then(r => r.json()), api('status'), api('rum'), api('lab')]);
      S.cats = tools.categories; S.tools = tools.tools; S.variants = tools.variants || [];
      S.status = st.status || { tools: {} }; S.log = st.log || []; S.rum = rum.rum; S.edges = rum.edges; S.maxWrites = rum.maxWrites; S.lab = lab.lab || {};
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
    const tabs = [['tools', 'Tools'], ['rum', 'Real visitors'], ['lab', 'Lab tests'], ['log', 'History'], ['help', 'Help']];
    wrap.append(el('div', { class: 'adm-tabs', role: 'tablist' }, tabs.map(([id, t]) => el('button', { class: 'adm-tab' + (S.tab === id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': S.tab === id ? 'true' : 'false', text: t, onclick: () => { S.tab = id; draw(); } }))));
    const body = el('div', { id: 'adm-body' }); wrap.append(body);
    ({ tools: drawTools, rum: drawRum, lab: drawLab, log: drawLog, help: drawHelp })[S.tab](body);
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
    if (/image|\.jpe?g|\.png|\.webp/.test(a) || any) { const jpgOnly = !/png|image\/\*|webp/.test(a) && /jpe?g/.test(a); return jpgOnly ? { blob: await sampleImage('image/jpeg'), name: 'lab-sample.jpg' } : { blob: await sampleImage('image/png'), name: 'lab-sample.png' }; }
    if (/\.gif/.test(a)) return { why: 'needs a GIF file' };
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
      let clicked = false;
      const outcome = await waitFor(() => {
        fillAsked(d, w);
        const e = errText(); if (e) return { state: 'err', msg: e };
        if (result()) return { state: 'ok' };
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

  function drawHelp(body) {
    const h = el('div', { class: 'adm-help' });
    h.innerHTML = `<h3>Setting it up (once)</h3><p>The panel needs two secrets in the Cloudflare Pages project (Settings, Variables and Secrets): <code>ADMIN_USER</code> (your ID) and <code>ADMIN_KEY</code> (your password, 16 or more characters, used nowhere else). Signing in gives this browser a session cookie for 8 hours that page scripts can't read; the password is never stored. After 5 wrong tries from one visitor, or 50 from everyone within an hour, the door stays shut for a while. Scripts can also send the headers <code>X-Requested-With: toolzbaba-admin</code>, <code>X-Admin-User</code> and <code>X-Admin-Key</code> (e.g. to delete a hosted file). For one more lock, put Cloudflare Access in front of <code>/admin</code> and <code>/api/admin/*</code> (see README). Archive / history / lab results live in the KV namespace called CDN.</p>
<h3>Archive and go live</h3><p>Archiving a tool puts its slug on a list at <code>/api/tool-status</code>. Every page keeps that list for 10 minutes and refreshes it when the browser is idle, so it never delays a page. The tool disappears from the home page, search and menus; its address shows "taking a break" (not indexed). A tool with tabs takes its tab pages with it; a single tab page can be archived on its own. For a permanent archive put <code>"archived": true</code> on the tool in <code>tools.json</code>: that also removes it from the sitemap. Until the next deploy the sitemap still lists tools archived here.</p>
<h3>Real visitors</h3><p>The speed numbers come from the visitors' own browsers: a sample (1 in 10) sends one small message per page view. Free KV allows 1,000 writes a day, so at most ${S.maxWrites} messages a day are saved. Counts are estimates. If the site grows, move this to D1 or Analytics Engine.</p>
<h3>Lab tests</h3><p>Run them after every deploy: "Every tool" without heavy tools takes a few minutes. Anything red is worth a look. The full browser test files in <code>/tests</code> remain the real safety net.</p>
<h3>Keeping the site fast</h3><p>Tools load their code only when used, models only when a button is pressed, and the admin code is never loaded on public pages. Watch "Weight", "Ready" and "LCP": a tool that turns red after a change is the one to fix. The limits used for the colours are Google's: LCP 2.5 s / 4 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25.</p>`;
    body.append(h);
  }

  boot(); // shows the sign-in form if this browser has no valid session
})();
