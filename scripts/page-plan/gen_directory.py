"""Phrases of the site footer that is now in every page's HTML, and of the "All tools and pages" directory (/all-tools),
in the 14 languages. Only fills phrases a language does not have yet. Run:  python scripts/page-plan/gen_directory.py ."""
import json, os, sys

LANGS = ['hi', 'bn', 'es', 'pt', 'id', 'fr', 'de', 'ru', 'ja', 'tr', 'vi', 'it', 'ar', 'pl']
S = [
    ["All tools & pages", "सभी टूल और पेज", "সব টুল ও পেজ", "Todas las herramientas y páginas", "Todas as ferramentas e páginas", "Semua alat & halaman", "Tous les outils et pages", "Alle Tools & Seiten", "Все инструменты и страницы", "すべてのツールとページ", "Tüm araçlar ve sayfalar", "Tất cả công cụ & trang", "Tutti gli strumenti e le pagine", "كل الأدوات والصفحات", "Wszystkie narzędzia i strony"],
    ["All tools and pages", "सभी टूल और पेज", "সব টুল ও পেজ", "Todas las herramientas y páginas", "Todas as ferramentas e páginas", "Semua alat dan halaman", "Tous les outils et pages", "Alle Tools und Seiten", "Все инструменты и страницы", "すべてのツールとページ", "Tüm araçlar ve sayfalar", "Tất cả công cụ và trang", "Tutti gli strumenti e le pagine", "كل الأدوات والصفحات", "Wszystkie narzędzia i strony"],
    ["All tools and pages – {0}", "सभी टूल और पेज – {0}", "সব টুল ও পেজ – {0}", "Todas las herramientas y páginas – {0}", "Todas as ferramentas e páginas – {0}", "Semua alat dan halaman – {0}", "Tous les outils et pages – {0}", "Alle Tools und Seiten – {0}", "Все инструменты и страницы – {0}", "すべてのツールとページ – {0}", "Tüm araçlar ve sayfalar – {0}", "Tất cả công cụ và trang – {0}", "Tutti gli strumenti e le pagine – {0}", "كل الأدوات والصفحات – {0}", "Wszystkie narzędzia i strony – {0}"],
    ["Every free tool on {0} in one list: {1} pages for images, PDF, video, audio, AI and text, with their format and size pages.",
     "{0} के सभी फ़्री टूल एक सूची में: इमेज, PDF, वीडियो, ऑडियो, AI और टेक्स्ट के {1} पेज, उनके फ़ॉर्मेट और साइज़ पेज के साथ।",
     "{0}-এর সব ফ্রি টুল এক তালিকায়: ছবি, PDF, ভিডিও, অডিও, AI ও টেক্সটের {1}টি পেজ, ফরম্যাট ও সাইজ পেজ সহ।",
     "Todas las herramientas gratis de {0} en una lista: {1} páginas de imágenes, PDF, vídeo, audio, IA y texto, con sus páginas de formato y tamaño.",
     "Todas as ferramentas grátis do {0} em uma lista: {1} páginas de imagens, PDF, vídeo, áudio, IA e texto, com suas páginas de formato e tamanho.",
     "Semua alat gratis {0} dalam satu daftar: {1} halaman untuk gambar, PDF, video, audio, AI, dan teks, beserta halaman format dan ukurannya.",
     "Tous les outils gratuits de {0} en une liste : {1} pages pour les images, PDF, vidéo, audio, IA et texte, avec leurs pages de format et de taille.",
     "Alle kostenlosen Tools von {0} in einer Liste: {1} Seiten für Bilder, PDF, Video, Audio, KI und Text, mit ihren Format- und Größenseiten.",
     "Все бесплатные инструменты {0} в одном списке: {1} страниц для изображений, PDF, видео, аудио, ИИ и текста, со страницами форматов и размеров.",
     "{0} の無料ツールをひとつのリストに：画像、PDF、動画、音声、AI、テキストの {1} ページ。形式別・サイズ別のページも含みます。",
     "{0} üzerindeki tüm ücretsiz araçlar tek listede: görsel, PDF, video, ses, yapay zekâ ve metin için {1} sayfa; biçim ve boyut sayfalarıyla birlikte.",
     "Tất cả công cụ miễn phí của {0} trong một danh sách: {1} trang cho ảnh, PDF, video, âm thanh, AI và văn bản, kèm các trang định dạng và kích thước.",
     "Tutti gli strumenti gratuiti di {0} in un elenco: {1} pagine per immagini, PDF, video, audio, IA e testo, con le loro pagine di formato e dimensione.",
     "كل أدوات {0} المجانية في قائمة واحدة: {1} صفحة للصور وPDF والفيديو والصوت والذكاء الاصطناعي والنصوص، مع صفحات الصيغ والأحجام.",
     "Wszystkie darmowe narzędzia {0} na jednej liście: {1} stron do obrazów, PDF, wideo, audio, AI i tekstu, z ich stronami formatów i rozmiarów."],
    ["Every tool on {0}, with all its format and size pages. All free, no sign-up.",
     "{0} का हर टूल, उसके सभी फ़ॉर्मेट और साइज़ पेज के साथ। सब फ़्री, बिना साइन-अप।",
     "{0}-এর প্রতিটি টুল, তার সব ফরম্যাট ও সাইজ পেজ সহ। সব ফ্রি, সাইন-আপ ছাড়াই।",
     "Cada herramienta de {0}, con todas sus páginas de formato y tamaño. Todo gratis, sin registro.",
     "Cada ferramenta do {0}, com todas as páginas de formato e tamanho. Tudo grátis, sem cadastro.",
     "Setiap alat di {0}, dengan semua halaman format dan ukurannya. Semua gratis, tanpa daftar.",
     "Chaque outil de {0}, avec toutes ses pages de format et de taille. Tout est gratuit, sans inscription.",
     "Jedes Tool von {0} mit allen Format- und Größenseiten. Alles kostenlos, ohne Anmeldung.",
     "Каждый инструмент {0} со всеми страницами форматов и размеров. Всё бесплатно, без регистрации.",
     "{0} のすべてのツールと、その形式別・サイズ別のページ。すべて無料、登録不要。",
     "{0} üzerindeki her araç, tüm biçim ve boyut sayfalarıyla. Hepsi ücretsiz, kayıt gerekmez.",
     "Mọi công cụ của {0}, cùng tất cả trang định dạng và kích thước. Hoàn toàn miễn phí, không cần đăng ký.",
     "Ogni strumento di {0}, con tutte le sue pagine di formato e dimensione. Tutto gratis, senza registrazione.",
     "كل أداة في {0} مع كل صفحات الصيغ والأحجام. كلها مجانية ودون تسجيل.",
     "Każde narzędzie {0} ze wszystkimi stronami formatów i rozmiarów. Wszystko za darmo, bez rejestracji."],
    ["{0} pages", "{0} पेज", "{0}টি পেজ", "{0} páginas", "{0} páginas", "{0} halaman", "{0} pages", "{0} Seiten", "{0} стр.", "{0} ページ", "{0} sayfa", "{0} trang", "{0} pagine", "{0} صفحة", "{0} stron"],
    ["Toolz Baba home", "Toolz Baba होम", "Toolz Baba হোম", "Inicio de Toolz Baba", "Início do Toolz Baba", "Beranda Toolz Baba", "Accueil Toolz Baba", "Toolz Baba Startseite", "Главная Toolz Baba", "Toolz Baba ホーム", "Toolz Baba ana sayfa", "Trang chủ Toolz Baba", "Home di Toolz Baba", "الصفحة الرئيسية لـ Toolz Baba", "Strona główna Toolz Baba"],
    ["Tools", "टूल", "টুল", "Herramientas", "Ferramentas", "Alat", "Outils", "Tools", "Инструменты", "ツール", "Araçlar", "Công cụ", "Strumenti", "الأدوات", "Narzędzia"],
    ["Popular", "लोकप्रिय", "জনপ্রিয়", "Populares", "Populares", "Populer", "Populaires", "Beliebt", "Популярные", "人気", "Popüler", "Phổ biến", "Popolari", "الأكثر استخدامًا", "Popularne"],
    ["Video & audio", "वीडियो और ऑडियो", "ভিডিও ও অডিও", "Vídeo y audio", "Vídeo e áudio", "Video & audio", "Vidéo et audio", "Video & Audio", "Видео и аудио", "動画と音声", "Video ve ses", "Video & âm thanh", "Video e audio", "الفيديو والصوت", "Wideo i audio"],
    ["Contact", "संपर्क", "যোগাযোগ", "Contacto", "Contato", "Kontak", "Contact", "Kontakt", "Контакты", "お問い合わせ", "İletişim", "Liên hệ", "Contatti", "اتصل بنا", "Kontakt"],
    ["Blog", "ब्लॉग", "ব্লগ", "Blog", "Blog", "Blog", "Blog", "Blog", "Блог", "ブログ", "Blog", "Blog", "Blog", "المدونة", "Blog"],
]


def main(root):
    assert all(len(r) == 15 for r in S)
    added = 0
    for i, lang in enumerate(LANGS, start=1):
        p = os.path.join(root, 'i18n', lang, 'strings.json')
        raw = open(p, 'rb').read().decode('utf-8'); d = json.loads(raw)
        for row in S:
            if row[0] not in d:
                d[row[0]] = row[i]; added += 1
        # written the way the file already is (same indent and line endings), so the diff is only the new lines
        crlf = '\r\n' in raw
        second = raw.replace('\r\n', '\n').split('\n')[1]
        text = json.dumps(d, ensure_ascii=False, indent=len(second) - len(second.lstrip(' '))) + '\n'
        open(p, 'wb').write((text.replace('\n', '\r\n') if crlf else text).encode('utf-8'))
    print(f'phrases: {len(S)} in {len(LANGS)} languages, {added} added')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
