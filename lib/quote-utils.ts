import type { Quote, QuoteLine, QuoteTotals } from "./types";

/** Menu del catalogo usati per le righe automatiche (solo nome e prezzo a persona). */
export interface QuoteMenuRef {
  name: string;
  price_per_person: number;
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
      description: `Menù bambini — ${input.kids_menu.name}`,
      quantity: input.kids_menus,
      unit_price: round2(input.kids_menu.price_per_person),
    });
  }
  return lines;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

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

const eurFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formatEUR(n: number): string {
  return eurFormatter.format(n);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Nome del file del preventivo (stesso nome usato dalle route PDF/DOCX). */
export function quoteFileName(number: string, ext: "pdf" | "docx"): string {
  return `Preventivo-${number.replace(/[^A-Za-z0-9._-]/g, "-")}.${ext}`;
}
