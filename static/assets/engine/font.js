// Font converter engine: the conversion itself is Python's fontTools (engine/fontconv.py), run in a worker by engine/font-worker.js
// so the page keeps responding while a large font is converted. The worker stays alive between conversions.
(() => {
  const MIME = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', ttc: 'font/collection', eot: 'application/vnd.ms-fontobject', svg: 'image/svg+xml', dfont: 'application/x-dfont' };
  let worker = null, seq = 0;
  const waiting = {};
  function start() {
    if (worker) return worker;
    worker = new Worker(HT.ver('/assets/engine/font-worker.js'), { type: 'module' });
    worker.onmessage = ({ data: m }) => {
      const w = waiting[m.id]; if (!w) return;
      if (m.type === 'progress') return w.ctx.status(m.msg);
      delete waiting[m.id];
      m.type === 'error' ? w.rej(new Error(m.msg)) : w.res(m);
    };
    worker.onerror = e => {   // the worker itself failed to start: tell everyone waiting, and start afresh next time
      for (const id of Object.keys(waiting)) { waiting[id].rej(new Error('The font engine could not start: ' + (e.message || 'unknown error'))); delete waiting[id]; }
      worker.terminate(); worker = null;
    };
    return worker;
  }
  HT.engine('font-converter', async ctx => {
    const fmt = String(ctx.opts.format || 'woff2');
    if (!MIME[fmt]) throw new Error('Choose the format to convert to.');
    const files = await Promise.all(ctx.files.map(async f => ({ name: f.name, data: await f.arrayBuffer() })));
    ctx.status('Starting the font engine...');
    const id = ++seq;
    const r = await new Promise((res, rej) => { waiting[id] = { res, rej, ctx }; start().postMessage({ id, files, format: fmt }, files.map(f => f.data)); });
    ctx.progress(1);
    ctx.info = { summary: r.summary };
    return r.outs.map(o => ({ name: o.name, blob: new Blob([o.data], { type: MIME[fmt] }) }));
  });
})();
