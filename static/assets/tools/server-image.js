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
}));

HT.register('image-to-svg', root => HT.serverTool(root, {
  slug: 'image-to-svg', accept: IMG, max: 20, action: 'Convert to SVG',
  hint: 'Works best on logos, icons and flat illustrations',
  fields: [{ name: 'preset', label: 'Type of image', type: 'select', options: [['logo', 'Logo / icon / illustration'], ['photo', 'Photo (more detail, bigger file)'], ['bw', 'Black & white line art']] }],
}));

HT.register('passport-photo-maker', root => HT.serverTool(root, {
  slug: 'passport-photo-maker', accept: 'image/*,.heic,.heif,.avif', max: 1, action: 'Make passport photo', compare: true,
  hint: 'Use a clear, front-facing photo with your whole head visible and even lighting',
  notice: 'The first run downloads the AI models to the server, so it can take a minute. After that it is fast.',
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
