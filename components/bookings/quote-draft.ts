import { buildDefaultQuoteLines, computeQuoteTotals, round2, type QuoteMenuRef } from "@/lib/quote-utils";
import type { QuoteLine, QuoteTotals } from "@/lib/types";
import { nextRowKey, type Errors } from "./booking-form-model";

// Bozza del preventivo nel form evento. I valori numerici restano stringhe finché l'utente scrive.
// Righe automatiche (menù × adulti, menù bambini × menù bambini): seguono sempre coperti e menù,
// si può cambiare solo il prezzo (priceOverrides). Le voci aggiunte a mano stanno in `extra`.

export interface QuoteLineDraft {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
  /** Riga calcolata da menù e coperti: descrizione e quantità non sono modificabili. */
  auto?: boolean;
}

export type AutoLineKey = "auto-adults" | "auto-kids";

export interface QuoteDraft {
  extra: QuoteLineDraft[];
  priceOverrides: Partial<Record<AutoLineKey, string>>;
  discount: string;
  /** Prezzo finale concordato (facoltativo): se compilato sostituisce il totale e disabilita lo sconto. */
  final_total: string;
  vat_rate: string;
  valid_until: string;
  notes: string;
}

export const EMPTY_QUOTE_DRAFT: QuoteDraft = {
  extra: [],
  priceOverrides: {},
  discount: "",
  final_total: "",
  vat_rate: "10",
  valid_until: "",
  notes: "",
};

/** Numero da input italiano o inglese; NaN se vuoto o non valido. */
export function parseAmount(raw: string): number {
  const text = raw.trim().replace(",", ".");
  if (text === "") return Number.NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Righe automatiche dal menù e dai coperti (stessa logica del server), con gli eventuali prezzi modificati. */
export function autoQuoteLines(
  input: {
    adults: number;
    kids_menus: number;
    menu: QuoteMenuRef | null;
    kids_menu: QuoteMenuRef | null;
  },
  priceOverrides: QuoteDraft["priceOverrides"] = {},
): QuoteLineDraft[] {
  const lines = buildDefaultQuoteLines(input);
  // buildDefaultQuoteLines aggiunge prima la riga adulti (se c'è) e poi quella bambini.
  const keys: AutoLineKey[] = [];
  if (input.menu && input.adults > 0) keys.push("auto-adults");
  if (input.kids_menu && input.kids_menus > 0) keys.push("auto-kids");
  return lines.map((line, index) => {
    const key = keys[index];
    return {
      key,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: priceOverrides[key] ?? String(line.unit_price),
      auto: true,
    };
  });
}

export function newQuoteLine(): QuoteLineDraft {
  return { key: nextRowKey(), description: "", quantity: "1", unit_price: "" };
}

/** Importo di una riga (quantità × prezzo); zero se i valori non sono validi. */
export function lineSubtotal(line: QuoteLineDraft): number {
  const quantity = parseAmount(line.quantity);
  const unitPrice = parseAmount(line.unit_price);
  return Number.isFinite(quantity) && Number.isFinite(unitPrice) ? round2(quantity * unitPrice) : 0;
}

/**
 * Prezzo finale: stessa normalizzazione del server (lib/validation.ts finalTotalSchema).
 * Se c'è una virgola: i punti sono separatori di migliaia ("1.250,50" → 1250.50); altrimenti il valore resta com'è.
 */
export function parseFinalTotal(raw: string): number {
  const trimmed = raw.trim();
  const text = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  if (text === "") return Number.NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Prezzo finale della bozza: null se vuoto o non valido (la validazione segnala i valori errati). */
export function finalTotalOf(draft: QuoteDraft): number | null {
  if (draft.final_total.trim() === "") return null;
  const n = parseFinalTotal(draft.final_total);
  return Number.isFinite(n) && round2(n) >= 0.01 ? round2(n) : null;
}

/** Totali live (IVA inclusa). Valori non validi contano come zero: la validazione li segnala all'invio. */
export function quoteTotals(draft: QuoteDraft, lines: QuoteLineDraft[]): QuoteTotals {
  const finiteOrZero = (n: number) => (Number.isFinite(n) ? n : 0);
  const quoteLines: QuoteLine[] = lines.map((line) => ({
    description: line.description,
    quantity: finiteOrZero(parseAmount(line.quantity)),
    unit_price: finiteOrZero(parseAmount(line.unit_price)),
  }));
  return computeQuoteTotals({
    lines: quoteLines,
    discount: finiteOrZero(parseAmount(draft.discount)),
    final_total: finalTotalOf(draft),
    vat_rate: draft.vat_rate.trim() === "" ? 10 : finiteOrZero(parseAmount(draft.vat_rate)),
  });
}

export interface QuotePayload {
  lines: QuoteLine[];
  discount: number;
  final_total: number | null;
  vat_rate: number;
  valid_until: string | null;
  notes: string | null;
}

/**
 * Valida la bozza e costruisce il payload `quote` di createBooking.
 * Le chiavi d'errore seguono il path del server (quote.lines.<i>.<campo>), così si mappano direttamente.
 * Sconto vuoto = 0; IVA vuota = 10 (come il server).
 */
export function buildQuotePayload(
  draft: QuoteDraft,
  lines: QuoteLineDraft[],
): { payload: QuotePayload | null; errors: Errors } {
  const errors: Errors = {};
  const add = (key: string, message: string) => {
    (errors[key] ??= []).push(message);
  };

  if (lines.length === 0) add("quote.lines", "Aggiungi almeno una voce al preventivo");

  const out: QuoteLine[] = [];
  lines.forEach((line, index) => {
    const description = line.description.trim();
    if (!description) add(`quote.lines.${index}.description`, "Descrizione obbligatoria");
    const quantity = parseAmount(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) add(`quote.lines.${index}.quantity`, "Quantità non valida");
    const unitPrice = parseAmount(line.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) add(`quote.lines.${index}.unit_price`, "Prezzo non valido");
    out.push({ description, quantity, unit_price: unitPrice });
  });

  const discount = draft.discount.trim() === "" ? 0 : parseAmount(draft.discount);
  if (!Number.isFinite(discount) || discount < 0) add("quote.discount", "Sconto non valido");

  let finalTotal: number | null = null;
  if (draft.final_total.trim() !== "") {
    const parsed = parseFinalTotal(draft.final_total);
    // Ordine come nel server: massimo sul valore grezzo, poi arrotondamento, poi minimo sul valore arrotondato.
    if (!Number.isFinite(parsed)) add("quote.final_total", "Prezzo finale non valido");
    else if (parsed > 1000000) add("quote.final_total", "Prezzo finale troppo alto (massimo 1.000.000 €)");
    else if (round2(parsed) < 0.01) add("quote.final_total", "Il prezzo finale deve essere almeno 0,01 €");
    else finalTotal = round2(parsed);
  }

  const vat = draft.vat_rate.trim() === "" ? 10 : parseAmount(draft.vat_rate);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) add("quote.vat_rate", "IVA non valida (da 0 a 100)");

  if (Object.keys(errors).length > 0) return { payload: null, errors };

  return {
    payload: {
      lines: out.map((l) => ({ ...l, unit_price: round2(l.unit_price) })),
      discount: finalTotal !== null ? 0 : round2(discount),
      final_total: finalTotal,
      vat_rate: round2(vat),
      valid_until: draft.valid_until || null,
      notes: draft.notes.trim() || null,
    },
    errors: {},
  };
}
