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
  type ParagraphChild,
} from "docx";
import type { QuoteDocumentMenu, QuoteDocumentModel } from "@/lib/documents/quote-model";

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
  children: ParagraphChild[],
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean } = {},
): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    keepNext: opts.keepNext,
  });
}

function eyebrow(label: string): Paragraph {
  return para(
    [text(label, { size: 8, bold: true, color: COLOR.bronze, caps: true, spacing: 30 })],
    { before: 240, after: 100, keepNext: true },
  );
}

function kv(label: string, value: string): Paragraph {
  return para([
    text(`${label}: `, { size: 8.5, color: COLOR.slate }),
    text(value, { size: 9.5 }),
  ], { after: 40 });
}

function menuBlock(title: string, menu: QuoteDocumentMenu): Paragraph[] {
  const out: Paragraph[] = [eyebrow(title)];
  if (menu.name) {
    out.push(para([text(menu.name, { size: 13, font: FONT.serif })], { after: 100, keepNext: true }));
  }
  for (const course of menu.courses) {
    out.push(
      para([text(course.label, { size: 8, bold: true, color: COLOR.bronze, caps: true, spacing: 20 })], {
        before: 60,
        after: 20,
        keepNext: true,
      }),
    );
    for (const dish of course.dishes) {
      out.push(para([text(dish, { size: 9.5 })], { after: 20 }));
    }
  }
  return out;
}

function headerCell(label: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: INK_LINE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [para([text(label, { size: 8, bold: true, caps: true, spacing: 20 })], { align, after: 0 })],
  });
}

function bodyCell(value: string, align: (typeof AlignmentType)[keyof typeof AlignmentType], width: number, bold = false, size = 9.5): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: THIN_LINE },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [para([text(value, { size, bold })], { align, after: 0 })],
  });
}

function signatureCell(label: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: NO_BORDER },
    margins: { top: 0, bottom: 0, left: 0, right: 200 },
    children: [
      para([], { after: 500 }),
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR.ink, space: 4 } },
        children: [text(label, { size: 8.5, color: COLOR.slate })],
        spacing: { after: 0 },
      }),
    ],
  });
}

/** Renderizza il modello del preventivo in un file DOCX (Buffer). */
export async function renderQuoteDocx(model: QuoteDocumentModel): Promise<Buffer> {
  const logo = await loadLogo();
  const { issuer, meta, client, event, setup, totals } = model;

  // Intestazione: 2 colonne senza bordi, dati Casale a sinistra, logo a destra.
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
              para([text(issuer.name, { size: 20, font: FONT.serif })], { after: 60 }),
              para([text(issuer.tagline, { size: 9.5, italics: true, color: COLOR.petrol, font: FONT.serif })], { after: 120 }),
              ...issuer.addressLines.map((line) => para([text(line, { size: 8.5, color: COLOR.slate })], { after: 10 })),
              para([text(issuer.phone, { size: 8.5, color: COLOR.slate })], { after: 10 }),
              para([text(issuer.email, { size: 8.5, color: COLOR.slate })], { after: 0 }),
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

  // Titolo e metadati
  const titleBlock = [
    para([text(model.title, { size: 8, bold: true, color: COLOR.bronze, caps: true, spacing: 30 })], { before: 280, after: 60 }),
    para([text(`N. ${meta.number}`, { size: 22, font: FONT.serif })], { after: 240 }),
    para([text(`Data di emissione: ${meta.issuedAt}`, { size: 9, color: COLOR.slate })], { after: 20 }),
    ...(meta.validUntil
      ? [para([text(`Valido fino al: ${meta.validUntil}`, { size: 9, color: COLOR.slate })], { after: 20 })]
      : []),
  ];

  // Cliente ed evento in due colonne
  const halfWidth = Math.floor(CONTENT_WIDTH / 2);
  const clientLines: Paragraph[] = [
    eyebrow("Cliente"),
    kv("Nome", client.fullName),
    kv("Telefono", client.phone),
    ...(client.email ? [kv("Email", client.email)] : []),
    ...(client.taxCode ? [kv("Codice fiscale", client.taxCode)] : []),
    ...(client.vatNumber ? [kv("Partita IVA", client.vatNumber)] : []),
  ];
  const eventLines: Paragraph[] = [
    eyebrow("Evento"),
    ...(event.name ? [kv("Evento", event.name)] : []),
    kv("Data", event.dateLong),
    ...(event.time ? [kv("Ora", event.time)] : []),
    kv("Sala", event.room),
    kv("Adulti", String(event.adults)),
    kv("Bambini", String(event.children)),
    ...(event.kidsMenus > 0 ? [kv("Menù bambini", String(event.kidsMenus))] : []),
  ];
  const infoTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [halfWidth, CONTENT_WIDTH - halfWidth],
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: halfWidth, type: WidthType.DXA },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            margins: { right: 240 },
            children: clientLines,
          }),
          new TableCell({
            width: { size: CONTENT_WIDTH - halfWidth, type: WidthType.DXA },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: eventLines,
          }),
        ],
      }),
    ],
  });

  // Menù e allestimento
  const menuParagraphs: Paragraph[] = [];
  if (model.menu) menuParagraphs.push(...menuBlock("Menù", model.menu));
  if (model.kidsMenu) menuParagraphs.push(...menuBlock("Menù bambini", model.kidsMenu));

  const setupParagraphs: Paragraph[] = [];
  if (setup.colors.length > 0 || setup.notes) {
    setupParagraphs.push(eyebrow("Allestimento"));
    if (setup.colors.length > 0) setupParagraphs.push(kv("Colori", setup.colors.join(", ")));
    if (setup.notes) setupParagraphs.push(para([text(setup.notes, { size: 9.5 })], { after: 60 }));
  }

  // Righe del preventivo
  const colWidths = [5306, 1200, 1900, 1900];
  const linesTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell("Descrizione", AlignmentType.LEFT, colWidths[0]),
          headerCell("Qtà", AlignmentType.RIGHT, colWidths[1]),
          headerCell("Prezzo unit.", AlignmentType.RIGHT, colWidths[2]),
          headerCell("Importo", AlignmentType.RIGHT, colWidths[3]),
        ],
      }),
      ...model.lines.map(
        (line) =>
          new TableRow({
            cantSplit: true,
            children: [
              bodyCell(line.description, AlignmentType.LEFT, colWidths[0]),
              bodyCell(line.quantity, AlignmentType.RIGHT, colWidths[1]),
              bodyCell(line.unitPrice, AlignmentType.RIGHT, colWidths[2]),
              bodyCell(line.amount, AlignmentType.RIGHT, colWidths[3]),
            ],
          }),
      ),
    ],
  });

  // Totali allineati a destra (prezzi IVA inclusa)
  const totalsWidth = 4800;
  const totalsLabelWidth = 3000;
  const totalsValueWidth = totalsWidth - totalsLabelWidth;
  const totalRow = (label: string, value: string, grand = false) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: totalsLabelWidth, type: WidthType.DXA },
          borders: {
            top: grand ? INK_LINE : NO_BORDER,
            bottom: NO_BORDER,
            left: NO_BORDER,
            right: NO_BORDER,
          },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [para([text(label, { size: grand ? 10 : 9, bold: grand, color: grand ? COLOR.ink : COLOR.slate })], { after: 0 })],
        }),
        new TableCell({
          width: { size: totalsValueWidth, type: WidthType.DXA },
          borders: {
            top: grand ? INK_LINE : NO_BORDER,
            bottom: NO_BORDER,
            left: NO_BORDER,
            right: NO_BORDER,
          },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [
            para([text(value, { size: grand ? 14 : 9, font: grand ? FONT.serif : FONT.sans, bold: grand })], {
              align: AlignmentType.RIGHT,
              after: 0,
            }),
          ],
        }),
      ],
    });
  const totalsRows = [
    totalRow("Subtotale (IVA inclusa)", totals.subtotal),
    ...(totals.hasDiscount ? [totalRow("Sconto", `- ${totals.discount}`)] : []),
    totalRow("di cui imponibile", totals.taxable),
    totalRow(`di cui IVA ${totals.vatRate}`, totals.vat),
    totalRow("Totale", totals.total, true),
  ];
  const totalsTable = new Table({
    width: { size: totalsWidth, type: WidthType.DXA },
    columnWidths: [totalsLabelWidth, totalsValueWidth],
    indent: { size: CONTENT_WIDTH - totalsWidth, type: WidthType.DXA },
    borders: NO_BORDERS,
    rows: totalsRows,
  });

  // Note, condizioni, firme
  const notesParagraphs: Paragraph[] = model.notes
    ? [eyebrow("Note"), para([text(model.notes, { size: 9.5 })], { after: 60 })]
    : [];

  const conditionsParagraphs: Paragraph[] = [
    eyebrow("Condizioni"),
    ...model.conditions.map((c) => para([text(`- ${c}`, { size: 8, color: COLOR.slate })], { after: 40 })),
  ];

  const signatureTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [halfWidth, CONTENT_WIDTH - halfWidth],
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          signatureCell(model.signature.issuerLabel, halfWidth),
          signatureCell(model.signature.clientLabel, CONTENT_WIDTH - halfWidth),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      para(
        [
          text(`${issuer.name} · ${issuer.addressLines.join(", ")} · ${issuer.phone}   |   Pagina `, { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: COLOR.slate, font: FONT.sans }),
          text(" di ", { size: 7.5, color: COLOR.slate }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: COLOR.slate, font: FONT.sans }),
        ],
        { align: AlignmentType.CENTER, after: 0 },
      ),
    ],
  });

  const doc = new Document({
    creator: issuer.name,
    title: `Preventivo ${meta.number}`,
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
          para([], { after: 120 }),
          infoTable,
          ...(menuParagraphs.length ? [para([], { after: 60 }), ...menuParagraphs] : []),
          ...setupParagraphs,
          eyebrow("Dettaglio"),
          linesTable,
          totalsTable,
          ...notesParagraphs,
          ...conditionsParagraphs,
          para([], { after: 200 }),
          signatureTable,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
