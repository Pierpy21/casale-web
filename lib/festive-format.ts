// Formattazione delle date e dei prezzi dei menù festivi (usata da landing e admin).
// Le date arrivano come "YYYY-MM-DD": si scompongono a mano, senza new Date(string), per evitare slittamenti di fuso.

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

export interface FestiveDay {
  year: number;
  month: number;
  day: number;
}

/** Scompone "YYYY-MM-DD". Restituisce null se il formato non è valido. */
export function parseFestiveDate(iso: string): FestiveDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "25 Dicembre": giorno e mese con iniziale maiuscola (per la card della landing). */
export function formatFestiveDayMonth(iso: string): string {
  const parsed = parseFestiveDate(iso);
  if (!parsed) return iso;
  const mese = MESI[parsed.month - 1];
  return `${parsed.day} ${mese.charAt(0).toUpperCase()}${mese.slice(1)}`;
}

/** "25 dicembre 2026" (per l'elenco admin). */
export function formatFestiveDateLong(iso: string): string {
  const parsed = parseFestiveDate(iso);
  if (!parsed) return iso;
  return `${parsed.day} ${MESI[parsed.month - 1]} ${parsed.year}`;
}

/** Data di oggi nel fuso locale, formato "YYYY-MM-DD". */
export function festiveTodayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Vero se la festa è già passata (data prima di oggi). Il confronto testuale funziona con "YYYY-MM-DD". */
export function isPastFestiveDate(iso: string, today: string = festiveTodayISO()): boolean {
  return iso < today;
}

/** Prezzo in stile sito: "70€", "69,5€". */
export function formatFestivePrice(price: number): string {
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(price)}€`;
}
