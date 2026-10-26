import type { BookingDetail, Payment, PaymentSummary } from "./types";
import type { ReceiptMimeType } from "./validation";

// Utilità pure (senza server-only): usabili anche nei Client Component.

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Riepilogo economico: previsto = adulti × menù + menù bambini × prezzo; versato = somma acconti. */
export function getPaymentSummary(booking: BookingDetail, payments: Payment[]): PaymentSummary {
  const adultsTotal = (booking.menu?.price_per_person ?? 0) * booking.adults;
  const kidsTotal = (booking.kids_menu?.price_per_person ?? 0) * booking.kids_menus;
  const expected_total = round2(adultsTotal + kidsTotal);
  const paid_total = round2(payments.reduce((acc, p) => acc + p.amount, 0));
  return {
    expected_total,
    paid_total,
    balance: round2(expected_total - paid_total),
  };
}

const EXTENSION_BY_MIME: Record<ReceiptMimeType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

export const RECEIPT_NAME_MAX = 80;

/**
 * Nome file sicuro per lo storage: solo [a-z0-9._-], max 80 caratteri, estensione
 * coerente con il MIME ammesso.
 */
export function sanitizeReceiptName(originalName: string, mime: ReceiptMimeType): string {
  const ext = EXTENSION_BY_MIME[mime];
  const stem = originalName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, RECEIPT_NAME_MAX - ext.length)
    .replace(/-+$/, "");
  return `${stem || "ricevuta"}${ext}`;
}
