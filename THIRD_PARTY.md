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
