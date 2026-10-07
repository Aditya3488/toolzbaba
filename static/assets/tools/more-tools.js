// Screens of the newer tools: PDF to Excel / PowerPoint / text, PowerPoint to PDF, crop, repair, compare and flatten PDF
// (engine/pdf-more.js), and the Audio Converter (engine/video.js).
const PDF = '.pdf,application/pdf';
const PAGES = { name: 'pages', label: 'Pages', type: 'text', value: 'all', placeholder: 'all, or 1-3,5', help: 'all, or ranges like 1-3,5,8-' };

HT.register('pdf-to-excel', root => HT.serverTool(root, {
  slug: 'pdf-to-excel', accept: PDF, max: 1, action: 'Convert to Excel', compare: false,
  hint: 'Works best on PDFs with real text and clear table columns (not scans). Up to 300 pages.',
  fields: [
    { name: 'layout', label: 'Sheets', type: 'select', options: [['pages', 'One sheet per page'], ['one', 'All pages on one sheet']] },
    { name: 'numbers', label: 'Turn numbers into real numbers (for sums and formulas)', type: 'checkbox', value: true },
    PAGES,
  ],
}));

HT.register('pdf-to-powerpoint', root => HT.serverTool(root, {
  slug: 'pdf-to-powerpoint', accept: PDF, max: 1, action: 'Convert to PowerPoint', compare: false,
  hint: 'Every page becomes a slide. Up to 300 pages.',
  fields: [{ name: 'dpi', label: 'Picture quality', type: 'select', value: 150, options: [[110, 'Smaller file'], [150, 'Good (recommended)'], [200, 'Sharp (bigger file)']] }],
}));

HT.register('powerpoint-to-pdf', root => HT.serverTool(root, {
  slug: 'powerpoint-to-pdf', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', max: 10, action: files => 'Convert ' + (files.length > 1 ? files.length + ' presentations' : 'to PDF'), compare: false,
  hint: 'PowerPoint (PPTX) files. Old .ppt files: save them as PPTX first. Converted on your device.',
}));

HT.register('pdf-to-text', root => HT.serverTool(root, {
  slug: 'pdf-to-text', accept: PDF, max: 1, action: 'Get the text', compare: false, hint: 'For scanned PDFs use OCR PDF instead.',
  fields: [{ name: 'markers', label: 'Mark where each page starts', type: 'checkbox', value: true }, PAGES],
}));

HT.register('crop-pdf', root => HT.serverTool(root, {
  slug: 'crop-pdf', accept: PDF, max: 1, action: 'Crop PDF', compare: false, hint: 'Up to 200 MB',
  fields: [
    { name: 'mode', label: 'How to crop', type: 'select', options: [['auto', 'Automatically: cut the white margins away'], ['margins', 'By margins I choose']] },
    { name: 'padding', label: 'Space to keep around the content (mm)', type: 'number', value: 3, min: 0, max: 30, showIf: v => v.mode === 'auto' },
    { name: 'top', label: 'Top (mm)', type: 'number', value: 10, min: 0, showIf: v => v.mode === 'margins' },
    { name: 'bottom', label: 'Bottom (mm)', type: 'number', value: 10, min: 0, showIf: v => v.mode === 'margins' },
    { name: 'left', label: 'Left (mm)', type: 'number', value: 10, min: 0, showIf: v => v.mode === 'margins' },
    { name: 'right', label: 'Right (mm)', type: 'number', value: 10, min: 0, showIf: v => v.mode === 'margins' },
    PAGES,
  ],
}));

HT.register('repair-pdf', root => HT.serverTool(root, {
  slug: 'repair-pdf', accept: PDF, max: 1, action: 'Repair PDF', compare: false,
  hint: 'For PDFs that won\'t open, show errors or open with missing pages.',
}));

HT.register('flatten-pdf', root => HT.serverTool(root, {
  slug: 'flatten-pdf', accept: PDF, max: 1, action: 'Flatten PDF', compare: false, hint: 'Up to 200 MB',
  fields: [
    { name: 'mode', label: 'Flatten', type: 'select', options: [['forms', 'Form fields and comments (text stays sharp and searchable)'], ['image', 'Everything into pictures (nothing can be edited or copied)']] },
    { name: 'annots', label: 'Also flatten comments, highlights and stamps', type: 'checkbox', value: true, showIf: v => v.mode === 'forms' },
    { name: 'dpi', label: 'Picture quality', type: 'select', value: 150, options: [[110, 'Smaller file'], [150, 'Good'], [220, 'Sharp']], showIf: v => v.mode === 'image' },
  ],
}));

HT.register('compare-pdf', root => HT.serverTool(root, {
  slug: 'compare-pdf', accept: PDF, max: 2, min: 2, reorder: true, action: 'Compare PDFs', compare: false,
  hint: 'Add 2 PDFs: the old version first, then the new one (use the arrows to swap).',
}));

HT.register('audio-converter', root => HT.serverTool(root, {
  slug: 'audio-converter', accept: 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma,.amr,.aiff,.aif,video/*,.mkv,.mov,.avi,.webm', max: 20,
  action: files => 'Convert ' + files.length + ' file' + (files.length > 1 ? 's' : ''), compare: false,
  hint: 'MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, WMA, AMR and the sound of videos. Converted on your device.',
  fields: [
    { name: 'format', label: 'Convert to', type: 'select', options: [['mp3', 'MP3 (plays everywhere)'], ['m4a', 'M4A / AAC (iPhone, small)'], ['wav', 'WAV (uncompressed)'], ['flac', 'FLAC (lossless, smaller than WAV)'], ['ogg', 'OGG (Opus)']] },
    { name: 'bitrate', label: 'Quality', type: 'select', value: '192', options: [['96', '96 kbps (voice, small)'], ['128', '128 kbps'], ['192', '192 kbps (recommended)'], ['256', '256 kbps'], ['320', '320 kbps (best)']], showIf: v => ['mp3', 'm4a', 'ogg'].includes(v.format) },
  ],
}));
