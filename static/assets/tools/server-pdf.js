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

// ---------------------------------------------------------------- page numbers / protect / unlock
HT.register('pdf-page-numbers', root => HT.serverTool(root, {
  slug: 'pdf-page-numbers', accept: PDF, max: 1, action: 'Add page numbers', compare: false, hint: 'Up to 200 MB',
  fields: [
    { name: 'position', label: 'Position', type: 'select', value: 'bc', options: [['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']] },
    { name: 'format', label: 'Format', type: 'select', options: [['n', '1, 2, 3'], ['page_n', 'Page 1, Page 2'], ['page_n_of_total', 'Page 1 of 10'], ['n_of_total', '1 / 10'], ['dash', '- 1 -']] },
    { name: 'start', label: 'First number', type: 'number', value: 1, min: 0 },
    { name: 'first_page', label: 'Start numbering on page', type: 'number', value: 1, min: 1, help: 'Use 2 to leave a cover page without a number.' },
    { name: 'font_size', label: 'Font size', type: 'range', min: 7, max: 30, value: 11, unit: 'pt' },
    { name: 'margin', label: 'Distance from the edge (mm)', type: 'number', value: 12, min: 4, max: 60 },
    { name: 'color', label: 'Colour', type: 'color', value: '#333333' },
  ],
}));

const showPasswords = (form, names) => {
  const box = HT.el('label', { class: 'chk', style: { marginTop: '4px' } }, HT.el('input', { type: 'checkbox', onchange: e => names.forEach(n => (form.ctl[n].type = e.target.checked ? 'text' : 'password')) }), 'Show password');
  form.el.append(HT.el('div', { class: 'field' }, box));
};

HT.register('protect-pdf', root => HT.serverTool(root, {
  slug: 'protect-pdf', accept: PDF, max: 1, action: 'Protect PDF', compare: false, hint: 'Up to 200 MB',
  notice: 'Keep your password safe: nobody, including this site, can recover it.',
  fields: [
    { name: 'password', label: 'Password', type: 'password', placeholder: 'at least 4 characters' },
    { name: 'password2', label: 'Repeat password', type: 'password' },
    { name: 'allow_print', label: 'Allow printing', type: 'checkbox', value: true },
    { name: 'allow_copy', label: 'Allow copying text', type: 'checkbox' },
    { name: 'allow_edit', label: 'Allow editing and filling forms', type: 'checkbox' },
  ],
  buildOptions: v => { if (v.password !== v.password2) throw new Error('The two passwords are not the same.'); const { password2, ...rest } = v; return rest; },
  onReady: ({ form }) => showPasswords(form, ['password', 'password2']),
}));

HT.register('unlock-pdf', root => HT.serverTool(root, {
  slug: 'unlock-pdf', accept: PDF, max: 1, action: 'Remove password', compare: false, hint: 'Up to 200 MB',
  notice: 'You need to know the password. This tool does not crack passwords.',
  fields: [{ name: 'password', label: 'PDF password', type: 'password' }],
  onReady: ({ form }) => showPasswords(form, ['password']),
}));
