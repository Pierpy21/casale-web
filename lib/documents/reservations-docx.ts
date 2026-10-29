import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableBordersOptions,
} from "docx";
import { buildReservationSheetView, type ReservationSheetView } from "@/lib/documents/reservations-view";
import type { ReservationSheet } from "@/lib/types";

// Foglio prenotazioni del giorno in DOCX: stessa impostazione del preventivo DOCX (lib/documents/quote-docx.ts).

const COLOR = {
  ink: "1C2B2D",
  petrol: "355A63",
  slate: "5A6668",
  bronze: "8B6B4A",
  line: "D5D5B7",
} as const;

const FONT = { sans: "Arial", serif: "Times New Roman" } as const;

// A4 in twip (1 pt = 20 twip). Margini 40 pt = 800 twip, come nel PDF.
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 800;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 10306

/** Larghezze colonne (twip): Nome | Sala | Tavolo | Orario | Cellulare. */
const COL_WIDTHS = [3706, 2200, 1300, 1300, 1800];

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS: ITableBordersOptions = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};
const THIN_LINE = { style: BorderStyle.SINGLE, size: 4, color: COLOR.line } as const;
const INK_LINE = { style: BorderStyle.SINGLE, size: 8, color: COLOR.ink } as const;

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

let logoCache: Promise<Buffer> | null = null;

function loadLogo(): Promise<Buffer> {
  if (!logoCache) {
    logoCache = readFile(path.join(process.cwd(), "public", "logo-dark.png"));
  }
  return logoCache;
}

function text(
  value: string,
  opts: { size?: number; bold?: boolean; italics?: boolean; color?: string; font?: string; caps?: boolean; spacing?: number } = {},
): TextRun {
  return new TextRun({
    text: value,
    size: (opts.size ?? 19) * 2, // docx usa mezzi-punti
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? COLOR.ink,
    font: opts.font ?? FONT.sans,
    allCaps: opts.caps,
    characterSpacing: opts.spacing,
  });
}

function para(
  children: TextRun[] | ImageRun[],
  opts: { align?: Align; before?: number; after?: number; keepNext?: boolean } = {},
): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    keepNext: opts.keepNext,
  });
}

function headerCell(label: string, align: Align, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: INK_LINE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [para([text(label, { size: 8, bold: true, caps: true, spacing: 20 })], { align, after: 0 })],
  });
}

function bodyCell(value: string, align: Align, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: THIN_LINE },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [para([text(value, { size: 9.5 })], { align, after: 0 })],
  });
}

/** Renderizza il foglio prenotazioni del giorno in un file DOCX (Buffer). */
export async function renderReservationsDocx(sheet: ReservationSheet): Promise<Buffer> {
  const logo = await loadLogo();
  return renderSheetView(buildReservationSheetView(sheet), logo);
}

async function renderSheetView(view: ReservationSheetView, logo: Buffer): Promise<Buffer> {
  // Intestazione: dati del Casale a sinistra, logo a destra (come il preventivo).
  const headerLeftWidth = 6306;
  const headerRightWidth = CONTENT_WIDTH - headerLeftWidth;
  const header = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [headerLeftWidth, headerRightWidth],
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: headerLeftWidth, type: WidthType.DXA },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              para([text("Casale del Notaio", { size: 20, font: FONT.serif })], { after: 60 }),
              para([text("Del gusto il Teatro.", { size: 9.5, italics: true, color: COLOR.petrol, font: FONT.serif })], { after: 120 }),
              para([text("Via Nicolosi 67, 95032 Belpasso (CT)", { size: 8.5, color: COLOR.slate })], { after: 10 }),
              para([text("+39 340 109 0100 · info@casaledelnotaio.it", { size: 8.5, color: COLOR.slate })], { after: 0 }),
            ],
          }),
          new TableCell({
            width: { size: headerRightWidth, type: WidthType.DXA },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              para(
                [
                  new ImageRun({
                    type: "png",
                    data: logo,
                    transformation: { width: 200, height: 67 },
                    altText: { name: "Logo Casale del Notaio", title: "Casale del Notaio", description: "Logo del Casale del Notaio" },
                  }),
                ],
                { align: AlignmentType.RIGHT, after: 0 },
              ),
            ],
          }),
        ],
      }),
    ],
  });

  // Titolo, data e totale
  const titleBlock = [
    para([text(view.title, { size: 22, font: FONT.serif })], { before: 280, after: 60 }),
    para([text(view.dateLong, { size: 13, italics: true, color: COLOR.petrol, font: FONT.serif })], { after: 60 }),
    para([text(view.countLabel, { size: 9, color: COLOR.slate })], { after: 240 }),
  ];

  const linesTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Nome", AlignmentType.LEFT, COL_WIDTHS[0]),
          headerCell("Sala", AlignmentType.LEFT, COL_WIDTHS[1]),
          headerCell("Tavolo", AlignmentType.CENTER, COL_WIDTHS[2]),
          headerCell("Orario", AlignmentType.CENTER, COL_WIDTHS[3]),
          headerCell("Cellulare", AlignmentType.LEFT, COL_WIDTHS[4]),
        ],
      }),
      ...view.rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: [
              bodyCell(row.name, AlignmentType.LEFT, COL_WIDTHS[0]),
              bodyCell(row.room, AlignmentType.LEFT, COL_WIDTHS[1]),
              bodyCell(row.table, AlignmentType.CENTER, COL_WIDTHS[2]),
              bodyCell(row.time, AlignmentType.CENTER, COL_WIDTHS[3]),
              bodyCell(row.phone, AlignmentType.LEFT, COL_WIDTHS[4]),
            ],
          }),
      ),
    ],
  });

  const footer = new Footer({
    children: [
      para(
        [
          text("Casale del Notaio · Via Nicolosi 67, Belpasso (CT)   |   Pagina ", { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: COLOR.slate, font: FONT.sans }),
          text(" di ", { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: COLOR.slate, font: FONT.sans }),
        ],
        { align: AlignmentType.CENTER, after: 0 },
      ),
    ],
  });

  const doc = new Document({
    creator: "Casale del Notaio",
    title: `${view.title} ${view.dateLong}`,
    styles: {
      default: {
        document: { run: { font: FONT.sans, size: 19, color: COLOR.ink } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, footer: 400 },
          },
        },
        footers: { default: footer },
        children: [
          header,
          para([], { after: 120 }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.line, space: 1 } },
            children: [],
            spacing: { after: 120 },
          }),
          ...titleBlock,
          ...(view.rows.length === 0
            ? [para([text("Nessuna prenotazione", { size: 9.5, italics: true, color: COLOR.slate, font: FONT.serif })], { before: 120 })]
            : [linesTable]),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
