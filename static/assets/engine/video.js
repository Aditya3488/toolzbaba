// Video / audio engine (runs in the browser with ffmpeg.wasm): converter, video -> GIF, GIF -> video, trimmer,
// compressor, audio cutter, merger and speed changer. Same ffmpeg commands as the server version, with faster
// x264 presets because the browser build has a single thread.
(() => {
  const BASE = '/assets/vendor/ffmpeg-0.12.15/';
  let wasm = null, onLog = null, onProgress = null;
  const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'];
  const mb = n => n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  // A fresh ffmpeg for every job: reusing one across jobs can leave its memory in a broken state.
  // Only the first job downloads the core (~31 MB); later ones start in a fraction of a second.
  async function engine(ctx) {
    if (!wasm) wasm = (async () => {
      // Cloudflare Pages allows 25 MiB per file, so the core is stored in two parts and joined here
      ctx.status('Loading the video engine (31 MB, only the first time)...');
      const parts = await Promise.all([0, 1].map(async i => {
        const r = await fetch(`${BASE}core/ffmpeg-core.wasm.part${i}`);
        if (!r.ok) throw new Error('Could not load the video engine. Check your connection and try again.');
        return r.blob();
      }));
      return URL.createObjectURL(new Blob(parts, { type: 'application/wasm' }));
    })().catch(e => { wasm = null; throw e; });
    const wasmURL = await wasm;
    const { FFmpeg } = await import(BASE + 'index.js');
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => onLog && onLog(message));
    ff.on('progress', ({ time }) => onProgress && onProgress(time / 1e6));
    ctx.status('Starting...');
    await ff.load({ coreURL: new URL(BASE + 'core/ffmpeg-core.js', location.href).href, wasmURL });
    return ff;
  }

  // Every tool gets session(files) -> { ff, paths }: a fresh ffmpeg with the input files mounted read-only (WORKERFS),
  // so even big videos aren't copied into memory first. The ffmpeg is shut down when the job ends, whatever happens.
  const tool = (slug, fn) => HT.engine(slug, async ctx => {
    let ff = null;
    const session = async files => {
      ff = await engine(ctx);
      const named = files.map((f, i) => new File([f], `in${i}.${HT.ext(f.name) || 'bin'}`, { type: f.type }));
      await ff.createDir('/in');
      await ff.mount('WORKERFS', { files: named }, '/in');
      return { ff, paths: named.map(f => '/in/' + f.name) };
    };
    try { return await fn(ctx, session); } finally { if (ff) ff.terminate(); }
  });

  // ffmpeg -i: duration, size and which streams there are
  async function probe(ff, path) {
    const lines = [];
    onLog = m => lines.push(m);
    try { await ff.exec(['-hide_banner', '-i', path]); } finally { onLog = null; }
    const all = lines.join('\n'), d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(all), size = /Video:.*?,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(all);
    return { duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null, hasAudio: / Audio:/.test(all),
      hasVideo: / Video:/.test(all) && !/attached pic/.test(all), w: size ? +size[1] : null, h: size ? +size[2] : null };
  }

  // run ffmpeg, mapping its progress onto ctx.progress(base .. base+span); returns the output file as a Blob
  // (or leaves it in ffmpeg's memory with keep: true, for a later step)
  async function run(ff, ctx, args, out, { duration = null, base = 0, span = 1, type = '', keep = false } = {}) {
    const errs = [];
    onLog = m => { if (/error|invalid|unknown|not found|no such/i.test(m)) errs.push(m); };
    onProgress = t => { if (duration && t > 0) ctx.progress(base + span * Math.min(1, t / duration)); };
    let code;
    try { code = await ff.exec(['-y', '-hide_banner', '-nostdin', ...args, out]); }
    catch { throw new Error('The video engine stopped on this file (it may be too big for this device). Try MP4, a lower resolution or a shorter clip.'); }
    finally { onLog = onProgress = null; }
    if (code !== 0) {
      await ff.deleteFile(out).catch(() => { });
      throw new Error('ffmpeg could not process this file: ' + (errs[errs.length - 1] || 'unknown error'));
    }
    if (keep) return null;
    const data = await ff.readFile(out);
    await ff.deleteFile(out);
    return new Blob([data], { type });
  }

  const parseTime = (v, def = null) => {
    if (v === undefined || v === null || String(v).trim() === '') return def;
    let s = 0;
    for (const p of String(v).trim().split(':')) { const n = Number(p); if (Number.isNaN(n)) throw new Error(`Can't read time '${v}'. Use seconds or mm:ss.`); s = s * 60 + n; }
    return s;
  };
  const scale = res => res && res !== 'keep' && /^\d+$/.test(res) ? `scale=-2:min(${parseInt(res, 10)}\\,ih)` : null;
  const outName = (f, ext, suffix = '') => HT.stem(f.name) + suffix + '.' + ext;
  const MIME = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo', gif: 'image/gif',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac' };
  const AUDIO = { mp3: ['-c:a', 'libmp3lame', '-q:a', '2'], m4a: ['-c:a', 'aac', '-b:a', '192k'], wav: ['-c:a', 'pcm_s16le'], ogg: ['-c:a', 'libopus', '-b:a', '160k'], flac: ['-c:a', 'flac'] };
  // WebM uses VP8: the VP9 encoder crashes in the browser build of ffmpeg
  const CRF = { high: 20, medium: 24, low: 28 }, VP8 = { high: ['10', '4M'], medium: ['20', '2M'], low: ['30', '1M'] };
  const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p'];

  // ---------------------------------------------------------------- converter
  tool('video-converter', async (ctx, session) => {
    const fmt = ctx.opts.format || 'mp4', quality = ctx.opts.quality || 'medium';
    if (!CRF[quality]) throw new Error('Unknown quality.');
    const outs = [], rows = [], { ff, paths } = await session(ctx.files);
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Converting ${i + 1} of ${ctx.files.length}...` : 'Converting...');
      const src = paths[i], { duration } = await probe(ff, src);
      let args = ['-i', src];
      if (AUDIO[fmt]) args.push('-vn', ...AUDIO[fmt]);
      else if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(fmt)) {
        const vf = scale(ctx.opts.resolution);
        if (vf) args.push('-vf', vf);
        if (fmt === 'webm') args.push('-c:v', 'libvpx', '-crf', VP8[quality][0], '-b:v', VP8[quality][1], '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-b:a', '128k');
        else {
          args.push(...X264, '-crf', String(CRF[quality]));
          args.push(...(fmt === 'avi' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'aac', '-b:a', '160k']));
          if (fmt === 'mp4' || fmt === 'mov') args.push('-movflags', '+faststart');
        }
      } else throw new Error('Unsupported output format.');
      const blob = await run(ff, ctx, args, `out.${fmt}`, { duration, base: i / ctx.files.length, span: 1 / ctx.files.length, type: MIME[fmt] });
      outs.push({ name: outName(f, fmt), blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
    }
    ctx.info = { summary: `Converted ${outs.length} file(s) to ${fmt.toUpperCase()}`, files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- video -> gif
  tool('video-to-gif', async (ctx, session) => {
    const f = ctx.files[0], o = ctx.opts;
    const start = parseTime(o.start, 0), length = Math.min(60, parseTime(o.duration, 8));
    const fps = Math.max(1, Math.min(30, parseInt(o.fps, 10) || 12)), width = Math.max(64, Math.min(1280, parseInt(o.width, 10) || 480));
    const loop = o.loop === undefined || o.loop === true || o.loop === 'true' ? '0' : '-1';
    const vf = `fps=${fps},scale='min(${width},iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
    const { ff, paths } = await session([f]);
    let blob;
    ctx.status('Making the GIF...');
    blob = await run(ff, ctx, ['-ss', String(start), '-t', String(length), '-i', paths[0], '-vf', vf, '-loop', loop], 'out.gif', { duration: length, type: 'image/gif' });
    ctx.info = { summary: `GIF created (${mb(blob.size)}). Lower the width or FPS for a smaller file.` };
    return [{ name: outName(f, 'gif'), blob }];
  });

  // ---------------------------------------------------------------- compress GIF (page /compress-gif)
  tool('compress-gif', async (ctx, session) => {
    const o = ctx.opts, colors = [256, 128, 64, 32, 16].includes(parseInt(o.colors, 10)) ? parseInt(o.colors, 10) : 128;
    const width = Math.max(0, Math.min(1920, parseInt(o.width, 10) || 0)), fps = Math.max(0, Math.min(30, parseInt(o.fps, 10) || 0));
    const pre = [fps ? `fps=${fps}` : '', width ? `scale='min(${width},iw)':-1:flags=lanczos` : ''].filter(Boolean).join(',');
    const vf = (pre ? pre + ',' : '') + `split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    const outs = [], rows = [], { ff, paths } = await session(ctx.files); let kept = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Compressing ${i + 1} of ${ctx.files.length}...` : 'Compressing...');
      const { duration } = await probe(ff, paths[i]);
      let blob = await run(ff, ctx, ['-i', paths[i], '-vf', vf, '-loop', '0'], 'out.gif', { duration, base: i / ctx.files.length, span: 1 / ctx.files.length, type: 'image/gif' });
      if (blob.size >= f.size) { blob = f; kept++; }  // already well compressed: never hand back a bigger file
      outs.push({ name: outName(f, 'gif', '_compressed'), blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
    }
    const tb = rows.reduce((a, r) => a + r.before, 0), ta = rows.reduce((a, r) => a + r.after, 0);
    ctx.info = { summary: `${mb(tb)} \u2192 ${mb(ta)}` + (ta < tb ? `  (${Math.round((1 - ta / tb) * 100)}% smaller)` : '')
      + (kept ? `. ${kept} GIF(s) were already well compressed, so the original was kept. Try fewer colours or a smaller width.` : ''), files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- gif -> video
  tool('gif-to-video', async (ctx, session) => {
    const fmt = ctx.opts.format || 'mp4', loops = Math.max(1, Math.min(20, parseInt(ctx.opts.loops, 10) || 1));
    if (fmt !== 'mp4' && fmt !== 'webm') throw new Error('Choose MP4 or WebM.');
    const outs = [], { ff, paths } = await session(ctx.files);
    for (const [i, f] of ctx.files.entries()) {
      const src = paths[i], { duration } = await probe(ff, src);
      const args = ['-stream_loop', String(loops - 1), '-i', src, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an'];
      if (fmt === 'webm') args.push('-c:v', 'libvpx', '-crf', '20', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p');
      else args.push(...X264, '-crf', '22', '-movflags', '+faststart');
      outs.push({ name: outName(f, fmt), blob: await run(ff, ctx, args, 'out.' + fmt, { duration: duration && duration * loops, base: i / ctx.files.length, span: 1 / ctx.files.length, type: MIME[fmt] }) });
    }
    ctx.info = { summary: `Converted ${outs.length} GIF(s) to ${fmt.toUpperCase()}` };
    return outs;
  });

  // ---------------------------------------------------------------- trimmer
  tool('video-trimmer', async (ctx, session) => {
    const f = ctx.files[0], ext = HT.ext(f.name) || 'mp4', { ff, paths } = await session([f]);
    let blob, start, end, length;
    const { duration } = await probe(ff, paths[0]);
    start = parseTime(ctx.opts.start, 0); end = parseTime(ctx.opts.end, duration);
    if (duration && (end === null || end > duration)) end = duration;
    if (end === null || end <= start) throw new Error('The end time must be after the start time.');
    length = end - start;
    let args;
    if (ctx.opts.mode === 'fast') args = ['-ss', String(start), '-i', paths[0], '-t', String(length), '-c', 'copy', '-avoid_negative_ts', 'make_zero'];
    else if (AUDIO_EXT.includes(ext)) args = ['-ss', String(start), '-i', paths[0], '-t', String(length)];
    else {
      args = ['-ss', String(start), '-i', paths[0], '-t', String(length), ...X264, '-crf', '20', '-c:a', 'aac', '-b:a', '160k'];
      if (['mp4', 'mov', 'm4v'].includes(ext)) args.push('-movflags', '+faststart');
    }
    ctx.status('Trimming...');
    blob = await run(ff, ctx, args, 'out.' + ext, { duration: length, type: f.type || MIME[ext] || '' });
    ctx.info = { summary: `Trimmed ${start.toFixed(1)}s → ${end.toFixed(1)}s (${length.toFixed(1)}s, ${mb(blob.size)})` };
    return [{ name: outName(f, ext, '_trimmed'), blob }];
  });

  // ---------------------------------------------------------------- compressor
  tool('compress-video', async (ctx, session) => {
    const o = ctx.opts, mode = o.mode || 'level';
    const crf = { light: 23, medium: 27, strong: 32 }[o.level || 'medium'];
    if (crf === undefined) throw new Error('Unknown compression level.');
    const outs = [], rows = [], { ff, paths } = await session(ctx.files);
    let kept = 0;
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Compressing ${i + 1} of ${ctx.files.length}...` : 'Compressing...');
      const src = paths[i], { duration } = await probe(ff, src), args = ['-i', src], vf = scale(o.resolution);
      if (vf) args.push('-vf', vf);
      let audio = '128k';
      if (mode === 'size') {
        const target = parseFloat(o.target_mb);
        if (!duration || !(target > 0)) throw new Error('Enter a target size in MB.');
        const vbit = Math.floor(target * 8192 * 0.97 / duration - 96);
        if (vbit < 50) throw new Error("That target is too small for this video's length. Try a larger size.");
        args.push('-c:v', 'libx264', '-preset', 'faster', '-b:v', vbit + 'k', '-maxrate', Math.floor(vbit * 1.4) + 'k', '-bufsize', vbit * 2 + 'k');
        audio = '96k';
      } else args.push('-c:v', 'libx264', '-preset', 'faster', '-crf', String(crf));
      args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', audio, '-movflags', '+faststart');
      let blob = await run(ff, ctx, args, 'out.mp4', { duration, base: i / ctx.files.length, span: 1 / ctx.files.length, type: 'video/mp4' });
      let name = outName(f, 'mp4', '_compressed');
      if (blob.size >= f.size) { blob = f; name = outName(f, HT.ext(f.name) || 'mp4', '_original'); kept++; } // re-encoding made it bigger: keep the original
      outs.push({ name, blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
    }
    const tb = rows.reduce((a, r) => a + r.before, 0), ta = rows.reduce((a, r) => a + r.after, 0), pct = tb ? Math.round((1 - ta / tb) * 100) : 0;
    let note = pct > 0 ? `  (${pct}% smaller)` : '';
    if (kept) note += `  (${kept} file(s) were already small enough, so the original was kept. Try 'Strong' or a lower resolution.)`;
    ctx.info = { summary: `${mb(tb)} → ${mb(ta)}` + note, files: rows };
    return outs;
  });

  // ---------------------------------------------------------------- audio cutter
  const cutAudio = async (ctx, session) => {
    const f = ctx.files[0], o = ctx.opts, srcExt = HT.ext(f.name), fmt = o.format && o.format !== 'keep' ? o.format : (AUDIO[srcExt] ? srcExt : 'mp3');
    if (!AUDIO[fmt]) throw new Error('Unsupported audio format.');
    const { ff, paths } = await session([f]);
    let blob, start, end, length;
    const { duration } = await probe(ff, paths[0]);
    start = parseTime(o.start, 0); end = parseTime(o.end, duration);
    if (duration && (end === null || end > duration)) end = duration;
    if (end === null || end <= start) throw new Error('The end time must be after the start time.');
    length = end - start;
    const fadeIn = Math.max(0, Math.min(+o.fade_in || 0, length)), fadeOut = Math.max(0, Math.min(+o.fade_out || 0, length)), filters = [];
    if (fadeIn) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut) filters.push(`afade=t=out:st=${Math.max(0, length - fadeOut)}:d=${fadeOut}`);
    const args = ['-ss', String(start), '-t', String(length), '-i', paths[0], '-vn'];
    if (filters.length) args.push('-af', filters.join(','));
    ctx.status('Cutting...');
    blob = await run(ff, ctx, [...args, ...AUDIO[fmt]], 'out.' + fmt, { duration: length, type: MIME[fmt] });
    ctx.info = { summary: `Cut ${start.toFixed(1)}s → ${end.toFixed(1)}s (${length.toFixed(1)}s, ${mb(blob.size)})` };
    return [{ name: outName(f, fmt, '_cut'), blob }];
  };

  // ---------------------------------------------------------------- merger
  const even = v => Math.max(2, Math.round(v / 2) * 2);
  tool('video-merger', async (ctx, session) => {
    const crf = { high: 20, medium: 23, low: 27 }[ctx.opts.quality || 'medium'];
    if (crf === undefined) throw new Error('Unknown quality.');
    const { ff, paths } = await session(ctx.files), segs = [];
    let W, H, blob;
    const infos = [];
    for (const [i, p] of paths.entries()) {
      const inf = await probe(ff, p);
      if (!inf.hasVideo) throw new Error(`'${ctx.files[i].name}' has no video.`);
      infos.push(inf);
    }
    const first = infos[0], res = ctx.opts.resolution || 'first';
    if (res === 'first') { W = even(first.w || 1280); H = even(first.h || 720); }
    else { H = even(parseInt(res, 10)); W = even(H * (first.w || 16) / (first.h || 9)); }
    const total = infos.reduce((a, i) => a + (i.duration || 0), 0) || 1;
    let done = 0;
    // every clip is re-encoded to the same size, frame rate and audio format, then the parts are joined losslessly
    for (const [i, inf] of infos.entries()) {
      ctx.status(`Preparing clip ${i + 1} of ${infos.length}...`);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`;
      const args = ['-i', paths[i]];
      let amap = '0:a:0', extra = [];
      if (!inf.hasAudio) { args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'); amap = '1:a:0'; extra = ['-shortest']; } // silent clips get silent audio
      args.push('-map', '0:v:0', '-map', amap, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', ...extra);
      const span = (inf.duration || 0) / total;
      await run(ff, ctx, args, `seg${i}.mp4`, { duration: inf.duration, base: done * 0.95, span: span * 0.95, keep: true });
      segs.push(`seg${i}.mp4`); done += span;
    }
    await ff.writeFile('list.txt', segs.map(s => `file '${s}'\n`).join(''));
    ctx.status('Joining...');
    blob = await run(ff, ctx, ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart'], 'merged.mp4', { type: 'video/mp4' });
    ctx.info = { summary: `Joined ${segs.length} videos into one ${W}×${H} MP4 (${mb(blob.size)})` };
    return [{ name: 'merged.mp4', blob }];
  });

  // ---------------------------------------------------------------- speed
  const atempo = speed => { // atempo accepts 0.5..2, so chain it for bigger changes
    const parts = [];
    while (speed > 2) { parts.push(2); speed /= 2; }
    while (speed < 0.5) { parts.push(0.5); speed /= 0.5; }
    parts.push(speed);
    return parts.map(p => `atempo=${p.toFixed(4)}`).join(',');
  };
  tool('change-video-speed', async (ctx, session) => {
    const speed = parseFloat(ctx.opts.speed ?? 2), keepAudio = (ctx.opts.audio || 'keep') === 'keep';
    if (!(speed >= 0.25 && speed <= 8)) throw new Error('Choose a speed between 0.25x and 8x.');
    const outs = [], { ff, paths } = await session(ctx.files);
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Changing speed ${i + 1} of ${ctx.files.length}...` : 'Changing speed...');
      const inf = await probe(ff, paths[i]), args = ['-i', paths[i], '-vf', `setpts=PTS/${speed}`];
      if (inf.hasAudio && keepAudio) args.push('-af', atempo(speed), '-c:a', 'aac', '-b:a', '160k'); else args.push('-an');
      args.push(...X264, '-crf', '23', '-movflags', '+faststart');
      outs.push({ name: outName(f, 'mp4', `_${speed}x`), blob: await run(ff, ctx, args, 'out.mp4', { duration: inf.duration && inf.duration / speed, base: i / ctx.files.length, span: 1 / ctx.files.length, type: 'video/mp4' }) });
    }
    ctx.info = { summary: `${speed}x speed applied to ${outs.length} video(s)` };
    return outs;
  });
  // ---------------------------------------------------------------- video -> audio (pages /video-to-audio and /mp4-to-mp3)
  const audioArgs = (fmt, br) => (fmt === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', br + 'k'] : fmt === 'm4a' ? ['-c:a', 'aac', '-b:a', br + 'k'] : fmt === 'ogg' ? ['-c:a', 'libopus', '-b:a', br + 'k'] : AUDIO[fmt]);
  tool('video-to-audio', async (ctx, session) => {
    const fmt = ctx.opts.format || 'mp3', br = ['64', '96', '128', '160', '192', '256', '320'].includes(String(ctx.opts.bitrate)) ? String(ctx.opts.bitrate) : '192';
    if (!AUDIO[fmt]) throw new Error('Unsupported audio format.');
    const outs = [], rows = [], { ff, paths } = await session(ctx.files);
    for (const [i, f] of ctx.files.entries()) {
      ctx.status(ctx.files.length > 1 ? `Taking the sound out of ${i + 1} of ${ctx.files.length}...` : 'Taking the sound out...');
      const inf = await probe(ff, paths[i]);
      if (!inf.hasAudio) throw new Error(`'${f.name}' has no sound.`);
      const blob = await run(ff, ctx, ['-i', paths[i], '-vn', ...audioArgs(fmt, br)], `out.${fmt}`, { duration: inf.duration, base: i / ctx.files.length, span: 1 / ctx.files.length, type: MIME[fmt] });
      outs.push({ name: outName(f, fmt), blob });
      rows.push({ name: f.name, before: f.size, after: blob.size });
    }
    ctx.info = { summary: `${outs.length} file(s) saved as ${fmt.toUpperCase()}`, files: rows };
    return outs;
  });

  // the Audio Converter (and its pages such as /wav-to-mp3) takes audio files too: the same job, the video part is simply absent
  HT.engines['audio-converter'] = HT.engines['video-to-audio'];

  // ---------------------------------------------------------------- split video / audio into parts
  const pad2 = n => String(n).padStart(2, '0');
  async function splitMedia(ctx, session, audioOnly) {
    const f = ctx.files[0], o = ctx.opts, srcExt = HT.ext(f.name) || (audioOnly ? 'mp3' : 'mp4');
    const { ff, paths } = await session([f]), { duration } = await probe(ff, paths[0]);
    if (!duration) throw new Error("Couldn't read the length of this file.");
    let len;
    if ((o.by || 'length') === 'parts') len = duration / Math.max(2, Math.min(100, parseInt(o.parts, 10) || 2));
    else { len = parseTime(o.seconds, 30); if (!(len >= 1)) throw new Error('Each part must be at least 1 second long.'); }
    const n = Math.ceil(duration / len - 0.001);
    if (n < 2) throw new Error(`This file is only ${duration.toFixed(1)} seconds long: choose a shorter part length.`);
    if (n > 100) throw new Error(`That would make ${n} parts (the limit is 100). Choose a longer part length.`);
    const fmt = audioOnly ? (o.format && o.format !== 'keep' ? o.format : null) : null;
    if (audioOnly && fmt && !AUDIO[fmt]) throw new Error('Unsupported audio format.');
    const ext = audioOnly ? (fmt || (AUDIO_EXT.includes(srcExt) ? srcExt : 'mp3')) : srcExt, outs = [];
    for (let i = 0; i < n; i++) {
      ctx.status(`Cutting part ${i + 1} of ${n}...`);
      const start = i * len, part = Math.min(len, duration - start);
      let args = ['-ss', String(start), '-i', paths[0], '-t', String(part)];
      if (audioOnly) args.push('-vn', ...(fmt ? AUDIO[fmt] : AUDIO_EXT.includes(srcExt) && !(o.accurate) ? ['-c', 'copy'] : AUDIO.mp3));
      else if ((o.mode || 'fast') === 'fast') args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
      else { args.push(...X264, '-crf', '22', '-c:a', 'aac', '-b:a', '160k'); if (['mp4', 'mov', 'm4v'].includes(ext)) args.push('-movflags', '+faststart'); }
      const blob = await run(ff, ctx, args, 'out.' + ext, { duration: part, base: i / n, span: 1 / n, type: MIME[ext] || f.type || '' });
      outs.push({ name: `${HT.stem(f.name)}_part${pad2(i + 1)}.${ext}`, blob });
    }
    ctx.info = { summary: `Split into ${n} parts of about ${len.toFixed(1)} seconds` + ((o.mode || 'fast') === 'fast' && !audioOnly ? '. Fast mode cuts at the nearest keyframe, so a part can start or end a moment off.' : '') };
    return outs;
  }
  tool('split-video', (ctx, session) => splitMedia(ctx, session, false));
  // the Split Audio page does both: cut out one part, or split into parts
  tool('split-audio', (ctx, session) => ((ctx.opts.by || 'cut') === 'cut' ? cutAudio(ctx, session) : splitMedia(ctx, session, true)));

  // ---------------------------------------------------------------- merge audio files
  tool('merge-audio', async (ctx, session) => {
    const fmt = ctx.opts.format || 'mp3';
    if (!AUDIO[fmt]) throw new Error('Unsupported audio format.');
    const { ff, paths } = await session(ctx.files), infos = [];
    for (const [i, p] of paths.entries()) { const inf = await probe(ff, p); if (!inf.hasAudio) throw new Error(`'${ctx.files[i].name}' has no sound.`); infos.push(inf); }
    const total = infos.reduce((a, i) => a + (i.duration || 0), 0) || null, gap = Math.max(0, Math.min(10, +ctx.opts.gap || 0));
    const args = [];
    paths.forEach(p => args.push('-i', p));
    // every file is made the same sample rate and channel layout first, then they are joined (with an optional silent gap)
    const parts = paths.map((_, i) => `[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo${gap && i < paths.length - 1 ? `,apad=pad_dur=${gap}` : ''}[a${i}]`);
    args.push('-filter_complex', parts.join(';') + ';' + paths.map((_, i) => `[a${i}]`).join('') + `concat=n=${paths.length}:v=0:a=1[out]`, '-map', '[out]', ...AUDIO[fmt]);
    ctx.status('Joining...');
    const blob = await run(ff, ctx, args, 'merged.' + fmt, { duration: total && total + gap * (paths.length - 1), type: MIME[fmt] });
    ctx.info = { summary: `Joined ${paths.length} audio files into one ${fmt.toUpperCase()} (${mb(blob.size)})` };
    return [{ name: 'merged.' + fmt, blob }];
  });

  // ---------------------------------------------------------------- watermark on a video (text or logo)
  // The watermark is drawn as a picture with its opacity already applied, then laid over the video with ffmpeg's overlay filter.
  async function watermarkPng(ctx, o, videoW) {
    let c;
    if (o.type === 'image') {
      const logo = ctx.files[1]; if (!logo) throw new Error('Add a logo image first.');
      const b = await HT.loadBitmap(logo), w = Math.max(16, Math.round(videoW * Math.max(2, Math.min(80, +o.size || 20)) / 100));
      c = HT.resample(HT.toCanvas(b), w, Math.max(1, Math.round(w * b.height / b.width)));
    } else {
      const text = String(o.text || '').trim(); if (!text) throw new Error('Type the watermark text first.');
      const px = Math.max(12, Math.round(videoW * Math.max(1, Math.min(30, +o.size || 6)) / 100)), font = `700 ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
      const m = HT.canvas(10, 10).getContext('2d'); m.font = font; const lines = text.split('\n').slice(0, 4), w = Math.ceil(Math.max(...lines.map(l => m.measureText(l).width))) + px;
      c = HT.canvas(w, Math.ceil(px * 1.35 * lines.length + px * 0.4));
      const x = c.getContext('2d'); x.font = font; x.textBaseline = 'top'; x.fillStyle = o.color || '#ffffff'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = px * 0.12; x.shadowOffsetY = px * 0.04;
      lines.forEach((l, i) => x.fillText(l, px / 2, px * 0.2 + i * px * 1.35));
    }
    const o2 = HT.canvas(c.width, c.height), x2 = o2.getContext('2d'); x2.globalAlpha = Math.max(0.05, Math.min(1, (+o.opacity || 70) / 100)); x2.drawImage(c, 0, 0);
    return new Uint8Array(await (await HT.encode(o2, 'image/png')).arrayBuffer());
  }
  tool('add-watermark-to-video', async (ctx, session) => {
    const f = ctx.files[0], o = ctx.opts, { ff, paths } = await session([f]), inf = await probe(ff, paths[0]);
    if (!inf.hasVideo) throw new Error(`'${f.name}' has no video.`);
    ctx.status('Preparing the watermark...');
    await ff.writeFile('wm.png', await watermarkPng(ctx, o, inf.w || 1280));
    const mg = Math.round((inf.w || 1280) * 0.02), pos = o.position || 'br';
    const x = { l: String(mg), c: '(W-w)/2', r: `W-w-${mg}` }[pos[1]], y = { t: String(mg), c: '(H-h)/2', b: `H-h-${mg}` }[pos[0]];
    if (!x || !y) throw new Error('Unknown position.');
    const args = ['-i', paths[0], '-i', 'wm.png', '-filter_complex', `[0:v][1:v]overlay=${x}:${y}:format=auto,format=yuv420p[v]`, '-map', '[v]'];
    if (inf.hasAudio) args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k');
    args.push(...X264, '-crf', '22', '-movflags', '+faststart');
    ctx.status('Adding the watermark...');
    const blob = await run(ff, ctx, args, 'out.mp4', { duration: inf.duration, type: 'video/mp4' });
    ctx.info = { summary: `Watermark added (${mb(blob.size)})` };
    return [{ name: outName(f, 'mp4', '_watermarked'), blob }];
  });
})();
