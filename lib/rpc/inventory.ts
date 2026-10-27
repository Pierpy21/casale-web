import "server-only";
import type PocketBase from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import {
  DEFAULT_INVENTORY_CATEGORY,
  DEFAULT_INVENTORY_SUPPLIER,
  countToOrderBySupplier,
  mergeReportLines,
  normalizeInventoryCategory,
  normalizeInventorySupplier,
  type InventoryLineSnapshot,
} from "@/lib/inventory-utils";
import { dayStartPb, generateRecordId, nn, num, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import type { InventoryReportInputType, InventoryProductUpdateInputType } from "@/lib/validation";
import type { InventoryCategory, InventorySupplier } from "@/lib/types";

// Giacenza: catalogo prodotti (nome univoco senza distinzione di maiuscole) e report di invio.

export interface InventoryActor {
  id: string;
  full_name: string;
}

/** Prodotto del catalogo nella forma usata dalle azioni (dopo creazione o riattivazione). */
export interface InventoryProductRef {
  id: string;
  name: string;
  unit: string | null;
  category: InventoryCategory;
  supplier: InventorySupplier;
}

/** Esiste già un altro prodotto con lo stesso nome (controllo prima della scrittura). */
export class InventoryNameTakenError extends Error {}

/** Chiave di unicita' del nome prodotto (minuscolo, spazi compressi). */
export function productNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

function refOf(r: PbRecord, unitFallback: string | null): InventoryProductRef {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    unit: nn(r.unit) ?? unitFallback,
    category: normalizeInventoryCategory(r.category),
    supplier: normalizeInventorySupplier(r.supplier),
  };
}

/** Sort successivo in categoria (il nuovo prodotto va in fondo alla sua categoria). */
async function nextSortInCategory(db: PocketBase, category: InventoryCategory): Promise<number> {
  const res = await db.collection("inventory_products").getList(1, 1, {
    filter: db.filter("category = {:c}", { c: category }),
    sort: "-sort",
    fields: "id,sort",
  });
  return num(res.items[0]?.sort) + 1;
}

/**
 * Trova il prodotto per nome o lo crea (attivo). Un prodotto disattivato viene riattivato:
 * chi lo scrive nel report lo vuole di nuovo in lista. Su un prodotto esistente restano fornitore e categoria del catalogo.
 */
export async function ensureProduct(
  db: PocketBase,
  input: { name: string; unit: string | null; category: InventoryCategory | null; supplier: InventorySupplier | null },
  actor: InventoryActor,
): Promise<InventoryProductRef> {
  const display = input.name.trim().replace(/\s+/g, " ");
  const key = productNameKey(display);
  const existing = await db
    .collection("inventory_products")
    .getFirstListItem(db.filter("name_key = {:k}", { k: key }))
    .catch(() => null);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.active !== true) patch.active = true;
    if (input.unit && !nn(existing.unit)) patch.unit = input.unit;
    if (Object.keys(patch).length > 0) await db.collection("inventory_products").update(existing.id, patch);
    return refOf(existing as unknown as PbRecord, input.unit);
  }

  const category = input.category ?? DEFAULT_INVENTORY_CATEGORY;
  const supplier = input.supplier ?? DEFAULT_INVENTORY_SUPPLIER;
  const created = await db.collection("inventory_products").create({
    name: display,
    name_key: key,
    unit: input.unit ?? "",
    category,
    supplier,
    sort: await nextSortInCategory(db, category),
    active: true,
    created_by: actor.id,
  });
  return { id: created.id, name: display, unit: input.unit, category, supplier };
}

/**
 * Modifica di un prodotto (solo admin). Nome duplicato (senza distinzione di maiuscole) → InventoryNameTakenError.
 * Le righe dei report storici non cambiano: conservano lo snapshot di fornitore, categoria e nome.
 */
export async function updateProduct(db: PocketBase, id: string, patch: InventoryProductUpdateInputType): Promise<void> {
  const current = await fetchOne(db, "inventory_products", id);
  if (!current) throw new UserFacingError("Prodotto non trovato.");

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const display = patch.name.trim().replace(/\s+/g, " ");
    const key = productNameKey(display);
    const clash = await db
      .collection("inventory_products")
      .getFirstListItem(db.filter("name_key = {:k} && id != {:id}", { k: key, id }))
      .catch(() => null);
    if (clash) throw new InventoryNameTakenError("Esiste già un prodotto con questo nome.");
    fields.name = display;
    fields.name_key = key;
  }
  if (patch.unit !== undefined) fields.unit = patch.unit ?? "";
  if (patch.category !== undefined) fields.category = patch.category;
  if (patch.supplier !== undefined) fields.supplier = patch.supplier;
  if (patch.sort !== undefined) fields.sort = patch.sort;
  if (patch.active !== undefined) fields.active = patch.active;
  if (Object.keys(fields).length === 0) return;

  await db.collection("inventory_products").update(id, fields);
}

export async function deactivateProduct(db: PocketBase, id: string): Promise<void> {
  const product = await fetchOne(db, "inventory_products", id);
  if (!product) throw new UserFacingError("Prodotto non trovato.");
  await db.collection("inventory_products").update(id, { active: false });
}

export interface SubmittedInventoryReport {
  id: string;
  /** Prodotti con quantità da ordinare. */
  toOrder: number;
  /** Prodotti con giacenza indicata. */
  present: number;
  /** Prodotti da ordinare per fornitore (solo fornitori con almeno un prodotto). */
  toOrderBySupplier: Partial<Record<InventorySupplier, number>>;
}

/**
 * Salva un report di giacenza: testata e righe in una batch. Ogni prodotto diventa fino a due righe
 * (presente = giacenza, da_ordinare = quantità da ordinare), con snapshot di fornitore e categoria.
 * I prodotti a testo libero vengono creati (o riattivati) prima.
 */
export async function submitInventoryReport(
  db: PocketBase,
  input: InventoryReportInputType,
  actor: InventoryActor,
): Promise<SubmittedInventoryReport> {
  const reportId = generateRecordId();
  const resolved: (InventoryLineSnapshot & { product_id: string })[] = [];

  for (const line of input.lines) {
    let ref: InventoryProductRef;
    if (line.product_id) {
      const product = await fetchOne(db, "inventory_products", line.product_id);
      if (!product) throw new UserFacingError("Uno dei prodotti non esiste più: ricarica la lista.");
      ref = refOf(product, line.unit);
    } else {
      ref = await ensureProduct(
        db,
        { name: line.product_name ?? "", unit: line.unit, category: line.category, supplier: null },
        actor,
      );
    }

    const snapshot = {
      product_id: ref.id,
      product_name: ref.name,
      unit: ref.unit,
      supplier: ref.supplier,
      category: ref.category,
    };
    if (line.stock > 0) resolved.push({ ...snapshot, state: "presente", quantity: line.stock });
    if (line.to_order > 0) resolved.push({ ...snapshot, state: "da_ordinare", quantity: line.to_order });
  }

  const rows = mergeReportLines(resolved);

  const batch = db.createBatch();
  batch.collection("inventory_reports").create({
    id: reportId,
    created_by: actor.id,
    created_by_name: actor.full_name,
    report_date: dayStartPb(input.report_date),
    notes: input.notes ?? "",
    status: "inviato",
  });
  resolved.forEach((line, index) => {
    batch.collection("inventory_report_lines").create({
      id: generateRecordId(),
      report: reportId,
      product: line.product_id,
      product_name: line.product_name,
      unit: line.unit ?? "",
      state: line.state,
      quantity: line.quantity,
      supplier: line.supplier,
      category: line.category,
      sort: index,
    });
  });
  await batch.send();

  return {
    id: reportId,
    toOrder: rows.filter((r) => (r.to_order ?? 0) > 0).length,
    present: rows.filter((r) => (r.stock ?? 0) > 0).length,
    toOrderBySupplier: countToOrderBySupplier(rows),
  };
}

/** Segna il report come visto dall'admin (una sola volta: le visite successive non cambiano il dato). */
export async function markReportSeen(db: PocketBase, id: string, actor: InventoryActor): Promise<void> {
  const report: PbRecord | null = await fetchOne(db, "inventory_reports", id);
  if (!report) throw new UserFacingError("Report non trovato.");
  if (report.status === "visto") return;
  await db.collection("inventory_reports").update(id, {
    status: "visto",
    seen_by: actor.id,
    seen_at: new Date().toISOString(),
  });
}
