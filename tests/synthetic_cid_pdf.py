"""Write a two-page fictional PDF with an unembedded standard CID font."""
import sys

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


if __name__ == '__main__':
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    pdf = canvas.Canvas(sys.stdout.buffer, invariant=True)
    pdf.setFont('Helvetica', 16)
    pdf.drawString(72, 760, 'Fictional career profile')
    pdf.setFont('STSong-Light', 16)
    pdf.drawString(72, 700, '你好世界，工作履历')
    pdf.showPage()
    pdf.drawString(72, 760, 'Fictional second page')
    pdf.save()
