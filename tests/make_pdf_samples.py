"""Makes PDFs that look like real documents (headings, paragraphs, bullet lists, a table, two columns, embedded and standard fonts)
for the PDF editor tests:   python tests/make_pdf_samples.py   ->  tests/samples/doc_*.pdf   (needs: pip install reportlab)"""
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, ListFlowable, ListItem, Frame, PageTemplate, BaseDocTemplate, FrameBreak

OUT = os.path.join(os.path.dirname(__file__), 'samples')
LOREM = ('Toolz Baba is a free set of everyday file tools that run right in your browser, so your files stay on your own device. '
         'You can compress images, merge and split PDF files, convert video and much more without creating an account. '
         'This paragraph is long enough to wrap onto several lines, which is exactly what a real document looks like.')

def letter(path, font, bold):
    ss = getSampleStyleSheet()
    h = ParagraphStyle('h', parent=ss['Heading1'], fontName=bold, fontSize=22, textColor=colors.HexColor('#0a4ff5'), spaceAfter=10)
    h2 = ParagraphStyle('h2', parent=ss['Heading2'], fontName=bold, fontSize=14, spaceBefore=12, spaceAfter=4)
    p = ParagraphStyle('p', parent=ss['BodyText'], fontName=font, fontSize=11, leading=15)
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    t = Table([['Item', 'Qty', 'Price'], ['Compress Image', '3', '0.00'], ['Merge PDF', '12', '0.00'], ['Video Converter', '1', '0.00']], colWidths=[80 * mm, 30 * mm, 30 * mm])
    t.setStyle(TableStyle([('FONTNAME', (0, 0), (-1, 0), bold), ('FONTNAME', (0, 1), (-1, -1), font), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8efff')), ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)]))
    story = [Paragraph('Quarterly Report 2026', h), Paragraph('Prepared by Toolz Baba for the product team', p), Spacer(1, 8), Paragraph('Summary', h2), Paragraph(LOREM, p), Paragraph('Highlights', h2),
             ListFlowable([ListItem(Paragraph(x, p)) for x in ['Faster tools on every page', 'A new PDF editor with a font library', 'An admin panel to archive tools']], bulletType='bullet', bulletFontName=font),
             Paragraph('Numbers', h2), t, Spacer(1, 10), Paragraph('Contact: hello@example.com, phone +91 98765 43210, page 1 of 2.', p), Paragraph(LOREM, p)]
    doc.build(story)

def columns(path):
    ss = getSampleStyleSheet(); p = ParagraphStyle('p', parent=ss['BodyText'], fontName='Helvetica', fontSize=10, leading=13)
    h = ParagraphStyle('h', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=14)
    doc = BaseDocTemplate(path, pagesize=A4); w, hgt = A4
    doc.addPageTemplates([PageTemplate(id='two', frames=[Frame(20 * mm, 20 * mm, (w - 50 * mm) / 2, hgt - 40 * mm, id='l'), Frame(30 * mm + (w - 50 * mm) / 2, 20 * mm, (w - 50 * mm) / 2, hgt - 40 * mm, id='r')])])
    doc.build([Paragraph('Left column heading', h), Paragraph(LOREM, p), FrameBreak(), Paragraph('Right column heading', h), Paragraph(LOREM, p)])

if __name__ == '__main__':
    pdfmetrics.registerFont(TTFont('ArialEmb', 'C:/Windows/Fonts/arial.ttf')); pdfmetrics.registerFont(TTFont('ArialEmbBold', 'C:/Windows/Fonts/arialbd.ttf'))
    letter(os.path.join(OUT, 'doc_standard.pdf'), 'Helvetica', 'Helvetica-Bold')    # the 14 standard fonts (not embedded)
    letter(os.path.join(OUT, 'doc_embedded.pdf'), 'ArialEmb', 'ArialEmbBold')       # a TrueType font embedded as a subset, like Word makes
    columns(os.path.join(OUT, 'doc_columns.pdf'))
    try:   # a scan: the page of doc_standard as a picture only (no text), like a photocopier makes it (needs: pip install pymupdf)
        import pymupdf
        src = pymupdf.open(os.path.join(OUT, 'doc_standard.pdf')); pix = src[0].get_pixmap(dpi=150); scan = pymupdf.open(); pg = scan.new_page(width=595.28, height=841.89)
        pg.insert_image(pg.rect, stream=pix.tobytes('jpg')); scan.save(os.path.join(OUT, 'doc_scan.pdf')); print('made doc_scan.pdf')
    except ImportError:
        print('pymupdf not installed: doc_scan.pdf not made')
    print('made doc_standard.pdf, doc_embedded.pdf, doc_columns.pdf in', OUT)
