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
