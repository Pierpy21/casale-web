import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { ReservationSheet } from "@/lib/types";

// Vista del foglio prenotazioni: testi e valori già formattati in italiano. Modulo puro (senza @react-pdf),
// usato dai renderer PDF e DOCX e dalle route.

const DASH = "—";

export interface ReservationPdfRow {
  name: string;
  room: string;
  table: string;
  time: string;
  phone: string;
}

/** Foglio già formattato in italiano (testi e valori mancanti "—"): input dei renderer PDF e DOCX. */
export interface ReservationSheetView {
  title: string;
  dateLong: string;
  countLabel: string;
  rows: ReservationPdfRow[];
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Testi e valori del foglio (puro): usato anche dal renderer DOCX. */
export function buildReservationSheetView(sheet: ReservationSheet): ReservationSheetView {
  const [y, m, d] = sheet.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const count = sheet.rows.length;
  return {
    title: "Foglio prenotazioni",
    dateLong: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    countLabel: `${count} ${count === 1 ? "prenotazione" : "prenotazioni"}`,
    rows: sheet.rows.map((row) => ({
      name: row.name || DASH,
      room: row.room || DASH,
      table: row.table === null ? DASH : String(row.table),
      time: row.time || DASH,
      phone: row.phone || DASH,
    })),
  };
}
