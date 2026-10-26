// Utility pure per PocketBase (senza server-only: usabili anche nel browser).

/** Record PocketBase generico (le relazioni sono id stringa, o oggetti se espanse). */
export type PbRecord = {
  id: string;
  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
  expand?: Record<string, PbRecord | PbRecord[] | undefined>;
  [key: string]: any;
};

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Id record PocketBase: 15 caratteri [a-z0-9]. Generato lato server per poter scrivere figli nella stessa batch. */
export function generateRecordId(): string {
  const bytes = new Uint8Array(15);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const RECORD_ID_RE = /^[a-z0-9]{15}$/;

/** Valida un id record ricevuto dal client (sostituisce il vecchio isUuid). */
export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && RECORD_ID_RE.test(value);
}

/** Stringa oppure null se vuota. */
export function nn(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-11-14 00:00:00.000Z" (formato date PocketBase) oppure "2026-11-14" → "2026-11-14". */
export function toDateOnly(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

/** Data PocketBase → ISO 8601. Restituisce la stringa originale se non parsabile. */
export function toIsoDateTime(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) return "";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

/** Estremi di un giorno in formato filtro PocketBase (date UTC). */
export function dayStartPb(isoDate: string): string {
  return `${isoDate} 00:00:00.000Z`;
}
export function dayEndPb(isoDate: string): string {
  return `${isoDate} 23:59:59.999Z`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** URL assoluto di un file di un record (foto menu, ecc.). */
export function fileUrl(baseUrl: string, record: PbRecord, filename: string): string {
  const collection = record.collectionId ?? record.collectionName ?? "";
  return `${baseUrl}/api/files/${collection}/${record.id}/${encodeURIComponent(filename)}`;
}
