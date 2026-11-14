import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { buildEventSheetView, type EventBlockView, type EventFieldView, type EventSheetView } from "@/lib/documents/events-view";
import { SHEET_FOOTER } from "@/lib/documents/reservations-view";
import type { EventSheet } from "@/lib/types";

// Foglio eventi del giorno in DOCX: stessa impostazione del foglio prenotazioni (reservations-docx.ts).
// Nessuna intestazione del Casale: si apre con il titolo del foglio e la data.
// Per ogni banchetto: titolo (pasto, nome, coperti) e una tabella etichetta | valore.

const COLOR = {
  ink: "1C2B2D",
  petrol: "355A63",
  slate: "5A6668",
  bronze: "8B6B4A",
  line: "D5D5B7",
  danger: "9B3B32",
} as const;

const FONT = { sans: "Arial", serif: "Times New Roman" } as const;

// A4 in twip (1 pt = 20 twip). Margini 40 pt = 800 twip, come nel PDF.
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 800;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 10306

/** Larghezze colonne della tabella etichetta | valore (twip). */
const LABEL_WIDTH = 2400;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const THIN_LINE = { style: BorderStyle.SINGLE, size: 4, color: COLOR.line } as const;

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

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
  children: TextRun[],
  opts: { align?: Align; before?: number; after?: number; keepNext?: boolean } = {},
): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    keepNext: opts.keepNext,
  });
}

/** Riga di valori (più righe nella stessa cella: una per paragrafo). `tag` in rosso dopo la prima riga. */
function valueParagraphs(lines: string[], size = 9.5, tag?: string): Paragraph[] {
  return lines.map((line, i) =>
    para(
      [
        text(line, { size }),
        ...(i === 0 && tag ? [text(`   ${tag}`, { size: 7.5, bold: true, color: COLOR.danger, spacing: 6 })] : []),
      ],
      { after: i === lines.length - 1 ? 0 : 40 },
    ),
  );
}

function summaryTable(fields: EventFieldView[]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH, VALUE_WIDTH],
    rows: fields.map(
      (field) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: LABEL_WIDTH, type: WidthType.DXA },
              borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: THIN_LINE },
              margins: { top: 60, bottom: 60, left: 80, right: 120 },
              children: [para([text(field.label, { size: 8, bold: true, caps: true, color: COLOR.bronze, spacing: 10 })], { after: 0 })],
            }),
            new TableCell({
              width: { size: VALUE_WIDTH, type: WidthType.DXA },
              borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: THIN_LINE },
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              verticalAlign: VerticalAlign.CENTER,
              children: valueParagraphs(field.lines, 9.5, field.tag),
            }),
          ],
        }),
    ),
  });
}

/** Intestazione del banchetto: pasto, nome (serif) e coperti sulla stessa riga. */
function blockHeading(block: EventBlockView): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 280, after: 100 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: COLOR.ink, space: 6 } },
    children: [
      text(`${block.meal}  `, { size: 11, bold: true, color: COLOR.petrol }),
      text(block.heading, { size: 14, font: FONT.serif }),
      text(`   ${block.covers}`, { size: 9, color: COLOR.slate }),
    ],
  });
}

/** Renderizza il foglio eventi del giorno in un file DOCX (Buffer). */
export async function renderEventsDocx(sheet: EventSheet): Promise<Buffer> {
  return renderEventSheetView(buildEventSheetView(sheet));
}

async function renderEventSheetView(view: EventSheetView): Promise<Buffer> {
  // Titolo, data e conteggio (in cima al foglio, senza intestazione del Casale)
  const titleBlock = [
    para([text(view.title, { size: 22, font: FONT.serif })], { after: 60 }),
    para([text(view.dateLong, { size: 13, italics: true, color: COLOR.petrol, font: FONT.serif })], { after: 60 }),
    para([text(view.countLabel, { size: 9, color: COLOR.slate })], { after: 240 }),
  ];

  const summaryHeading = para([text("Riepilogo della giornata", { size: 8, bold: true, caps: true, spacing: 20 })], { after: 80, keepNext: true });

  const footer = new Footer({
    children: [
      para(
        [
          text(`${SHEET_FOOTER}   |   Pagina `, { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: COLOR.slate, font: FONT.sans }),
          text(" di ", { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: COLOR.slate, font: FONT.sans }),
        ],
        { align: AlignmentType.CENTER, after: 0 },
      ),
    ],
  });

  const body = [
    summaryHeading,
    summaryTable(view.summary),
    ...(view.blocks.length === 0
      ? [para([text("Nessun evento", { size: 9.5, italics: true, color: COLOR.slate, font: FONT.serif })], { before: 240 })]
      : view.blocks.flatMap((block) => [blockHeading(block), summaryTable(block.fields)])),
  ];

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
        children: [...titleBlock, ...body],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
