const IMG = 'image/*,.heic,.heif,.avif,.tif,.tiff';
const IMG_HINT = 'JPG, PNG, WebP, GIF, AVIF, HEIC... you can add several at once';

HT.register('compress-image', root => HT.serverTool(root, {
  slug: 'compress-image', accept: IMG, max: 40, action: files => 'Compress ' + files.length + ' image' + (files.length > 1 ? 's' : ''),
  hint: IMG_HINT,
  fields: [
    { name: 'quality', label: 'Quality', type: 'range', min: 10, max: 100, value: 75, unit: '%', help: 'Lower = smaller file. 70–80% is usually invisible.' },
    { name: 'format', label: 'Output format', type: 'select', options: [['same', 'Keep original format'], ['jpeg', 'JPG'], ['webp', 'WebP (small)'], ['avif', 'AVIF (smallest, slower)'], ['png', 'PNG']] },
    { name: 'max_width', label: 'Max width in px (optional)', type: 'number', min: 0, placeholder: 'e.g. 1920', help: 'Bigger images are scaled down to this width.' },
    { name: 'lossy_png', label: 'Reduce PNG colours (much smaller files)', type: 'checkbox', value: true, showIf: v => v.format === 'same' || v.format === 'png' },
  ],
}));

// ---- format pages of the compressor: same tool, one page (and URL) per format
const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
const MAXW = { name: 'max_width', label: 'Max width in px (optional)', type: 'number', min: 0, placeholder: 'e.g. 1920', help: 'Bigger images are scaled down to this width.' };
HT.register('compress-png', root => HT.serverTool(root, {
  slug: 'compress-image', accept: 'image/png,.png', max: 40, action: files => 'Compress ' + plural(files.length, 'PNG'),
  hint: 'PNG files only: transparency is kept. Add up to 40 at once.',
  fields: [
    { name: 'lossy_png', label: 'Reduce colours (much smaller, usually looks the same)', type: 'checkbox', value: true, showIf: v => v.format === 'same' },
    { name: 'format', label: 'Output', type: 'select', options: [['same', 'PNG (keep the format)'], ['webp', 'WebP (even smaller)']] },
    { name: 'quality', label: 'WebP quality', type: 'range', min: 10, max: 100, value: 80, unit: '%', showIf: v => v.format === 'webp' },
    MAXW,
  ],
}));
// /compress-jpg and /compress-jpeg (and the "under X KB" pages) use the target-size screen in compress-target.js
HT.register('compress-gif', root => HT.serverTool(root, {
  slug: 'compress-gif', accept: 'image/gif,.gif', max: 10, action: files => 'Compress ' + plural(files.length, 'GIF'),
  hint: 'Animated GIFs stay animated. Add up to 10 at once.',
  notice: 'The first GIF loads the video engine (31 MB, only the first time). After that it is fast.',
  fields: [
    { name: 'colors', label: 'Colours', type: 'select', value: '128', options: [['256', '256 (best quality)'], ['128', '128 (recommended)'], ['64', '64 (smaller)'], ['32', '32 (smallest)'], ['16', '16 (tiny, flat look)']], help: 'Fewer colours is the biggest saving with the least visible change.' },
    { name: 'width', label: 'Width', type: 'select', value: '0', options: [['0', 'Keep the original size'], ['640', 'Max 640 px'], ['480', 'Max 480 px'], ['320', 'Max 320 px'], ['240', 'Max 240 px']] },
    { name: 'fps', label: 'Frame rate', type: 'select', value: '0', options: [['0', 'Keep the original'], ['15', '15 frames/second'], ['10', '10 frames/second'], ['8', '8 frames/second']], help: 'A lower frame rate removes frames: smaller, but less smooth.' },
  ],
}));

HT.register('convert-image', root => HT.serverTool(root, {
  slug: 'convert-image', accept: IMG, max: 40, action: files => 'Convert ' + files.length + ' image' + (files.length > 1 ? 's' : ''),
  hint: IMG_HINT,
  fields: [
    { name: 'format', label: 'Convert to', type: 'select', value: 'webp', options: [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['gif', 'GIF'], ['bmp', 'BMP'], ['tiff', 'TIFF'], ['ico', 'ICO (icon)']] },
    { name: 'quality', label: 'Quality', type: 'range', min: 40, max: 100, value: 90, unit: '%', showIf: v => ['jpg', 'webp', 'avif'].includes(v.format) },
    { name: 'background', label: 'Background for transparent areas', type: 'color', value: '#ffffff', showIf: v => ['jpg', 'bmp'].includes(v.format), help: 'JPG and BMP cannot be transparent.' },
  ],
}));

HT.register('exif-remover', root => HT.serverTool(root, {
  slug: 'exif-remover', accept: IMG, max: 40, action: 'Remove metadata', compare: false,
  hint: 'JPEGs are cleaned without re-encoding, so quality is untouched',
  notice: 'Photos from phones often contain your exact GPS location, camera model and time. This removes all of it.',
  // show everything that is hidden in the photo(s) before it is removed
  onFiles: async (files, { empty }) => {
    const old = empty.querySelector('.exv-wrap'); if (old) old.remove(); if (!files.length) return;
    const wrap = HT.el('div', { class: 'exv-wrap' }); empty.append(wrap);
    await HT.loadScript('/assets/tools/exif-view.js');
    const show = async f => { wrap.querySelector('.exv') && wrap.querySelector('.exv').remove(); wrap.append(await HT.exifPanel(f)); };
    if (files.length > 1) wrap.append(HT.el('div', { class: 'field' }, HT.el('label', { class: 'lbl', text: 'See the hidden information of' }), HT.el('select', { 'aria-label': 'Photo', onchange: e => show(files[+e.target.value]) }, files.map((f, i) => HT.el('option', { value: i, text: f.name })))));
    await show(files[0]);
  },
}));

HT.register('image-to-svg', root => HT.serverTool(root, {
  slug: 'image-to-svg', accept: IMG, max: 20, action: 'Convert to SVG',
  hint: 'Works best on logos, icons and flat illustrations',
  fields: [{ name: 'preset', label: 'Type of image', type: 'select', options: [['logo', 'Logo / icon / illustration'], ['photo', 'Photo (more detail, bigger file)'], ['bw', 'Black & white line art']] }],
}));

HT.register('passport-size-photo-maker', root => HT.serverTool(root, {
  slug: 'passport-size-photo-maker', accept: 'image/*,.heic,.heif,.avif', max: 1, action: 'Make passport photo', compare: true,
  hint: 'Use a clear, front-facing photo with your whole head visible and even lighting',
  notice: 'The AI runs on your device, so your photo is never uploaded. The first use downloads the AI models once (about 26 MB).',
  fields: [
    { name: 'size', label: 'Photo size', type: 'select', options: [['35x45', '35 × 45 mm (used by many countries)'], ['51x51', '51 × 51 mm / 2 × 2 inch (US visa and others)'], ['33x48', '33 × 48 mm'], ['25x35', '25 × 35 mm (small ID)'], ['custom', 'Custom size...']] },
    { name: 'width_mm', label: 'Width (mm)', type: 'number', value: 35, min: 15, max: 100, showIf: v => v.size === 'custom' },
    { name: 'height_mm', label: 'Height (mm)', type: 'number', value: 45, min: 15, max: 130, showIf: v => v.size === 'custom' },
    { name: 'background', label: 'Background', type: 'select', options: [['white', 'White'], ['lightgray', 'Light grey'], ['blue', 'Blue'], ['red', 'Red'], ['custom', 'Custom colour...']] },
    { name: 'custom_color', label: 'Colour', type: 'color', value: '#ffffff', showIf: v => v.background === 'custom' },
    { name: 'head', label: 'Head size', type: 'select', options: [['auto', 'Standard'], ['smaller', 'A little smaller'], ['larger', 'A little larger']], help: 'Countries differ. Check the rules for your document.' },
    { name: 'sheet', label: 'Print sheet', type: 'select', options: [['4x6', '4 × 6 inch (photo lab)'], ['5x7', '5 × 7 inch'], ['a4', 'A4'], ['none', 'No sheet: only the single photo']] },
    { name: 'copies', label: 'Copies on the sheet', type: 'number', value: 0, min: 0, max: 60, showIf: v => v.sheet !== 'none', help: '0 = as many as fit.' },
  ],
}));
