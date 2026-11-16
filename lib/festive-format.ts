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

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"] as const;

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

/** "25 dicembre" (giorno e mese in minuscolo, come nei menù stampati). Se la data non è valida restituisce la stringa originale. */
export function formatFestiveDayMonth(iso: string): string {
  const parsed = parseFestiveDate(iso);
  if (!parsed) return iso;
  return `${parsed.day} ${MESI[parsed.month - 1]}`;
}

/** "giovedì": giorno della settimana della festa, calcolato in UTC per non dipendere dal fuso. Stringa vuota se la data non è valida. */
export function formatFestiveWeekday(iso: string): string {
  const parsed = parseFestiveDate(iso);
  if (!parsed) return "";
  const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return GIORNI[weekday];
}

/** Prezzo in stile sito: "70€", "69,5€". */
export function formatFestivePrice(price: number): string {
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(price)}€`;
}
