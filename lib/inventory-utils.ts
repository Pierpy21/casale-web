// Giacenza: utilità pure (senza server-only): fornitori (ordine, predefinito, nome file), categoria e raggruppamenti per il report e per il PDF.
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryCategory,
  type InventoryProduct,
  type InventoryReportLine,
  type InventorySupplier,
} from "./types";

/** Etichetta di riserva per una riga o un prodotto senza fornitore (la relazione è obbligatoria: non dovrebbe capitare). */
export const NO_SUPPLIER_LABEL = "Senza fornitore";
export const DEFAULT_INVENTORY_CATEGORY: InventoryCategory = "altro";

export function isInventoryCategory(v: unknown): v is InventoryCategory {
  return typeof v === "string" && (INVENTORY_CATEGORIES as readonly string[]).includes(v);
}

/** Valore dal database → categoria valida (fuori elenco o vuota → altro). */
export function normalizeInventoryCategory(v: unknown): InventoryCategory {
  return isInventoryCategory(v) ? v : DEFAULT_INVENTORY_CATEGORY;
}

export function inventoryCategoryRank(c: InventoryCategory): number {
  return INVENTORY_CATEGORIES.indexOf(c);
}

/** Ordine di visualizzazione dei fornitori: `sort`, poi nome. */
export function sortSuppliers<T extends Pick<InventorySupplier, "sort" | "name">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "it"));
}

/**
 * Fornitore predefinito per i prodotti creati senza scelta: l'attivo chiamato "Altro", altrimenti il primo attivo
 * in ordine. Null se non ce n'e' nessuno attivo.
 */
export function defaultInventorySupplier(suppliers: InventorySupplier[]): InventorySupplier | null {
  const active = sortSuppliers(suppliers.filter((s) => s.active));
  return active.find((s) => s.name.trim().toLowerCase() === "altro") ?? active[0] ?? null;
}

/** Nome del fornitore per il file: minuscolo, senza accenti, lettere e cifre separate da trattini. */
export function inventorySupplierSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "fornitore";
}

/**
 * Nome del file PDF di un report di giacenza: completo, oppure la lista d'ordine di un fornitore
 * (`giacenza-2026-11-03-viagrande.pdf`). Usato da route, PDF e pulsanti.
 */
export function inventoryPdfFileName(reportDate: string, supplierName?: string | null): string {
  return supplierName ? `giacenza-${reportDate}-${inventorySupplierSlug(supplierName)}.pdf` : `giacenza-${reportDate}.pdf`;
}

/** Ordine catalogo: categoria (ordine di visualizzazione), poi ordine manuale, poi nome. */
export function compareInventoryProducts(a: InventoryProduct, b: InventoryProduct): number {
  return (
    inventoryCategoryRank(a.category) - inventoryCategoryRank(b.category) ||
    a.sort - b.sort ||
    a.name.localeCompare(b.name, "it")
  );
}

/**
 * Colori di una categoria nella Giacenza (tablet): classi Tailwind complete, così il compilatore le trova.
 * Tinte chiare e terrose, in armonia con il brand (petrol, bronze, olive, slate, sand); il colore pieno
 * (accent) è solo decorativo, il testo resta ink su tinta chiara o bianco su pieno (≥ 4.5:1).
 */
export interface InventoryCategoryColor {
  /** Sfondo tenue della tessera e della pillola. */
  tint: string;
  /** Sfondo in hover (tessera e pillola). */
  tintHover: string;
  /** Bordo leggero della tessera e della pillola. */
  edge: string;
  /** Colore pieno: striscia laterale, pallino e barra di avanzamento. */
  accent: string;
  /** Pillola attiva: sfondo pieno (il testo è bianco). */
  solid: string;
}

/** Colore per categoria: carne rossa e uova, latticini burro, verdure salvia, surgelati ghiaccio, altro oliva. */
export const INVENTORY_CATEGORY_COLORS: Record<InventoryCategory, InventoryCategoryColor> = {
  // Verdure e frutta: verde salvia.
  ortofrutta: {
    tint: "bg-[#e4ecdb]",
    tintHover: "hover:bg-[#d8e3cb]",
    edge: "border-[#b5c7a6]",
    accent: "bg-[#4f6b45]",
    solid: "border-[#4f6b45] bg-[#4f6b45]",
  },
  // Latticini: crema e burro (ocra scura per il contrasto).
  latticini: {
    tint: "bg-[#f7f0d7]",
    tintHover: "hover:bg-[#f1e6c3]",
    edge: "border-[#dccb94]",
    accent: "bg-[#7d6219]",
    solid: "border-[#7d6219] bg-[#7d6219]",
  },
  // Salumi: rosa antico, vinaccia spenta.
  salumi: {
    tint: "bg-[#f1e2e4]",
    tintHover: "hover:bg-[#e9d4d8]",
    edge: "border-[#d7b5bb]",
    accent: "bg-[#7d3f4a]",
    solid: "border-[#7d3f4a] bg-[#7d3f4a]",
  },
  // Carne e uova: terracotta e mattone.
  carne_uova: {
    tint: "bg-[#f4e1d7]",
    tintHover: "hover:bg-[#ecd3c4]",
    edge: "border-[#dcb19c]",
    accent: "bg-[#9a4a32]",
    solid: "border-[#9a4a32] bg-[#9a4a32]",
  },
  // Dispensa: bronzo del brand.
  dispensa: {
    tint: "bg-[#efe6d6]",
    tintHover: "hover:bg-[#e6dac4]",
    edge: "border-[#cdb897]",
    accent: "bg-[#8b6b4a]",
    solid: "border-[#8b6b4a] bg-[#8b6b4a]",
  },
  // Surgelati: azzurro ghiaccio e petrolio chiaro.
  surgelati: {
    tint: "bg-[#e1edf0]",
    tintHover: "hover:bg-[#d3e4e9]",
    edge: "border-[#adc9d0]",
    accent: "bg-[#3d6b78]",
    solid: "border-[#3d6b78] bg-[#3d6b78]",
  },
  // Non food: grigio ardesia.
  non_food: {
    tint: "bg-[#e8ebeb]",
    tintHover: "hover:bg-[#dbe0e1]",
    edge: "border-[#bfc8ca]",
    accent: "bg-[#5a6668]",
    solid: "border-[#5a6668] bg-[#5a6668]",
  },
  // Altro: oliva neutro.
  altro: {
    tint: "bg-[#ecebe0]",
    tintHover: "hover:bg-[#e2e1d1]",
    edge: "border-[#c9c8ad]",
    accent: "bg-[#6b6955]",
    solid: "border-[#6b6955] bg-[#6b6955]",
  },
};

export interface InventoryGroup<K extends string, T> {
  key: K;
  label: string;
  items: T[];
}

/** Fornitore citato da un report: id e nome (snapshot della riga, come era al momento dell'invio). */
export interface InventoryReportSupplier {
  id: string;
  name: string;
}

/**
 * Fornitori con almeno una riga nel report, nell'ordine del catalogo (sort). Il nome è quello dello snapshot;
 * i fornitori non più in elenco vanno in fondo, per nome. Un report senza righe dà una lista vuota.
 */
export function reportSuppliers(
  lines: Pick<InventoryReportLine, "supplier_id" | "supplier_name">[],
  suppliers: InventorySupplier[],
): InventoryReportSupplier[] {
  const names = new Map<string, string>();
  for (const line of lines) {
    if (!names.has(line.supplier_id)) names.set(line.supplier_id, line.supplier_name || NO_SUPPLIER_LABEL);
  }
  const rank = new Map<string, number>(sortSuppliers(suppliers).map((s, index): [string, number] => [s.id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last) || a.name.localeCompare(b.name, "it"));
}

/** Gruppi per fornitore (solo quelli non vuoti), nell'ordine dei fornitori. Gli elementi mantengono l'ordine in ingresso. */
export function groupLinesBySupplier(lines: InventoryReportLine[], suppliers: InventorySupplier[]): InventoryGroup<string, InventoryReportLine>[] {
  return reportSuppliers(lines, suppliers).map((s) => ({
    key: s.id,
    label: s.name,
    items: lines.filter((l) => l.supplier_id === s.id),
  }));
}

/** Gruppi per categoria (solo quelli non vuoti), nell'ordine di INVENTORY_CATEGORIES. Gli elementi mantengono l'ordine in ingresso. */
export function groupLinesByCategory(lines: InventoryReportLine[]): InventoryGroup<InventoryCategory, InventoryReportLine>[] {
  return INVENTORY_CATEGORIES.map((key) => ({
    key,
    label: INVENTORY_CATEGORY_LABELS[key],
    items: lines.filter((l) => normalizeInventoryCategory(l.category) === key),
  })).filter((g) => g.items.length > 0);
}

/** Campi di una riga del report che servono per ricomporre il prodotto (anche prima della scrittura su PocketBase). */
export type InventoryLineSnapshot = Pick<
  InventoryReportLine,
  "product_id" | "product_name" | "unit" | "supplier_id" | "supplier_name" | "category" | "state" | "quantity"
>;

/** Riga del report unificata per prodotto: giacenza (presente) e quantità da ordinare (da_ordinare) sulla stessa riga. */
export interface InventoryOrderRow {
  key: string;
  product_id: string | null;
  name: string;
  unit: string | null;
  supplier_id: string;
  /** Nome del fornitore come era al momento dell'invio. */
  supplier_name: string;
  category: InventoryCategory;
  /** Giacenza; null se non indicata. */
  stock: number | null;
  /** Quantità da ordinare; null se non indicata. */
  to_order: number | null;
}

/** Unisce le righe (presente e da ordinare dello stesso prodotto) in una sola riga per prodotto. */
export function mergeReportLines(lines: InventoryLineSnapshot[]): InventoryOrderRow[] {
  const byKey = new Map<string, InventoryOrderRow>();
  for (const line of lines) {
    const key = line.product_id ?? `name:${line.product_name.trim().toLocaleLowerCase("it")}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        product_id: line.product_id,
        name: line.product_name,
        unit: line.unit,
        supplier_id: line.supplier_id,
        supplier_name: line.supplier_name || NO_SUPPLIER_LABEL,
        category: normalizeInventoryCategory(line.category),
        stock: null,
        to_order: null,
      };
      byKey.set(key, row);
    }
    if (!row.unit && line.unit) row.unit = line.unit;
    if (line.state === "presente") row.stock = (row.stock ?? 0) + line.quantity;
    else row.to_order = (row.to_order ?? 0) + line.quantity;
  }
  return [...byKey.values()];
}

/**
 * Righe unificate per fornitore (ordine dei fornitori, solo quelli con righe), etichetta = nome dello snapshot.
 * Dentro, per categoria e poi nome.
 */
export function groupOrderRowsBySupplier(rows: InventoryOrderRow[], suppliers: InventorySupplier[]): InventoryGroup<string, InventoryOrderRow>[] {
  const sorted = [...rows].sort(
    (a, b) => inventoryCategoryRank(a.category) - inventoryCategoryRank(b.category) || a.name.localeCompare(b.name, "it"),
  );
  return reportSuppliers(rows, suppliers).map((s) => ({
    key: s.id,
    label: s.name,
    items: sorted.filter((r) => r.supplier_id === s.id),
  }));
}

/** Un fornitore con i prodotti da ordinare (conteggio > 0). */
export interface InventoryToOrderCount {
  supplier_id: string;
  name: string;
  count: number;
}

/** Numero di prodotti da ordinare per fornitore (solo fornitori con conteggio > 0), nell'ordine dei fornitori. */
export function countToOrderBySupplier(rows: InventoryOrderRow[], suppliers: InventorySupplier[]): InventoryToOrderCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if ((row.to_order ?? 0) > 0) counts.set(row.supplier_id, (counts.get(row.supplier_id) ?? 0) + 1);
  }
  return reportSuppliers(rows, suppliers)
    .filter((s) => (counts.get(s.id) ?? 0) > 0)
    .map((s) => ({ supplier_id: s.id, name: s.name, count: counts.get(s.id) ?? 0 }));
}

/** "Viagrande 5, Amadori 3" (solo voci con conteggio > 0, nell'ordine ricevuto). Stringa vuota se nessuna. */
export function formatToOrderSummary(counts: InventoryToOrderCount[]): string {
  return counts
    .filter((c) => c.count > 0)
    .map((c) => `${c.name} ${c.count}`)
    .join(", ");
}
