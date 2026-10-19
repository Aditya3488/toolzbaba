"""Image Enhancer: the tool, six pages for the main jobs people search for, and the translations of the tool and its screen.

Run from the repo root:  python scripts/page-plan/gen_enhancer.py .
Idempotent: the tool and pages are only added when missing; translations are (re)written.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from gen_docsheet import save_like, LANGS  # noqa: E402
from i18n_archive import t  # noqa: E402

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
TOOLS = ROOT / "static" / "assets" / "tools.json"

BASE = {
    "slug": "image-enhancer", "cat": "image", "icon": "image-enhancer", "name": "Image Enhancer",
    "desc": "Fix dark, dull, blurry or noisy photos in one click, then fine-tune like a pro. Runs in your browser.",
    "kind": "client", "engine": "enhance", "js": "image-enhancer", "tabAll": "All looks",
    "keywords": "photo enhancer image enhancer improve photo quality auto enhance brighten fix dark photo sharpen denoise unblur optimize optimise colour correction lightroom",
    "about": ("Make any photo look its best. Auto Enhance reads each picture and corrects what it needs: exposure, contrast, white "
              "balance, shadows and highlights, dull colours, noise and softness. Every correction is shown on a slider, so you can "
              "see exactly what changed and fine-tune it like in a professional editor: exposure, contrast, highlights, shadows, "
              "whites, blacks, temperature, tint, vibrance, saturation, clarity, dehaze, sharpening, noise reduction and vignette. "
              "Looks for portraits, landscapes, low light, products, food, old photos, documents and black and white shape the result "
              "in one tap. An optional AI step (Real-ESRGAN) removes blur, noise and JPEG blocks. Save as JPG, WebP, AVIF or PNG, "
              "resize for the web and hit a target file size, for many photos at once. Everything runs in your browser, so your "
              "photos are never uploaded."),
    "title": "Image Enhancer Free: Auto Enhance & Improve Photo Quality Online | Toolz Baba",
    "metaDesc": "Fix dark, dull, blurry or noisy photos in one click. Pro sliders, AI detail restore, looks for portraits, old photos and documents. Free, private, nothing uploaded.",
    "steps": ["Add your photos (several at once is fine).", "Pick a look, or keep Auto: each photo is corrected on its own.",
              "Fine-tune the sliders if you like, compare with the drag line, then save as JPG, WebP, AVIF or PNG."],
    "faq": [
        {"q": "How does Auto Enhance decide what to change?", "a": "It measures the photo: how bright it is, how wide its tones are, whether neutral colours have a cast, how much noise and how much fine detail it has. From that it sets each slider, and you can see and change every value."},
        {"q": "Can it fix a blurry photo?", "a": "Sharpening and clarity make soft photos crisper. For really soft, small or old photos, turn on AI detail restore: an AI model rebuilds fine detail and removes noise and JPEG blocks."},
        {"q": "Will it work on many photos at once?", "a": "Yes. Each photo is analysed and corrected on its own, with your chosen look and slider changes on top, and they download together in a ZIP."},
        {"q": "Are my photos uploaded?", "a": "No. Everything, including the AI step, runs inside your browser, so your photos never leave your device."},
    ],
}

PAGES = [
    ("image-optimizer", {"format": "webp", "maxSide": 1920, "quality": 82}, "Image Optimizer", "Image Optimizer Online Free: Optimize Images for Web (WebP, Smaller, Sharper)",
     "Make images smaller and better for websites: enhanced, resized and saved as WebP. Nothing uploaded.",
     "Free image optimizer for websites and shops: auto-enhance, resize to 1920 px and save as WebP or AVIF, often 70 to 90% smaller. Batch, private, no upload.",
     ("Optimise images for a website, an online shop or social media in one go. Each photo is enhanced (exposure, colour and "
      "sharpness corrected), resized to 1920 pixels and saved as WebP, which is usually 70 to 90% smaller than the original JPG or PNG "
      "while looking the same. Change the size, quality or format, or set a target file size, before you download. Smaller images "
      "load faster, which helps both visitors and search rankings. Metadata such as camera details and location are removed. "
      "Everything runs in your browser, so the images are never uploaded."),
     [("Why WebP?", "Every current browser shows WebP, and it is usually 25 to 35% smaller than a JPG of the same quality. AVIF is smaller still, if your site supports it."),
      ("What size should web images be?", "1920 pixels on the long side covers full-width images on most screens; 1280 pixels is enough for images inside an article; product photos often use 1080 to 2000 pixels."),
      ("Are the photos uploaded?", "No. They are optimised inside your browser.")]),
    ("unblur-image", {"ai": "restore"}, "Unblur Image", "Unblur Image Online Free: Sharpen & Fix Blurry Photos with AI",
     "Sharpen soft photos and restore detail with AI, then fine-tune. Nothing uploaded.",
     "Free unblur image tool: AI detail restore plus sharpening and clarity fix soft, blurry and low-quality photos. Runs in your browser, nothing uploaded.",
     ("Make a soft or slightly blurry photo crisp again. AI detail restore is already switched on: an AI model (Real-ESRGAN) rebuilds fine "
      "detail and removes noise and JPEG blocks, then sharpening and clarity bring out edges. It works best on photos that are a bit soft, "
      "low resolution or compressed; a photo that is very out of focus or shaken cannot be made fully sharp by any tool. Compare with the "
      "drag line and adjust the sliders before you save. Everything runs in your browser, so the photo is never uploaded."),
     [("Can any blurry photo be fixed?", "Slight softness, low resolution and compression blur improve a lot. Strong motion blur or a badly missed focus can only be improved a little."),
      ("Why is the first run slow?", "The AI model (5 MB) is downloaded once and runs on your device; a large photo can take up to a minute on a phone."),
      ("Is my photo uploaded?", "No. The AI runs inside your browser.")]),
    ("old-photo-restoration", {"look": "oldphoto", "ai": "restore"}, "Old Photo Restoration", "Old Photo Restoration Free: Restore Faded Old Photos Online",
     "Bring back faded colours, contrast and detail in old photos. Nothing uploaded.",
     "Free old photo restoration: repair faded and yellowed colours, lift contrast, reduce grain and restore detail with AI. Runs in your browser, nothing uploaded.",
     ("Restore scanned or photographed old prints. The Old photo look repairs faded and yellowed colours by stretching each colour channel "
      "back to its full range, lifts contrast, reduces grain and noise, and AI detail restore rebuilds fine detail. Scratches and tears "
      "are not painted over, but the photo becomes much clearer and more natural. Fine-tune with the sliders and compare before you save. "
      "Everything runs in your browser, so family photos never leave your device."),
     [("How do I scan an old photo for the best result?", "Scan at 600 DPI if you can, or photograph it flat in daylight without flash and without reflections."),
      ("Can it remove scratches?", "Not yet: it fixes colour, contrast, noise and detail. Scratches and tears stay."),
      ("Are my photos uploaded?", "No. They are restored inside your browser.")]),
    ("low-light-photo-enhancer", {"look": "lowlight"}, "Low Light Photo Enhancer", "Low Light Photo Enhancer Free: Brighten Dark Photos Online",
     "Brighten dark photos, open up shadows and clean the noise. Nothing uploaded.",
     "Free low light photo enhancer: brighten dark and night photos, lift shadows, keep highlights and remove noise. Batch, private, nothing uploaded.",
     ("Fix photos taken indoors, at night or against the light. The Low light look raises the exposure, opens up the shadows while "
      "holding back bright windows and lamps, and removes the coloured noise that dark photos are full of. Each photo is measured on its "
      "own, so a whole batch of party or wedding photos comes out evenly. Fine-tune and compare before you save. Everything runs in your "
      "browser, so the photos are never uploaded."),
     [("Why does a brightened photo look grainy?", "Dark photos carry noise that brightening reveals. The noise reduction slider removes most of it; raise it for very dark photos."),
      ("Can I fix many dark photos at once?", "Yes. Each one is analysed on its own and they download together."),
      ("Are my photos uploaded?", "No. Everything runs in your browser.")]),
    ("document-scan-enhancer", {"look": "document", "format": "jpg"}, "Document Scan Enhancer", "Document Scan Enhancer Free: Make Scanned Documents Clear & White",
     "Turn phone photos of documents into clean, white, readable scans. Nothing uploaded.",
     "Free document scan enhancer: whiten the paper, remove shadows, darken the text and sharpen phone photos of documents, certificates and forms. Nothing uploaded.",
     ("Turn a phone photo of a document, certificate, ID or handwritten page into a clean scan. The Document look evens out uneven light "
      "and shadows, turns grey or yellow paper white, darkens the text and sharpens it, which makes uploads for exam and government forms "
      "easier to read. Set a target file size (for example 200 KB) before saving if a form asks for one. Everything runs in your browser, "
      "so your documents are never uploaded."),
     [("Will it work on a photo with a shadow across the page?", "Yes. The page's own lighting is measured and evened out, so a shadow or a dark corner turns white with the rest of the paper."),
      ("Can I make it smaller for an online form?", "Yes. Type the size the form allows, for example 100 or 200 KB, in the target file size box."),
      ("Are my documents uploaded?", "No. They are processed inside your browser.")]),
    ("product-photo-enhancer", {"look": "product", "format": "webp", "maxSide": 2000}, "Product Photo Enhancer", "Product Photo Enhancer Free: Bright, Clean Photos for Online Stores",
     "Make product photos bright, neutral and crisp for Amazon, Flipkart, Shopify and Instagram. Nothing uploaded.",
     "Free product photo enhancer: correct colour, brighten whites, sharpen detail and save store-ready images for Amazon, Flipkart, Meesho, Shopify and Instagram.",
     ("Get store-ready product photos without a studio. The Product look fully neutralises colour casts (so a white shirt is white), "
      "brightens the background and whites, adds clarity and sharpens detail. Photos are saved as WebP at 2000 pixels by default, a good "
      "size for zoom on most marketplaces; switch to JPG if a store needs it. Enhance a whole catalogue at once. Everything runs in your "
      "browser, so your photos are never uploaded."),
     [("What size do marketplaces want?", "Most ask for at least 1000 pixels on the long side so buyers can zoom; 2000 pixels is a safe choice. Check your marketplace's rules."),
      ("Can it make the background pure white?", "It brightens the background a lot. For a perfectly white or removed background, use the Background Remover after enhancing."),
      ("Are my photos uploaded?", "No. They are processed inside your browser.")]),
]


def page(slug, preset, name, title, desc, meta, about, faq):
    return {"slug": slug, "base": "image-enhancer", "cat": "image", "kind": "client", "preset": preset, "name": name, "tab": name,
            "title": title, "desc": desc, "metaDesc": meta, "about": about,
            "steps": ["Add your photos.", "The right settings are already chosen; adjust the sliders if you like.", "Compare with the drag line and download."],
            "faq": [{"q": q, "a": a} for q, a in faq]}


TL = {
 "hi": t("इमेज एन्हांसर", "अंधेरी, फीकी, धुंधली या नॉइज़ वाली फ़ोटो एक क्लिक में ठीक करें, फिर प्रो की तरह फ़ाइन-ट्यून करें। ब्राउज़र में चलता है।",
   "इमेज एन्हांसर फ्री: फ़ोटो क्वालिटी ऑनलाइन बेहतर करें | Toolz Baba",
   "अंधेरी, फीकी, धुंधली या नॉइज़ वाली फ़ोटो एक क्लिक में ठीक करें। प्रो स्लाइडर, AI डिटेल रिस्टोर, पोर्ट्रेट, पुरानी फ़ोटो और डॉक्यूमेंट के लुक। फ्री, कुछ अपलोड नहीं।",
   "हर फ़ोटो को उसका सबसे अच्छा रूप दें। ऑटो एन्हांस हर तस्वीर को पढ़कर वही ठीक करता है जिसकी ज़रूरत है: एक्सपोज़र, कंट्रास्ट, व्हाइट बैलेंस, शैडो और हाइलाइट, फीके रंग, नॉइज़ और धुंधलापन। हर बदलाव स्लाइडर पर दिखता है, ताकि आप प्रोफ़ेशनल एडिटर की तरह उसे बदल सकें। पोर्ट्रेट, लैंडस्केप, कम रोशनी, प्रोडक्ट, खाना, पुरानी फ़ोटो, डॉक्यूमेंट और ब्लैक एंड व्हाइट के लुक एक टैप में नतीजा बदलते हैं। AI डिटेल रिस्टोर (Real-ESRGAN) धुंधलापन, नॉइज़ और JPEG ब्लॉक हटाता है। JPG, WebP, AVIF या PNG में सेव करें, वेब के लिए छोटा करें और फ़ाइल साइज़ तय करें, कई फ़ोटो एक साथ। सब कुछ आपके ब्राउज़र में होता है, फ़ोटो अपलोड नहीं होतीं।",
   ["अपनी फ़ोटो जोड़ें (कई एक साथ भी)।", "एक लुक चुनें या ऑटो रहने दें: हर फ़ोटो अपने हिसाब से ठीक होती है।", "चाहें तो स्लाइडर बदलें, लाइन खींचकर तुलना करें, फिर JPG, WebP, AVIF या PNG में सेव करें।"],
   [("ऑटो एन्हांस कैसे तय करता है कि क्या बदलना है?", "यह फ़ोटो को मापता है: कितनी रोशनी है, टोन कितने फैले हैं, रंगों में कोई झलक है या नहीं, कितना नॉइज़ और कितनी बारीक डिटेल है। उसी से हर स्लाइडर सेट होता है, और आप हर मान देख और बदल सकते हैं।"),
    ("क्या यह धुंधली फ़ोटो ठीक कर सकता है?", "शार्पन और क्लैरिटी हल्की धुंधली फ़ोटो को साफ़ करते हैं। बहुत धुंधली, छोटी या पुरानी फ़ोटो के लिए AI डिटेल रिस्टोर चालू करें।"),
    ("क्या मेरी फ़ोटो अपलोड होती हैं?", "नहीं। AI समेत सब कुछ आपके ब्राउज़र में चलता है।")], "सभी लुक"),
 "bn": t("ইমেজ এনহ্যান্সার", "অন্ধকার, ফ্যাকাশে, ঝাপসা বা নয়েজি ছবি এক ক্লিকে ঠিক করুন, তারপর প্রো-র মতো ফাইন-টিউন করুন। ব্রাউজারেই চলে।",
   "ইমেজ এনহ্যান্সার ফ্রি: অনলাইনে ছবির কোয়ালিটি বাড়ান | Toolz Baba",
   "অন্ধকার, ফ্যাকাশে, ঝাপসা বা নয়েজি ছবি এক ক্লিকে ঠিক করুন। প্রো স্লাইডার, AI ডিটেল রিস্টোর, পোর্ট্রেট, পুরোনো ছবি ও ডকুমেন্টের লুক। ফ্রি, কিছুই আপলোড হয় না।",
   "প্রতিটি ছবিকে তার সেরা রূপ দিন। অটো এনহ্যান্স প্রতিটি ছবি পড়ে যা দরকার তা ঠিক করে: এক্সপোজার, কনট্রাস্ট, হোয়াইট ব্যালান্স, শ্যাডো ও হাইলাইট, ফ্যাকাশে রং, নয়েজ ও ঝাপসাভাব। প্রতিটি পরিবর্তন স্লাইডারে দেখা যায়, তাই প্রফেশনাল এডিটরের মতো বদলাতে পারেন। পোর্ট্রেট, ল্যান্ডস্কেপ, কম আলো, প্রোডাক্ট, খাবার, পুরোনো ছবি, ডকুমেন্ট ও সাদা-কালো লুক এক ট্যাপে ফল বদলায়। AI ডিটেল রিস্টোর (Real-ESRGAN) ঝাপসাভাব, নয়েজ ও JPEG ব্লক সরায়। JPG, WebP, AVIF বা PNG-এ সেভ করুন, ওয়েবের জন্য ছোট করুন ও ফাইল সাইজ ঠিক করুন, অনেক ছবি একসাথে। সবকিছু আপনার ব্রাউজারে হয়, ছবি আপলোড হয় না।",
   ["আপনার ছবি যোগ করুন (একসাথে অনেকগুলোও)।", "একটি লুক বেছে নিন বা অটো রাখুন: প্রতিটি ছবি নিজের মতো ঠিক হয়।", "চাইলে স্লাইডার বদলান, লাইন টেনে তুলনা করুন, তারপর JPG, WebP, AVIF বা PNG-এ সেভ করুন।"],
   [("অটো এনহ্যান্স কীভাবে ঠিক করে কী বদলাবে?", "এটি ছবি মাপে: কতটা আলো, টোন কতটা ছড়ানো, রঙে কোনো আভা আছে কি না, কতটা নয়েজ ও কতটা সূক্ষ্ম ডিটেল। তা থেকে প্রতিটি স্লাইডার সেট হয়, আর আপনি প্রতিটি মান দেখতে ও বদলাতে পারেন।"),
    ("এটি কি ঝাপসা ছবি ঠিক করতে পারে?", "শার্পেন ও ক্ল্যারিটি হালকা ঝাপসা ছবি পরিষ্কার করে। খুব ঝাপসা, ছোট বা পুরোনো ছবির জন্য AI ডিটেল রিস্টোর চালু করুন।"),
    ("আমার ছবি কি আপলোড হয়?", "না। AI সহ সবকিছু আপনার ব্রাউজারে চলে।")], "সব লুক"),
 "es": t("Mejorador de imágenes", "Arregla fotos oscuras, apagadas, borrosas o con ruido en un clic y ajústalas como un profesional. Funciona en tu navegador.",
   "Mejorador de imágenes gratis: mejora la calidad de tus fotos online | Toolz Baba",
   "Arregla fotos oscuras, apagadas, borrosas o con ruido en un clic. Controles profesionales, restauración de detalle con IA y estilos para retratos, fotos antiguas y documentos. Gratis y privado.",
   "Saca lo mejor de cada foto. Mejora automática analiza cada imagen y corrige lo que necesita: exposición, contraste, balance de blancos, sombras y luces, colores apagados, ruido y falta de nitidez. Cada corrección aparece en un control deslizante, así que ves exactamente qué cambió y puedes afinarlo como en un editor profesional. Los estilos para retratos, paisajes, poca luz, productos, comida, fotos antiguas, documentos y blanco y negro cambian el resultado con un toque. Un paso opcional con IA (Real-ESRGAN) elimina desenfoque, ruido y bloques JPEG. Guarda en JPG, WebP, AVIF o PNG, redimensiona para la web y ajusta el tamaño del archivo, con muchas fotos a la vez. Todo ocurre en tu navegador: tus fotos nunca se suben.",
   ["Añade tus fotos (varias a la vez sin problema).", "Elige un estilo o deja Auto: cada foto se corrige por separado.", "Ajusta los controles si quieres, compara arrastrando la línea y guarda en JPG, WebP, AVIF o PNG."],
   [("¿Cómo decide la mejora automática qué cambiar?", "Mide la foto: cuánta luz tiene, cuánto abarcan sus tonos, si los colores neutros tienen un tinte, cuánto ruido y cuánto detalle fino hay. Con eso ajusta cada control, y puedes ver y cambiar cada valor."),
    ("¿Puede arreglar una foto borrosa?", "Nitidez y claridad hacen más definidas las fotos suaves. Para fotos muy suaves, pequeñas o antiguas, activa la restauración de detalle con IA."),
    ("¿Se suben mis fotos?", "No. Todo, incluida la IA, funciona en tu navegador.")], "Todos los estilos"),
 "pt": t("Melhorador de imagens", "Corrija fotos escuras, apagadas, borradas ou com ruído em um clique e ajuste como um profissional. Funciona no seu navegador.",
   "Melhorador de imagens grátis: melhore a qualidade das fotos online | Toolz Baba",
   "Corrija fotos escuras, apagadas, borradas ou com ruído em um clique. Controles profissionais, restauração de detalhes com IA e estilos para retratos, fotos antigas e documentos. Grátis e privado.",
   "Deixe cada foto no seu melhor. O aprimoramento automático analisa cada imagem e corrige o que ela precisa: exposição, contraste, balanço de branco, sombras e realces, cores apagadas, ruído e falta de nitidez. Cada correção aparece num controle deslizante, então você vê exatamente o que mudou e ajusta como num editor profissional. Estilos para retratos, paisagens, pouca luz, produtos, comida, fotos antigas, documentos e preto e branco mudam o resultado com um toque. Uma etapa opcional com IA (Real-ESRGAN) remove desfoque, ruído e blocos de JPEG. Salve em JPG, WebP, AVIF ou PNG, redimensione para a web e defina o tamanho do arquivo, com várias fotos de uma vez. Tudo acontece no seu navegador: suas fotos nunca são enviadas.",
   ["Adicione suas fotos (várias de uma vez sem problema).", "Escolha um estilo ou deixe no Auto: cada foto é corrigida por si.", "Ajuste os controles se quiser, compare arrastando a linha e salve em JPG, WebP, AVIF ou PNG."],
   [("Como o aprimoramento automático decide o que mudar?", "Ele mede a foto: quanta luz tem, quão amplos são os tons, se as cores neutras têm um tom, quanto ruído e quanto detalhe fino. Com isso ajusta cada controle, e você pode ver e mudar cada valor."),
    ("Ele consegue corrigir uma foto borrada?", "Nitidez e clareza deixam fotos suaves mais definidas. Para fotos muito suaves, pequenas ou antigas, ative a restauração de detalhes com IA."),
    ("Minhas fotos são enviadas?", "Não. Tudo, inclusive a IA, roda no seu navegador.")], "Todos os estilos"),
 "id": t("Peningkat Kualitas Gambar", "Perbaiki foto gelap, kusam, buram, atau berisik dalam satu klik, lalu atur seperti profesional. Berjalan di browser Anda.",
   "Peningkat Kualitas Gambar Gratis: Tingkatkan Kualitas Foto Online | Toolz Baba",
   "Perbaiki foto gelap, kusam, buram, atau berisik dalam satu klik. Slider profesional, pemulihan detail AI, gaya untuk potret, foto lama, dan dokumen. Gratis, tidak ada yang diunggah.",
   "Buat setiap foto tampil terbaik. Peningkatan otomatis membaca setiap gambar dan memperbaiki yang dibutuhkan: eksposur, kontras, white balance, bayangan dan sorotan, warna kusam, noise, dan kurang tajam. Setiap perbaikan tampil di slider, jadi Anda melihat persis apa yang berubah dan bisa mengaturnya seperti di editor profesional. Gaya untuk potret, pemandangan, cahaya rendah, produk, makanan, foto lama, dokumen, dan hitam putih mengubah hasil dalam satu ketukan. Langkah AI opsional (Real-ESRGAN) menghapus blur, noise, dan blok JPEG. Simpan sebagai JPG, WebP, AVIF, atau PNG, ubah ukuran untuk web dan tentukan ukuran file, untuk banyak foto sekaligus. Semuanya berjalan di browser Anda, jadi foto tidak pernah diunggah.",
   ["Tambahkan foto Anda (beberapa sekaligus juga bisa).", "Pilih gaya atau biarkan Otomatis: setiap foto diperbaiki sendiri-sendiri.", "Atur slider jika mau, bandingkan dengan menggeser garis, lalu simpan sebagai JPG, WebP, AVIF, atau PNG."],
   [("Bagaimana peningkatan otomatis menentukan apa yang diubah?", "Alat ini mengukur foto: seberapa terang, seberapa lebar rentang nadanya, apakah warna netral punya rona, seberapa banyak noise dan detail halus. Dari situ setiap slider diatur, dan Anda bisa melihat serta mengubah setiap nilai."),
    ("Bisakah memperbaiki foto buram?", "Penajaman dan kejernihan membuat foto yang lembut lebih tegas. Untuk foto yang sangat lembut, kecil, atau lama, nyalakan pemulihan detail AI."),
    ("Apakah foto saya diunggah?", "Tidak. Semuanya, termasuk AI, berjalan di browser Anda.")], "Semua gaya"),
 "fr": t("Améliorateur d'images", "Corrigez en un clic les photos sombres, ternes, floues ou bruitées, puis peaufinez comme un pro. Fonctionne dans votre navigateur.",
   "Améliorateur d'images gratuit : améliorer la qualité des photos en ligne | Toolz Baba",
   "Corrigez en un clic les photos sombres, ternes, floues ou bruitées. Réglages pro, restauration des détails par IA, styles pour portraits, vieilles photos et documents. Gratuit et privé.",
   "Tirez le meilleur de chaque photo. L'amélioration automatique analyse chaque image et corrige ce qu'il faut : exposition, contraste, balance des blancs, ombres et hautes lumières, couleurs ternes, bruit et manque de netteté. Chaque correction apparaît sur un curseur : vous voyez exactement ce qui a changé et pouvez l'ajuster comme dans un éditeur professionnel. Les styles portrait, paysage, faible lumière, produit, cuisine, vieille photo, document et noir et blanc changent le résultat d'un geste. Une étape IA facultative (Real-ESRGAN) supprime le flou, le bruit et les blocs JPEG. Enregistrez en JPG, WebP, AVIF ou PNG, redimensionnez pour le web et visez une taille de fichier, pour de nombreuses photos à la fois. Tout se passe dans votre navigateur : vos photos ne sont jamais envoyées.",
   ["Ajoutez vos photos (plusieurs à la fois, sans problème).", "Choisissez un style ou gardez Auto : chaque photo est corrigée séparément.", "Ajustez les curseurs si vous le souhaitez, comparez en faisant glisser la ligne, puis enregistrez en JPG, WebP, AVIF ou PNG."],
   [("Comment l'amélioration automatique décide-t-elle quoi changer ?", "Elle mesure la photo : sa luminosité, l'étendue de ses tons, une éventuelle dominante de couleur, la quantité de bruit et de détail fin. Elle règle ainsi chaque curseur, et vous pouvez voir et modifier chaque valeur."),
    ("Peut-elle corriger une photo floue ?", "La netteté et la clarté rendent les photos douces plus précises. Pour les photos très douces, petites ou anciennes, activez la restauration des détails par IA."),
    ("Mes photos sont-elles envoyées ?", "Non. Tout, y compris l'IA, fonctionne dans votre navigateur.")], "Tous les styles"),
 "de": t("Bildverbesserer", "Dunkle, flaue, unscharfe oder verrauschte Fotos mit einem Klick verbessern und wie ein Profi feinjustieren. Läuft in Ihrem Browser.",
   "Bildverbesserer kostenlos: Fotoqualität online verbessern | Toolz Baba",
   "Dunkle, flaue, unscharfe oder verrauschte Fotos mit einem Klick verbessern. Profi-Regler, KI-Detailwiederherstellung, Looks für Porträts, alte Fotos und Dokumente. Kostenlos, nichts wird hochgeladen.",
   "Holen Sie das Beste aus jedem Foto. Die automatische Verbesserung analysiert jedes Bild und korrigiert, was es braucht: Belichtung, Kontrast, Weißabgleich, Tiefen und Lichter, flaue Farben, Rauschen und Unschärfe. Jede Korrektur steht auf einem Regler, sodass Sie genau sehen, was sich geändert hat, und wie in einem Profi-Editor nachjustieren können. Looks für Porträt, Landschaft, wenig Licht, Produkt, Essen, alte Fotos, Dokumente und Schwarzweiß verändern das Ergebnis mit einem Tipp. Ein optionaler KI-Schritt (Real-ESRGAN) entfernt Unschärfe, Rauschen und JPEG-Blöcke. Speichern Sie als JPG, WebP, AVIF oder PNG, verkleinern Sie für das Web und treffen Sie eine Zieldateigröße, für viele Fotos auf einmal. Alles läuft in Ihrem Browser, Ihre Fotos werden nie hochgeladen.",
   ["Fügen Sie Ihre Fotos hinzu (gern mehrere auf einmal).", "Wählen Sie einen Look oder lassen Sie Auto: Jedes Foto wird einzeln korrigiert.", "Regler bei Bedarf anpassen, mit der Linie vergleichen und als JPG, WebP, AVIF oder PNG speichern."],
   [("Wie entscheidet die automatische Verbesserung, was sie ändert?", "Sie misst das Foto: Helligkeit, Tonwertumfang, Farbstiche in neutralen Farben, Rauschen und feine Details. Daraus stellt sie jeden Regler ein, und Sie können jeden Wert sehen und ändern."),
    ("Kann es ein unscharfes Foto retten?", "Schärfen und Klarheit machen weiche Fotos knackiger. Für sehr weiche, kleine oder alte Fotos schalten Sie die KI-Detailwiederherstellung ein."),
    ("Werden meine Fotos hochgeladen?", "Nein. Alles, auch die KI, läuft in Ihrem Browser.")], "Alle Looks"),
 "ru": t("Улучшение фото", "Исправьте тёмные, блёклые, размытые или шумные фото в один клик и доведите их как профи. Работает в браузере.",
   "Улучшение фото бесплатно: повысить качество фотографии онлайн | Toolz Baba",
   "Исправьте тёмные, блёклые, размытые или шумные фото в один клик. Профессиональные ползунки, восстановление деталей ИИ, стили для портретов, старых фото и документов. Бесплатно и приватно.",
   "Сделайте каждое фото лучше. Автоулучшение анализирует снимок и исправляет то, что нужно: экспозицию, контраст, баланс белого, тени и света, блёклые цвета, шум и нерезкость. Каждая правка видна на ползунке, так что вы точно знаете, что изменилось, и можете подстроить её как в профессиональном редакторе. Стили для портретов, пейзажей, слабого света, товаров, еды, старых фото, документов и чёрно-белого меняют результат одним касанием. Необязательный шаг с ИИ (Real-ESRGAN) убирает размытие, шум и блоки JPEG. Сохраняйте в JPG, WebP, AVIF или PNG, уменьшайте для сайта и задавайте размер файла, сразу для многих фото. Всё работает в вашем браузере, фото никуда не загружаются.",
   ["Добавьте фото (можно сразу несколько).", "Выберите стиль или оставьте Авто: каждое фото исправляется отдельно.", "При желании подвиньте ползунки, сравните, перетаскивая линию, и сохраните в JPG, WebP, AVIF или PNG."],
   [("Как автоулучшение решает, что менять?", "Оно измеряет фото: яркость, диапазон тонов, оттенок нейтральных цветов, количество шума и мелких деталей. По этим данным выставляется каждый ползунок, и любое значение можно увидеть и изменить."),
    ("Можно ли исправить размытое фото?", "Резкость и чёткость делают мягкие фото чётче. Для очень мягких, маленьких или старых фото включите восстановление деталей ИИ."),
    ("Мои фото загружаются на сервер?", "Нет. Всё, включая ИИ, работает в вашем браузере.")], "Все стили"),
 "ja": t("画像補正ツール", "暗い・くすんだ・ぼやけた・ノイズの多い写真をワンクリックで補正し、プロのように微調整。ブラウザで動作します。",
   "画像補正ツール（無料）：写真の画質をオンラインで向上 | Toolz Baba",
   "暗い・くすんだ・ぼやけた・ノイズの多い写真をワンクリックで補正。プロ向けスライダー、AI ディテール復元、ポートレート・古い写真・書類向けのスタイル。無料、アップロードなし。",
   "すべての写真をベストな状態に。自動補正が写真ごとに分析し、必要な点を直します。露出、コントラスト、ホワイトバランス、シャドウとハイライト、くすんだ色、ノイズ、甘いピントです。補正内容はすべてスライダーに表示されるので、何が変わったかが分かり、プロ向けエディタのように微調整できます。ポートレート、風景、暗所、商品、料理、古い写真、書類、モノクロのスタイルでワンタップで仕上がりを変えられます。オプションの AI 処理（Real-ESRGAN）がぼやけ、ノイズ、JPEG のブロックを取り除きます。JPG、WebP、AVIF、PNG で保存し、ウェブ用に縮小し、ファイルサイズも指定でき、複数の写真をまとめて処理できます。すべてブラウザ内で動くため、写真がアップロードされることはありません。",
   ["写真を追加します（複数まとめても大丈夫です）。", "スタイルを選ぶか自動のままにします。写真ごとに個別に補正されます。", "必要ならスライダーを調整し、線をドラッグして比較し、JPG・WebP・AVIF・PNG で保存します。"],
   [("自動補正は何を変えるかどう決めていますか？", "写真の明るさ、トーンの幅、ニュートラルな色の色かぶり、ノイズ量、細部の量を測り、それに合わせて各スライダーを設定します。すべての値を確認・変更できます。"),
    ("ぼやけた写真は直せますか？", "シャープとクラリティで甘い写真がくっきりします。とてもぼやけた、小さい、または古い写真は AI ディテール復元をオンにしてください。"),
    ("写真はアップロードされますか？", "いいえ。AI も含めすべてブラウザ内で動作します。")], "すべてのスタイル"),
 "tr": t("Görüntü İyileştirici", "Karanlık, soluk, bulanık veya gürültülü fotoğrafları tek tıkla düzeltin, sonra bir profesyonel gibi ince ayar yapın. Tarayıcınızda çalışır.",
   "Görüntü İyileştirici Ücretsiz: Fotoğraf Kalitesini Online Artırın | Toolz Baba",
   "Karanlık, soluk, bulanık veya gürültülü fotoğrafları tek tıkla düzeltin. Profesyonel kaydırıcılar, AI ayrıntı onarımı, portre, eski fotoğraf ve belge stilleri. Ücretsiz, hiçbir şey yüklenmez.",
   "Her fotoğrafı en iyi hâline getirin. Otomatik iyileştirme her görüntüyü okur ve gerekeni düzeltir: pozlama, kontrast, beyaz dengesi, gölgeler ve parlak alanlar, soluk renkler, gürültü ve netlik eksikliği. Her düzeltme bir kaydırıcıda görünür; neyin değiştiğini tam olarak görür ve profesyonel bir editördeki gibi ayarlarsınız. Portre, manzara, düşük ışık, ürün, yemek, eski fotoğraf, belge ve siyah beyaz stilleri sonucu tek dokunuşla değiştirir. İsteğe bağlı AI adımı (Real-ESRGAN) bulanıklığı, gürültüyü ve JPEG bloklarını giderir. JPG, WebP, AVIF veya PNG olarak kaydedin, web için küçültün ve hedef dosya boyutu belirleyin, birçok fotoğrafı bir kerede. Her şey tarayıcınızda olur, fotoğraflarınız asla yüklenmez.",
   ["Fotoğraflarınızı ekleyin (birden çok da olur).", "Bir stil seçin veya Otomatik bırakın: her fotoğraf kendi başına düzeltilir.", "İsterseniz kaydırıcıları ayarlayın, çizgiyi sürükleyerek karşılaştırın, ardından JPG, WebP, AVIF veya PNG olarak kaydedin."],
   [("Otomatik iyileştirme neyi değiştireceğine nasıl karar verir?", "Fotoğrafı ölçer: ne kadar aydınlık olduğunu, tonların ne kadar geniş olduğunu, nötr renklerde renk kayması olup olmadığını, ne kadar gürültü ve ince ayrıntı olduğunu. Buna göre her kaydırıcıyı ayarlar; her değeri görüp değiştirebilirsiniz."),
    ("Bulanık bir fotoğrafı düzeltebilir mi?", "Keskinleştirme ve netlik, yumuşak fotoğrafları daha belirgin yapar. Çok yumuşak, küçük veya eski fotoğraflar için AI ayrıntı onarımını açın."),
    ("Fotoğraflarım yükleniyor mu?", "Hayır. AI dahil her şey tarayıcınızda çalışır.")], "Tüm stiller"),
 "vi": t("Làm nét và cải thiện ảnh", "Sửa ảnh tối, nhạt, mờ hoặc nhiễu chỉ với một cú nhấp, rồi tinh chỉnh như dân chuyên. Chạy trong trình duyệt.",
   "Cải thiện chất lượng ảnh miễn phí: làm đẹp ảnh trực tuyến | Toolz Baba",
   "Sửa ảnh tối, nhạt, mờ hoặc nhiễu chỉ với một cú nhấp. Thanh trượt chuyên nghiệp, khôi phục chi tiết bằng AI, phong cách cho chân dung, ảnh cũ và tài liệu. Miễn phí, không tải lên.",
   "Làm cho mỗi bức ảnh đẹp nhất. Tự động cải thiện đọc từng ảnh và sửa đúng chỗ cần: phơi sáng, tương phản, cân bằng trắng, vùng tối và vùng sáng, màu nhạt, nhiễu và độ mềm. Mỗi chỉnh sửa hiện trên một thanh trượt, nên bạn thấy chính xác điều gì thay đổi và có thể tinh chỉnh như trong trình chỉnh sửa chuyên nghiệp. Các phong cách chân dung, phong cảnh, thiếu sáng, sản phẩm, đồ ăn, ảnh cũ, tài liệu và đen trắng thay đổi kết quả chỉ với một chạm. Bước AI tùy chọn (Real-ESRGAN) loại bỏ mờ, nhiễu và khối JPEG. Lưu dạng JPG, WebP, AVIF hoặc PNG, thu nhỏ cho web và đặt dung lượng tệp, cho nhiều ảnh cùng lúc. Mọi thứ chạy trong trình duyệt nên ảnh không bao giờ bị tải lên.",
   ["Thêm ảnh của bạn (nhiều ảnh cùng lúc cũng được).", "Chọn một phong cách hoặc để Tự động: mỗi ảnh được sửa riêng.", "Tinh chỉnh thanh trượt nếu muốn, kéo đường so sánh, rồi lưu dạng JPG, WebP, AVIF hoặc PNG."],
   [("Tự động cải thiện quyết định thay đổi gì như thế nào?", "Nó đo bức ảnh: độ sáng, độ rộng dải tông, màu trung tính có bị ám không, lượng nhiễu và chi tiết nhỏ. Từ đó đặt từng thanh trượt, và bạn có thể xem và đổi mọi giá trị."),
    ("Có sửa được ảnh mờ không?", "Làm nét và độ rõ giúp ảnh hơi mềm sắc hơn. Với ảnh rất mờ, nhỏ hoặc cũ, hãy bật khôi phục chi tiết bằng AI."),
    ("Ảnh của tôi có bị tải lên không?", "Không. Mọi thứ, kể cả AI, chạy trong trình duyệt của bạn.")], "Tất cả phong cách"),
 "it": t("Migliora immagini", "Correggi in un clic foto scure, spente, sfocate o rumorose, poi rifiniscile come un professionista. Funziona nel browser.",
   "Migliora immagini gratis: migliora la qualità delle foto online | Toolz Baba",
   "Correggi in un clic foto scure, spente, sfocate o rumorose. Cursori professionali, ripristino dei dettagli con IA, stili per ritratti, foto vecchie e documenti. Gratis e privato.",
   "Tira fuori il meglio da ogni foto. Il miglioramento automatico analizza ogni immagine e corregge ciò che serve: esposizione, contrasto, bilanciamento del bianco, ombre e luci, colori spenti, rumore e scarsa nitidezza. Ogni correzione compare su un cursore, così vedi esattamente cosa è cambiato e puoi rifinirlo come in un editor professionale. Gli stili per ritratti, paesaggi, poca luce, prodotti, cibo, foto vecchie, documenti e bianco e nero cambiano il risultato con un tocco. Un passaggio facoltativo con IA (Real-ESRGAN) elimina sfocatura, rumore e blocchi JPEG. Salva in JPG, WebP, AVIF o PNG, ridimensiona per il web e imposta il peso del file, per molte foto insieme. Tutto avviene nel browser: le foto non vengono mai caricate.",
   ["Aggiungi le foto (anche più di una alla volta).", "Scegli uno stile o lascia Auto: ogni foto viene corretta per conto suo.", "Regola i cursori se vuoi, confronta trascinando la linea e salva in JPG, WebP, AVIF o PNG."],
   [("Come decide il miglioramento automatico cosa cambiare?", "Misura la foto: luminosità, ampiezza dei toni, eventuali dominanti nei colori neutri, quantità di rumore e di dettaglio fine. Da lì imposta ogni cursore, e puoi vedere e cambiare ogni valore."),
    ("Può sistemare una foto sfocata?", "Nitidezza e chiarezza rendono più definite le foto morbide. Per foto molto morbide, piccole o vecchie attiva il ripristino dei dettagli con IA."),
    ("Le mie foto vengono caricate?", "No. Tutto, IA compresa, funziona nel browser.")], "Tutti gli stili"),
 "ar": t("محسّن الصور", "أصلح الصور المظلمة أو الباهتة أو المشوشة أو المليئة بالتشويش بنقرة واحدة، ثم اضبطها كالمحترفين. يعمل في متصفحك.",
   "محسّن الصور مجانًا: حسّن جودة الصور أونلاين | Toolz Baba",
   "أصلح الصور المظلمة أو الباهتة أو المشوشة أو المليئة بالتشويش بنقرة. منزلقات احترافية واستعادة التفاصيل بالذكاء الاصطناعي وأنماط للصور الشخصية والقديمة والمستندات. مجاني وخاص.",
   "أخرج أفضل ما في كل صورة. يقرأ التحسين التلقائي كل صورة ويصلح ما تحتاجه: التعريض والتباين وتوازن الأبيض والظلال والإضاءات والألوان الباهتة والتشويش وضعف الحدة. يظهر كل تصحيح على منزلق، فترى بالضبط ما تغيّر وتضبطه كما في محرر احترافي. أنماط الصور الشخصية والمناظر والإضاءة المنخفضة والمنتجات والطعام والصور القديمة والمستندات والأبيض والأسود تغيّر النتيجة بلمسة. وخطوة ذكاء اصطناعي اختيارية (Real-ESRGAN) تزيل الضبابية والتشويش وكتل JPEG. احفظ بصيغة JPG أو WebP أو AVIF أو PNG، وصغّر الحجم للويب وحدد حجم الملف، لصور كثيرة معًا. كل شيء يجري في متصفحك، فلا تُرفع صورك أبدًا.",
   ["أضف صورك (عدة صور معًا لا بأس).", "اختر نمطًا أو اترك التلقائي: تُصحَّح كل صورة على حدة.", "اضبط المنزلقات إن شئت، وقارن بسحب الخط، ثم احفظ بصيغة JPG أو WebP أو AVIF أو PNG."],
   [("كيف يقرر التحسين التلقائي ما يغيّره؟", "يقيس الصورة: سطوعها ومدى نطاق درجاتها ووجود صبغة في الألوان المحايدة ومقدار التشويش والتفاصيل الدقيقة. ومن ذلك يضبط كل منزلق، ويمكنك رؤية كل قيمة وتغييرها."),
    ("هل يمكنه إصلاح صورة ضبابية؟", "الحدة والوضوح يجعلان الصور الناعمة أوضح. للصور الناعمة جدًا أو الصغيرة أو القديمة شغّل استعادة التفاصيل بالذكاء الاصطناعي."),
    ("هل تُرفع صوري؟", "لا. كل شيء، بما فيه الذكاء الاصطناعي، يعمل في متصفحك.")], "كل الأنماط"),
 "pl": t("Poprawa jakości zdjęć", "Popraw ciemne, mdłe, rozmyte lub zaszumione zdjęcia jednym kliknięciem, a potem dopracuj je jak profesjonalista. Działa w przeglądarce.",
   "Poprawa jakości zdjęć za darmo: ulepsz zdjęcia online | Toolz Baba",
   "Popraw ciemne, mdłe, rozmyte lub zaszumione zdjęcia jednym kliknięciem. Profesjonalne suwaki, odtwarzanie szczegółów AI, style dla portretów, starych zdjęć i dokumentów. Za darmo i prywatnie.",
   "Wydobądź z każdego zdjęcia to, co najlepsze. Automatyczna poprawa analizuje każde zdjęcie i koryguje to, czego potrzebuje: ekspozycję, kontrast, balans bieli, cienie i światła, mdłe kolory, szum i brak ostrości. Każda korekta jest widoczna na suwaku, więc widzisz dokładnie, co się zmieniło, i możesz to dopracować jak w profesjonalnym edytorze. Style dla portretu, krajobrazu, słabego światła, produktu, jedzenia, starego zdjęcia, dokumentu i czerni i bieli zmieniają wynik jednym dotknięciem. Opcjonalny krok AI (Real-ESRGAN) usuwa rozmycie, szum i bloki JPEG. Zapisz jako JPG, WebP, AVIF lub PNG, zmniejsz dla internetu i ustaw docelowy rozmiar pliku, dla wielu zdjęć naraz. Wszystko dzieje się w przeglądarce, więc zdjęcia nigdy nie są wysyłane.",
   ["Dodaj zdjęcia (kilka naraz też można).", "Wybierz styl lub zostaw Auto: każde zdjęcie jest poprawiane osobno.", "Jeśli chcesz, przesuń suwaki, porównaj przeciągając linię i zapisz jako JPG, WebP, AVIF lub PNG."],
   [("Jak automatyczna poprawa decyduje, co zmienić?", "Mierzy zdjęcie: jasność, rozpiętość tonów, przebarwienia neutralnych kolorów, ilość szumu i drobnych szczegółów. Na tej podstawie ustawia każdy suwak, a każdą wartość możesz zobaczyć i zmienić."),
    ("Czy naprawi rozmyte zdjęcie?", "Wyostrzanie i klarowność sprawiają, że miękkie zdjęcia są wyraźniejsze. Przy bardzo miękkich, małych lub starych zdjęciach włącz odtwarzanie szczegółów AI."),
    ("Czy moje zdjęcia są wysyłane?", "Nie. Wszystko, także AI, działa w przeglądarce.")], "Wszystkie style"),
}

# screen phrases: [English, then hi bn es pt id fr de ru ja tr vi it ar pl]
S = [
 ["Exposure", "एक्सपोज़र", "এক্সপোজার", "Exposición", "Exposição", "Eksposur", "Exposition", "Belichtung", "Экспозиция", "露出", "Pozlama", "Phơi sáng", "Esposizione", "التعريض", "Ekspozycja"],
 ["Contrast", "कंट्रास्ट", "কনট্রাস্ট", "Contraste", "Contraste", "Kontras", "Contraste", "Kontrast", "Контраст", "コントラスト", "Kontrast", "Tương phản", "Contrasto", "التباين", "Kontrast"],
 ["Highlights", "हाइलाइट", "হাইলাইট", "Luces", "Realces", "Sorotan", "Hautes lumières", "Lichter", "Света", "ハイライト", "Parlak alanlar", "Vùng sáng", "Luci", "الإضاءات", "Światła"],
 ["Shadows", "शैडो", "শ্যাডো", "Sombras", "Sombras", "Bayangan", "Ombres", "Tiefen", "Тени", "シャドウ", "Gölgeler", "Vùng tối", "Ombre", "الظلال", "Cienie"],
 ["Whites", "व्हाइट्स", "হোয়াইটস", "Blancos", "Brancos", "Putih", "Blancs", "Weiß", "Белые", "白レベル", "Beyazlar", "Trắng", "Bianchi", "الأبيض", "Biele"],
 ["Blacks", "ब्लैक्स", "ব্ল্যাকস", "Negros", "Pretos", "Hitam", "Noirs", "Schwarz", "Чёрные", "黒レベル", "Siyahlar", "Đen", "Neri", "الأسود", "Czernie"],
 ["Temperature", "तापमान (गर्म/ठंडा)", "তাপমাত্রা", "Temperatura", "Temperatura", "Suhu", "Température", "Farbtemperatur", "Температура", "色温度", "Sıcaklık", "Nhiệt độ màu", "Temperatura", "درجة الحرارة", "Temperatura"],
 ["Tint", "टिंट", "টিন্ট", "Matiz", "Matiz", "Rona", "Teinte", "Tönung", "Оттенок", "色かぶり補正", "Ton", "Sắc độ", "Tinta", "الصبغة", "Odcień"],
 ["Vibrance", "वाइब्रेंस", "ভাইব্রেন্স", "Intensidad", "Vibração", "Vibransi", "Vibrance", "Dynamik", "Красочность", "自然な彩度", "Canlılık", "Độ rực", "Vividezza", "الحيوية", "Jaskrawość"],
 ["Saturation", "सैचुरेशन", "স্যাচুরেশন", "Saturación", "Saturação", "Saturasi", "Saturation", "Sättigung", "Насыщенность", "彩度", "Doygunluk", "Độ bão hòa", "Saturazione", "التشبع", "Nasycenie"],
 ["Clarity", "क्लैरिटी", "ক্ল্যারিটি", "Claridad", "Clareza", "Kejernihan", "Clarté", "Klarheit", "Чёткость", "明瞭度", "Netlik", "Độ rõ", "Chiarezza", "الوضوح", "Klarowność"],
 ["Dehaze", "धुंध हटाएँ", "কুয়াশা সরান", "Eliminar neblina", "Remover névoa", "Hapus kabut", "Correction du voile", "Dunst entfernen", "Удаление дымки", "かすみの除去", "Pus giderme", "Khử sương mờ", "Rimuovi foschia", "إزالة الضباب", "Usuwanie mgiełki"],
 ["Sharpen", "शार्पन", "শার্পেন", "Nitidez", "Nitidez", "Penajaman", "Netteté", "Schärfen", "Резкость", "シャープ", "Keskinleştirme", "Làm nét", "Nitidezza", "الحدة", "Wyostrzanie"],
 ["Noise reduction", "नॉइज़ कम करें", "নয়েজ কমান", "Reducción de ruido", "Redução de ruído", "Pengurangan noise", "Réduction du bruit", "Rauschreduzierung", "Шумоподавление", "ノイズ除去", "Gürültü azaltma", "Giảm nhiễu", "Riduzione rumore", "تقليل التشويش", "Redukcja szumu"],
 ["Vignette", "विग्नेट", "ভিনিয়েট", "Viñeta", "Vinheta", "Vinyet", "Vignettage", "Vignette", "Виньетка", "周辺光量", "Vinyet", "Làm tối viền", "Vignettatura", "التظليل الجانبي", "Winieta"],
 ["Repair faded colours", "फीके रंग ठीक करें", "ফ্যাকাশে রং ঠিক করুন", "Reparar colores desvaídos", "Reparar cores desbotadas", "Perbaiki warna pudar", "Réparer les couleurs passées", "Verblasste Farben reparieren", "Восстановить выцветшие цвета", "色あせを修復", "Solmuş renkleri onar", "Phục hồi màu phai", "Ripara colori sbiaditi", "إصلاح الألوان الباهتة", "Napraw wyblakłe kolory"],
 ["Document cleanup", "डॉक्यूमेंट साफ़ करें", "ডকুমেন্ট পরিষ্কার", "Limpieza de documentos", "Limpeza de documentos", "Pembersihan dokumen", "Nettoyage de document", "Dokument bereinigen", "Очистка документа", "書類のクリーンアップ", "Belge temizleme", "Làm sạch tài liệu", "Pulizia documenti", "تنظيف المستند", "Czyszczenie dokumentu"],
 ["Detail", "डिटेल", "ডিটেল", "Detalle", "Detalhe", "Detail", "Détail", "Details", "Детали", "ディテール", "Ayrıntı", "Chi tiết", "Dettaglio", "التفاصيل", "Szczegóły"],
 ["Effects and repair", "इफ़ेक्ट और रिपेयर", "ইফেক্ট ও রিপেয়ার", "Efectos y reparación", "Efeitos e reparo", "Efek dan perbaikan", "Effets et réparation", "Effekte und Reparatur", "Эффекты и восстановление", "効果と修復", "Efektler ve onarım", "Hiệu ứng và phục hồi", "Effetti e riparazione", "المؤثرات والإصلاح", "Efekty i naprawa"],
 ["Auto", "ऑटो", "অটো", "Auto", "Auto", "Otomatis", "Auto", "Auto", "Авто", "自動", "Otomatik", "Tự động", "Auto", "تلقائي", "Auto"],
 ["Natural", "नैचुरल", "ন্যাচারাল", "Natural", "Natural", "Alami", "Naturel", "Natürlich", "Естественно", "ナチュラル", "Doğal", "Tự nhiên", "Naturale", "طبيعي", "Naturalnie"],
 ["Low light", "कम रोशनी", "কম আলো", "Poca luz", "Pouca luz", "Cahaya rendah", "Faible lumière", "Wenig Licht", "Слабый свет", "暗所", "Düşük ışık", "Thiếu sáng", "Poca luce", "إضاءة منخفضة", "Słabe światło"],
 ["Product", "प्रोडक्ट", "প্রোডাক্ট", "Producto", "Produto", "Produk", "Produit", "Produkt", "Товар", "商品", "Ürün", "Sản phẩm", "Prodotto", "منتج", "Produkt"],
 ["Food", "खाना", "খাবার", "Comida", "Comida", "Makanan", "Cuisine", "Essen", "Еда", "料理", "Yemek", "Đồ ăn", "Cibo", "طعام", "Jedzenie"],
 ["Old photo", "पुरानी फ़ोटो", "পুরোনো ছবি", "Foto antigua", "Foto antiga", "Foto lama", "Vieille photo", "Altes Foto", "Старое фото", "古い写真", "Eski fotoğraf", "Ảnh cũ", "Foto vecchia", "صورة قديمة", "Stare zdjęcie"],
 ["Document", "डॉक्यूमेंट", "ডকুমেন্ট", "Documento", "Documento", "Dokumen", "Document", "Dokument", "Документ", "書類", "Belge", "Tài liệu", "Documento", "مستند", "Dokument"],
 ["Black & white", "ब्लैक एंड व्हाइट", "সাদা-কালো", "Blanco y negro", "Preto e branco", "Hitam putih", "Noir et blanc", "Schwarzweiß", "Чёрно-белое", "モノクロ", "Siyah beyaz", "Đen trắng", "Bianco e nero", "أبيض وأسود", "Czarno-białe"],
 ["Choose a look", "लुक चुनें", "লুক বেছে নিন", "Elige un estilo", "Escolha um estilo", "Pilih gaya", "Choisissez un style", "Look wählen", "Выберите стиль", "スタイルを選ぶ", "Bir stil seçin", "Chọn phong cách", "Scegli uno stile", "اختر نمطًا", "Wybierz styl"],
 ["Fine-tune", "फ़ाइन-ट्यून करें", "ফাইন-টিউন", "Ajuste fino", "Ajuste fino", "Atur detail", "Réglages fins", "Feinabstimmung", "Тонкая настройка", "微調整", "İnce ayar", "Tinh chỉnh", "Rifinitura", "ضبط دقيق", "Dostrajanie"],
 ["Save", "सेव करें", "সেভ করুন", "Guardar", "Salvar", "Simpan", "Enregistrer", "Speichern", "Сохранить", "保存", "Kaydet", "Lưu", "Salva", "حفظ", "Zapisz"],
 ["Reset to the look", "लुक पर वापस जाएँ", "লুকে ফিরে যান", "Volver al estilo", "Voltar ao estilo", "Kembali ke gaya", "Revenir au style", "Auf den Look zurücksetzen", "Вернуть к стилю", "スタイルに戻す", "Stile sıfırla", "Về lại phong cách", "Torna allo stile", "العودة إلى النمط", "Przywróć styl"],
 ["AI detail restore", "AI डिटेल रिस्टोर", "AI ডিটেল রিস্টোর", "Restauración de detalle con IA", "Restauração de detalhes com IA", "Pemulihan detail AI", "Restauration des détails par IA", "KI-Detailwiederherstellung", "Восстановление деталей ИИ", "AI ディテール復元", "AI ayrıntı onarımı", "Khôi phục chi tiết bằng AI", "Ripristino dettagli IA", "استعادة التفاصيل بالذكاء الاصطناعي", "Odtwarzanie szczegółów AI"],
 ["Off", "बंद", "বন্ধ", "Desactivado", "Desligado", "Mati", "Désactivé", "Aus", "Выкл.", "オフ", "Kapalı", "Tắt", "Disattivato", "إيقاف", "Wyłączone"],
 ["On: remove blur, noise and JPEG blocks (same size)", "चालू: धुंधलापन, नॉइज़ और JPEG ब्लॉक हटाएँ (उसी साइज़ में)", "চালু: ঝাপসাভাব, নয়েজ ও JPEG ব্লক সরান (একই মাপে)", "Activado: quitar desenfoque, ruido y bloques JPEG (mismo tamaño)", "Ligado: remover desfoque, ruído e blocos JPEG (mesmo tamanho)", "Nyala: hapus blur, noise, dan blok JPEG (ukuran sama)", "Activé : supprimer flou, bruit et blocs JPEG (même taille)", "An: Unschärfe, Rauschen und JPEG-Blöcke entfernen (gleiche Größe)", "Вкл.: убрать размытие, шум и блоки JPEG (тот же размер)", "オン：ぼやけ・ノイズ・JPEG ブロックを除去（同じサイズ）", "Açık: bulanıklık, gürültü ve JPEG bloklarını gider (aynı boyut)", "Bật: khử mờ, nhiễu và khối JPEG (giữ kích thước)", "Attivo: rimuovi sfocatura, rumore e blocchi JPEG (stessa dimensione)", "تشغيل: إزالة الضبابية والتشويش وكتل JPEG (بالحجم نفسه)", "Wł.: usuń rozmycie, szum i bloki JPEG (ten sam rozmiar)"],
 ["On, and enlarge 2x", "चालू, और 2 गुना बड़ा करें", "চালু, এবং 2 গুণ বড় করুন", "Activado y ampliar 2x", "Ligado e ampliar 2x", "Nyala, dan perbesar 2x", "Activé, et agrandir 2x", "An, und 2-fach vergrößern", "Вкл. и увеличить в 2 раза", "オン、2 倍に拡大", "Açık ve 2 kat büyüt", "Bật và phóng to 2 lần", "Attivo e ingrandisci 2x", "تشغيل وتكبير مرتين", "Wł. i powiększ 2x"],
 ["Uses the AI model of the Image Upscaler (5 MB, downloaded once). Best for small, soft or old photos.", "इमेज अपस्केलर का AI मॉडल (5 MB, एक बार डाउनलोड)। छोटी, हल्की धुंधली या पुरानी फ़ोटो के लिए सबसे अच्छा।", "ইমেজ আপস্কেলারের AI মডেল (5 MB, একবার ডাউনলোড)। ছোট, নরম বা পুরোনো ছবির জন্য সবচেয়ে ভালো।", "Usa el modelo de IA del ampliador de imágenes (5 MB, se descarga una vez). Ideal para fotos pequeñas, suaves o antiguas.", "Usa o modelo de IA do ampliador de imagens (5 MB, baixado uma vez). Ideal para fotos pequenas, suaves ou antigas.", "Memakai model AI dari Pembesar Gambar (5 MB, diunduh sekali). Terbaik untuk foto kecil, lembut, atau lama.", "Utilise le modèle IA de l'agrandisseur d'images (5 Mo, téléchargé une fois). Idéal pour les photos petites, douces ou anciennes.", "Nutzt das KI-Modell des Bildvergrößerers (5 MB, einmal geladen). Am besten für kleine, weiche oder alte Fotos.", "Использует модель ИИ увеличителя изображений (5 МБ, загружается один раз). Лучше всего для маленьких, мягких или старых фото.", "画像拡大ツールの AI モデルを使います（5 MB、初回のみダウンロード）。小さい・甘い・古い写真に最適です。", "Görüntü Büyütücü'nün AI modelini kullanır (5 MB, bir kez indirilir). Küçük, yumuşak veya eski fotoğraflar için en iyisi.", "Dùng mô hình AI của công cụ phóng to ảnh (5 MB, tải một lần). Tốt nhất cho ảnh nhỏ, mềm hoặc cũ.", "Usa il modello IA dell'ingranditore di immagini (5 MB, scaricato una volta). Ideale per foto piccole, morbide o vecchie.", "يستخدم نموذج الذكاء الاصطناعي لأداة تكبير الصور (5 ميغابايت، يُنزَّل مرة واحدة). الأفضل للصور الصغيرة أو الناعمة أو القديمة.", "Używa modelu AI z narzędzia do powiększania (5 MB, pobierany raz). Najlepsze do małych, miękkich lub starych zdjęć."],
 ["WebP (smaller)", "WebP (छोटा)", "WebP (ছোট)", "WebP (más pequeño)", "WebP (menor)", "WebP (lebih kecil)", "WebP (plus léger)", "WebP (kleiner)", "WebP (меньше)", "WebP（小さめ）", "WebP (daha küçük)", "WebP (nhỏ hơn)", "WebP (più leggero)", "WebP (أصغر)", "WebP (mniejszy)"],
 ["AVIF (smallest)", "AVIF (सबसे छोटा)", "AVIF (সবচেয়ে ছোট)", "AVIF (el más pequeño)", "AVIF (o menor)", "AVIF (paling kecil)", "AVIF (le plus léger)", "AVIF (am kleinsten)", "AVIF (самый маленький)", "AVIF（最小）", "AVIF (en küçük)", "AVIF (nhỏ nhất)", "AVIF (il più leggero)", "AVIF (الأصغر)", "AVIF (najmniejszy)"],
 ["Maximum size", "अधिकतम साइज़", "সর্বোচ্চ মাপ", "Tamaño máximo", "Tamanho máximo", "Ukuran maksimum", "Taille maximale", "Maximale Größe", "Максимальный размер", "最大サイズ", "En büyük boyut", "Kích thước tối đa", "Dimensione massima", "الحجم الأقصى", "Maksymalny rozmiar"],
 ["Keep the size", "साइज़ वैसा ही रखें", "মাপ একই রাখুন", "Mantener el tamaño", "Manter o tamanho", "Pertahankan ukuran", "Garder la taille", "Größe behalten", "Сохранить размер", "サイズを維持", "Boyutu koru", "Giữ kích thước", "Mantieni la dimensione", "الإبقاء على الحجم", "Zachowaj rozmiar"],
 ["1920 px (web, social)", "1920 px (वेब, सोशल)", "1920 px (ওয়েব, সোশ্যাল)", "1920 px (web, redes)", "1920 px (web, redes)", "1920 px (web, sosial)", "1920 px (web, réseaux)", "1920 px (Web, Social Media)", "1920 px (сайт, соцсети)", "1920 px（ウェブ・SNS）", "1920 px (web, sosyal)", "1920 px (web, mạng xã hội)", "1920 px (web, social)", "1920 بكسل (ويب، تواصل)", "1920 px (WWW, social media)"],
 ["Target file size (KB, optional)", "फ़ाइल साइज़ लक्ष्य (KB, वैकल्पिक)", "লক্ষ্য ফাইল সাইজ (KB, ঐচ্ছিক)", "Tamaño de archivo objetivo (KB, opcional)", "Tamanho de arquivo alvo (KB, opcional)", "Target ukuran file (KB, opsional)", "Taille de fichier visée (Ko, facultatif)", "Ziel-Dateigröße (KB, optional)", "Желаемый размер файла (КБ, необязательно)", "目標ファイルサイズ（KB、任意）", "Hedef dosya boyutu (KB, isteğe bağlı)", "Dung lượng mục tiêu (KB, tùy chọn)", "Peso file desiderato (KB, facoltativo)", "حجم الملف المطلوب (كيلوبايت، اختياري)", "Docelowy rozmiar pliku (KB, opcjonalnie)"],
 ["The best quality that fits under this size.", "इस साइज़ में आने वाली सबसे अच्छी क्वालिटी।", "এই মাপের মধ্যে সবচেয়ে ভালো কোয়ালিটি।", "La mejor calidad que cabe en ese tamaño.", "A melhor qualidade que cabe nesse tamanho.", "Kualitas terbaik yang muat di bawah ukuran ini.", "La meilleure qualité qui tient sous cette taille.", "Die beste Qualität, die unter diese Größe passt.", "Лучшее качество, которое укладывается в этот размер.", "このサイズに収まる最高の画質。", "Bu boyuta sığan en iyi kalite.", "Chất lượng tốt nhất vừa dưới dung lượng này.", "La migliore qualità che rientra in questo peso.", "أفضل جودة تناسب هذا الحجم.", "Najlepsza jakość, która zmieści się w tym rozmiarze."],
 ["Enhance and download", "एन्हांस करें और डाउनलोड करें", "এনহ্যান্স করে ডাউনলোড করুন", "Mejorar y descargar", "Melhorar e baixar", "Tingkatkan dan unduh", "Améliorer et télécharger", "Verbessern und herunterladen", "Улучшить и скачать", "補正してダウンロード", "İyileştir ve indir", "Cải thiện và tải về", "Migliora e scarica", "حسّن ونزّل", "Popraw i pobierz"],
 ["Auto reads each photo and corrects it on its own. A look shapes the result; the sliders below show exactly what was done.", "ऑटो हर फ़ोटो को पढ़कर उसे अपने हिसाब से ठीक करता है। लुक नतीजे को आकार देता है; नीचे के स्लाइडर दिखाते हैं कि ठीक-ठीक क्या किया गया।", "অটো প্রতিটি ছবি পড়ে নিজের মতো ঠিক করে। লুক ফলকে রূপ দেয়; নিচের স্লাইডার দেখায় ঠিক কী করা হয়েছে।", "Auto analiza cada foto y la corrige por separado. Un estilo da forma al resultado; los controles de abajo muestran exactamente qué se hizo.", "O Auto analisa cada foto e a corrige individualmente. Um estilo molda o resultado; os controles abaixo mostram exatamente o que foi feito.", "Otomatis membaca setiap foto dan memperbaikinya sendiri. Gaya membentuk hasil; slider di bawah menunjukkan persis apa yang dilakukan.", "Auto analyse chaque photo et la corrige séparément. Un style façonne le résultat ; les curseurs ci-dessous montrent exactement ce qui a été fait.", "Auto liest jedes Foto und korrigiert es einzeln. Ein Look formt das Ergebnis; die Regler darunter zeigen genau, was gemacht wurde.", "Авто анализирует каждое фото и исправляет его отдельно. Стиль задаёт характер результата; ползунки ниже показывают, что именно сделано.", "自動は写真ごとに分析して個別に補正します。スタイルで仕上がりを整え、下のスライダーで何をしたかを正確に確認できます。", "Otomatik her fotoğrafı okur ve ayrı ayrı düzeltir. Stil sonucu şekillendirir; aşağıdaki kaydırıcılar tam olarak ne yapıldığını gösterir.", "Tự động đọc từng ảnh và sửa riêng. Phong cách định hình kết quả; các thanh trượt bên dưới cho thấy chính xác điều đã làm.", "Auto analizza ogni foto e la corregge per conto suo. Uno stile dà forma al risultato; i cursori qui sotto mostrano esattamente cosa è stato fatto.", "يقرأ التلقائي كل صورة ويصحّحها على حدة. النمط يشكّل النتيجة؛ والمنزلقات أدناه تبيّن بالضبط ما تم.", "Auto analizuje każde zdjęcie i poprawia je osobno. Styl kształtuje wynik; suwaki poniżej pokazują dokładnie, co zrobiono."],
 ["Enhanced", "एन्हांस्ड", "এনহ্যান্সড", "Mejorada", "Melhorada", "Ditingkatkan", "Améliorée", "Verbessert", "Улучшено", "補正後", "İyileştirilmiş", "Đã cải thiện", "Migliorata", "بعد التحسين", "Po poprawie"],
 ["Drag the line to compare. The download is made at full size, so fine detail may look even better than here.", "तुलना के लिए लाइन खींचें। डाउनलोड पूरे साइज़ में बनता है, इसलिए बारीक डिटेल यहाँ से भी बेहतर दिख सकती है।", "তুলনার জন্য লাইন টানুন। ডাউনলোড পূর্ণ মাপে তৈরি হয়, তাই সূক্ষ্ম ডিটেল এখানকার চেয়েও ভালো দেখাতে পারে।", "Arrastra la línea para comparar. La descarga se hace a tamaño completo, así que el detalle fino puede verse aún mejor.", "Arraste a linha para comparar. O download é feito em tamanho total, então os detalhes finos podem ficar ainda melhores.", "Geser garis untuk membandingkan. Unduhan dibuat dalam ukuran penuh, jadi detail halus bisa terlihat lebih baik lagi.", "Faites glisser la ligne pour comparer. Le téléchargement est fait en pleine taille : les fins détails peuvent être encore meilleurs.", "Linie ziehen zum Vergleichen. Der Download hat volle Größe, feine Details können also noch besser aussehen.", "Перетащите линию, чтобы сравнить. Файл сохраняется в полном размере, так что мелкие детали могут выглядеть ещё лучше.", "線をドラッグして比較。ダウンロードはフルサイズなので、細部はここよりさらにきれいに見えることがあります。", "Karşılaştırmak için çizgiyi sürükleyin. İndirme tam boyutta yapılır, ince ayrıntılar burada olduğundan da iyi görünebilir.", "Kéo đường để so sánh. Tệp tải về ở kích thước đầy đủ nên chi tiết nhỏ có thể còn đẹp hơn.", "Trascina la linea per confrontare. Il download è a piena dimensione, quindi i dettagli fini possono apparire ancora migliori.", "اسحب الخط للمقارنة. التنزيل بالحجم الكامل، لذا قد تبدو التفاصيل الدقيقة أفضل مما هنا.", "Przeciągnij linię, aby porównać. Pobierany plik ma pełny rozmiar, więc drobne szczegóły mogą wyglądać jeszcze lepiej."],
 ["JPG, PNG, WebP, HEIC... several at once. Runs in your browser: nothing is uploaded.", "JPG, PNG, WebP, HEIC... कई एक साथ। आपके ब्राउज़र में चलता है: कुछ अपलोड नहीं होता।", "JPG, PNG, WebP, HEIC... একসাথে অনেক। আপনার ব্রাউজারে চলে: কিছুই আপলোড হয় না।", "JPG, PNG, WebP, HEIC... varias a la vez. Funciona en tu navegador: no se sube nada.", "JPG, PNG, WebP, HEIC... várias de uma vez. Funciona no seu navegador: nada é enviado.", "JPG, PNG, WebP, HEIC... beberapa sekaligus. Berjalan di browser Anda: tidak ada yang diunggah.", "JPG, PNG, WebP, HEIC... plusieurs à la fois. Fonctionne dans votre navigateur : rien n'est envoyé.", "JPG, PNG, WebP, HEIC... mehrere auf einmal. Läuft in Ihrem Browser: nichts wird hochgeladen.", "JPG, PNG, WebP, HEIC... сразу несколько. Работает в браузере: ничего не загружается.", "JPG、PNG、WebP、HEIC など、複数まとめて。ブラウザで動作：アップロードはありません。", "JPG, PNG, WebP, HEIC... birden çok aynı anda. Tarayıcınızda çalışır: hiçbir şey yüklenmez.", "JPG, PNG, WebP, HEIC... nhiều ảnh cùng lúc. Chạy trong trình duyệt: không tải lên gì.", "JPG, PNG, WebP, HEIC... più file insieme. Funziona nel browser: nulla viene caricato.", "JPG وPNG وWebP وHEIC... عدة صور معًا. يعمل في متصفحك: لا يُرفع أي شيء.", "JPG, PNG, WebP, HEIC... kilka naraz. Działa w przeglądarce: nic nie jest wysyłane."],
 ["Reading the photo...", "फ़ोटो पढ़ी जा रही है...", "ছবি পড়া হচ্ছে...", "Leyendo la foto...", "Lendo a foto...", "Membaca foto...", "Lecture de la photo...", "Foto wird gelesen...", "Читаем фото...", "写真を読み込んでいます...", "Fotoğraf okunuyor...", "Đang đọc ảnh...", "Lettura della foto...", "جارٍ قراءة الصورة...", "Wczytywanie zdjęcia..."],
 ["AI is restoring detail (the slow part, up to a minute on a phone)...", "AI डिटेल वापस ला रहा है (धीमा हिस्सा, फ़ोन पर एक मिनट तक)...", "AI ডিটেল ফেরাচ্ছে (ধীর অংশ, ফোনে এক মিনিট পর্যন্ত)...", "La IA está restaurando el detalle (la parte lenta, hasta un minuto en el móvil)...", "A IA está restaurando os detalhes (a parte lenta, até um minuto no celular)...", "AI sedang memulihkan detail (bagian lambat, hingga satu menit di ponsel)...", "L'IA restaure les détails (la partie lente, jusqu'à une minute sur téléphone)...", "Die KI stellt Details wieder her (der langsame Teil, bis zu einer Minute am Handy)...", "ИИ восстанавливает детали (долгий этап, до минуты на телефоне)...", "AI がディテールを復元しています（時間のかかる処理、スマートフォンで最大 1 分）...", "AI ayrıntıları onarıyor (yavaş kısım, telefonda bir dakikaya kadar)...", "AI đang khôi phục chi tiết (phần chậm, tới một phút trên điện thoại)...", "L'IA sta ripristinando i dettagli (la parte lenta, fino a un minuto sul telefono)...", "الذكاء الاصطناعي يستعيد التفاصيل (الجزء البطيء، حتى دقيقة على الهاتف)...", "AI odtwarza szczegóły (wolny etap, do minuty na telefonie)..."],
 ["Look", "लुक", "লুক", "Estilo", "Estilo", "Gaya", "Style", "Look", "Стиль", "スタイル", "Stil", "Phong cách", "Stile", "النمط", "Styl"],
 ["Photo to preview", "प्रीव्यू के लिए फ़ोटो", "প্রিভিউয়ের ছবি", "Foto para la vista previa", "Foto para pré-visualizar", "Foto untuk pratinjau", "Photo à prévisualiser", "Foto für die Vorschau", "Фото для просмотра", "プレビューする写真", "Önizlenecek fotoğraf", "Ảnh để xem trước", "Foto da visualizzare", "الصورة للمعاينة", "Zdjęcie do podglądu"],
 ["Compare before and after", "पहले और बाद की तुलना करें", "আগে ও পরে তুলনা করুন", "Comparar antes y después", "Comparar antes e depois", "Bandingkan sebelum dan sesudah", "Comparer avant et après", "Vorher und nachher vergleichen", "Сравнить до и после", "補正前後を比較", "Öncesi ve sonrasını karşılaştır", "So sánh trước và sau", "Confronta prima e dopo", "قارن قبل وبعد", "Porównaj przed i po"],
]


def main():
    data = json.loads(TOOLS.read_text("utf-8"))
    if "image-enhancer" not in {t_["slug"] for t_ in data["tools"]}:
        at = next(i for i, t_ in enumerate(data["tools"]) if t_["slug"] == "upscale-image")
        data["tools"].insert(at, dict(BASE))
    taken = {t_["slug"] for t_ in data["tools"]} | {v["slug"] for v in data["variants"]} | {a for x in data["tools"] + data["variants"] for a in (x.get("aliases") or [])}
    new = [page(*p) for p in PAGES if p[0] not in taken]
    data["variants"] += new
    base = next(t_ for t_ in data["tools"] if t_["slug"] == "image-enhancer")
    for a in ("photo-enhancer", "enhance-photo", "photo-quality-enhancer", "image-quality-enhancer"):
        if a not in taken:
            base.setdefault("aliases", []).append(a); taken.add(a)
    TOOLS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    for i, code in enumerate(LANGS):
        p = ROOT / "i18n" / code / "tools.json"; raw = p.read_bytes().decode("utf-8"); tl = json.loads(raw)
        tl["image-enhancer"] = TL[code]
        save_like(p, tl, raw)
        q = ROOT / "i18n" / code / "strings.json"; rawq = q.read_bytes().decode("utf-8"); ui = json.loads(rawq)
        for row in S:
            ui[row[0]] = row[1 + i]
        save_like(q, ui, rawq)
    print(f"pages added: {len(new)}; aliases: {base.get('aliases')}; phrases: {len(S)} in {len(LANGS)} languages")


if __name__ == "__main__":
    main()
