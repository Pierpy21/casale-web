import { isValid, parseISO } from "date-fns";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/types";
import { todayISO } from "@/components/agenda/agenda-utils";

/** Bozza di un acconto nei form (prenotazione e pannello Pagamenti). Tutto testo tranne la ricevuta. */
export interface PaymentDraft {
  amount: string;
  paid_at: string;
  method: PaymentMethod | "";
  notes: string;
  receipt: File | null;
}

export type DraftField = keyof PaymentDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const PAYMENT_MAX_AMOUNT = 1_000_000;
export const PAYMENT_NOTES_MAX = 2000;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = "image/*,application/pdf";
export const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const ALLOWED_RECEIPT_EXT = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;

export function emptyPaymentDraft(): PaymentDraft {
  return { amount: "", paid_at: todayISO(), method: "", notes: "", receipt: null };
}

/** Accetta "120", "120,5", "1.250,50", "120.50". Ritorna null se non è un importo valido. */
export function parseAmountInput(raw: string): number | null {
  let n = raw.trim().replace(/\s/g, "");
  if (n === "") return null;
  if (n.includes(",")) n = n.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(n)) return null;
  const value = Number(n);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function isPdfReceipt(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isAllowedReceipt(file: Pick<File, "type" | "name">): boolean {
  if (file.type) return ALLOWED_RECEIPT_TYPES.includes(file.type);
  // Alcuni sistemi (es. HEIC da iOS) non valorizzano il MIME: fallback sull'estensione.
  return ALLOWED_RECEIPT_EXT.test(file.name);
}

/** "842 KB", "2,4 MB": dimensione leggibile in italiano. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

export function validateDraft(d: PaymentDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.amount.trim()) {
    errors.amount = "Campo obbligatorio";
  } else {
    const value = parseAmountInput(d.amount);
    if (value === null) errors.amount = "Importo non valido (es. 150 o 150,50)";
    else if (value <= 0) errors.amount = "L’importo deve essere maggiore di zero";
    else if (value > PAYMENT_MAX_AMOUNT) errors.amount = "Importo troppo alto";
  }

  const date = parseISO(d.paid_at);
  if (!d.paid_at || !/^\d{4}-\d{2}-\d{2}$/.test(d.paid_at) || !isValid(date)) {
    errors.paid_at = "Data non valida";
  }

  if (d.notes.length > PAYMENT_NOTES_MAX) errors.notes = `Massimo ${PAYMENT_NOTES_MAX} caratteri`;

  if (d.receipt) {
    if (d.receipt.size > RECEIPT_MAX_BYTES) errors.receipt = "La ricevuta supera 10 MB";
    else if (!isAllowedReceipt(d.receipt)) {
      errors.receipt = "Formato non supportato: usa una foto (JPG, PNG, HEIC, WebP) o un PDF";
    }
  }
  return errors;
}

/** FormData per addPayment(bookingId, formData): campi attesi dal contratto. */
export function buildPaymentFormData(d: PaymentDraft): FormData {
  const fd = new FormData();
  const value = parseAmountInput(d.amount) ?? 0;
  fd.append("amount", value.toFixed(2));
  fd.append("paid_at", d.paid_at);
  if (d.method) fd.append("method", d.method);
  if (d.notes.trim()) fd.append("notes", d.notes.trim());
  if (d.receipt) fd.append("receipt", d.receipt, d.receipt.name);
  return fd;
}

/** Mappa gli errori di campo restituiti dal server sulle chiavi della bozza (quando riconoscibili). */
export function serverDraftErrors(fieldErrors: Record<string, string[]> | undefined): DraftErrors {
  const out: DraftErrors = {};
  const map: Record<string, DraftField> = {
    amount: "amount",
    paid_at: "paid_at",
    method: "method",
    notes: "notes",
    receipt: "receipt",
  };
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const field = map[key.replace(/^payment\./, "")];
    if (field && messages[0]) out[field] = messages[0];
  }
  return out;
}
