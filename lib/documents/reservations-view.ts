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

/** Foglio già formattato in italiano (testi e valori mancanti "—"): input dei renderer PDF e DOCX. */
export interface ReservationSheetView {
  title: string;
  dateLong: string;
  countLabel: string;
  rows: ReservationPdfRow[];
}

/** Intestazione e piè di pagina del foglio: stessi testi del PDF e dell'anteprima HTML. */
export const SHEET_ISSUER = {
  name: "Casale del Notaio",
  tagline: "Del gusto il Teatro.",
  lines: ["Via Nicolosi 67, 95032 Belpasso (CT)", "+39 340 109 0100 · info@casaledelnotaio.it"],
  footer: "Casale del Notaio · Via Nicolosi 67, Belpasso (CT)",
} as const;

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Testi e valori del foglio (puro): usato anche dal renderer DOCX. */
export function buildReservationSheetView(sheet: ReservationSheet): ReservationSheetView {
  const [y, m, d] = sheet.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const count = sheet.rows.length;
  const covers = sheet.rows.reduce((acc, row) => acc + row.covers, 0);
  return {
    title: "Foglio prenotazioni",
    dateLong: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    countLabel: `${count} ${count === 1 ? "prenotazione" : "prenotazioni"} · ${covers} ${covers === 1 ? "coperto" : "coperti"}`,
    rows: sheet.rows.map((row) => ({
      name: row.name || DASH,
      room: row.room || DASH,
      table: row.table === null ? DASH : String(row.table),
      // Sempre diviso: "23 (A 20 + B 3)", B = menù bambini anche se 0.
      covers: row.covers > 0 ? `${row.covers} (A ${row.adults} + B ${row.kids_menus})` : DASH,
      meal: row.meal ? BOOKING_MEAL_LABELS[row.meal] : DASH,
      phone: row.phone || DASH,
    })),
  };
}
