// Font Converter: TTF, OTF, WOFF, WOFF2, TTC, EOT, SVG fonts, DFONT and Type 1 (PFB) in, every web and desktop format out.
// The work is done by Python's fontTools in a worker (/assets/engine/font.js), on the visitor's device.
HT.register('font-converter', root => HT.serverTool(root, {
  slug: 'font-converter', accept: '.ttf,.otf,.woff,.woff2,.ttc,.otc,.eot,.dfont,.suit,.pfb,.pfa,.svg,font/ttf,font/otf,font/woff,font/woff2,font/collection', max: 20, action: 'Convert', compare: false,
  hint: 'TTF, OTF, WOFF, WOFF2, TTC, EOT, DFONT, SVG fonts and Type 1 (PFB). Converted in your browser: nothing is uploaded.',
  notice: 'The first conversion downloads the font engine once (about 15 MB); after that it starts straight away.',
  fields: [
    { name: 'format', label: 'Convert to', type: 'select', value: 'woff2', options: [['woff2', 'WOFF2 (websites)'], ['woff', 'WOFF (older browsers)'], ['ttf', 'TTF (TrueType)'], ['otf', 'OTF (OpenType CFF)'], ['ttc', 'TTC (font collection)'], ['eot', 'EOT (old Internet Explorer)'], ['svg', 'SVG font'], ['dfont', 'DFONT (Mac)']] },
  ],
}));
