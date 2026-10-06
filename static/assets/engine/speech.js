// Speech engines (run in the browser): video / audio -> text with Whisper, and text -> audio with MMS-TTS.
// Both use transformers.js (onnxruntime-web inside). The models are served from this site (/assets/models/<name>/), so nothing leaves the device.
// Cloudflare Pages allows 25 MiB per file: bigger model files are stored in parts (see each model folder's parts.json) and joined here.
(() => {
  const TF = '/assets/vendor/transformers-3.8.1/', MODELS = '/assets/models/';
  const manifests = {};
  let onModelProgress = null, libP = null;
  const manifest = async name => manifests[name] || (manifests[name] = fetch(`${MODELS}${name}/parts.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})));
  const dirOf = p => p.slice(0, p.lastIndexOf('/') + 1);

  // transformers.js asks this "cache" for every model file; we serve joined parts for the big ones and say "not here" for the rest
  const cache = {
    async match(key) {
      const url = typeof key === 'string' ? key : key.url, at = url.indexOf(MODELS);
      if (at < 0) return undefined;
      const rel = url.slice(at + MODELS.length), name = rel.split('/')[0], file = rel.slice(name.length + 1), parts = (await manifest(name))[file];
      if (!parts) return undefined;
      const dir = `${MODELS}${name}/${dirOf(file)}`, bufs = [];
      let loaded = 0;
      for (const [i, p] of parts.entries()) {
        const r = await fetch(dir + p); if (!r.ok) throw new Error('Could not load the speech model. Check your connection and try again.');
        const b = await r.arrayBuffer(); bufs.push(b); loaded += b.byteLength;
        if (onModelProgress) onModelProgress((i + 1) / parts.length);
      }
      return new Response(new Blob(bufs), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(loaded) } });
    },
    async put() { },
  };

  const lib = () => libP || (libP = (async () => {
    const T = await import(TF + 'transformers.min.js'), { env } = T;
    // the files are fetched from this site as if it were the model hub: a missing optional file is then a plain 404, which the library handles
    env.allowLocalModels = false; env.allowRemoteModels = true; env.remoteHost = location.origin + MODELS; env.remotePathTemplate = '{model}/'; env.useBrowserCache = false; env.useCustomCache = true; env.customCache = cache;
    env.backends.onnx.wasm.wasmPaths = TF;
    env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    return T;
  })().catch(e => { libP = null; throw new Error('Could not start the speech engine: ' + (e && e.message || e)); }));

  const loadPipeline = async (ctx, task, model, label) => {
    const T = await lib(); ctx.status(`Loading ${label} (only the first time)...`);
    onModelProgress = f => ctx.status(`Loading ${label}: ${Math.round(f * 100)}% (only the first time)`);
    try { return await T.pipeline(task, model, { dtype: 'q8', device: 'wasm' }); }
    catch (e) { throw new Error('Could not load the speech model: ' + (e && e.message || e)); }
    finally { onModelProgress = null; }
  };
  const clock = (t, sep) => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000); return [h, m, s].map(n => String(n).padStart(2, '0')).join(':') + sep + String(Math.min(999, ms)).padStart(3, '0'); };

  // ---------------------------------------------------------------- audio -> 16 kHz mono floats
  async function toMono16k(buf) {
    const ac = new AudioContext({ sampleRate: 16000 });
    try {
      const a = await ac.decodeAudioData(buf), n = a.length, out = new Float32Array(n);
      for (let c = 0; c < a.numberOfChannels; c++) { const d = a.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / a.numberOfChannels; }
      return out;
    } finally { ac.close(); }
  }
  async function decodeAudio(ctx, f) {
    const isAudio = /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name);
    if (isAudio || f.size < 150e6) { try { return await toMono16k(await f.arrayBuffer()); } catch { /* the container is not one the browser can read: use ffmpeg */ } }
    ctx.status('Taking the sound out of the file (loads the video engine the first time: 31 MB)...');
    await HT.loadScript('/assets/engine/video.js');
    const outs = await HT.engines['video-to-audio']({ files: [f], opts: { format: 'wav' }, info: null, progress: () => { }, status: ctx.status });
    return toMono16k(await outs[0].blob.arrayBuffer());
  }

  // ---------------------------------------------------------------- video / audio -> text
  const LANGS = { auto: null, english: 'english', hindi: 'hindi', spanish: 'spanish', french: 'french', german: 'german', portuguese: 'portuguese', arabic: 'arabic', russian: 'russian', japanese: 'japanese', chinese: 'chinese', korean: 'korean', turkish: 'turkish', italian: 'italian', indonesian: 'indonesian', bengali: 'bengali', tamil: 'tamil', telugu: 'telugu', urdu: 'urdu', marathi: 'marathi', gujarati: 'gujarati', punjabi: 'punjabi' };
  HT.engine('video-to-text', async ctx => {
    const o = ctx.opts, f = ctx.files[0], model = o.model === 'base' ? 'whisper-base' : 'whisper-tiny', fmt = ['txt', 'srt', 'vtt'].includes(o.format) ? o.format : 'txt';
    if (!(o.language in LANGS)) throw new Error('Unknown language.');
    ctx.status('Reading the sound...'); ctx.progress(0.02);
    const audio = await decodeAudio(ctx, f), seconds = audio.length / 16000;
    if (!audio.length || audio.every(v => v === 0)) throw new Error('This file has no sound to turn into text.');
    ctx.progress(0.1);
    const asr = await loadPipeline(ctx, 'automatic-speech-recognition', model, model === 'whisper-base' ? 'the speech model (80 MB)' : 'the speech model (40 MB)');
    ctx.progress(0.2); ctx.status('Listening...');
    let done = 0; const per = 20;  // each 30 s chunk advances 20 s (5 s overlap on both sides)
    const res = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, language: LANGS[o.language] || undefined, task: o.task === 'translate' ? 'translate' : 'transcribe',
      chunk_callback: () => { done++; ctx.progress(0.2 + 0.78 * Math.min(1, done * per / seconds)); ctx.status(`Listening... ${Math.min(100, Math.round(done * per / seconds * 100))}%`); } });
    const segs = (res.chunks || []).map(c => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] ?? 0, text: String(c.text || '').trim() })).filter(s => s.text);
    const text = (res.text || '').trim() || segs.map(s => s.text).join(' ');
    if (!text) throw new Error('No speech was found in this file.');
    const body = fmt === 'srt' ? segs.map((s, i) => `${i + 1}\n${clock(s.start, ',')} --> ${clock(s.end || s.start + 2, ',')}\n${s.text}\n`).join('\n')
      : fmt === 'vtt' ? 'WEBVTT\n\n' + segs.map(s => `${clock(s.start, '.')} --> ${clock(s.end || s.start + 2, '.')}\n${s.text}\n`).join('\n') : text + '\n';
    ctx.info = { summary: `${text.split(/\s+/).length} words from ${Math.round(seconds)} seconds of audio${o.task === 'translate' ? ' (translated to English)' : ''}. Whisper can make mistakes, so read it through.`, text, segments: segs, seconds };
    return [{ name: HT.stem(f.name) + '.' + fmt, blob: new Blob([body], { type: fmt === 'txt' ? 'text/plain;charset=utf-8' : 'text/' + fmt }) }];
  });

  // ---------------------------------------------------------------- text -> audio
  const wavBlob = (samples, rate) => {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return new Blob([buf], { type: 'audio/wav' });
  };
  // cut long text at sentence ends so each piece is a comfortable size for the voice
  const pieces = text => {
    const out = []; let cur = '';
    for (const s of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?।。！？])\s+/)) { if ((cur + ' ' + s).length > 220 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }
    if (cur) out.push(cur);
    return out.flatMap(p => (p.length <= 300 ? [p] : p.match(/.{1,260}(\s|$)/g)));
  };
  HT.engine('text-to-audio', async ctx => {
    const o = ctx.opts, text = String(o.text || '').trim(), voice = o.voice === 'hin' ? 'hin' : 'eng', fmt = o.format === 'mp3' ? 'mp3' : 'wav';
    if (!text) throw new Error('Type or paste some text first.');
    if (text.length > 20000) throw new Error('That is a lot of text (the limit is 20,000 characters). Split it into parts.');
    const tts = await loadPipeline(ctx, 'text-to-speech', 'mms-tts-' + voice, 'the voice (38 MB)');
    const parts = pieces(text), gap = 0.28, chunks = []; let rate = 16000, total = 0;
    for (const [i, p] of parts.entries()) {
      ctx.status(`Speaking part ${i + 1} of ${parts.length}...`); ctx.progress(0.1 + 0.85 * i / parts.length); await HT.tick();
      const r = await tts(p); rate = r.sampling_rate || rate; chunks.push(r.audio, new Float32Array(Math.round(rate * gap))); total += r.audio.length + Math.round(rate * gap);
    }
    const all = new Float32Array(total); let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; }
    let blob = wavBlob(all, rate), name = 'speech.wav';
    try { await tts.dispose(); } catch { /* the voice is not needed any more: free its memory and threads before ffmpeg starts */ }
    if (fmt === 'mp3') {
      ctx.status('Making the MP3 (loads the video engine the first time: 31 MB)...');
      await HT.loadScript('/assets/engine/video.js');
      const outs = await HT.engines['video-converter']({ files: [new File([blob], 'speech.wav', { type: 'audio/wav' })], opts: { format: 'mp3' }, info: null, progress: () => { }, status: ctx.status });
      blob = outs[0].blob; name = 'speech.mp3';
    }
    ctx.info = { summary: `${Math.round(all.length / rate)} seconds of speech from ${text.split(/\s+/).length} words (${voice === 'hin' ? 'Hindi' : 'English'} voice).` };
    return [{ name, blob }];
  });
})();
