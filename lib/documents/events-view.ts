import { format } from "date-fns";
import { it } from "date-fns/locale";
import { kidsMenuRowLabel } from "@/lib/quote-utils";
import { BOOKING_MEAL_LABELS, type EventSheet, type EventSheetRow } from "@/lib/types";

// Vista del foglio eventi: testi e valori già formattati in italiano. Modulo puro (senza @react-pdf),
// usato dai renderer PDF e DOCX e dalle route. Stesso schema del foglio prenotazioni (reservations-view.ts).

const DASH = "—";

/** Una voce della scheda (es. "Sala", "Allergie"): righe di valore; vuoto = "—". */
export interface EventFieldView {
  label: string;
  lines: string[];
}

/** Scheda di un banchetto già formattata. `heading` = nome del cliente. */
export interface EventBlockView {
  /** Pasto: "Pranzo", "Cena" o "—". */
  meal: string;
  heading: string;
  covers: string;
  fields: EventFieldView[];
}

/** Foglio eventi già formattato in italiano: input dei renderer PDF e DOCX. */
export interface EventSheetView {
  title: string;
  dateLong: string;
  countLabel: string;
  /** Riepilogo del giorno: eventi, coperti, adulti/bambini, menù. */
  summary: EventFieldView[];
  blocks: EventBlockView[];
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const orDash = (value: string | null | undefined): string => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : DASH;
};

/** Testo multi-riga (note) in righe non vuote; nessun valore = ["—"]. */
function linesOf(value: string | null | undefined): string[] {
  const lines = (value ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines.length > 0 ? lines : [DASH];
}

/** "A 40 + B 4" (notazione del Casale: A = adulti, B = bambini). */
function coversNotation(adults: number, children: number): string {
  return children > 0 ? `A ${adults} + B ${children}` : `A ${adults}`;
}

/** Data di una nota in fuso Europe/Rome ("1 nov, 14:30"); timestamp non valido = "—". */
function noteStamp(createdAt: string): string {
  const date = new Date(createdAt.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function allergyLine(allergy: { subject: string | null; condition: string; notes: string | null }): string {
  const who = allergy.subject ? ` (${allergy.subject})` : "";
  const note = allergy.notes ? ` — ${allergy.notes}` : "";
  return `${orDash(allergy.condition)}${who}${note}`;
}

function blockOf(row: EventSheetRow): EventBlockView {
  const covers = row.adults + row.children;
  const hasKidsMenu = row.kids_menus > 0;
  const setupLines: string[] = [];
  if (row.setup_colors.length > 0) setupLines.push(`Colori: ${row.setup_colors.join(", ")}`);
  if (row.setup_notes) setupLines.push(...linesOf(row.setup_notes));

  return {
    meal: row.meal ? BOOKING_MEAL_LABELS[row.meal] : DASH,
    heading: orDash(row.client_name),
    covers: `${covers} coperti`,
    fields: [
      { label: "Cliente", lines: [orDash(row.client_name)] },
      { label: "Sala", lines: [orDash(row.room)] },
      { label: "Coperti", lines: [`${covers} · ${coversNotation(row.adults, row.children)}`] },
      { label: "Menù", lines: [orDash(row.menu)] },
      {
        label: "Menù bambini",
        lines: [hasKidsMenu ? `${kidsMenuRowLabel(row.kids_menu)} ×${row.kids_menus}` : DASH],
      },
      {
        label: "Piatti",
        lines:
          row.dishes.length > 0
            ? row.dishes.map((group) => `${group.label}: ${group.items.join(", ")}`)
            : [DASH],
      },
      {
        label: "Allergie",
        lines: row.allergies.length > 0 ? row.allergies.map(allergyLine) : [DASH],
      },
      { label: "Allestimento", lines: setupLines.length > 0 ? setupLines : [DASH] },
      { label: "Note prenotazione", lines: linesOf(row.booking_notes) },
      {
        label: "Note cucina",
        lines:
          row.kitchen_notes.length > 0
            ? row.kitchen_notes.map((n) => `${orDash(n.author)} (${noteStamp(n.created_at)}): ${n.body.trim()}`)
            : [DASH],
      },
    ],
  };
}

/** Testi e valori del foglio eventi (puro): usato dai renderer PDF e DOCX. */
export function buildEventSheetView(sheet: EventSheet): EventSheetView {
  const [y, m, d] = sheet.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const { totals } = sheet;
  const count = sheet.rows.length;

  const menuLines =
    totals.menus.length > 0
      ? totals.menus.map((menu) => `${menu.kind === "kids" ? kidsMenuRowLabel(menu.name) : orDash(menu.name)} ×${menu.quantity}`)
      : [DASH];

  return {
    title: "Foglio eventi",
    dateLong: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    countLabel: `${count} ${count === 1 ? "evento" : "eventi"}`,
    summary: [
      { label: "Eventi", lines: [String(totals.events)] },
      {
        label: "Coperti",
        lines: [`${totals.covers} · ${coversNotation(totals.adults, totals.children)}`],
      },
      { label: "Menù del giorno", lines: menuLines },
    ],
    blocks: sheet.rows.map(blockOf),
  };
}
