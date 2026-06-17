// Report export helpers: turn tabular data into a downloadable CSV or PDF.
// Used by the BFF (server-side) to transform API data into a file response.

import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

// ---- CSV ---------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---- PDF ---------------------------------------------------------------

export interface PdfColumn {
  header: string;
  /** Relative width weight (columns share the usable width proportionally). */
  width: number;
  align?: "left" | "right";
}

export interface TablePdfOptions {
  title: string;
  subtitle?: string;
  /** Small grey metadata lines under the subtitle (filters, date, totals). */
  meta?: string[];
  columns: PdfColumn[];
  rows: (string | number)[][];
}

const PAGE = { w: 612, h: 792, margin: 48 };
const BRAND = rgb(0.31, 0.27, 0.9);
const GREY = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);
const ZEBRA = rgb(0.96, 0.97, 0.99);

function truncate(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

export async function tablePdf(opts: TablePdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setProducer("OpenReturn UI");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const usable = PAGE.w - PAGE.margin * 2;
  const totalWeight = opts.columns.reduce((a, c) => a + c.width, 0);
  const colW = opts.columns.map((c) => (c.width / totalWeight) * usable);
  const colX: number[] = [];
  let acc = PAGE.margin;
  for (const w of colW) {
    colX.push(acc);
    acc += w;
  }

  const fontSize = 9;
  const rowH = 18;
  let page!: PDFPage;
  let y = 0;
  let pageNum = 0;

  const cellText = (
    p: PDFPage,
    text: string,
    colIdx: number,
    yy: number,
    f: PDFFont,
    color = rgb(0.1, 0.1, 0.12),
  ) => {
    const pad = 4;
    const w = colW[colIdx] - pad * 2;
    const t = truncate(f, text, fontSize, w);
    const align = opts.columns[colIdx].align ?? "left";
    const x = align === "right"
      ? colX[colIdx] + colW[colIdx] - pad - f.widthOfTextAtSize(t, fontSize)
      : colX[colIdx] + pad;
    p.drawText(t, { x, y: yy, size: fontSize, font: f, color });
  };

  const drawHeader = () => {
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 4,
      width: usable,
      height: rowH,
      color: rgb(0.93, 0.94, 0.99),
    });
    opts.columns.forEach((c, i) =>
      cellText(page, c.header, i, y + 1, bold, BRAND)
    );
    y -= rowH;
    page.drawLine({
      start: { x: PAGE.margin, y: y + rowH - 4 },
      end: { x: PAGE.margin + usable, y: y + rowH - 4 },
      thickness: 0.5,
      color: LINE,
    });
  };

  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    pageNum += 1;
    y = PAGE.h - PAGE.margin;
    if (pageNum === 1) {
      page.drawText(opts.title, {
        x: PAGE.margin,
        y,
        size: 18,
        font: bold,
        color: BRAND,
      });
      y -= 22;
      if (opts.subtitle) {
        page.drawText(opts.subtitle, {
          x: PAGE.margin,
          y,
          size: 11,
          font,
          color: GREY,
        });
        y -= 16;
      }
      for (const m of opts.meta ?? []) {
        page.drawText(m, { x: PAGE.margin, y, size: 9, font, color: GREY });
        y -= 12;
      }
      y -= 10;
    }
    drawHeader();
  };

  newPage();

  opts.rows.forEach((row, idx) => {
    if (y < PAGE.margin + rowH) newPage();
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: PAGE.margin,
        y: y - 4,
        width: usable,
        height: rowH,
        color: ZEBRA,
      });
    }
    row.forEach((cell, i) =>
      cellText(page, String(cell ?? ""), i, y + 1, font)
    );
    y -= rowH;
  });

  // Page-number footers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE.w - PAGE.margin - 70,
      y: PAGE.margin - 24,
      size: 8,
      font,
      color: GREY,
    });
  });

  return await doc.save();
}

export function pdfResponse(filename: string, bytes: Uint8Array): Response {
  // Copy via the ArrayLike constructor to get a Uint8Array<ArrayBuffer>, which
  // the strict DOM BodyInit type accepts (the save() result is ArrayBufferLike).
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
