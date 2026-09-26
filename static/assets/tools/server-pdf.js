const PDF = '.pdf,application/pdf';

HT.register('image-to-pdf', root => HT.serverTool(root, {
  slug: 'image-to-pdf', accept: 'image/*,.heic,.heif,.avif', max: 100, reorder: true, action: 'Create PDF', compare: false,
  hint: 'Add images in any order, then reorder with the arrows',
  fields: [
    { name: 'page', label: 'Page size', type: 'select', options: [['a4', 'A4'], ['letter', 'US Letter'], ['a5', 'A5'], ['fit', 'Same as image']] },
    { name: 'orientation', label: 'Orientation', type: 'select', options: [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], showIf: v => v.page !== 'fit' },
    { name: 'margin', label: 'Margin (mm)', type: 'number', value: 10, min: 0, max: 50, showIf: v => v.page !== 'fit' },
  ],
}));

HT.register('pdf-to-image', root => HT.serverTool(root, {
  slug: 'pdf-to-image', accept: PDF, max: 1, action: 'Convert to images', compare: false, hint: 'Up to 200 MB',
  fields: [
    { name: 'format', label: 'Image format', type: 'select', options: [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']] },
    { name: 'dpi', label: 'Quality (DPI)', type: 'select', value: 150, options: [[72, '72 – small'], [150, '150 – good'], [200, '200 – sharp'], [300, '300 – print']] },
    { name: 'pages', label: 'Pages', type: 'text', value: 'all', placeholder: 'all, or 1-3,5', help: 'Use all, or ranges like 1-3,5,8-10' },
  ],
}));

HT.register('pdf-merge', root => HT.serverTool(root, {
  slug: 'pdf-merge', accept: PDF, max: 50, min: 2, reorder: true, action: files => 'Merge ' + files.length + ' PDFs', compare: false,
  hint: 'Add 2 or more PDFs, then set the order with the arrows',
}));

HT.register('pdf-split', root => HT.serverTool(root, {
  slug: 'pdf-split', accept: PDF, max: 1, action: 'Split PDF', compare: false,
  fields: [
    { name: 'mode', label: 'How to split', type: 'select', options: [['each', 'Every page into its own PDF'], ['every_n', 'Every N pages'], ['ranges', 'Custom ranges (one file each)'], ['extract', 'Extract selected pages into one PDF']] },
    { name: 'every', label: 'Pages per file', type: 'number', value: 2, min: 1, showIf: v => v.mode === 'every_n' },
    { name: 'pages', label: 'Pages', type: 'text', placeholder: '1-3, 4-6, 9', showIf: v => v.mode === 'ranges' || v.mode === 'extract', help: 'Ranges: 1-3,5,8-10. In "Custom ranges" each comma-separated part becomes its own file.' },
  ],
}));

HT.register('pdf-compress', root => HT.serverTool(root, {
  slug: 'pdf-compress', accept: PDF, max: 10, action: 'Compress PDF', compare: false, hint: 'Works best on PDFs with photos or scans',
  fields: [{ name: 'level', label: 'Compression', type: 'select', value: 'medium', options: [['low', 'Light (best quality)'], ['medium', 'Balanced'], ['high', 'Strong (smallest file)']] }],
}));

HT.register('docx-to-pdf', root => HT.serverTool(root, {
  slug: 'docx-to-pdf', accept: '.docx,.doc,.odt,.rtf,.txt,.pptx,.xlsx', max: 10, action: 'Convert to PDF', compare: false,
  hint: 'DOCX, DOC, ODT, RTF, TXT, PPTX, XLSX. Uses LibreOffice on the server.',
}));

HT.register('pdf-to-docx', root => HT.serverTool(root, {
  slug: 'pdf-to-docx', accept: PDF, max: 1, action: 'Convert to Word', compare: false,
  hint: 'Works best on text-based PDFs (not scans). Up to 50 MB.',
}));
