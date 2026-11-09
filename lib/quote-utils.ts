import type { BookingDetail, BookingStatus, Menu, Quote, QuoteLine, QuoteTotals } from "./types";

/** Menu del catalogo usati per le righe automatiche (solo nome e prezzo a persona). */
export interface QuoteMenuRef {
  name: string;
  price_per_person: number;
}

/**
 * Etichetta della riga/chip menù bambini: "Menù bambini" se il nome è generico, altrimenti
 * "Menù bambini — <nome>". Non duplica il prefisso se il nome lo contiene già.
 */
export function kidsMenuRowLabel(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || /^men[uù]\s+bambini$/i.test(trimmed)) return "Menù bambini";
  if (/^men[uù]\s+bambini\b/i.test(trimmed)) return trimmed;
  return `Menù bambini — ${trimmed}`;
}

/**
 * Righe automatiche del preventivo (pura, usata sia dal pannello live sia dal server):
 * "<Menù> — adulti" × adulti al prezzo del menù adulti; "Menù bambini — <nome>" × menù bambini al prezzo del menù bambini.
 * Una riga per menu valorizzato con quantità > 0.
 */
export function buildDefaultQuoteLines(input: {
  adults: number;
  kids_menus: number;
  menu: QuoteMenuRef | null;
  kids_menu: QuoteMenuRef | null;
}): QuoteLine[] {
  const lines: QuoteLine[] = [];
  if (input.menu && input.adults > 0) {
    lines.push({ description: `${input.menu.name} — adulti`, quantity: input.adults, unit_price: round2(input.menu.price_per_person) });
  }
  if (input.kids_menu && input.kids_menus > 0) {
    lines.push({
      description: kidsMenuRowLabel(input.kids_menu.name),
      quantity: input.kids_menus,
      unit_price: round2(input.kids_menu.price_per_person),
    });
  }
  return lines;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Riga automatica adulti ("<Menù> — adulti"). */
const isAdultAutoLine = (l: QuoteLine): boolean => /\s—\sadulti$/.test(l.description);
/** Riga automatica bambini ("Menù bambini" o "Menù bambini — <nome>"). */
const isKidsAutoLine = (l: QuoteLine): boolean => /^men[uù]\s+bambini\b/i.test(l.description.trim());

/** Menù dell'evento per le righe automatiche: adulti, menù bambini, menù e prezzi effettivi. */
export interface QuoteAutoInput {
  adults: number;
  kids_menus: number;
  menu: QuoteMenuRef | null;
  kids_menu: QuoteMenuRef | null;
}

/**
 * Allinea le righe automatiche di un ordine di servizio già emesso all'evento (menù aggiunto, cambiato o tolto,
 * coperti cambiati, prezzo del menù cambiato). Le righe aggiunte a mano restano com'erano, nello stesso ordine.
 * - Riga adulti / bambini: quantità e descrizione dall'evento; aggiunta se manca (adulti in cima, bambini subito dopo),
 *   tolta se il menù non c'è più o la quantità è 0.
 * - Prezzo: se la riga esisteva per lo stesso menù e il prezzo di quel menù non è cambiato (`previous`), resta il prezzo
 *   della riga (eventuale prezzo scritto a mano nel preventivo); altrimenti il prezzo attuale del menù.
 * Ritorna null se non cambia nulla.
 */
export function syncAutoQuoteLines(
  lines: QuoteLine[],
  next: QuoteAutoInput,
  previous: Pick<QuoteAutoInput, "menu" | "kids_menu"> | null,
): QuoteLine[] | null {
  const wanted = buildDefaultQuoteLines(next);
  const wantedAdult = next.menu && next.adults > 0 ? wanted[0] : null;
  const wantedKids = next.kids_menu && next.kids_menus > 0 ? wanted[wanted.length - 1] : null;

  const samePrice = (a: QuoteMenuRef | null | undefined, b: QuoteMenuRef | null) =>
    !!a && !!b && a.name === b.name && round2(a.price_per_person) === round2(b.price_per_person);

  const merge = (current: QuoteLine | undefined, target: QuoteLine, keepPrice: boolean): QuoteLine =>
    current && keepPrice && current.description === target.description ? { ...target, unit_price: current.unit_price } : target;

  const result: QuoteLine[] = [];
  let adultDone = false;
  let kidsDone = false;
  for (const line of lines) {
    if (isAdultAutoLine(line)) {
      if (adultDone || !wantedAdult) continue; // doppione o menù tolto: la riga sparisce
      result.push(merge(line, wantedAdult, samePrice(previous?.menu, next.menu)));
      adultDone = true;
    } else if (isKidsAutoLine(line)) {
      if (kidsDone || !wantedKids) continue;
      result.push(merge(line, wantedKids, samePrice(previous?.kids_menu, next.kids_menu)));
      kidsDone = true;
    } else {
      result.push(line);
    }
  }
  if (wantedAdult && !adultDone) result.unshift(wantedAdult);
  if (wantedKids && !kidsDone) {
    const adultIndex = result.findIndex(isAdultAutoLine);
    result.splice(adultIndex + 1, 0, wantedKids);
  }

  const unchanged =
    result.length === lines.length &&
    result.every((l, i) => l.description === lines[i].description && l.quantity === lines[i].quantity && l.unit_price === lines[i].unit_price);
  return unchanged ? null : result;
}

/**
 * Totali del preventivo. Prezzi IVA inclusa:
 * subtotal = Σ quantity × unit_price; discount è un importo in EUR (limitato al subtotale);
 * total = subtotal − discount; taxable = total / (1 + vat/100); vat = total − taxable.
 * Con prezzo finale (final_total numerico ≥ 0): total = final_total, sconto 0, overridden = true;
 * subtotal resta la somma delle righe (indicativa).
 */
export function computeQuoteTotals(
  q: Pick<Quote, "lines" | "discount" | "vat_rate"> & { final_total?: number | null },
): QuoteTotals {
  const subtotal = round2(q.lines.reduce((acc, l) => acc + l.quantity * l.unit_price, 0));
  const hasFinal = typeof q.final_total === "number" && Number.isFinite(q.final_total) && q.final_total >= 0;
  const discount = hasFinal ? 0 : round2(Math.min(Math.max(q.discount, 0), subtotal));
  const total = hasFinal ? round2(q.final_total as number) : round2(subtotal - discount);
  const taxable = round2(total / (1 + q.vat_rate / 100));
  const vat = round2(total - taxable);
  return { subtotal, discount, total, taxable, vat, overridden: hasFinal };
}

/**
 * Prezzo stimato di un evento (IVA inclusa, prima di un eventuale prezzo finale):
 * menu adulti × adulti + menu bambini × menù bambini. Senza menù la voce vale 0.
 * Accetta il dettaglio prenotazione (BookingDetail) e le liste (solo il prezzo a persona dei menù).
 */
export function estimateBookingPrice(
  b: Pick<BookingDetail, "adults" | "kids_menus"> & {
    menu: Pick<Menu, "price_per_person"> | null;
    kids_menu: Pick<Menu, "price_per_person"> | null;
  },
): number {
  const adults = b.menu ? b.menu.price_per_person * b.adults : 0;
  const kids = b.kids_menu ? b.kids_menu.price_per_person * b.kids_menus : 0;
  return round2(adults + kids);
}

const eurFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formatEUR(n: number): string {
  return eurFormatter.format(n);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Nome del documento: sempre "Ordine di servizio", qualunque sia lo stato dell'evento.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- lo stato resta nella firma per i chiamanti esistenti
export function quoteDocumentTitle(_status: BookingStatus): "Ordine di servizio" {
  return "Ordine di servizio";
}

/** Nome del file del documento (stesso nome usato dalle route PDF/DOCX), es. "Ordine-di-servizio-2026-001.pdf". */
export function quoteFileName(number: string, ext: "pdf" | "docx", status: BookingStatus): string {
  const base = quoteDocumentTitle(status).replace(/ /g, "-");
  return `${base}-${number.replace(/[^A-Za-z0-9._-]/g, "-")}.${ext}`;
}
