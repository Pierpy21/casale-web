// Bozza della nuova giacenza in localStorage: un ricaricamento della pagina non fa perdere quanto digitato.
// Ogni accesso è protetto da try/catch (modalità privata, quota piena, storage disabilitato).

export const INVENTORY_DRAFT_KEY = "casale:giacenza:bozza:v1";

export interface InventoryDraftCount {
  stock: number;
  to_order: number;
}

export interface InventoryDraft {
  reportDate: string;
  notes: string;
  /** Solo i prodotti con almeno una quantità > 0, per id di prodotto. */
  counts: Record<string, InventoryDraftCount>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100000;
}

/** Valida la forma salvata: un valore corrotto viene scartato senza errori. */
function parseDraft(raw: unknown): InventoryDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.reportDate !== "string" || !ISO_DATE.test(data.reportDate)) return null;
  if (typeof data.notes !== "string") return null;
  if (!data.counts || typeof data.counts !== "object") return null;

  const counts: Record<string, InventoryDraftCount> = {};
  for (const [id, value] of Object.entries(data.counts as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (!isQuantity(entry.stock) || !isQuantity(entry.to_order)) continue;
    if (entry.stock === 0 && entry.to_order === 0) continue;
    counts[id] = { stock: entry.stock, to_order: entry.to_order };
  }
  return { reportDate: data.reportDate, notes: data.notes, counts };
}

/** Bozza salvata, o null se assente, illeggibile o non disponibile. */
export function readInventoryDraft(): InventoryDraft | null {
  try {
    const raw = window.localStorage.getItem(INVENTORY_DRAFT_KEY);
    if (!raw) return null;
    return parseDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeInventoryDraft(draft: InventoryDraft): void {
  try {
    window.localStorage.setItem(INVENTORY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage non disponibile: la bozza non viene salvata, il modulo funziona comunque.
  }
}

export function clearInventoryDraft(): void {
  try {
    window.localStorage.removeItem(INVENTORY_DRAFT_KEY);
  } catch {
    // Nulla da fare.
  }
}
