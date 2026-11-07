import { format } from "date-fns";
import { it } from "date-fns/locale";
import { BOOKING_MEAL_LABELS, type ReservationSheet } from "@/lib/types";

// Vista del foglio prenotazioni: testi e valori già formattati in italiano. Modulo puro (senza @react-pdf),
// usato dai renderer PDF e DOCX e dalle route.

const DASH = "—";

export interface ReservationPdfRow {
  name: string;
  room: string;
  table: string;
  /** Coperti (adulti + bambini), "—" se zero. */
  covers: string;
  /** Pasto: "Pranzo", "Cena" o "—". */
  meal: string;
  phone: string;
}

/** Una sala nel foglio diviso per pagine: nome, conteggio e prenotazioni della sala. */
export interface ReservationRoomSection {
  room: string;
  countLabel: string;
  rows: ReservationPdfRow[];
}

/** Una pagina del PDF: una o più sale, separate da una linea. */
export interface ReservationSheetPage {
  sections: ReservationRoomSection[];
}

/** Foglio già formattato in italiano (testi e valori mancanti "—"): input dei renderer PDF e DOCX. */
export interface ReservationSheetView {
  title: string;
  dateLong: string;
  countLabel: string;
  rows: ReservationPdfRow[];
  /** Divisione per sale del PDF (vedi ROOM_PAGES), più una pagina per le altre sale/senza sala se servono. */
  pages: ReservationSheetPage[];
}

/**
 * Pagine fisse del PDF per sala, sempre stampate anche se vuote:
 * 1) Sala 1, 2 e 3 · 2) Sala Grande · 3) Palmento · 4) Terrazza e Pozzo.
 */
export const ROOM_PAGES: readonly (readonly string[])[] = [
  ["Sala 1", "Sala 2", "Sala 3"],
  ["Sala Grande"],
  ["Palmento"],
  ["Terrazza", "Pozzo"],
];

const NO_ROOM = "Senza sala";

/** Intestazione e piè di pagina del foglio: stessi testi del PDF e dell'anteprima HTML. */
export const SHEET_ISSUER = {
  name: "Casale del Notaio",
  tagline: "Del gusto il Teatro.",
  lines: ["Via Nicolosi 67, 95032 Belpasso (CT)", "+39 340 109 0100 · info@casaledelnotaio.it"],
  footer: "Casale del Notaio · Via Nicolosi 67, Belpasso (CT)",
} as const;

const normalizeRoom = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

function countLabelOf(rows: ReadonlyArray<{ covers: number }>): string {
  const count = rows.length;
  const covers = rows.reduce((acc, row) => acc + row.covers, 0);
  return `${count} ${count === 1 ? "prenotazione" : "prenotazioni"} · ${covers} ${covers === 1 ? "coperto" : "coperti"}`;
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Testi e valori del foglio (puro): usato anche dal renderer DOCX. */
export function buildReservationSheetView(sheet: ReservationSheet): ReservationSheetView {
  const [y, m, d] = sheet.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const toView = (row: ReservationSheet["rows"][number]): ReservationPdfRow => ({
    name: row.name || DASH,
    room: row.room || DASH,
    table: row.table === null ? DASH : String(row.table),
    // Sempre diviso: "23 (A 20 + B 3)", B = menù bambini anche se 0.
    covers: row.covers > 0 ? `${row.covers} (A ${row.adults} + B ${row.kids_menus})` : DASH,
    meal: row.meal ? BOOKING_MEAL_LABELS[row.meal] : DASH,
    phone: row.phone || DASH,
  });
  return {
    title: "Foglio prenotazioni",
    dateLong: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    countLabel: countLabelOf(sheet.rows),
    rows: sheet.rows.map(toView),
    pages: roomPages(sheet.rows, toView),
  };
}

/** Divide le prenotazioni (già ordinate) nelle pagine per sala; l'ordine delle righe resta quello del foglio. */
function roomPages(
  rows: ReservationSheet["rows"],
  toView: (row: ReservationSheet["rows"][number]) => ReservationPdfRow,
): ReservationSheetPage[] {
  const section = (room: string, roomRows: ReservationSheet["rows"]): ReservationRoomSection => ({
    room,
    countLabel: countLabelOf(roomRows),
    rows: roomRows.map(toView),
  });
  const known = new Set(ROOM_PAGES.flat().map(normalizeRoom));
  const pages: ReservationSheetPage[] = ROOM_PAGES.map((rooms) => ({
    sections: rooms.map((room) =>
      section(room, rows.filter((r) => r.room !== null && normalizeRoom(r.room) === normalizeRoom(room))),
    ),
  }));

  // Sale non previste e prenotazioni senza sala: una pagina in più, solo se ce ne sono.
  const others = new Map<string, ReservationSheet["rows"]>();
  for (const r of rows) {
    if (r.room !== null && known.has(normalizeRoom(r.room))) continue;
    const key = r.room?.trim() || NO_ROOM;
    others.set(key, [...(others.get(key) ?? []), r]);
  }
  if (others.size > 0) {
    pages.push({ sections: [...others].map(([room, roomRows]) => section(room, roomRows)) });
  }
  return pages;
}
