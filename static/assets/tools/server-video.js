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

// ---------------------------------------------------------------- audio cutter (with a preview to pick the part)
HT.register('audio-cutter', root => {
  const el = HT.el;
  const media = el('video', { controls: true, style: { width: '100%', maxHeight: '260px', background: '#111', borderRadius: '12px' } });
  const info = el('div', { class: 'help', style: { marginTop: '6px' } });
  let form = null, url = null;
  const set = (name, t) => form && form.set(name, clock(t));
  const card = el('div', { class: 'card hidden' }, HT.stepTitle(2, 'Pick the part to keep'), media, info,
    el('div', { class: 'actions' },
      el('button', { class: 'btn sec sm', type: 'button', text: 'Set start here', onclick: () => set('start', media.currentTime) }),
      el('button', { class: 'btn sec sm', type: 'button', text: 'Set end here', onclick: () => set('end', media.currentTime) })));
  HT.serverTool(root, {
    slug: 'audio-cutter', accept: 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma', max: 1, action: 'Cut audio', compare: false, hint: 'MP3, WAV, M4A, FLAC, OGG... or a video file to take its sound',
    fields: [
      { name: 'start', label: 'Start (seconds or mm:ss)', type: 'text', value: '0:00.0' },
      { name: 'end', label: 'End (seconds or mm:ss)', type: 'text', value: '' },
      { name: 'fade_in', label: 'Fade in (seconds)', type: 'number', value: 0, min: 0, max: 30, step: 0.5 },
      { name: 'fade_out', label: 'Fade out (seconds)', type: 'number', value: 0, min: 0, max: 30, step: 0.5 },
      { name: 'format', label: 'Save as', type: 'select', options: [['mp3', 'MP3'], ['m4a', 'M4A (AAC)'], ['wav', 'WAV'], ['ogg', 'OGG Opus'], ['flac', 'FLAC']] },
    ],
    onReady: ({ optsCard, form: f }) => { form = f; optsCard.before(card); },
    onFiles: files => {
      card.classList.toggle('hidden', !files.length);
      if (url) URL.revokeObjectURL(url);
      if (!files.length) { media.removeAttribute('src'); return; }
      url = URL.createObjectURL(files[0]); media.src = url;
      media.onloadedmetadata = () => { info.textContent = 'Length: ' + clock(media.duration) + '. Play it, then use the buttons to mark the start and end.'; form.set('start', '0:00.0'); form.set('end', clock(media.duration)); };
    },
  });
});

// ---------------------------------------------------------------- video merger
HT.register('video-merger', root => HT.serverTool(root, {
  slug: 'video-merger', accept: VID.replace(',.gif', ''), max: 20, min: 2, reorder: true, action: files => 'Merge ' + files.length + ' videos', compare: false,
  hint: 'Add 2 or more clips, then set the order with the arrows. ' + BIG,
  fields: [
    { name: 'resolution', label: 'Output size', type: 'select', options: [['first', 'Same as the first clip'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']], help: 'Other clips are fitted inside this size with black bars if the shape differs.' },
    { name: 'quality', label: 'Quality', type: 'select', value: 'medium', options: [['high', 'High'], ['medium', 'Balanced'], ['low', 'Small file']] },
  ],
}));

// ---------------------------------------------------------------- video speed
HT.register('video-speed', root => HT.serverTool(root, {
  slug: 'video-speed', accept: VID.replace(',.gif', ''), max: 3, action: 'Change speed', compare: false, hint: BIG,
  fields: [
    { name: 'preset', label: 'Speed', type: 'select', value: '2', options: [['0.25', '0.25× (very slow)'], ['0.5', '0.5× (slow motion)'], ['0.75', '0.75×'], ['1.5', '1.5×'], ['2', '2× (fast)'], ['3', '3×'], ['4', '4×'], ['8', '8× (timelapse)'], ['custom', 'Custom...']] },
    { name: 'custom', label: 'Custom speed (0.25 to 8)', type: 'number', value: 1.25, min: 0.25, max: 8, step: 0.05, showIf: v => v.preset === 'custom' },
    { name: 'audio', label: 'Sound', type: 'select', options: [['keep', 'Keep (pitch stays natural)'], ['mute', 'Remove sound']] },
  ],
  buildOptions: v => ({ speed: v.preset === 'custom' ? v.custom : Number(v.preset), audio: v.audio }),
}));
