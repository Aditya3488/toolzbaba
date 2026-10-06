const IMG = 'image/*,.heic,.heif,.avif';
const NOTE = 'The AI runs on your device, so your photos are never uploaded. The first use downloads the AI model once (5 to 46 MB); after that it starts quickly.';

HT.register('remove-background', root => HT.serverTool(root, {
  slug: 'remove-background', accept: IMG, max: 10, action: 'Remove background', notice: NOTE, hint: 'Photos of people, products, animals, objects',
  fields: [
    { name: 'model', label: 'Model', type: 'select', options: [['general', 'Best quality (general, 46 MB)'], ['person', 'People / portraits (26 MB)'], ['fast', 'Fast (5 MB, lower quality)']] },
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
    { name: 'model', label: 'Cut-out model', type: 'select', options: [['general', 'Best quality (46 MB)'], ['person', 'People / portraits (26 MB)'], ['fast', 'Fast (5 MB)']] },
  ],
  extraFile: { label: 'Background photo', showIf: v => v.mode === 'image' },
}));

HT.register('upscale-image', root => HT.serverTool(root, {
  slug: 'upscale-image', accept: IMG, max: 5, action: 'Upscale', notice: NOTE,
  hint: 'AI mode handles images up to about 1.5 megapixels and takes a little while on phones. Great for small or blurry pictures.',
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

HT.register('ai-headshot-generator', root => HT.serverTool(root, {
  slug: 'ai-headshot-generator', accept: IMG, max: 1, action: 'Make my headshot', notice: NOTE, hint: 'A clear photo of yourself with your whole head visible, facing the camera',
  fields: [
    { name: 'background', label: 'Background', type: 'select', value: 'studio', options: [['studio', 'Studio grey'], ['warm', 'Warm beige'], ['blue', 'Soft blue'], ['dark', 'Dark'], ['white', 'White'], ['blur', 'Blurred original'], ['custom', 'Custom colour...']] },
    { name: 'custom_color', label: 'Colour', type: 'color', value: '#dfe6f3', showIf: v => v.background === 'custom' },
    { name: 'shape', label: 'Shape', type: 'select', value: 'square', options: [['square', 'Square (LinkedIn, most profile pictures)'], ['portrait', 'Portrait 4:5']] },
    { name: 'framing', label: 'How close', type: 'select', value: 'standard', options: [['standard', 'Head and shoulders'], ['tight', 'Close up'], ['wide', 'Wider (more shoulders)']] },
    { name: 'size', label: 'Size', type: 'select', value: '1200', options: [['1200', '1200 px (best quality)'], ['800', '800 px'], ['400', '400 px (small upload limits)']] },
    { name: 'touchup', label: 'Light touch-up (a little brighter, more contrast)', type: 'checkbox', value: true },
  ],
}));
