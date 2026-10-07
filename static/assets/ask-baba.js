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

  // ---------------------------------------------------------------- understanding what people type
  // People do not type tool names, they type sentences, in their own language, sometimes two jobs at once ("merge
  // these and make it smaller"), sometimes a question ("is it free?"). So: the words become ideas (LEX: an idea and
  // the words for it in the 15 languages, plus Hinglish), and the ideas pick the tool. A sentence with two jobs gets a
  // plan with two tools; a question gets an answer; when Baba is not sure, it offers the closest tools, never a dead end.
  // A word: "word" must be the whole word, "word*" is the start of a word, words with a space or in Japanese are found
  // anywhere. "xx:word" is used only on the xx pages (a word that means something else in other languages).
  const LEX = {
    compress: 'compress*|shrink*|too big|too large|too heavy|heavy|reduce*|smaller|small|lighter|lightweight|decrease*|kam|kum|chota|chhota|choti|chhoti|chote|ghatao|ghata|कम|छोटा|छोटी|छोटे|घटा*|कंप्रेस*|ছোট|কমা*|কম|কম্প্রেস*|comprim*|reduc*|reduz*|diminu*|pequeñ*|más ligera|menos peso|ligera|ligeira|mais leve|leve|allég*|réduire|réduis*|rédui*|compresse*|kleiner|verklein*|verringer*|reduzier*|komprim*|сжат*|сжим*|сожм*|уменьш*|меньше|圧縮|小さく|軽く|軽量|縮小|sıkıştır*|küçült*|azalt*|nén|giảm|nhỏ|rido*|riduci*|riduzi*|allegger*|più piccol*|ضغط|اضغط|صغر|تصغير|قلل|تقليل|kompres*|kecil*|perkecil|kurangi|skompresuj|kompresuj*|kompresj*|zmniejsz*|mniejsz*|pomniejsz*',
    resize: 'resize*|dimension*|width|height|pixel*|px|rescale|scale|size|redimension*|tamaño|tamanho|taille|größe|grösse|размер*|サイズ|boyut*|kích thước|kích cỡ|ridimension*|dimensioni|الحجم|حجم|المقاس|ukuran|rozmiar*|साइज|आकार|সাইজ|আকার',
    convert: 'convert*|conver*|turn|transform*|save as|export*|badlo|badal*|बदल*|कन्वर्ट*|রূপান্তর*|কনভার্ট*|বদল*|convierte|convertir|pasar|converta|transforme|transformar|convertis*|umwandeln|umwandl*|wandle*|konvertier*|конверт*|преобраз*|переве*|変換|dönüştür*|çevir*|chuyển*|đổi|converti*|trasforma*|تحويل|حول|ubah|konversi|jadikan|zamień|konwert*|przekonwert*',
    merge: 'merge*|combin*|join*|together|one file|single file|one pdf|single pdf|jodo|jod|jodna|milao|जोड*|मिला*|एक में|एक करो|एक कर|ek karo|একত্র*|জুড়*|জোড়া*|যুক্ত কর*|unir|unifica*|es:une|juntar|junte|junta*|combinar|fusionn*|fusion*|regroup*|zusammen*|verbind*|füge*|объедин*|склеи*|соедин*|結合|まとめ|ひとつ|一つ|1つ|birleştir*|gộp|ghép|nối|unisci|unire|combina*|دمج|ادمج|اجمع|gabung*|satukan|połącz*|scal*|jeden plik|tr:tek',
    split: 'split*|separat*|divide*|break up|alag|todo|अलग|बांट*|बाँट*|ভাগ*|আলাদা*|dividir|divide|separar|sépar*|diviser|divis*|teile*|trenn*|aufteil*|раздел*|разби*|分割|分け|böl*|ayır*|tách|chia|dividi*|separa*|تقسيم|قسم|افصل|فصل|pisah*|bagi*|podziel*|rozdziel*',
    remove: 'remove*|delete*|erase*|eraser|get rid|without|hatao|hata|hatana|mitao|nikalo|हटा*|मिटा*|निकाल*|ডিলিট*|সরা*|মুছ*|quita*|quitar|elimin*|borra*|remov*|apaga*|supprim*|enlev*|efface*|retir*|entfern*|lösch*|удал*|убер*|убра*|сотр*|без|消し|消す|削除|除去|kaldır*|xóa|xoá|bỏ|rimuov*|togli*|cancell*|senza|إزالة|ازالة|أزل|ازل|احذف|حذف|بدون|hapus*|buang*|usuń|usun*|bez',
    background: 'background*|backdrop|bg|बैकग्राउंड|बैकग्राउन्ड|पृष्ठभूमि|ব্যাকগ্রাউন্ড|পটভূমি|fondo|fundo|arrière-plan|arriere-plan|fr:fond|hintergrund*|фон|фона|фоном|背景|arka plan*|arkaplan*|phông|nền|sfondo|خلفية|الخلفية|latar*|tło|tła|tle',
    transparent: 'transparent*|transparen*|trasparen*|прозрачн*|透過|透明|şeffaf|trong suốt|شفاف*|przezroczyst*|ট্রান্সপারেন্ট|पारदर्शी',
    replace: 'replace*|change|swap|new|white|black|blue|red|green|सफेद|সাদা|blanco|branco|blanc|weiß|weiss|бел*|白|beyaz|trắng|bianco|أبيض|putih|biał*|बदल*|cambiar|cambia*|trocar|troque|changer|change*|ändern|ersetz*|замен*|поменя*|変更|置き換え|değiştir*|thay*|sostitu*|استبدال|غير|تغيير|ganti|zmień|wymień|বদল*|পরিবর্তন*',
    image: 'image*|photo*|pic|pics|screenshot*|picture*|img|selfie*|tasveer|tasvir|फोटो|तस्वीर*|चित्र|इमेज|पिक|ছবি*|ফটো*|ইমেজ|imagen*|imágen*|imagem*|imagens|immagin*|foto*|bild|bilder|bildes|изображ*|фото*|картин*|снимок|写真|画像|イメージ|resim*|fotoğraf*|görsel*|ảnh|hình*|صورة|صورتي|صور|gambar*|zdjęci*|obraz*|fotka*|jpg|jpeg|png|webp|heic|avif|bmp|tiff|जेपीजी|পিএনজি|জেপিজি|पीएनजी',
    jpg: 'jpg|jpeg|jpe|जेपीजी|জেপিজি|джпг', png: 'png|पीएनजी|পিএনজি', webp: 'webp', heic: 'heic|heif|iphone photo*', gif: 'gif|gifs', svg: 'svg|vector*|vektor*|вектор*|ベクター',
    pdf: 'pdf*|पीडीएफ|পিডিএফ|пдф',
    doc: 'document*|documento*|dokument*|документ*|文書|書類|belge*|tài liệu|مستند*|وثيقة|dokumen*|दस्तावेज*|डॉक्यूमेंट|ডকুমেন্ট*|নথি',
    word: 'word|docx|doc|ms word|वर्ड|ওয়ার্ড|ворд|ワード|وورد|ورد',
    excel: 'excel|xls|xlsx|spreadsheet*|एक्सेल|এক্সেল|эксель|エクセル|إكسل|اكسل|planilha*|tableur|tabelle*|bảng tính|foglio di calcolo|arkusz*|hoja de cálculo',
    ppt: 'ppt|pptx|powerpoint|slide*|presentation*|पीपीटी|প্রেজেন্টেশন|презентац*|パワポ|プレゼン|sunum*|trình chiếu|presentazion*|عرض تقديمي|presentasi|prezentacj*|diapositiva*|apresenta*|présentation*|präsentation*|folien',
    html: 'html|htm|web page|webpage', markdown: 'markdown|md',
    text: 'text*|words|writing|written|letters|typed|टेक्स्ट|लिखा*|शब्द|লেখা*|টেক্সট|অক্ষর|texto*|texte*|testo|текст*|テキスト|文字|metin*|yazı*|chữ|văn bản|نص|النص|الكتابة|teks|tulisan|tekst*',
    video: 'video*|vid|vedio*|vidio*|viedo*|vidoe*|movie*|film*|clip*|reel*|mp4|mov|mkv|avi|webm|वीडियो|विडियो|ভিডিও|vídeo*|vidéo*|видео|ролик*|動画|ビデオ|phim|فيديو|الفيديو|wideo|filmik*',
    mp4: 'mp4',
    audio: 'audio*|song*|एमपी3|music*|sound*|track|mp3|wav|m4a|aac|flac|ogg|gana|gaana|गाना|गाने|गीत|संगीत|ऑडियो|आवाज*|গান|অডিও|সঙ্গীত|canción|cancion*|música|musica|áudio|fr:son|chanson*|musique|de:lied|musik|de:ton|песн*|музык*|аудио|звук*|曲|音楽|音声|オーディオ|şarkı*|müzik*|tr:ses|bài hát|nhạc|âm thanh|canzon*|أغنية|الأغنية|موسيقى|الصوت|lagu|suara|piosenk*|muzyk*|dźwięk*',
    mp3: 'mp3', wav: 'wav', m4a: 'm4a', flac: 'flac', ogg: 'ogg', aac: 'aac',
    speech: 'speech|voice|voiceover|aloud|read out|narrat*|tts|बोलकर|आवाज़ में|voz|voix|stimme|голос*|読み上げ|seslendir*|giọng|đọc|voce|نطق|głos*|কণ্ঠ|বলে',
    sign: 'sign|signs|signing|signature*|esign*|e-sign|autograph|हस्ताक्षर|साइन|দস্তখত|স্বাক্ষর|সই|firma*|firme|assin*|signe*|signer|signatur*|unterschr*|подпис*|署名|サイン|imza*|ký|chữ ký|توقيع|وقع|tanda tangan|ttd|podpis*',
    protect: 'protect*|lock|encrypt*|लॉक|লক|proteg*|bloque*|protég*|verrouill*|chiffr*|schütz*|verschlüssel*|sperr*|защит*|запарол*|保護|ロック|暗号|koru*|şifrele*|kilitle*|bảo vệ|khóa|protegg*|blocca*|حماية|احم|قفل|kunci|lindungi|zabezpiecz*|chroń|zablokuj|zaszyfruj',
    unlock: 'unlock*|decrypt*|open password|forgot|forgotten|lost|अनलॉक|আনলক|desbloque*|débloqu*|déverrouill*|entsperr*|freischalt*|разблок*|снять пароль|ロック解除|解除|kilidini aç*|kilit aç*|mở khóa|sblocca*|فك القفل|فتح القفل|buka kunci|odblokuj*',
    password: 'password*|पासवर्ड|পাসওয়ার্ড|contraseña*|senha*|mot de passe|passwort*|kennwort|пароль*|パスワード|şifre*|mật khẩu|parola|كلمة المرور|كلمة السر|kata sandi|sandi|hasło|hasła|hasl*',
    rotate: 'rotat*|sideways|upside down|flip*|mirror*|ghumao|ghuma|घुमा*|उल्टा|ঘোরা*|girar|gira*|rodar|tourn*|pivot*|dreh*|spiegel*|поверн*|переверн*|разверн*|回転|反転|döndür*|xoay|lật|ruota*|capovolg*|تدوير|دور|اقلب|putar*|balik*|obróć|obroc*|odwróć',
    crop: 'crop*|cut out|क्रॉप|ক্রপ|recort*|recadr*|rogner|zuschneid*|beschneid*|обрез*|кадрир*|トリミング|切り抜|kırp*|ritaglia*|اقتصاص|krop*|przytnij|kadruj*',
    cut: 'cut|cuts|cutting|trim*|shorten|kato|kaat|kaato|काट*|কাট*|cortar|corta|recortar|couper|coupe*|schneid*|kürz*|вырез*|カット|切り取|切る|kes*|cắt|taglia*|accorcia*|قص|اقطع|potong*|wytnij|skróć',
    upscale: 'upscal*|enhanc*|quality|hd|4k|sharpen*|unblur*|blurry|clarity|enlarge*|bigger|better|बेहतर|क्वालिटी|साफ|ক্লিয়ার|কোয়ালিটি|mejorar|calidad|nitid*|melhor*|qualidade|améliorer|qualité|netteté|verbesser*|qualität|schärf*|улучш*|качеств*|чётк*|четк*|高画質|画質|鮮明|kalite*|netleştir*|iyileştir*|nét|chất lượng|làm rõ|miglior*|qualità|تحسين|جودة|وضوح|pertajam|kualitas|tingkatkan|popraw*|jakość|wyostrz*',
    blur: 'blur|blur out|hide|black out|blackout|censor*|redact*|धुंधला|difumin*|desenfoc*|desfoc*|flout*|unscharf*|verpixel*|размыт*|размой|ぼかし|bulanıklaştır*|làm mờ|sfoca*|طمس|تمويه|buramkan|samarkan|rozmyj|rozmaż*|ঝাপসা',
    pixelate: 'pixelat*|pixel art|mosaic|モザイク',
    face: 'face|faces|चेहरा|चेहरे|মুখ|cara|caras|rosto*|visage*|gesicht*|лица|лицо|顔|yüz|yüzü|yüzler*|khuôn mặt|volto|volti|viso|وجه|الوجوه|الوجه|wajah|twarz*',
    watermark: 'watermark*|stamp|logo|वॉटरमार्क|ওয়াটারমার্ক|marca de agua|marca d\'água|filigrane|wasserzeichen|водян*|透かし|ウォーターマーク|filigran*|hình mờ|filigrana|علامة مائية|العلامة المائية|tanda air|znak wodny|znakiem wodnym',
    passport: 'passport*|visa photo|id photo|id card photo|3x4|35x45|2x2|पासपोर्ट|পাসপোর্ট|pasaporte|carnet|fotocarnet*|passaporte|3x4|identité|passbild*|passfoto*|biometrisch*|паспорт*|証明写真|パスポート|vesikalık|biyometrik|pasaport|hộ chiếu|ảnh thẻ|fototessera|passaporto|جواز|paspor|pas foto|pasfoto|paszport*|legitymacj*',
    kb: 'kb|kbs|kilobyte*|केबी|কেবি|кб|килобайт*|mb|мб',
    form: 'exam*|form|forms|application|pan card|aadhaar|aadhar|id card|voter|upsc|ssc|neet|jee|govt|government|sarkari|परीक्षा|फॉर्म|आवेदन|পরীক্ষা|ফর্ম|আবেদন|formulario|formulário|formulaire|formular|анкет*|заявлени*|申込|申請|フォーム|form|biểu mẫu|hồ sơ|modulo|استمارة|نموذج|formulir|formularz*',
    page: 'page|pages|पेज|पन्न*|পৃষ্ঠা*|পেজ|página*|pagina*|seite*|страниц*|ページ|sayfa*|trang|صفحة|صفحات|الصفحات|halaman|stron*|strona',
    number: 'number*|numbering|paginat*|नंबर|সংখ্যা|নম্বর|numer*|número*|numéro*|nummer*|нумер*|номер*|番号|numara*|đánh số|numera*|ترقيم|أرقام|nomor*|numeruj*',
    extract: 'extract*|get|take|take out|pull out|copy|grab|nikalo|निकाल*|कॉपी|কপি|বের কর*|extra*|sacar|saca|copiar|copia*|tirar|tire|extrai*|extraire|extrais|copier|copie|extrahier*|kopier*|hol|извлеч*|вытащ*|достан*|скопир*|копир*|取り出|抽出|コピー|çıkar*|kopyala*|lấy|sao chép|estrai*|استخرج|استخراج|انسخ|نسخ|ambil|salin|ekstrak|wyciągnij|wyodrębnij|skopiuj|kopiuj',
    organize: 'organi*|reorder|rearrange|sort|arrange|order|क्रम|ক্রম|ordenar|reorden*|organiz*|réorganis*|réordonn*|ordnen|sortier*|упорядоч*|поменять порядок|並べ替え|並び替え|sırala*|sắp xếp|riordina*|ترتيب|رتب|urutkan|susun|uporządkuj|zmień kolejność',
    edit: 'edit*|modify|annotate|highlight|fill|write on|add text|एडिट|संपादित|এডিট|editar|edita|modific*|éditer|modifier|bearbeit*|редакт*|編集|düzenle*|chỉnh sửa|sửa|modifica*|تعديل|عدل|حرر|edytuj*|edycj*',
    compare: 'compar*|difference*|diff|vergleich*|сравн*|比較|karşılaştır*|so sánh|confront*|مقارنة|قارن|bandingkan|porówn*|तुलना|তুলনা',
    repair: 'repair*|fix|corrupt*|broken|damaged|won\'t open|reparar|repara*|réparer|répar*|reparier*|восстанов*|почин*|修復|onar*|sửa lỗi|ripara*|إصلاح|اصلاح|perbaiki|napraw*|ठीक|মেরামত',
    flatten: 'flatten*|flat pdf', speed: 'speed*|slow motion|fast forward|faster|slower|velocidad|velocidade|vitesse|geschwindigkeit|скорост*|速度|hız*|tốc độ|velocità|سرعة|kecepatan|prędkość|स्पीड|গতি',
    qr: 'qr|qrcode|qr code|क्यूआर|কিউআর|qrコード', json: 'json', count: 'count*|word count|character count|गिनती|গণনা|contar|compter|zählen|посчит*|подсчит*|数え|カウント|đếm|contare|عد الكلمات|hitung|policz*',
    case: 'uppercase|lowercase|caps|all caps|capitaliz*|upper case|lower case|capital letters|title case|mayúscula*|minúscula*|maiúscula*|majuscule*|minuscule*|großbuchstaben|kleinbuchstaben|заглавн*|строчн*|大文字|小文字|büyük harf|küçük harf|chữ hoa|maiuscol*|minuscol*|أحرف كبيرة|huruf besar|wielkie litery',
    hash: 'hash|uuid|guid|md5|sha1|sha256|sha512', base64: 'base64|base 64', urlenc: 'url encode*|urlencode|percent encod*|decode url|url decode*',
    font: 'font|fonts|typeface*|फॉन्ट|ফন্ট|tipografía|tipograf*|police d\'écriture|schriftart*|шрифт*|フォント|yazı tipi|phông chữ|carattere|الخطوط|czcionk*',
    color: 'colour*|color*|palette*|hex code|रंग|রং|cor|cores|couleur*|farbe*|farben|цвет*|色|カラー|renk*|màu|colore*|colori|لون|ألوان|الألوان|warna|kolor*',
    link: 'link|links|share|sharing|direct link|host|hosting|hosted|लिंक|শেয়ার|লিংক|enlace*|compartir|compartilh*|partag*|teilen|ссылк*|подел*|リンク|共有|bağlantı*|paylaş*|liên kết|chia sẻ|condivid*|collegamento|رابط|مشاركة|tautan|bagikan|udostępnij',
    site: 'website*|site|sites|url|वेबसाइट|ওয়েবসাইট|sitio web|página web|site web|webseite|сайт*|サイト|web sitesi|trang web|sito|موقع|situs|strona www',
    collage: 'collage*|grid|side by side|कोलाज|কোলাজ|コラージュ|kolaj|ghép ảnh|коллаж*|كولاج|kolase|kolaż*',
    meme: 'meme*|मीम|মিম|мем*|ミーム|ميم', favicon: 'favicon*|site icon', thumbnail: 'thumbnail*|thumb|youtube cover|थंबनेल|থাম্বনেইল|miniatura*|vignette*|миниатюр*|превью|サムネ*|küçük resim|ảnh bìa|copertina|صورة مصغرة',
    screenshot: 'screenshot*|screen shot|स्क्रीनशॉट|স্ক্রিনশট|captura de pantalla|captura de tela|capture d\'écran|bildschirmfoto|скриншот*|スクショ|スクリーンショット|ekran görüntüsü|ảnh chụp màn hình|لقطة شاشة|tangkapan layar|zrzut ekranu',
    anime: 'anime|cartoon*|ghibli|toon*|कार्टून|এনিমে|কার্টুন|caricatura|dessin animé|мульт*|аниме|アニメ|çizgi film|hoạt hình|cartone|كرتون|انمي|kartun|kreskówk*',
    headshot: 'headshot*|profile photo|profile picture|linkedin photo|professional photo', exif: 'exif|metadata|meta data|location|gps|geotag*|camera info',
    carousel: 'carousel*|carrusel|carrossel|carrousel|karussell|карусел*|カルーセル|karusel*|caroselo|كاروسيل',
    scan: 'scan|scans|scanned|scanner|ocr|स्कैन|স্ক্যান|escane*|escaneado|digitaliz*|numérisé*|gescannt*|скан*|スキャン|taranmış|quét|scansionat*|ممسوح|pindai*|zeskanow*',
    social: 'instagram|insta|whatsapp|facebook|fb|twitter|tiktok|youtube|linkedin|story|stories|dp|status|line|zalo|telegram|pinterest|snapchat',
    generate: 'generat*|create|make|random|strong|banao|bana|बना*|তৈরি*|বানা*|crear|crea*|genera*|créer|génér*|erstell*|generier*|созда*|сгенер*|作成|生成|作って|作る|oluştur*|üret*|tạo|إنشاء|انشئ|توليد|buat*|bikin|utwórz|wygeneruj|generuj',
    // questions about the site itself
    q_free: 'nowatermark|free|cost*|price*|pricing|pay|paid|payment|subscription*|premium|money|fee|fees|charge*|paisa|paise|फ्री|मुफ्त|मुफत|पैसे|कीमत|ফ্রি|বিনামূল্যে|দাম|টাকা|gratis|gratuit*|precio|pagar|cuesta|grátis|preço|custa|prix|payer|payant|kostenlos|preis|kostet|bezahl*|бесплатн*|цена|стоит|платн*|無料|料金|有料|ücretsiz|bedava|fiyat|ücret*|miễn phí|giá|trả phí|prezzo|pagare|costa|مجان*|سعر|ثمن|دفع|bayar|harga|darmow*|za darmo|cena|płat*',
    q_safe: 'safe|safely|secure|security|privacy|private|server*|store|stored|storage|data|my files|virus*|malware|hack*|leak*|सुरक्षित|सेफ|प्राइवेसी|डेटा|নিরাপদ|প্রাইভেসি|ডেটা|seguro|segura|seguridad|privacidad|servidor*|datos|segurança|privacidade|dados|sécur*|confidentialité|serveur*|données|privé|sicher*|datenschutz|daten|безопас*|конфиденц*|сервер*|данные|安全|セキュリティ|プライバシー|サーバー|güvenli*|gizlilik|sunucu*|veri*|an toàn|bảo mật|máy chủ|dữ liệu|sicur*|privacy|dati|آمن|امان|أمان|خصوصية|الخصوصية|خادم|بيانات|aman|privasi|bezpiecz*|prywatn*|serwer*|dane',
    q_account: 'signup|signin|register*|login|log in|account*|e-mail|लॉगिन|लॉग इन|साइन अप|अकाउंट|रजिस्टर|অ্যাকাউন্ট|লগইন|সাইন আপ|registr*|cuenta|iniciar sesión|cadastr*|inscri*|compte|connexion|anmeld*|konto|einlogg*|регистр*|аккаунт*|войти|логин|登録|ログイン|アカウント|kayıt|üye ol*|hesap|giriş yap*|đăng ký|đăng nhập|tài khoản|accedi|accesso|iscri*|تسجيل|حساب|اشتراك|daftar|akun|logowan*|zaloguj|zarejestr*',
    q_limit: 'limit*|maximum|max|how big|how large|large file*|big file*|सीमा|लिमिट|সীমা|সর্বোচ্চ|límite|máximo|limite|taille max*|begrenz*|maximal*|лимит*|ограничен*|максимал*|制限|上限|最大|sınır*|maksimum|giới hạn|tối đa|massim*|الحد|أقصى|اقصى|batas*|maksimal|maksymaln*|ograniczen*',
    q_mobile: 'phone*|mobile*|android|iphone|ipad|ios|app|apps|tablet*|मोबाइल|फोन|ऐप|मोबाईल|মোবাইল|ফোন|অ্যাপ|móvil|celular*|teléfono|aplicación|telemóvel|aplicativo|téléphone|portable|smartphone*|appli|application mobile|handy|телефон*|мобильн*|андроид|приложени*|スマホ|携帯|アプリ|telefon*|mobil*|uygulama*|điện thoại|ứng dụng|cellulare|telefonino|هاتف|جوال|موبايل|تطبيق|ponsel|hp|aplikasi|komórk*|aplikacj*',
    q_offline: 'offline|without internet|no internet|without wifi|ऑफलाइन|बिना इंटरनेट|ইন্টারনেট ছাড়া|অফলাইন|sin internet|sin conexión|sem internet|hors ligne|sans internet|ohne internet|без интернет*|офлайн|オフライン|internetsiz|çevrimdışı|không cần mạng|ngoại tuyến|senza internet|بدون انترنت|بدون إنترنت|tanpa internet|bez internetu',
    q_what: 'who are you|what is this|what can you do|what do you do|help|how does this work|how it works|madad|मदद|सहायता|आप कौन|तुम कौन|সাহায্য|তুমি কে|ayuda|quién eres|ajuda|quem é você|aide|qui es-tu|hilfe|wer bist du|помощ*|кто ты|что ты умеешь|ヘルプ|あなたは誰|何ができ|yardım|sen kimsin|giúp|bạn là ai|aiuto|chi sei|مساعدة|من أنت|bantuan|siapa kamu|pomoc|kim jesteś|co potrafisz',
    q_hello: 'hi|hii|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|हेलो|हाय|হ্যালো|নমস্কার|hola|olá|oi|bonjour|salut|hallo|привет|здравств*|こんにちは|merhaba|selam|xin chào|chào|ciao|salve|مرحبا|السلام عليكم|اهلا|أهلا|cześć|dzień dobry|halo|selamat pagi',
    q_thanks: 'thanks|thank you|thx|ty|dhanyavad|shukriya|धन्यवाद|शुक्रिया|ধন্যবাদ|gracias|obrigad*|merci|danke|спасибо|ありがとう|teşekkür*|sağol*|cảm ơn|grazie|شكرا|شكراً|dzięk*|terima kasih|makasih',
  };
  // how much a word says about the tool: a rare, precise word (passport, watermark) beats a common one (photo)
  const WT = { passport: 8, background: 5, transparent: 5, watermark: 5, sign: 5, exif: 5, meme: 5, favicon: 5, thumbnail: 5, screenshot: 4, heic: 3, anime: 5, headshot: 5, collage: 5,
    carousel: 5, qr: 5, json: 5, case: 5, hash: 5, base64: 5, urlenc: 5, flatten: 5, pixelate: 5, unlock: 5, font: 4, speed: 4, count: 4, repair: 4, compare: 4, organize: 4,
    blur: 4, upscale: 4, scan: 4, number: 3, password: 3, protect: 3, speech: 3, color: 3, link: 3, form: 3, face: 3, rotate: 3, crop: 3, compress: 2.5, merge: 2.5, split: 2.5,
    edit: 2.5, resize: 2, remove: 2, replace: 2, cut: 2, site: 2, word: 2, convert: 1, social: 1, extract: 1, generate: 1, doc: 1 };
  const wt = c => WT[c] || 1.5;
  // the jobs: a tool and the ideas it needs (all of them). Popular tools first: on a tie the earlier one wins.
  const RULES = [
    ['', 'remove watermark'], ['', 'rotate video'],
    ['passport-size-photo-maker', 'passport'], ['remove-background', 'remove background'], ['remove-background', 'transparent'], ['replace-background', 'replace background'],
    ['remove-background', 'background'], ['resize-image-to-kb', 'resize sign'], ['resize-image-to-kb', 'compress sign'], ['resize-image-to-kb', 'form sign'], ['resize-image-to-kb', 'form image'], ['esign-pdf', 'sign'],
    ['compress-pdf', 'compress pdf'], ['compress-image', 'compress image'], ['compress-video', 'compress video'], ['merge-pdf', 'merge pdf'], ['photo-collage-maker', 'collage'],
    ['video-merger', 'merge video'], ['merge-audio', 'merge audio'], ['photo-collage-maker', 'merge image'], ['split-pdf', 'split pdf'], ['split-video', 'split video'], ['split-audio', 'split audio'],
    ['unlock-pdf', 'unlock'], ['unlock-pdf', 'remove password'], ['protect-pdf', 'protect pdf'], ['protect-pdf', 'password pdf'], ['password-generator', 'generate password'], ['password-generator', 'password'],
    ['instagram-image-carousel-splitter', 'split image'], ['delete-pdf-pages', 'remove page'], ['extract-pdf-pages', 'extract page'], ['organize-pdf', 'organize'], ['add-page-numbers-to-pdf', 'number page'],
    ['add-page-numbers-to-pdf', 'number pdf'], ['ocr-pdf', 'scan pdf'], ['image-to-text', 'scan'], ['image-to-text', 'extract text'], ['rotate-pdf', 'rotate pdf'], ['rotate-flip', 'rotate'], ['crop-pdf', 'crop pdf'], ['crop-image', 'crop'],
    ['video-trimmer', 'cut video'], ['split-audio', 'cut audio'], ['split-pdf', 'cut pdf'], ['crop-image', 'cut image'], ['upscale-image', 'upscale'], ['face-blur', 'blur face'], ['blur-redact-pdf', 'blur pdf'],
    ['face-blur', 'blur'], ['pixelate-image', 'pixelate'], ['add-watermark-to-pdf', 'watermark pdf'], ['add-watermark-to-video', 'watermark video'], ['add-watermark-to-image', 'watermark'],
    ['exif-remover', 'exif'], ['meme-generator', 'meme'], ['favicon-generator', 'favicon'], ['thumbnail-generator', 'thumbnail'], ['screenshot-beautifier', 'screenshot'], ['anime-style', 'anime'],
    ['ai-headshot-generator', 'headshot'], ['linkedin-carousel-maker', 'carousel'], ['social-media-image-resizer', 'resize image social'], ['social-media-image-resizer', 'resize social'], ['resize-image', 'resize image'], ['resize-image', 'resize'],
    ['pdf-editor', 'edit pdf'], ['compare-pdf', 'compare'], ['repair-pdf', 'repair'], ['flatten-pdf', 'flatten'], ['change-video-speed', 'speed'], ['text-to-audio', 'speech'], ['qr-code-generator', 'qr'],
    ['json-formatter', 'json'], ['word-counter', 'count'], ['text-case-converter', 'case'], ['hash-uuid-generator', 'hash'], ['url-encoder', 'urlenc'], ['base64', 'base64'], ['font-library', 'font'],
    ['website-color-palette-extractor', 'color site'], ['image-color-palette-extractor', 'color image'], ['color-palette-generator', 'color'], ['image-cdn', 'link image'],
    ['temporary-file-upload-direct-link-share', 'link'], ['heic-to-jpg', 'heic'], ['image-to-svg', 'svg'], ['markdown-converter', 'markdown'], ['video-to-audio', 'extract audio'],
    ['convert-image', 'convert image'], ['video-converter', 'convert video'], ['audio-converter', 'convert audio'], ['compress-pdf', 'compress doc'], ['merge-pdf', 'merge doc'], ['esign-pdf', 'sign doc'],
  ];
  const FAQ_A = {
    free: 'Yes, everything here is free: no sign-up, no watermark on your files and no daily limit.',
    safe: 'Your files stay on your device. The tools work right in your browser, so nothing is uploaded to a server (only the sharing tools, like file links, upload what you choose to share).',
    account: 'No account needed. Just open a tool and use it.',
    limit: 'There is no upload limit, because your own device does the work. Very big files, like long videos, just take longer.',
    mobile: 'Yes, it works on phones, tablets and computers, right in the browser. No app to install.',
    offline: 'You need the internet to open a tool, but the work itself happens on your device, so your files are never sent anywhere.',
    what: 'I am Baba. I know every tool on this site: tell me what you want to do with a file (make it smaller, convert it, merge it, sign it...) and I will open the right tool.',
    hello: 'Hi, I am Baba! Tell me what you want to do with a file, like "compress pdf" or "photo to 50 KB", and I will open the right tool.',
    thanks: 'Happy to help! Ask me anything else you need to do with a file.',
  };
  const FAQ_IDS = ['free', 'safe', 'account', 'limit', 'mobile', 'offline', 'what', 'hello', 'thanks'];
  const NOTE_FAQ = new Set(['free', 'safe', 'account', 'limit', 'mobile', 'offline']);   // also answered next to a tool
  // file types, for "A to B": which family each belongs to, and the names the tool addresses use for it
  const FAM = { jpg: 'image', png: 'image', webp: 'image', heic: 'image', image: 'image', mp4: 'video', video: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', flac: 'audio', ogg: 'audio',
    aac: 'audio', audio: 'audio', speech: 'audio', pdf: 'pdf', word: 'word', excel: 'excel', ppt: 'ppt', html: 'html', markdown: 'markdown', text: 'text', gif: 'gif', svg: 'svg' };
  const GENERIC = new Set(['image', 'video', 'audio', 'speech']);
  const NAMES = { jpg: ['jpg', 'image'], png: ['png', 'image'], webp: ['webp', 'image'], heic: ['heic', 'image'], image: ['image', 'jpg', 'png'], gif: ['gif'], svg: ['svg'], pdf: ['pdf'],
    word: ['word', 'docx'], excel: ['excel'], ppt: ['powerpoint'], html: ['html'], markdown: ['markdown'], text: ['text'], mp4: ['mp4', 'video'], video: ['video', 'mp4'],
    mp3: ['mp3', 'audio'], audio: ['audio', 'mp3'], wav: ['wav', 'audio'], m4a: ['m4a', 'audio'], flac: ['flac', 'audio'], ogg: ['ogg', 'audio'], aac: ['aac', 'audio'], speech: ['audio'] };
  // "the text FROM this picture": the source comes after these words, so the order flips
  const FROM = new Set(['from', 'of', 'out', 'desde', 'de', 'del', 'da', 'do', 'das', 'dos', 'desta', 'deste', 'dessa', 'desse', 'dal', 'dalla', 'dallo', 'dai', 'aus', 'von', 'из', 'с', 'со', 'من', 'từ', 'z', 'ze', 'dari']);
  const TO_WORDS = new Set(['to', 'into', 'as', '2']);
  const OBJ = new Set([...Object.keys(FAM), 'doc', 'page']);
  const VERB = new Set(['compress', 'resize', 'convert', 'merge', 'split', 'remove', 'rotate', 'crop', 'cut', 'edit', 'protect', 'unlock', 'upscale', 'watermark', 'number', 'organize', 'extract', 'sign', 'blur', 'replace']);
  // words that join two jobs; the short ones only in their own language ("i" is "and" in Polish but "the" in Italian)
  const CONNECT = ['and then', 'and also', 'then', 'and', 'also', 'after that', 'phir', 'fir', 'aur', 'और', 'फिर', 'एवं', 'এবং', 'তারপর', 'আর', 'y luego', 'luego', 'después', 'es:y', 'e depois', 'depois', 'então',
    'pt:e', 'it:e', 'puis', 'ensuite', 'fr:et', 'und dann', 'dann', 'und', 'и потом', 'потом', 'затем', 'ru:и', 'sonra', 'tr:ve', 'rồi', 'và', 'sau đó', 'poi', 'quindi', 'ثم', 'ar:و', 'lalu', 'kemudian', 'id:dan', 'potem', 'następnie', 'pl:i'];
  const splitters = {};
  const splitter = lang => splitters[lang] || (splitters[lang] = new RegExp('[,;+&、，。!?？！]|\\.(?!\\d)|そして|それから|てから|(?<=^|\\s)(?:' +
    CONNECT.filter(w => !/^[a-z]{2}:/.test(w) || w.startsWith(lang + ':')).map(w => w.replace(/^[a-z]{2}:/, '')).sort((a, b) => b.length - a.length).join('|') + ')(?=\\s|$)', 'u'));

  const clean = s => s.toLowerCase().normalize('NFC').replace(/[’`´]/g, "'").replace(/[़়ً-ْـ]/g, '');
  // accents typed or not ("comprímelos", "cancion"): Latin letters are also compared without them (not in Vietnamese,
  // where the marks tell words apart: nén is compress, nền is background)
  const fold = s => s.normalize('NFD').replace(/([\p{Script=Latin}])\p{M}+/gu, '$1').normalize('NFC');
  const SPACED = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Arabic}\p{Script=Greek}\d*]+$/u;   // one plain word (else: found anywhere)
  const ENTRIES = Object.entries(LEX).flatMap(([c, s]) => s.split('|').map(x => {
    let lang = null; const m = /^([a-z]{2}):(.+)$/.exec(x); if (m) { lang = m[1]; x = m[2]; }
    x = clean(x); const pre = x.endsWith('*'); if (pre) x = x.slice(0, -1);
    const mode = SPACED.test(x) ? (pre ? 'pre' : 'eq') : 'sub', f = fold(x);
    return f === x ? [{ c, lang, e: x, mode }] : [{ c, lang, e: x, mode }, { c, lang, e: f, mode, folded: true }];
  }).flat());
  const AR_PRE = ['وال', 'بال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف'];

  // the ideas in a piece of text, each with where it first appears
  const analyse = (text, lang) => {
    const n = clean(text).replace(/sign[\s-]?(up|in)\b/g, 'signup').replace(/\b(no|without|free of|zero) watermarks?/g, 'nowatermark')
      .replace(/([\p{Script=Latin}\d])(?=[^\p{Script=Latin}\d\s'-])/gu, '$1 ').replace(/([^\p{Script=Latin}\d\s'-])(?=[\p{Script=Latin}\d])/gu, '$1 ');
    const toks = [];
    for (const m of n.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      toks.push({ t: m[0], i: m.index });
      if (lang !== 'vi' && /\p{Script=Latin}/u.test(m[0])) { const f = fold(m[0]); if (f !== m[0]) toks.push({ t: f, i: m.index }); }
      if (/^\p{Script=Arabic}/u.test(m[0])) for (const p of AR_PRE) if (m[0].startsWith(p) && m[0].length - p.length >= 2) toks.push({ t: m[0].slice(p.length), i: m.index });
    }
    const hits = new Map(), hit = (c, i) => { if (!hits.has(c) || hits.get(c) > i) hits.set(c, i); };
    const nf = lang === 'vi' ? n : fold(n);
    for (const x of ENTRIES) {
      if ((x.lang && x.lang !== lang) || (x.folded && lang === 'vi')) continue;
      if (x.mode === 'sub') {
        const edge = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Arabic}]/u.test(x.e), s = x.folded ? nf : n;
        for (let k = s.indexOf(x.e); k >= 0; k = s.indexOf(x.e, k + 1)) if (!edge || !/[\p{L}\p{M}]/u.test(s[k - 1] || ' ')) { hit(x.c, k); break; }
      } else for (const t of toks) if (x.mode === 'pre' ? t.t.startsWith(x.e) : (t.t === x.e || t.t === x.e + 's')) { hit(x.c, t.i); break; }
    }
    const sm = [...n.matchAll(/(\d+(?:[.,]\d+)?)\s*(kb|k|kbs|kilobytes?|кб|केबी|কেবি|mb|мб|एमबी|এমবি)(?![\p{L}])/gu)].pop();
    const size = sm ? { n: sm[1].replace(',', '.'), u: /^(mb|мб|एमबी|এমবি)$/.test(sm[2]) ? 'mb' : 'kb' } : null;
    if (size) hit('kb', sm.index);
    const dm = /\d+\s*[x×]\s*\d+/.exec(n); if (dm && !hits.has('passport')) hit('resize', dm.index);
    return { n, toks, hits, size };
  };
  const has = (A, c) => A.hits.has(c) || (c === 'pdf' && A.hits.has('doc'));

  // "A to B" (pdf to jpg, photo into pdf, the song from this video as mp3)
  const conversion = (A, all) => {
    const list = [...A.hits].filter(([c]) => FAM[c]).sort((a, b) => a[1] - b[1] || GENERIC.has(a[0]) - GENERIC.has(b[0])), seq = [];
    for (const [c, p] of list) {
      const same = seq.find(s => FAM[s.c] === FAM[c]);
      if (!same) seq.push({ c, p });
      else if (GENERIC.has(same.c) && !GENERIC.has(c)) same.c = c;
      else if (!GENERIC.has(c) && same.c !== c) seq.push({ c, p });
    }
    const between = (p1, p2, set) => A.toks.some(t => t.i > p1 && t.i < p2 && set.has(t.t));
    // "jpg and png to pdf": two of a kind going the same way become the kind (image to pdf)
    const names = (x, y) => (seq.some(s => s !== x && FAM[s.c] === FAM[x.c] && (s.p < y.p) === (x.p < y.p)) ? [FAM[x.c], ...NAMES[x.c]] : NAMES[x.c]);
    const pairs = [];
    for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) {
      const a = seq[i], b = seq[j], to = between(a.p, b.p, TO_WORDS), flip = between(a.p, b.p, FROM);
      pairs.push({ to, tries: flip ? [[b, a]] : to ? [[a, b]] : [[a, b], [b, a]] });
    }
    pairs.sort((p, q) => q.to - p.to);   // a pair with "to" between them says the most
    for (const { tries } of pairs) for (const [x, y] of tries) for (const nx of names(x, y)) for (const ny of NAMES[y.c]) { const s = nx + '-to-' + ny; if (all.has(s)) return { slug: s, out: y.c }; }
    return null;
  };
  // "20 KB", "under 1 MB": the size pages
  const bySize = (A, all) => {
    if (!A.hits.has('kb')) return null;
    const tag = A.size ? A.size.n + A.size.u : '';
    if (A.hits.has('video')) return 'compress-video';
    if (has(A, 'pdf')) return all.has('compress-pdf-under-' + tag) ? 'compress-pdf-under-' + tag : 'compress-pdf';
    const f = A.hits.has('png') ? 'png' : A.hits.has('jpg') ? (A.n.includes('jpeg') ? 'jpeg' : 'jpg') : null;
    if (f && A.hits.has('compress') && all.has(`compress-${f}-under-${tag}`)) return `compress-${f}-under-${tag}`;
    return 'resize-image-to-kb';
  };
  const bestRule = A => {
    let best = null;
    RULES.forEach(([slug, need], k) => {
      const req = need.split(' '); if (!req.every(c => has(A, c))) return;
      const score = req.reduce((s, c) => s + wt(c), 0), strong = req.some(c => wt(c) >= 3 && c !== 'speech');
      if (!best || score > best.score) best = { slug, score, strong, k };
    });
    return best;
  };
  const CAT_OBJ = { image: 'image', ai: 'image', pdf: 'pdf', video: 'video' };   // what a tool hands on to the next job
  const faqsOf = A =>FAQ_IDS.filter(id => A.hits.has('q_' + id));
  // one job: the tool for it, or the answer to a question, or nothing
  const classify = (A, all) => {
    const objOut = () => [...A.hits.keys()].find(c => OBJ.has(c));
    let slug = bySize(A, all), out = null;
    if (!slug) {
      const conv = conversion(A, all), rule = bestRule(A);
      if (rule && rule.slug === '') return { none: true };
      if (conv && !(rule && rule.strong && rule.score >= 5)) { slug = conv.slug; out = conv.out; }
      else if (rule && !(rule.score < 3 && faqsOf(A).some(f => NOTE_FAQ.has(f)))) slug = rule.slug;   // "max file size" is a question, not a resize
    }
    const faqs = faqsOf(A);
    if (slug && all.has(slug)) return { slug, conv: !!out, out: out || objOut() || CAT_OBJ[all.get(slug).cat], faqs: faqs.filter(f => NOTE_FAQ.has(f) && !(f === 'mobile' && A.hits.has('heic'))) };
    if (faqs.length) return { faqs: faqs.filter(f => faqs.length === 1 || !['hello', 'what', 'thanks'].includes(f)).slice(0, 3) };
    return null;
  };
  const cache = new WeakMap();
  const toolsOf = data => {
    if (cache.has(data)) return cache.get(data);
    const m = new Map(); HT.searchItems(data).forEach(t => m.set(t.slug, t));
    (data.variants || []).forEach(v => { if (m.has(v.slug)) return; const b = data.tools.find(t => t.slug === v.base); if (b) m.set(v.slug, { ...v, cat: v.cat || b.cat, base: v.base, href: HT.href(v.slug), isTab: true }); });
    cache.set(data, m); return m;
  };

  // the whole question -> { kind: 'tool' | 'plan' | 'faq' | 'pick' | 'none', tools: [...], faqs: [...] }
  const match = (data, text) => {
    const all = toolsOf(data), lang = HT.lang, T = s => all.get(s);
    const res = (kind, slugs, faqs = []) => ({ kind, tools: [...new Set(slugs)].map(T).filter(Boolean), faqs });
    // two or more jobs ("merge these, then make it smaller"): each piece on its own, borrowing the file from its neighbour
    const segs = text.split(splitter(lang)).map(s => s && s.trim()).filter(s => s && /[\p{L}\p{N}]/u.test(s));
    if (segs.length > 1) {
      const As = segs.map(s => analyse(s, lang)), objs = A => [...A.hits.keys()].filter(c => OBJ.has(c));
      let prevOut = null; const outs = [];
      As.forEach((A, i) => {
        if (!objs(A).length && [...A.hits.keys()].some(c => VERB.has(c))) {
          (prevOut ? [prevOut] : (As.slice(i + 1).map(objs).find(o => o.length) || [])).forEach(c => A.hits.set(c, 1e6));
          if (A.hits.has('replace') && i && As[i - 1].hits.has('background')) A.hits.set('background', 1e6);   // "remove the background, then add white"
        }
        else if (prevOut && A.hits.has('convert') && [...A.hits.keys()].filter(c => FAM[c] && !GENERIC.has(c)).length === 1 && !A.hits.has(prevOut)) A.hits.set(prevOut, -1);
        const r = classify(A, all); outs.push(r); if (r && r.slug) prevOut = r.out || prevOut;
      });
      if (outs.every(r => r && !r.none)) {
        const slugs = outs.filter(r => r.slug).map(r => r.slug).filter((s, i, a) => s !== a[i - 1]), faqs = [...new Set(outs.flatMap(r => r.faqs))];
        const fq = slugs.length ? faqs.filter(f => NOTE_FAQ.has(f)) : faqs.filter(f => faqs.length === 1 || !['hello', 'what', 'thanks'].includes(f));
        if (slugs.length > 1) return res('plan', slugs.slice(0, 4), fq);
        if (slugs.length === 1) return res('tool', slugs, fq);
        return res('faq', [], fq.slice(0, 3));
      }
    }
    const A = analyse(text, lang), r = classify(A, all);
    if (r && r.none) return res('none', SLUGS.slice(0, 4));
    if (r && r.slug) return res('tool', [r.slug], r.faqs);
    if (r) return res('faq', [], r.faqs);
    // not sure: the tools closest to the ideas Baba did understand, else the site's own search (it knows every
    // tool's name in this language), else word by word
    const near = [];
    const convs = [...A.hits.keys()].filter(c => FAM[c]).flatMap(c => NAMES[c]).flatMap(nm => [...[...all.keys()].filter(k => k.startsWith(nm + '-to-')), ...[...all.keys()].filter(k => k.endsWith('-to-' + nm))]);   // "convert pdf": from pdf first
    if (A.hits.has('convert')) near.push(...convs);
    RULES.map(([slug, need], k) => { const req = need.split(' '), got = req.filter(c => has(A, c)); return { slug, w: got.reduce((x, c) => x + wt(c), 0), k }; })
      .filter(x => x.w >= 1.5).sort((a, b) => b.w - a.w || a.k - b.k).forEach(x => near.push(x.slug));
    if (!A.hits.has('convert')) near.push(...convs);
    if (!near.length) { const s = HT.searchTools(data, text); if (s.hits.length) return res(s.hits.length === 1 ? 'tool' : 'pick', s.hits.slice(0, 4).map(t => t.slug)); }
    if (!near.length) {   // word by word through the site search
      const tally = new Map();
      A.toks.filter(t => t.t.length >= 3).forEach(t => HT.searchTools(data, t.t).hits.slice(0, 3).forEach((h, k) => tally.set(h.slug, (tally.get(h.slug) || 0) + 3 - k)));
      near.push(...[...tally].sort((a, b) => b[1] - a[1]).map(x => x[0]));
    }
    if (near.length) return res('pick', [...new Set(near)].filter(s => all.has(s)).slice(0, 4));
    return res('none', SLUGS.slice(0, 4));
  };
  HT.askBabaMatch = (data, text) => match(data, text);

  HT.askBaba = async (stage, { compact = false } = {}) => {
    if (!stage || stage.dataset.ready) return; stage.dataset.ready = '1';
    const data = await HT.loadTools(); await HT.i18n;
    const all = toolsOf(data);
    const texts = Q[HT.lang] || Q.en;
    const tasks = SLUGS.map((s, i) => ({ slug: s, text: texts[i], tool: all.get(s) })).filter(t => t.tool);   // archived tools drop out
    const narrow = () => stage.clientWidth < 700 || compact;
    let spots = narrow() ? NARROW : WIDE, cards = [], active = -1, auto = null, typing = null, panel = null, next = 0;

    // far-away boxes: small soft cards across the whole width (the farther, the smaller and blurrier), on a faint floor
    const ghosts = el('div', { class: 'ab-ghosts', 'aria-hidden': 'true' });
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 28; i++) {
      const d = rnd() * .4, w = (70 + rnd() * 120) * (.6 + d);
      const g = el('i', { style: { left: (rnd() * 96 + 2) + '%', top: (rnd() * 90 + 5) + '%', width: w.toFixed(0) + 'px', height: (w * .36).toFixed(0) + 'px', opacity: (.4 + d).toFixed(2) } });
      g.style.setProperty('--d', d.toFixed(2)); ghosts.append(g);
    }
    const field = el('div', { class: 'ab-field' });
    stage.textContent = ''; stage.append(el('div', { class: 'ab-floor', 'aria-hidden': 'true' }), ghosts, field);

    const place = () => {
      spots = narrow() ? NARROW : WIDE;
      cards.forEach((c, i) => { const s = spots[i]; c.hidden = !s; if (!s) return; c.style.left = (s[0] * 100) + '%'; c.style.top = (s[1] * 100) + '%'; c.style.setProperty('--d', s[2]); c.style.zIndex = Math.round(s[2] * 10); });
    };
    const makeCard = (task, i) => {
      const txt = el('span', { class: 'ab-text', text: task.text });
      const c = el('button', { type: 'button', class: 'ab-card', 'aria-label': task.text }, txt, el('span', { class: 'ab-foot' }, face(), el('span', { class: 'ab-send' }, send())));
      c.task = task; c.txt = txt;
      c.addEventListener('click', () => open(c.task.text, { kind: 'tool', tools: [c.task.tool], faqs: [] }, c));
      c.addEventListener('focus', () => wake(i, false));
      return c;
    };
    for (let i = 0; i < Math.max(WIDE.length, NARROW.length); i++) { const c = makeCard(tasks[i % tasks.length], i); cards.push(c); field.append(c); }
    next = cards.length % tasks.length;
    place(); addEventListener('resize', HT.debounce(place, 150));

    // the real message box, at the front
    const input = el('input', { type: 'text', class: 'ab-input', placeholder: T('Type what you need…'), 'aria-label': T('Type what you need…'), enterkeyhint: 'send', autocomplete: 'off', maxlength: '300' });
    const go = el('button', { type: 'submit', class: 'ab-go', 'aria-label': T('Ask Baba') }, send());
    const form = el('form', { class: 'ab-ask' }, face(), input, go);
    form.addEventListener('submit', e => {
      e.preventDefault(); const q = input.value.trim(); if (!q) return input.focus();
      open(q, match(data, q), form);
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
    const lean = () => { tx += (px - tx) * .08; ty += (py - ty) * .08; stage.style.setProperty('--mx', tx.toFixed(3)); stage.style.setProperty('--my', ty.toFixed(3)); if (Math.abs(px - tx) + Math.abs(py - ty) > .002) raf = requestAnimationFrame(lean); else raf = 0; };
    stage.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || panel) return;
      const r = stage.getBoundingClientRect(); hover = true;
      px = (e.clientX - r.left) / r.width - .5; py = (e.clientY - r.top) / r.height - .5;
      if (!raf) raf = requestAnimationFrame(lean);
      let best = -1, bd = Infinity;
      cards.forEach((c, k) => { if (c.hidden) return; const b = c.getBoundingClientRect(), d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)); if (d < bd) { bd = d; best = k; } });
      if (best >= 0) wake(best, false);
    });
    stage.addEventListener('pointerleave', () => { hover = false; px = py = 0; if (!raf) raf = requestAnimationFrame(lean); });

    // ---- Baba at work: the box grows into a panel and the answer appears piece by piece
    const hrefOf = t => t.href || HT.href(t.slug);
    const stepsOf = t => { const b = t.isTab && all.get(t.base); const s = (t.steps && t.steps.length ? t.steps : b && b.steps) || []; return s.length ? s : [T('<b>Add your file</b>: it stays on your device'), T('<b>Adjust</b> the settings and watch the live preview'), T('<b>Download</b> the finished result')]; };
    const toolCard = (t, label) => el('a', { class: 'ab-tool', href: hrefOf(t) }, el('i', {}, HT.toolIcon(t.isTab ? t.base : t.slug)),
      el('span', {}, label ? el('em', { text: label }) : null, el('b', { text: t.name }), el('small', { text: t.desc })));
    function open(text, res, from) {
      if (panel) return;
      clearInterval(auto); clearInterval(typing);
      const fr = from.getBoundingClientRect();
      const close = el('button', { type: 'button', class: 'ab-x', 'aria-label': T('Close'), text: '×' });
      const chip = el('div', { class: 'ab-chip' }, el('span', { class: 'ab-dots' }, el('i'), el('i'), el('i')), el('span', { text: T('Baba is on it') }));
      const body = el('div', { class: 'ab-body' }), bar = el('div', { class: 'ab-bar' }, el('i')), end = el('div', { class: 'ab-end' });
      panel = el('div', { class: 'ab-panel', role: 'dialog', 'aria-label': T('Ask Baba'), 'aria-live': 'polite' }, el('div', { class: 'ab-top' }, el('div', { class: 'ab-q', text: text }), close), chip, body, bar, end);
      // it starts exactly where the box was, then grows to the middle (only transform and opacity move: smooth)
      stage.append(panel); stage.classList.add('open');
      const pr = panel.getBoundingClientRect();
      panel.animate([{ transform: `translate(${fr.left - pr.left}px, ${fr.top - pr.top}px) scale(${fr.width / pr.width}, ${fr.height / pr.height})`, opacity: .6 }, { transform: 'none', opacity: 1 }],
        { duration: 520, easing: 'cubic-bezier(.2, .8, .25, 1)' });
      const shut = () => {
        if (!panel) return; const p = panel; panel = null; stage.classList.remove('open');
        p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => p.remove();
        document.removeEventListener('keydown', esc); startAuto();
      };
      const esc = e => { if (e.key === 'Escape') shut(); };
      close.onclick = shut; document.addEventListener('keydown', esc);
      const again = () => el('button', { type: 'button', class: 'btn ghost sm', text: T('Ask something else'), onclick: () => { shut(); setTimeout(() => { input.value = ''; input.focus(); }, 250); } });
      // what to show, one piece at a time
      const steps = [], say = id => steps.push(() => body.append(el('p', { class: 'ab-say', text: T(FAQ_A[id]) })));
      const tools = res.tools; let done = '', buttons = [];
      if (res.kind === 'tool') {
        res.faqs.forEach(say);
        const t = tools[0], ol = el('ol', { class: 'ab-steps' });
        steps.push(() => body.append(toolCard(t)));
        stepsOf(t).forEach((s, i) => steps.push(() => { if (!i) body.append(ol); const li = el('li'); li.innerHTML = s.replace(/<(?!\/?b>)[^>]*>/g, ''); ol.append(li); }));
        done = T('Ready: here is your tool'); buttons = [el('a', { class: 'btn', href: hrefOf(t) }, T('Open {0}', t.name), ' →'), again()];
      } else if (res.kind === 'plan') {
        res.faqs.forEach(say);
        tools.forEach((t, i) => steps.push(() => body.append(toolCard(t, T('Step {0}', i + 1)))));
        done = T('Baba made a plan'); buttons = [el('a', { class: 'btn', href: hrefOf(tools[0]) }, T('Start with {0}', tools[0].name), ' →'), again()];
      } else if (res.kind === 'faq') {
        res.faqs.forEach(say); done = T('Baba says'); buttons = [again()];
      } else {
        steps.push(() => body.append(el('p', { class: 'ab-say', text: res.kind === 'none' ? T('Baba does not have a tool for that yet. These are the ones people use most:') : T('A few tools could help. Pick the one you need:') })));
        const list = el('div', { class: 'ab-list' });
        tools.forEach((t, i) => steps.push(() => { if (!i) body.append(list); list.append(toolCard(t)); }));
        done = T('Baba found these'); buttons = [again()];
      }
      let k = 0;
      const next = () => {
        if (!panel) return;
        if (k < steps.length) { steps[k++](); bar.firstChild.style.width = (k / (steps.length + 1) * 100) + '%'; setTimeout(next, res.kind === 'tool' ? 650 : 420); return; }
        bar.firstChild.style.width = '100%'; chip.classList.add('done'); chip.lastChild.textContent = done;
        end.append(...buttons);
        const a = end.querySelector('a, button'); if (a) a.focus({ preventScroll: true });
      };
      setTimeout(next, 850);
    }

    // start only while the section is on screen
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { if (active < 0) wake(spots === NARROW ? 1 : 4, true); startAuto(); } else clearInterval(auto); }), { threshold: .2 }).observe(stage);
  };
})();
