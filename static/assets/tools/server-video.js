const VID = 'video/*,.mkv,.avi,.mov,.flv,.wmv,.ts,.3gp,.gif';
const RES = [['keep', 'Keep original'], ['2160', '4K (2160p)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p']];
const BIG = 'Large files are fine (up to 2 GB), but uploading takes a moment on slow connections.';

HT.register('video-converter', root => HT.serverTool(root, {
  slug: 'video-converter', accept: VID + ',audio/*', max: 10, action: files => 'Convert ' + files.length + ' file' + (files.length > 1 ? 's' : ''), hint: BIG,
  fields: [
    { name: 'format', label: 'Convert to', type: 'select', options: [['mp4', 'MP4 (works everywhere)'], ['webm', 'WebM (web, small)'], ['mkv', 'MKV'], ['mov', 'MOV'], ['avi', 'AVI'], ['mp3', 'MP3 (audio only)'], ['m4a', 'M4A / AAC (audio only)'], ['wav', 'WAV (audio only)'], ['ogg', 'OGG Opus (audio only)'], ['flac', 'FLAC (audio only)']] },
    { name: 'quality', label: 'Quality', type: 'select', value: 'medium', options: [['high', 'High'], ['medium', 'Balanced'], ['low', 'Small file']], showIf: v => ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(v.format) },
    { name: 'resolution', label: 'Resolution', type: 'select', options: RES, showIf: v => ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(v.format), help: 'Only ever scales down.' },
  ],
}));

HT.register('video-to-gif', root => HT.serverTool(root, {
  slug: 'video-to-gif', accept: VID, max: 1, action: 'Make GIF', compare: false, hint: 'Best for short clips (up to 60 seconds)',
  fields: [
    { name: 'start', label: 'Start (seconds or mm:ss)', type: 'text', value: '0' },
    { name: 'duration', label: 'Length (seconds)', type: 'number', value: 6, min: 1, max: 60 },
    { name: 'fps', label: 'Frames per second', type: 'range', min: 5, max: 30, value: 12 },
    { name: 'width', label: 'Width (px)', type: 'select', value: 480, options: [[240, '240'], [320, '320'], [480, '480'], [640, '640'], [800, '800'], [1080, '1080']] },
    { name: 'loop', label: 'Loop forever', type: 'checkbox', value: true },
  ],
}));

HT.register('gif-to-video', root => HT.serverTool(root, {
  slug: 'gif-to-video', accept: '.gif,image/gif', max: 10, action: 'Convert to video', compare: false, hint: 'GIF files up to 200 MB',
  fields: [
    { name: 'format', label: 'Format', type: 'select', options: [['mp4', 'MP4'], ['webm', 'WebM']] },
    { name: 'loops', label: 'Repeat the GIF', type: 'number', value: 1, min: 1, max: 20, help: 'Videos cannot loop on their own everywhere, so repeat it here if you need more length.' },
  ],
}));

HT.register('video-compressor', root => HT.serverTool(root, {
  slug: 'video-compressor', accept: VID, max: 5, action: 'Compress video', compare: false, hint: BIG,
  fields: [
    { name: 'mode', label: 'Compress by', type: 'select', options: [['level', 'Quality level'], ['size', 'Target file size']] },
    { name: 'level', label: 'Level', type: 'select', value: 'medium', options: [['light', 'Light (looks the same)'], ['medium', 'Balanced'], ['strong', 'Strong (smallest)']], showIf: v => v.mode === 'level' },
    { name: 'target_mb', label: 'Target size (MB)', type: 'number', value: 25, min: 1, showIf: v => v.mode === 'size', help: 'Great for upload limits (e.g. 25 MB for email, 8 MB for Discord). Very small targets make the video blurry.' },
    { name: 'resolution', label: 'Resolution', type: 'select', options: RES },
  ],
}));

// ---- trimmer: local preview so you can pick the exact start/end
const clock = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
HT.register('video-trimmer', root => {
  const el = HT.el;
  const video = el('video', { controls: true, style: { width: '100%', maxHeight: '420px', background: '#000', borderRadius: '10px' } });
  const info = el('div', { class: 'help', style: { marginTop: '6px' } });
  let form = null, url = null;
  const set = (name, t) => form && form.set(name, clock(t));
  const card = el('div', { class: 'card hidden' }, el('h2', { text: 'Pick the part to keep' }), video, info,
    el('div', { class: 'actions' },
      el('button', { class: 'btn sec sm', type: 'button', text: 'Set start here', onclick: () => set('start', video.currentTime) }),
      el('button', { class: 'btn sec sm', type: 'button', text: 'Set end here', onclick: () => set('end', video.currentTime) })));
  HT.serverTool(root, {
    slug: 'video-trimmer', accept: VID + ',audio/*', max: 1, action: 'Trim', compare: false, hint: BIG,
    fields: [
      { name: 'start', label: 'Start (seconds or mm:ss)', type: 'text', value: '0:00.0' },
      { name: 'end', label: 'End (seconds or mm:ss)', type: 'text', value: '' },
      { name: 'mode', label: 'Cutting method', type: 'select', options: [['accurate', 'Accurate (re-encodes, exact cut)'], ['fast', 'Fast (no re-encode, cuts at nearest keyframe)']] },
    ],
    onReady: ({ optsCard, form: f }) => { form = f; optsCard.before(card); },
    onFiles: files => {
      card.classList.toggle('hidden', !files.length);
      if (url) URL.revokeObjectURL(url);
      if (!files.length) { video.removeAttribute('src'); return; }
      url = URL.createObjectURL(files[0]); video.src = url;
      video.onloadedmetadata = () => { info.textContent = 'Length: ' + clock(video.duration) + '. Scrub the video, then use the buttons to mark the start and end.'; form.set('start', '0:00.0'); form.set('end', clock(video.duration)); };
    },
  });
});
