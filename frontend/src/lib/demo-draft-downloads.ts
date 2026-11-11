const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 48;
const fontSize = 11;
const leading = 15;
const contentWidth = pageWidth - 2 * margin;

function wrapLine(text: string, measure: (text: string) => number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= contentWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    if (measure(word) <= contentWidth) {
      line = word;
      continue;
    }
    for (const character of word) {
      if (line && measure(line + character) > contentWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  return [...lines, line];
}

export async function demoWordDocument(text: string) {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const document = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 950, bottom: 950, left: 950, right: 950 } },
        },
        children: text.split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, size: 22 })],
              spacing: { after: 65 },
            }),
        ),
      },
    ],
  });
  return Packer.toBlob(document);
}

export async function demoPdfDocument(text: string) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const characters = new Set(font.getCharacterSet());
  const encodable = (line: string) =>
    [...line].every((character) => characters.has(character.codePointAt(0)!));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "PDF export is unavailable in this browser. Download Word instead.",
    );
  const systemFont = `${fontSize}px system-ui, sans-serif`;
  const width = (line: string) => {
    if (encodable(line)) return font.widthOfTextAtSize(line, fontSize);
    context.font = systemFont;
    return context.measureText(line).width;
  };
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin - fontSize;
  for (const line of text
    .normalize("NFC")
    .replace(/\n(?:[ \t]*\n){2,}/g, "\n\n")
    .split("\n")
    .flatMap((line) => wrapLine(line, width))) {
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin - fontSize;
    }
    if (line && encodable(line)) {
      page.drawText(line, { x: margin, y, size: fontSize, font });
    } else if (line) {
      // Use the browser's installed fonts for text outside the PDF font's
      // character set. Only these lines require an image fallback.
      const scale = 3;
      const imageWidth = Math.min(contentWidth, Math.ceil(width(line) + 2));
      canvas.width = Math.ceil(imageWidth * scale);
      canvas.height = leading * scale;
      context.scale(scale, scale);
      context.font = systemFont;
      context.fillText(line, 0, fontSize, imageWidth);
      const image = await pdf.embedPng(canvas.toDataURL("image/png"));
      page.drawImage(image, {
        x: margin,
        y: y - (leading - fontSize),
        width: imageWidth,
        height: leading,
      });
    }
    y -= leading;
  }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
