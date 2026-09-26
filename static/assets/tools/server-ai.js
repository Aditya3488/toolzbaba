const IMG = 'image/*,.heic,.heif,.avif';
const NOTE = 'The first run downloads the AI model to the server (a few MB up to ~170 MB), so it can take a minute. After that it is fast.';

HT.register('remove-background', root => HT.serverTool(root, {
  slug: 'remove-background', accept: IMG, max: 10, action: 'Remove background', notice: NOTE, hint: 'Photos of people, products, animals, objects',
  fields: [
    { name: 'model', label: 'Model', type: 'select', options: [['general', 'Best quality (general)'], ['person', 'People / portraits'], ['anime', 'Anime / illustrations'], ['fast', 'Fast (lower quality)']] },
    { name: 'format', label: 'Output', type: 'select', options: [['png', 'PNG (transparent)'], ['webp', 'WebP (transparent, smaller)']] },
  ],
}));

HT.register('replace-background', root => HT.serverTool(root, {
  slug: 'replace-background', accept: IMG, max: 1, action: 'Replace background', notice: NOTE, hint: 'Add the photo whose background you want to change',
  fields: [
    { name: 'mode', label: 'New background', type: 'select', options: [['color', 'Solid colour'], ['gradient', 'Gradient'], ['blur', 'Blurred original'], ['image', 'Another photo'], ['transparent', 'Transparent']] },
    { name: 'color', label: 'Colour', type: 'color', value: '#4f46e5', showIf: v => v.mode === 'color' || v.mode === 'gradient' },
    { name: 'color2', label: 'Second colour', type: 'color', value: '#ec4899', showIf: v => v.mode === 'gradient' },
    { name: 'blur', label: 'Blur amount', type: 'range', min: 4, max: 60, value: 20, showIf: v => v.mode === 'blur' },
    { name: 'model', label: 'Cut-out model', type: 'select', options: [['general', 'Best quality'], ['person', 'People / portraits'], ['fast', 'Fast']] },
  ],
  extraFile: { label: 'Background photo', showIf: v => v.mode === 'image' },
}));

HT.register('upscale-image', root => HT.serverTool(root, {
  slug: 'upscale-image', accept: IMG, max: 5, action: 'Upscale', notice: NOTE,
  hint: 'AI mode handles images up to ~2.5 megapixels. Great for small or blurry pictures.',
  fields: [
    { name: 'scale', label: 'Enlarge', type: 'select', options: [[2, '2×'], [3, '3×'], [4, '4×']] },
    { name: 'engine', label: 'Mode', type: 'select', options: [['ai', 'AI (sharp details)'], ['fast', 'Fast (simple resize + sharpen, any size)']] },
  ],
}));

HT.register('face-blur', root => HT.serverTool(root, {
  slug: 'face-blur', accept: IMG, max: 20, action: 'Blur faces', hint: 'Faces are found automatically',
  fields: [
    { name: 'style', label: 'Style', type: 'select', options: [['blur', 'Blur'], ['pixelate', 'Pixelate'], ['black', 'Black cover']] },
    { name: 'strength', label: 'Strength', type: 'range', min: 10, max: 100, value: 70, unit: '%', showIf: v => v.style !== 'black' },
    { name: 'padding', label: 'Extra area around face', type: 'range', min: 0, max: 60, value: 20, unit: '%' },
    { name: 'sensitivity', label: 'Detection', type: 'select', options: [[0.6, 'Normal'], [0.4, 'High (finds smaller / turned faces)'], [0.25, 'Very high (may catch non-faces)']] },
  ],
}));

HT.register('anime-style', root => HT.serverTool(root, {
  slug: 'anime-style', accept: IMG, max: 10, action: 'Turn into anime', notice: NOTE, hint: 'Portraits and scenery both work',
  fields: [{ name: 'style', label: 'Style', type: 'select', options: [['hayao', 'Hayao (soft, painterly)'], ['shinkai', 'Shinkai (vivid, cinematic)']] }],
}));
