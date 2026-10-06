// Video / audio -> text (Whisper) and text -> audio (MMS voices). Both run in the browser: see engine/speech.js.
const $s = HT.el;
const stamp = (t, sep) => { t = Math.max(0, t); const p = n => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t % 3600 / 60))}:${p(Math.floor(t % 60))}${sep}${String(Math.min(999, Math.round((t % 1) * 1000))).padStart(3, '0')}`; };

HT.register('video-to-text', root => {
  let result = null;
  const list = HT.fileList({ onChange: fs => { setCard.classList.toggle('hidden', !fs.length); main.classList.toggle('hidden', !fs.length); bench.set(fs.length > 0); run.disabled = !fs.length; if (!fs.length) clear(); } });
  const dz = HT.dropzone({ accept: 'video/*,audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.mp4,.mov,.mkv,.webm,.avi', hint: 'A video or an audio file (a recording, a lecture, a voice note). Runs in your browser: it is never uploaded.', onFiles: fs => list.add(fs.slice(0, 1), false) });
  const LANGS = [['auto', 'Detect automatically'], ['english', 'English'], ['hindi', 'Hindi'], ['bengali', 'Bengali'], ['tamil', 'Tamil'], ['telugu', 'Telugu'], ['marathi', 'Marathi'], ['gujarati', 'Gujarati'], ['punjabi', 'Punjabi'], ['urdu', 'Urdu'], ['spanish', 'Spanish'], ['french', 'French'], ['german', 'German'], ['portuguese', 'Portuguese'], ['italian', 'Italian'], ['arabic', 'Arabic'], ['russian', 'Russian'], ['turkish', 'Turkish'], ['indonesian', 'Indonesian'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['chinese', 'Chinese']];
  const form = HT.form([
    { name: 'model', label: 'Accuracy', type: 'select', value: 'tiny', options: [['tiny', 'Fast (40 MB first download)'], ['base', 'Better (80 MB first download: clearer results, much better for Hindi)']] },
    { name: 'language', label: 'Language spoken', type: 'select', value: 'auto', options: LANGS, help: 'Choosing the language is more accurate than automatic detection.' },
    { name: 'task', label: 'Write', type: 'select', value: 'transcribe', options: [['transcribe', 'What is said, in the same language'], ['translate', 'A translation into English']] },
  ], () => { });
  const prog = HT.progress(), run = $s('button', { class: 'btn', type: 'button', text: 'Turn into text', disabled: true, onclick: go });
  const setCard = $s('div', { class: 'card hidden' }, HT.stepTitle(2, 'Settings'), form.el, $s('div', { class: 'actions' }, run), prog.el);
  const info = $s('div', { class: 'tinfo' }), out = $s('textarea', { rows: 18, 'aria-label': 'Text', placeholder: 'The text appears here. You can edit it before you copy or download it.', style: { minHeight: '320px', fontFamily: 'inherit', fontSize: '.98rem' } });
  const b = (t, fn, cls = 'btn sec sm') => $s('button', { class: cls, type: 'button', text: t, onclick: fn });
  const copyBtn = b('Copy text', () => out.value && HT.copy(out.value, 'Text copied'), 'btn sm');
  const dls = [b('.txt', () => save('txt')), b('.srt (subtitles)', () => save('srt')), b('.vtt (web captions)', () => save('vtt'))];
  const bar = $s('div', { class: 'actions', style: { margin: 0 } }, copyBtn, ...dls);
  const main = $s('div', { class: 'card tmain hidden' }, $s('div', { class: 'tbar' }, info, bar), out);
  const bench = HT.bench([dz, list.el, setCard], main, { keep: true }); root.append(bench);
  const clear = () => { result = null; out.value = ''; info.textContent = ''; };
  clear();
  function save(fmt) {
    if (!out.value.trim()) return HT.toast('There is no text yet.'); const name = HT.stem(list.files[0].name) || 'transcript';
    if (fmt === 'txt' || !result || !result.segments.length) return HT.download(new Blob([out.value], { type: 'text/plain;charset=utf-8' }), name + '.txt');
    const segs = result.segments, body = fmt === 'srt' ? segs.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end || s.start + 2, ',')}\n${s.text}\n`).join('\n') : 'WEBVTT\n\n' + segs.map(s => `${stamp(s.start, '.')} --> ${stamp(s.end || s.start + 2, '.')}\n${s.text}\n`).join('\n');
    HT.download(new Blob([body], { type: 'text/' + fmt + ';charset=utf-8' }), `${name}.${fmt}`);
  }
  async function go() {
    const f = list.files[0]; if (!f) return; run.disabled = true; clear(); info.textContent = 'Working...';
    try {
      prog.set(0, 'Starting...');
      const { id } = await HT.upload('video-to-text', [f], { ...form.values(), format: 'txt' });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Working...'));
      prog.clear(); result = job.info; out.value = result.text; info.textContent = result.summary;
    } catch (e) { prog.error(e.message); info.textContent = ''; }
    run.disabled = !list.files.length;
  }
  return { list, accept: 'video/*,audio/*' };
});

HT.register('text-to-audio', root => {
  let url = null, name = 'speech.wav';
  const form = HT.form([
    { name: 'voice', label: 'Voice', type: 'select', value: 'eng', options: [['eng', 'English'], ['hin', 'Hindi']] },
    { name: 'format', label: 'Save as', type: 'select', value: 'wav', options: [['wav', 'WAV (best quality, bigger file)'], ['mp3', 'MP3 (smaller; loads the video engine the first time, 31 MB)']] },
  ], () => { });
  const text = $s('textarea', { rows: 12, maxlength: 20000, 'aria-label': 'Text to speak', placeholder: 'Type or paste the text you want to hear...', style: { minHeight: '220px', fontFamily: 'inherit' } }), count = $s('div', { class: 'help' });
  text.addEventListener('input', () => { count.textContent = text.value.length + ' / 20,000 characters'; go.disabled = !text.value.trim(); }); count.textContent = '0 / 20,000 characters';
  const prog = HT.progress(), go = $s('button', { class: 'btn', type: 'button', text: 'Make audio', disabled: true, onclick: make });
  const setCard = $s('div', { class: 'card' }, HT.stepTitle(1, 'Your text'), text, count, $s('div', { style: { marginTop: '14px' } }, form.el), $s('div', { class: 'actions' }, go), prog.el,
    $s('p', { class: 'help', style: { marginTop: '10px' }, text: 'The first time, the voice (about 38 MB) is downloaded to your browser. After that it works fast, and your text never leaves your device. The voice is clear but a little robotic.' }));
  const info = $s('div', { class: 'tinfo', text: 'Your audio will appear here.' }), player = $s('audio', { controls: true, style: { width: '100%', marginTop: '12px' } });
  const dl = $s('button', { class: 'btn', type: 'button', text: 'Download', disabled: true, onclick: () => url && HT.download(url, name) });
  const main = $s('div', { class: 'card tmain' }, $s('div', { class: 'tbar' }, info, $s('div', { class: 'actions' }, dl)), player);
  const bench = HT.bench([setCard], main, { keep: true }); bench.classList.add('on'); root.append(bench);
  async function make() {
    go.disabled = true; dl.disabled = true; player.removeAttribute('src');
    try {
      prog.set(0, 'Starting...');
      const { id } = await HT.upload('text-to-audio', [], { ...form.values(), text: text.value });
      const job = await HT.poll(id, s => prog.set(s.progress || 0, s.speed || 'Working...'));
      prog.clear(); url = job.url; name = job.filename; player.src = url; info.textContent = job.info.summary; dl.disabled = false; dl.textContent = 'Download ' + name;
    } catch (e) { prog.error(e.message); }
    go.disabled = !text.value.trim();
  }
  return {};
});
