# Third-party software and models

The static site (Cloudflare Pages) ships these libraries and AI models in `static/assets/vendor/` and
`static/assets/models/`. They run in the visitor's browser.

## Libraries

| Library | Version | Used for | Licence |
|---|---|---|---|
| [MuPDF.js](https://mupdf.com/) | 1.28.1 | PDF tools, Word/Excel to PDF layout, PDF to Word | AGPL-3.0-or-later |
| [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (`@ffmpeg/ffmpeg`, `@ffmpeg/util`) | 0.12.15 | Video and audio tools | MIT |
| ffmpeg.wasm core (`@ffmpeg/core`, FFmpeg with x264, libvpx, LAME, Opus...) | 0.12.10 | Video and audio tools | GPL-2.0-or-later |
| [ONNX Runtime Web](https://onnxruntime.ai/) | 1.30.0 | AI tools | MIT |
| [jSquash AVIF](https://github.com/jamsinclair/jSquash) (libavif) | 2.1.1 | AVIF encoding | Apache-2.0 (libavif: BSD-2-Clause) |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.13.0 | Word to PDF | BSD-2-Clause |
| [SheetJS Community Edition](https://sheetjs.com/) | 0.20.3 | Excel/CSV to PDF | Apache-2.0 |
| [UPNG.js](https://github.com/photopea/UPNG.js) | 2.1.0 | Small PNGs (colour reduction) | MIT |
| [pako](https://github.com/nodeca/pako) | 1.0.11 | Compression for UPNG/UTIF | MIT and Zlib |
| [UTIF.js](https://github.com/photopea/UTIF.js) | 3.1.0 | TIFF reading and writing | MIT |
| [gifenc](https://github.com/mattdesl/gifenc) | 1.0.3 | GIF writing | MIT |
| [heic2any](https://github.com/alexcorvi/heic2any) (includes libheif) | 0.0.4 | Opening iPhone HEIC photos | MIT (libheif: LGPL-3.0) |
| [exifr](https://github.com/MikeKovarik/exifr) | 7.1.3 | Reading photo metadata | MIT |
| [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) | 1.2.6 | Image to SVG | Unlicense (public domain) |
| [Noto Sans](https://notofonts.github.io/) Devanagari, Bengali, Gujarati, Gurmukhi, Tamil, Telugu, Kannada, Malayalam, Oriya | – | Indian scripts in Word to PDF | SIL Open Font License 1.1 |
| [Transformers.js](https://github.com/huggingface/transformers.js) (includes onnxruntime-web) | 3.8.1 | Runs the speech models in the browser (video to text, text to audio) | Apache-2.0 (onnxruntime: MIT) |
| [Pyodide](https://pyodide.org/) (CPython 3.14 compiled to WebAssembly, with its standard library) | 314.0.7 | Runs the Visual Sitemap Generator's Python engine (`site_board/`) in the browser | MPL-2.0 (CPython: PSF License) |
| pdf.js, Tesseract.js, JSZip, QRCode.js | (already in the project) | PDF preview, OCR, ZIP, QR codes | Apache-2.0, Apache-2.0, MIT, MIT |

MuPDF (AGPL) and the ffmpeg core (GPL) are copyleft. Because the site sends them to visitors, its source code has to
be available to them: keep this repository public, or replace those libraries.

## AI models

| Model | File | Used for | Licence |
|---|---|---|---|
| [ISNet (DIS)](https://github.com/xuebinqin/DIS) general use, 8-bit ([Ko033/isnet-general-use-onnx](https://huggingface.co/Ko033/isnet-general-use-onnx)) | `isnet-general-use-q8.onnx.part*` | Background removal, best quality | Apache-2.0 |
| [MODNet](https://github.com/ZHKKKe/MODNet) ([Xenova/modnet](https://huggingface.co/Xenova/modnet)) | `modnet.onnx` | Background removal for people, passport photos | Apache-2.0 |
| [U²-Net-p](https://github.com/xuebinqin/U-2-Net) | `u2netp.onnx` | Background removal, fast | Apache-2.0 |
| [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (2023mar) | `yunet-2023mar.onnx` | Face detection (face blur, passport photos) | MIT |
| [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) general x4v3 | `realesr-general-x4v3.onnx` | AI upscaler | BSD-3-Clause |
| [AnimeGANv3](https://github.com/TachibanaYoshino/AnimeGANv3) Hayao 36 / Shinkai 37 | `animeganv3-*.onnx` | Anime style | **Free for non-commercial use only**; commercial use needs the author's permission |

The server version of the site used the same AnimeGANv3 models. If the site earns money (ads, paid features), ask the
author for permission or remove the Anime Style tool.

### Speech models (video to text, text to audio)

Files in `static/assets/models/whisper-*` and `mms-tts-*`; get them with `python scripts/get_speech_models.py`. Files over 24 MiB are stored
in parts (`*.part0`, `*.part1`) and joined in the browser, because Cloudflare Pages allows 25 MiB per file.

| Model | Used for | Licence |
|---|---|---|
| [Whisper tiny and base](https://github.com/openai/whisper), ONNX 8-bit by [Xenova](https://huggingface.co/Xenova/whisper-tiny) | Video / audio to text | MIT (OpenAI Whisper), Apache-2.0 (the ONNX conversions) |
| [MMS-TTS English and Hindi](https://huggingface.co/facebook/mms-tts-eng), ONNX 8-bit by [Xenova](https://huggingface.co/Xenova/mms-tts-eng) | Text to audio voices | **CC BY-NC 4.0: non-commercial use only** |

If the site earns money (ads, paid features), replace the MMS voices before that, for example with
[Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (Apache-2.0, has English and Hindi voices), or remove the Text to Audio tool.


### Fonts (Font Library and PDF Editor)

Files in `static/assets/fonts/` (get them with `python scripts/get_fonts.py`, which reads the `@expo-google-fonts/*` npm packages of the Google Fonts project). Each font keeps its own copyright line in `fonts.json`.

| Fonts | Licence |
|---|---|
| Arimo, Tinos, Cousine, Inter, Open Sans, Lato, Montserrat, Poppins, Nunito, Source Sans 3, Work Sans, DM Sans, Raleway, Rubik, Karla, Playfair Display, Merriweather, Lora, Libre Baskerville, PT Serif, Crimson Text, Bebas Neue, Oswald, Anton, Abril Fatface, Dancing Script, Caveat, Satisfy, Great Vibes, Shadows Into Light, Indie Flower, Pacifico, Roboto Mono, Source Code Pro, Courier Prime, Noto Sans / Serif (Devanagari, Bengali, Tamil, Telugu, Gujarati, Gurmukhi, Kannada, Malayalam), Hind, Mukta, Tiro Devanagari Hindi, Baloo 2, Kalam | SIL Open Font License 1.1 (free for commercial use; the fonts may not be sold on their own) |
| Roboto | Apache-2.0 |
| Ubuntu | Ubuntu Font Licence 1.0 (free to use, embed and share) |

The ZIP that the Font Library gives for each font contains a `LICENSE.txt` note (name, copyright line, licence). PDFs made with the editor embed the font that was used; embedding in documents is allowed by these licences.

### Markdown and HTML converters

Files in `static/assets/vendor/marked-18.1.0` and `turndown-7.2.4` (browser builds, unchanged, with their licence files).

| Library | Used for | Licence |
|---|---|---|
| [marked](https://github.com/markedjs/marked) 18.1.0 | Markdown to HTML | MIT |
| [turndown](https://github.com/mixmark-io/turndown) 7.2.4 and [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) 1.0.2 | HTML to Markdown (tables, task lists, strikethrough) | MIT |
