/**
 * Akasha Library — Format Export/Convert Layer
 *
 * Handles conversion between formats:
 * - MD → PDF (via html render + print)
 * - MD → XLSX (table extraction)
 * - Book → PDF (via html2canvas or print)
 * - Any text → MD
 *
 * Uses dynamic CDN imports to keep initial load light.
 */

let pdfLibLoaded = null;

async function loadPDFLib() {
  if (pdfLibLoaded) return pdfLibLoaded;
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  pdfLibLoaded = window.PDFLib;
  return pdfLibLoaded;
}

/**
 * Convert Markdown to a downloadable PDF via browser print
 * Opens a new window with rendered HTML, triggers print dialog
 */
export function mdToPDFPrint(markdownHtml, title = 'document') {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Noto Serif TC', Georgia, serif; font-size: 12pt; line-height: 1.8; padding: 2cm; color: #1a1a1a; }
  h1 { font-size: 22pt; margin: 0 0 16pt; }
  h2 { font-size: 18pt; margin: 24pt 0 12pt; border-bottom: 0.5pt solid #ccc; padding-bottom: 4pt; }
  h3 { font-size: 14pt; margin: 20pt 0 8pt; }
  p { margin: 0 0 10pt; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; font-size: 10pt; }
  th, td { border: 0.5pt solid #999; padding: 6pt 8pt; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; }
  code { font-family: Consolas, monospace; background: #f4f4f4; padding: 1pt 4pt; border-radius: 2pt; }
  pre { background: #f4f4f4; padding: 12pt; overflow: auto; border-radius: 4pt; font-size: 10pt; }
  ul, ol { padding-left: 1.4em; }
  @media print { body { padding: 0; } }
</style>
</head><body>${markdownHtml}</body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

/**
 * Extract tables from Markdown and convert to XLSX-compatible TSV
 * Returns a string that can be pasted into Excel/Sheets
 */
export function mdTablesToTSV(markdownText) {
  const lines = markdownText.split('\n');
  const tables = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      if (tableRows.length >= 2) {
        const isSeparator = (row) => {
          const cells = row.slice(1, -1).split('|');
          return cells.every(c => /^\s*:?-{3,}:?\s*$/.test(c));
        };
        if (isSeparator(tableRows[1])) {
          const dataRows = [tableRows[0], ...tableRows.slice(2)];
          const tsv = dataRows.map(row => {
            return row.slice(1, -1).split('|').map(c => c.trim()).join('\t');
          }).join('\n');
          tables.push(tsv);
        }
      }
    } else {
      i++;
    }
  }

  return tables.join('\n\n');
}

/**
 * Create a simple PDF from text content using pdf-lib
 */
export async function textToPDF(text, title = 'document') {
  const PDFLib = await loadPDFLib();
  const pdfDoc = await PDFLib.PDFDocument.create();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const fontSize = 11;
  const lineHeight = fontSize * 1.6;
  const maxWidth = pageWidth - margin * 2;

  const lines = text.split('\n');
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of lines) {
    if (y < margin + lineHeight) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    const textWidth = font.widthOfTextAtSize(line || ' ', fontSize);
    if (textWidth <= maxWidth) {
      page.drawText(line || ' ', { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    } else {
      // Simple word wrap
      const words = line.split(' ');
      let currentLine = '';
      for (const word of words) {
        const test = currentLine ? currentLine + ' ' + word : word;
        if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
          currentLine = test;
        } else {
          if (y < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          page.drawText(currentLine, { x: margin, y, size: fontSize, font });
          y -= lineHeight;
          currentLine = word;
        }
      }
      if (currentLine) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(currentLine, { x: margin, y, size: fontSize, font });
        y -= lineHeight;
      }
    }
  }

  const bytes = await pdfDoc.save();
  downloadBytes(bytes, `${title}.pdf`, 'application/pdf');
}

/**
 * Download helper
 */
export function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text, filename, mimeType = 'text/plain') {
  downloadBytes(new TextEncoder().encode(text), filename, mimeType);
}
