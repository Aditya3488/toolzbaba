// "Ask Baba": a field of message boxes with the tasks people ask for most, in the page's language (the idea of Shopify
// Editions' Sidekick section). The box nearest the pointer wakes up (sharp, white, a soft glow); on a phone, or when the
// pointer is away, they wake up one after another and type themselves. Clicking one, or typing your own request in the
// real box at the front, opens a panel where Baba "works" (the tool's steps appear one by one) and then offers the tool.
// Loaded only when the section comes near the screen: HT.askBaba(stageElement).
(() => {
  const el = HT.el, T = HT.t;
  // the tasks people search for most (global search volume for file tools), by tool address
  const SLUGS = ['compress-pdf', 'resize-image-to-kb', 'jpg-to-pdf', 'remove-background', 'merge-pdf', 'pdf-to-word', 'passport-size-photo-maker',
    'compress-image', 'mp4-to-mp3', 'image-to-text', 'compress-video', 'esign-pdf'];
  const Q = {
    en: ['Compress my PDF to under 200 KB', 'Resize my photo to 20 KB for an exam form', 'Turn my photos into one PDF', 'Remove the background from my photo', 'Merge these PDFs into one file', 'Convert my PDF into an editable Word file', 'Make a passport size photo', 'Make this photo smaller for WhatsApp', 'Get the song from this video as MP3', 'Copy the text from this picture', 'Shrink this video so I can email it', 'Sign this PDF'],
    hi: ['मेरी PDF को 200 KB से कम करो', 'परीक्षा फ़ॉर्म के लिए फ़ोटो 20 KB की करो', 'मेरी फ़ोटो से एक PDF बनाओ', 'मेरी फ़ोटो का बैकग्राउंड हटाओ', 'इन PDF फ़ाइलों को एक में जोड़ो', 'मेरी PDF को एडिट होने वाली Word फ़ाइल में बदलो', 'पासपोर्ट साइज़ फ़ोटो बनाओ', 'WhatsApp के लिए यह फ़ोटो छोटी करो', 'इस वीडियो का गाना MP3 में निकालो', 'इस तस्वीर से टेक्स्ट कॉपी करो', 'यह वीडियो छोटा करो ताकि ईमेल हो सके', 'इस PDF पर साइन करो'],
    bn: ['আমার PDF 200 KB-এর নিচে করো', 'পরীক্ষার ফর্মের জন্য ছবি 20 KB করো', 'আমার ছবিগুলো দিয়ে একটা PDF বানাও', 'আমার ছবির ব্যাকগ্রাউন্ড সরাও', 'এই PDF গুলো একটায় জুড়ে দাও', 'আমার PDF-কে এডিটযোগ্য Word ফাইলে বদলাও', 'পাসপোর্ট সাইজের ছবি বানাও', 'WhatsApp-এর জন্য ছবিটা ছোট করো', 'এই ভিডিও থেকে গানটা MP3 করো', 'এই ছবি থেকে লেখা কপি করো', 'ভিডিওটা ছোট করো যাতে ইমেল করা যায়', 'এই PDF-এ সই করো'],
    es: ['Comprime mi PDF a menos de 200 KB', 'Reduce mi foto a 20 KB para un formulario', 'Convierte mis fotos en un solo PDF', 'Quita el fondo de mi foto', 'Une estos PDF en un solo archivo', 'Convierte mi PDF en un Word editable', 'Haz una foto tamaño pasaporte', 'Haz esta foto más ligera para WhatsApp', 'Saca la canción de este video en MP3', 'Copia el texto de esta imagen', 'Reduce este video para enviarlo por correo', 'Firma este PDF'],
    pt: ['Comprima meu PDF para menos de 200 KB', 'Reduza minha foto para 20 KB para um formulário', 'Transforme minhas fotos em um só PDF', 'Remova o fundo da minha foto', 'Junte estes PDFs em um arquivo', 'Converta meu PDF em um Word editável', 'Faça uma foto 3x4 para documento', 'Deixe esta foto mais leve para o WhatsApp', 'Tire a música deste vídeo em MP3', 'Copie o texto desta imagem', 'Diminua este vídeo para enviar por e-mail', 'Assine este PDF'],
    id: ['Kompres PDF saya jadi di bawah 200 KB', 'Ubah ukuran foto saya jadi 20 KB untuk formulir', 'Jadikan foto-foto saya satu PDF', 'Hapus latar belakang foto saya', 'Gabungkan PDF ini jadi satu file', 'Ubah PDF saya jadi Word yang bisa diedit', 'Buat pas foto ukuran paspor', 'Kecilkan foto ini untuk WhatsApp', 'Ambil lagu dari video ini jadi MP3', 'Salin teks dari gambar ini', 'Kecilkan video ini supaya bisa dikirim lewat email', 'Tanda tangani PDF ini'],
    fr: ['Compresse mon PDF à moins de 200 KB', 'Réduis ma photo à 20 KB pour un formulaire', 'Transforme mes photos en un seul PDF', 'Supprime l’arrière-plan de ma photo', 'Fusionne ces PDF en un seul fichier', 'Convertis mon PDF en Word modifiable', 'Fais une photo d’identité', 'Allège cette photo pour WhatsApp', 'Extrais la musique de cette vidéo en MP3', 'Copie le texte de cette image', 'Réduis cette vidéo pour l’envoyer par e-mail', 'Signe ce PDF'],
    de: ['Komprimiere mein PDF auf unter 200 KB', 'Verkleinere mein Foto auf 20 KB für ein Formular', 'Mach aus meinen Fotos ein PDF', 'Entferne den Hintergrund von meinem Foto', 'Füge diese PDFs zu einer Datei zusammen', 'Wandle mein PDF in ein bearbeitbares Word um', 'Erstelle ein Passfoto', 'Mach dieses Foto kleiner für WhatsApp', 'Hol den Song aus diesem Video als MP3', 'Kopiere den Text aus diesem Bild', 'Verkleinere dieses Video für den E-Mail-Versand', 'Unterschreibe dieses PDF'],
    ru: ['Сожми мой PDF до 200 KB', 'Уменьши фото до 20 KB для анкеты', 'Собери мои фото в один PDF', 'Убери фон с моего фото', 'Объедини эти PDF в один файл', 'Преврати мой PDF в редактируемый Word', 'Сделай фото на паспорт', 'Уменьши это фото для WhatsApp', 'Вытащи песню из этого видео в MP3', 'Скопируй текст с этой картинки', 'Сожми это видео, чтобы отправить по почте', 'Подпиши этот PDF'],
    ja: ['PDFを200KB以下に圧縮して', '申込フォーム用に写真を20KBにして', '写真をまとめて1つのPDFにして', '写真の背景を消して', 'このPDFを1つのファイルに結合して', 'PDFを編集できるWordに変換して', 'パスポート用の証明写真を作って', 'LINEで送れるように写真を小さくして', 'この動画の曲をMP3で取り出して', 'この画像の文字をコピーして', 'メールで送れるように動画を小さくして', 'このPDFに署名して'],
    tr: ['PDF’imi 200 KB’ın altına sıkıştır', 'Fotoğrafımı form için 20 KB’a küçült', 'Fotoğraflarımı tek bir PDF yap', 'Fotoğrafımın arka planını kaldır', 'Bu PDF’leri tek dosyada birleştir', 'PDF’imi düzenlenebilir Word’e çevir', 'Vesikalık fotoğraf hazırla', 'Bu fotoğrafı WhatsApp için küçült', 'Bu videodaki şarkıyı MP3 olarak çıkar', 'Bu resimdeki yazıyı kopyala', 'Bu videoyu e-postayla gönderebilmem için küçült', 'Bu PDF’i imzala'],
    vi: ['Nén PDF của tôi xuống dưới 200 KB', 'Giảm ảnh của tôi còn 20 KB để nộp hồ sơ', 'Gộp ảnh của tôi thành một file PDF', 'Xóa phông nền ảnh của tôi', 'Gộp các PDF này thành một file', 'Chuyển PDF của tôi sang Word để chỉnh sửa', 'Làm ảnh thẻ cỡ hộ chiếu', 'Giảm dung lượng ảnh này để gửi Zalo', 'Tách bài hát trong video này ra MP3', 'Sao chép chữ từ bức ảnh này', 'Nén video này để gửi qua email', 'Ký tên vào PDF này'],
    it: ['Comprimi il mio PDF sotto i 200 KB', 'Riduci la mia foto a 20 KB per un modulo', 'Trasforma le mie foto in un unico PDF', 'Rimuovi lo sfondo dalla mia foto', 'Unisci questi PDF in un unico file', 'Converti il mio PDF in un Word modificabile', 'Crea una fototessera', 'Alleggerisci questa foto per WhatsApp', 'Estrai la canzone da questo video in MP3', 'Copia il testo da questa immagine', 'Riduci questo video per inviarlo via email', 'Firma questo PDF'],
    ar: ['اضغط ملف PDF الخاص بي إلى أقل من 200 KB', 'صغّر صورتي إلى 20 KB لاستمارة', 'حوّل صوري إلى ملف PDF واحد', 'أزل خلفية صورتي', 'ادمج ملفات PDF هذه في ملف واحد', 'حوّل ملف PDF إلى Word قابل للتعديل', 'اصنع صورة بمقاس جواز السفر', 'صغّر هذه الصورة لإرسالها عبر WhatsApp', 'استخرج الأغنية من هذا الفيديو بصيغة MP3', 'انسخ النص من هذه الصورة', 'صغّر هذا الفيديو لأرسله بالبريد الإلكتروني', 'وقّع على ملف PDF هذا'],
    pl: ['Skompresuj mój PDF poniżej 200 KB', 'Zmniejsz moje zdjęcie do 20 KB do formularza', 'Zrób z moich zdjęć jeden PDF', 'Usuń tło z mojego zdjęcia', 'Połącz te PDF-y w jeden plik', 'Zamień mój PDF na edytowalny plik Word', 'Zrób zdjęcie do paszportu', 'Zmniejsz to zdjęcie do WhatsAppa', 'Wyciągnij piosenkę z tego filmu jako MP3', 'Skopiuj tekst z tego obrazka', 'Zmniejsz ten film, żeby wysłać go mailem', 'Podpisz ten PDF'],
  };
  // where the boxes sit: x / y as a share of the stage (the centre of the box), depth 0 (far) .. 1 (near)
  const WIDE = [[.17, .15, .55], [.5, .1, .4], [.83, .19, .65], [.2, .46, .95], [.53, .4, .8], [.84, .52, .5], [.38, .69, .7]];   // the real box sits below them
  const NARROW = [[.42, .12, .6], [.58, .32, .85], [.42, .52, .7], [.58, .71, .5]];
  const send = () => HT.svg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>');
  const face = () => { const s = HT.star(22); return el('span', { class: 'ab-face' }, s); };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  HT.askBaba = async (stage, { compact = false } = {}) => {
    if (!stage || stage.dataset.ready) return; stage.dataset.ready = '1';
    const data = await HT.loadTools(); await HT.i18n;
    const by = new Map(HT.searchItems(data).map(t => [t.slug, t]));
    const texts = Q[HT.lang] || Q.en;
    const tasks = SLUGS.map((s, i) => ({ slug: s, text: texts[i], tool: by.get(s) })).filter(t => t.tool);   // archived tools drop out
    const narrow = () => stage.clientWidth < 700 || compact;
    let spots = narrow() ? NARROW : WIDE, cards = [], active = -1, auto = null, typing = null, panel = null, next = 0;

    // far-away boxes: soft, blurred bars that give the field its depth
    const ghosts = el('div', { class: 'ab-ghosts', 'aria-hidden': 'true' });
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 18; i++) { const g = el('i', { style: { left: (rnd() * 92 + 2) + '%', top: (rnd() * 90 + 3) + '%', width: (40 + rnd() * 90) + 'px', opacity: (.25 + rnd() * .35).toFixed(2) } }); g.style.setProperty('--d', (rnd() * .3).toFixed(2)); ghosts.append(g); }
    const field = el('div', { class: 'ab-field' }, ghosts);
    stage.textContent = ''; stage.append(field);

    const place = () => {
      spots = narrow() ? NARROW : WIDE;
      cards.forEach((c, i) => { const s = spots[i]; c.hidden = !s; if (!s) return; c.style.left = (s[0] * 100) + '%'; c.style.top = (s[1] * 100) + '%'; c.style.setProperty('--d', s[2]); c.style.zIndex = Math.round(s[2] * 10); });
    };
    const makeCard = (task, i) => {
      const txt = el('span', { class: 'ab-text', text: task.text });
      const c = el('button', { type: 'button', class: 'ab-card', 'aria-label': task.text }, txt, el('span', { class: 'ab-foot' }, face(), el('span', { class: 'ab-send' }, send())));
      c.task = task; c.txt = txt;
      c.addEventListener('click', () => open(c.task, c));
      c.addEventListener('focus', () => wake(i, false));
      return c;
    };
    for (let i = 0; i < Math.max(WIDE.length, NARROW.length); i++) { const c = makeCard(tasks[i % tasks.length], i); cards.push(c); field.append(c); }
    next = cards.length % tasks.length;
    place(); addEventListener('resize', HT.debounce(place, 150));

    // the real message box, at the front
    const input = el('input', { type: 'text', class: 'ab-input', placeholder: T('Type what you need…'), 'aria-label': T('Type what you need…'), enterkeyhint: 'send', autocomplete: 'off' });
    const go = el('button', { type: 'submit', class: 'ab-go', 'aria-label': T('Ask Baba') }, send());
    const form = el('form', { class: 'ab-ask' }, face(), input, go);
    form.addEventListener('submit', e => {
      e.preventDefault(); const q = input.value.trim(); if (!q) return input.focus();
      const hit = HT.searchTools(data, q).hits[0];
      open(hit ? { slug: hit.slug, text: q, tool: hit } : { text: q, tool: null }, form);
    });
    stage.append(form);

    // one box awake at a time
    function wake(i, typeIt) {
      if (i === active || !cards[i] || cards[i].hidden) return;
      cards.forEach((c, k) => c.classList.toggle('on', k === i)); active = i;
      clearInterval(typing);
      const c = cards[i];
      if (typeIt) {   // types itself, like someone writing it
        const full = c.task.text; let n = 0; c.txt.textContent = ''; c.classList.add('typing');
        typing = setInterval(() => { n += 1 + (Math.random() < .25); c.txt.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); c.classList.remove('typing'); } }, 42);
      } else c.txt.textContent = c.task.text;
    }
    // now and then a sleeping box gets another task, so all of them come round
    function swapOne() {
      const free = cards.filter((c, k) => k !== active && !c.hidden); if (!free.length || tasks.length <= cards.length) return;
      const c = free[Math.floor(Math.random() * free.length)], shown = new Set(cards.map(x => x.task.slug));
      let t = tasks[next % tasks.length], guard = 0; while (shown.has(t.slug) && guard++ < tasks.length) t = tasks[++next % tasks.length]; next++;
      c.classList.add('swap'); setTimeout(() => { c.task = t; c.txt.textContent = t.text; c.setAttribute('aria-label', t.text); c.classList.remove('swap'); }, 350);
    }
    const tick = () => { if (panel || hover) return; const vis = cards.map((c, k) => (c.hidden ? -1 : k)).filter(k => k >= 0); const k = vis[(vis.indexOf(active) + 1) % vis.length]; swapOne(); wake(k, true); };
    const startAuto = () => { clearInterval(auto); auto = setInterval(tick, 3600); };

    // the pointer: the nearest box wakes up, and the field leans a little towards it (depth)
    let hover = false, px = 0, py = 0, tx = 0, ty = 0, raf = 0;
    const lean = () => { tx += (px - tx) * .08; ty += (py - ty) * .08; field.style.setProperty('--mx', tx.toFixed(3)); field.style.setProperty('--my', ty.toFixed(3)); if (Math.abs(px - tx) + Math.abs(py - ty) > .002) raf = requestAnimationFrame(lean); else raf = 0; };
    stage.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || panel) return;
      const r = stage.getBoundingClientRect(); hover = true;
      px = (e.clientX - r.left) / r.width - .5; py = (e.clientY - r.top) / r.height - .5;
      if (!reduce() && !raf) raf = requestAnimationFrame(lean);
      let best = -1, bd = Infinity;
      cards.forEach((c, k) => { if (c.hidden) return; const b = c.getBoundingClientRect(), d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)); if (d < bd) { bd = d; best = k; } });
      if (best >= 0) wake(best, false);
    });
    stage.addEventListener('pointerleave', () => { hover = false; px = py = 0; if (!reduce() && !raf) raf = requestAnimationFrame(lean); });

    // ---- Baba at work: the box grows into a panel, the tool's steps appear one by one, then the tool is offered
    function open(task, from) {
      if (panel) return;
      clearInterval(auto); clearInterval(typing);
      const tool = task.tool, sr = stage.getBoundingClientRect(), fr = from.getBoundingClientRect();
      const close = el('button', { type: 'button', class: 'ab-x', 'aria-label': T('Close'), text: '×' });
      const chip = el('div', { class: 'ab-chip' }, el('span', { class: 'ab-dots' }, el('i'), el('i'), el('i')), T('Baba is on it'));
      const steps = el('ol', { class: 'ab-steps' }), bar = el('div', { class: 'ab-bar' }, el('i')), end = el('div', { class: 'ab-end' });
      panel = el('div', { class: 'ab-panel', role: 'dialog', 'aria-label': T('Ask Baba') },
        el('div', { class: 'ab-top' }, el('div', { class: 'ab-q', text: task.text }), close), chip,
        tool ? el('div', { class: 'ab-tool' }, el('i', {}, HT.toolIcon(tool.isTab ? tool.base : tool.slug)), el('span', {}, el('b', { text: tool.name }), el('small', { text: tool.desc }))) : null,
        steps, bar, end);
      // it starts exactly where the box was, then grows to the middle (only transform and opacity move: smooth)
      stage.append(panel); stage.classList.add('open');
      const pr = panel.getBoundingClientRect();
      const sx = fr.width / pr.width, sy = fr.height / pr.height, dx = fr.left - pr.left, dy = fr.top - pr.top;
      panel.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: .6 }, { transform: 'none', opacity: 1 }],
        { duration: 520, easing: 'cubic-bezier(.2, .8, .25, 1)' });
      const shut = () => {
        if (!panel) return; const p = panel; panel = null; stage.classList.remove('open');
        p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => p.remove();
        document.removeEventListener('keydown', esc); startAuto();
      };
      const esc = e => { if (e.key === 'Escape') shut(); };
      close.onclick = shut; document.addEventListener('keydown', esc);
      const list = tool ? (tool.steps && tool.steps.length ? tool.steps : [T('<b>Add your file</b>: it stays on your device'), T('<b>Adjust</b> the settings and watch the live preview'), T('<b>Download</b> the finished result')]) : [];
      let k = 0, delay = 650;
      const addStep = () => {
        if (!panel) return;
        if (k < list.length) { const li = el('li'); li.innerHTML = list[k++].replace(/<(?!\/?b>)[^>]*>/g, ''); steps.append(li); bar.firstChild.style.width = (k / (list.length + 1) * 100) + '%'; setTimeout(addStep, delay); return; }
        bar.firstChild.style.width = '100%'; chip.classList.add('done'); chip.lastChild.textContent = tool ? T('Ready: here is your tool') : '';
        if (tool) end.append(el('a', { class: 'btn', href: tool.href || HT.href(tool.slug) }, T('Open {0}', tool.name), ' →'), el('button', { type: 'button', class: 'btn ghost sm', text: T('Ask something else'), onclick: () => { shut(); setTimeout(() => input.focus(), 250); } }));
        else { chip.remove(); end.append(el('p', { class: 'ab-miss', text: T('Baba could not find a tool for that. Try simpler words, like "compress pdf".') }), el('button', { type: 'button', class: 'btn sm', text: T('Ask something else'), onclick: () => { shut(); setTimeout(() => input.focus(), 250); } })); }
        const a = end.querySelector('a, button'); if (a) a.focus({ preventScroll: true });
      };
      setTimeout(addStep, delay + 200);
    }

    // start only while the section is on screen
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { if (active < 0) wake(spots === NARROW ? 1 : 4, true); startAuto(); } else clearInterval(auto); }), { threshold: .2 }).observe(stage);
  };
})();
