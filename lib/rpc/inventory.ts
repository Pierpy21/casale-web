import "server-only";
import type PocketBase from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import {
  DEFAULT_INVENTORY_CATEGORY,
  countToOrderBySupplier,
  defaultInventorySupplier,
  mergeReportLines,
  normalizeInventoryCategory,
  sortSuppliers,
  type InventoryLineSnapshot,
  type InventoryToOrderCount,
} from "@/lib/inventory-utils";
import { mapInventorySupplier } from "@/lib/pocketbase/mappers";
import { dayStartPb, generateRecordId, nn, num, type PbRecord } from "@/lib/pocketbase/helpers";
import { countWhere, fetchOne, listAll } from "@/lib/pocketbase/queries";
import type { InventoryReportInputType, InventoryProductUpdateInputType } from "@/lib/validation";
import type { InventoryCategory, InventorySupplier } from "@/lib/types";

// Giacenza: catalogo prodotti (nome univoco senza distinzione di maiuscole), fornitori (gestiti dall'admin) e report di invio.

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
  supplier_id: string;
}

/** Esiste già un altro record con lo stesso nome (prodotto o fornitore; controllo prima della scrittura). */
export class InventoryNameTakenError extends Error {}

/** Chiave di unicita' del nome (minuscolo, spazi compressi). Vale per prodotti e fornitori. */
export function productNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

function refOf(r: PbRecord, unitFallback: string | null): InventoryProductRef {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    unit: nn(r.unit) ?? unitFallback,
    category: normalizeInventoryCategory(r.category),
    supplier_id: String(r.supplier ?? ""),
  };
}

/** Tutti i fornitori (anche disattivati), in ordine di visualizzazione. */
export async function listSuppliers(db: PocketBase): Promise<InventorySupplier[]> {
  const records = await listAll(db, "inventory_suppliers", "");
  return sortSuppliers(records.map(mapInventorySupplier));
}

/** Fornitore attivo per id: errore se non esiste o è disattivato (non si assegna un fornitore spento). */
async function requireActiveSupplier(db: PocketBase, id: string): Promise<PbRecord> {
  const supplier = await fetchOne(db, "inventory_suppliers", id);
  if (!supplier) throw new UserFacingError("Fornitore non trovato.");
  if (supplier.active !== true) throw new UserFacingError("Il fornitore è disattivato: scegline un altro.");
  return supplier;
}

/** Fornitore predefinito (l'attivo "Altro", altrimenti il primo attivo). Errore se non ce n'è nessuno attivo. */
async function defaultSupplierId(db: PocketBase): Promise<string> {
  const fallback = defaultInventorySupplier(await listSuppliers(db));
  if (!fallback) throw new UserFacingError("Non ci sono fornitori attivi: attivane uno dalla giacenza.");
  return fallback.id;
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
 * Senza fornitore (cucina, o testo libero) si usa il fornitore predefinito.
 */
export async function ensureProduct(
  db: PocketBase,
  input: { name: string; unit: string | null; category: InventoryCategory | null; supplier_id: string | null },
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
  const supplierId = input.supplier_id ?? (await defaultSupplierId(db));
  await requireActiveSupplier(db, supplierId);
  const created = await db.collection("inventory_products").create({
    name: display,
    name_key: key,
    unit: input.unit ?? "",
    category,
    supplier: supplierId,
    sort: await nextSortInCategory(db, category),
    active: true,
    created_by: actor.id,
  });
  return { id: created.id, name: display, unit: input.unit, category, supplier_id: supplierId };
}

/**
 * Modifica di un prodotto (solo admin). Nome duplicato (senza distinzione di maiuscole) → InventoryNameTakenError.
 * Cambiare fornitore richiede un fornitore attivo. Le righe dei report storici non cambiano: conservano lo snapshot di fornitore, categoria e nome.
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
  if (patch.supplier_id !== undefined) {
    if (patch.supplier_id !== String(current.supplier ?? "")) await requireActiveSupplier(db, patch.supplier_id);
    fields.supplier = patch.supplier_id;
  }
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

/** Crea un fornitore attivo, in fondo all'elenco. Nome già usato (senza distinzione di maiuscole) → InventoryNameTakenError. */
export async function createSupplier(db: PocketBase, name: string): Promise<string> {
  const display = name.trim().replace(/\s+/g, " ");
  const key = productNameKey(display);
  await assertSupplierNameFree(db, key, null);
  const suppliers = await listSuppliers(db);
  const sort = suppliers.reduce((max, s) => Math.max(max, s.sort), -1) + 1;
  const created = await db.collection("inventory_suppliers").create({ name: display, name_key: key, sort, active: true });
  return created.id;
}

/** Rinomina un fornitore. Le righe dei report storici conservano il nome vecchio (snapshot). */
export async function renameSupplier(db: PocketBase, id: string, name: string): Promise<void> {
  const current = await fetchOne(db, "inventory_suppliers", id);
  if (!current) throw new UserFacingError("Fornitore non trovato.");
  const display = name.trim().replace(/\s+/g, " ");
  const key = productNameKey(display);
  await assertSupplierNameFree(db, key, id);
  await db.collection("inventory_suppliers").update(id, { name: display, name_key: key });
}

/** Attiva o disattiva un fornitore. Disattivato: non si può assegnare a nuovi prodotti, ma i prodotti e i report esistenti restano. */
export async function updateSupplierActive(db: PocketBase, id: string, active: boolean): Promise<void> {
  const current = await fetchOne(db, "inventory_suppliers", id);
  if (!current) throw new UserFacingError("Fornitore non trovato.");
  await db.collection("inventory_suppliers").update(id, { active });
}

/**
 * Nuovo ordine dei fornitori: `ids` deve contenere tutti i fornitori, una volta sola. Il sort diventa la posizione (0, 1, …).
 * Se l'elenco è cambiato nel frattempo (fornitori aggiunti o eliminati) → errore, la pagina va ricaricata.
 */
export async function reorderSuppliers(db: PocketBase, ids: string[]): Promise<void> {
  const current = await listSuppliers(db);
  const known = new Set(current.map((s) => s.id));
  if (ids.length !== current.length || ids.some((id) => !known.has(id))) {
    throw new UserFacingError("L'elenco dei fornitori è cambiato: ricarica la pagina.");
  }
  const batch = db.createBatch();
  let changes = 0;
  ids.forEach((id, index) => {
    const supplier = current.find((s) => s.id === id);
    if (supplier && supplier.sort !== index) {
      batch.collection("inventory_suppliers").update(id, { sort: index });
      changes++;
    }
  });
  if (changes > 0) await batch.send();
}

/**
 * Elimina un fornitore che nessun prodotto e nessuna riga di report usa. Altrimenti lo disattiva e restituisce `deleted: false`:
 * le righe storiche devono poter risalire al fornitore.
 */
export async function removeSupplier(db: PocketBase, id: string): Promise<{ deleted: boolean }> {
  const current = await fetchOne(db, "inventory_suppliers", id);
  if (!current) throw new UserFacingError("Fornitore non trovato.");
  const products = await countWhere(db, "inventory_products", db.filter("supplier = {:id}", { id }));
  const lines = await countWhere(db, "inventory_report_lines", db.filter("supplier = {:id}", { id }));
  if (products > 0 || lines > 0) {
    await db.collection("inventory_suppliers").update(id, { active: false });
    return { deleted: false };
  }
  await db.collection("inventory_suppliers").delete(id);
  return { deleted: true };
}

/** Controllo del nome fornitore (unicità senza distinzione di maiuscole), escluso il fornitore stesso se `exceptId`. */
async function assertSupplierNameFree(db: PocketBase, key: string, exceptId: string | null): Promise<void> {
  const filter = exceptId
    ? db.filter("name_key = {:k} && id != {:id}", { k: key, id: exceptId })
    : db.filter("name_key = {:k}", { k: key });
  const clash = await db
    .collection("inventory_suppliers")
    .getFirstListItem(filter)
    .catch(() => null);
  if (clash) throw new InventoryNameTakenError("Esiste già un fornitore con questo nome.");
}

export interface SubmittedInventoryReport {
  id: string;
  /** Prodotti con quantità da ordinare. */
  toOrder: number;
  /** Prodotti con giacenza indicata. */
  present: number;
  /** Prodotti da ordinare per fornitore, nell'ordine dei fornitori (solo quelli con almeno un prodotto). */
  toOrderBySupplier: InventoryToOrderCount[];
}

/** settings.batch.maxRequests di PocketBase (migrazione 1793000000_casale_schema.js). */
const BATCH_MAX_REQUESTS = 500;

type ResolvedReportLine = InventoryLineSnapshot & { product_id: string };

/**
 * Righe del report dall'input: ogni prodotto diventa fino a due righe (presente = giacenza, da_ordinare = quantità
 * da ordinare), con snapshot di fornitore (id e nome) e categoria. I prodotti a testo libero vengono creati (o riattivati).
 */
async function resolveReportLines(
  db: PocketBase,
  input: InventoryReportInputType,
  actor: InventoryActor,
): Promise<ResolvedReportLine[]> {
  const resolved: ResolvedReportLine[] = [];
  // Nome del fornitore letto una volta per fornitore (lo snapshot è quello del momento dell'invio).
  const supplierNames = new Map<string, string>();
  const supplierNameOf = async (id: string): Promise<string> => {
    const known = supplierNames.get(id);
    if (known !== undefined) return known;
    const supplier = await fetchOne(db, "inventory_suppliers", id);
    if (!supplier) throw new UserFacingError("Uno dei fornitori non esiste più: ricarica la pagina.");
    const name = String(supplier.name ?? "");
    supplierNames.set(id, name);
    return name;
  };

  for (const line of input.lines) {
    let ref: InventoryProductRef;
    if (line.product_id) {
      const product = await fetchOne(db, "inventory_products", line.product_id);
      if (!product) throw new UserFacingError("Uno dei prodotti non esiste più: ricarica la lista.");
      ref = refOf(product, line.unit);
    } else {
      ref = await ensureProduct(
        db,
        { name: line.product_name ?? "", unit: line.unit, category: line.category, supplier_id: null },
        actor,
      );
    }

    const snapshot = {
      product_id: ref.id,
      product_name: ref.name,
      unit: ref.unit,
      supplier_id: ref.supplier_id,
      supplier_name: await supplierNameOf(ref.supplier_id),
      category: ref.category,
    };
    if (line.stock > 0) resolved.push({ ...snapshot, state: "presente", quantity: line.stock });
    if (line.to_order > 0) resolved.push({ ...snapshot, state: "da_ordinare", quantity: line.to_order });
  }
  return resolved;
}

/** Aggiunge alla batch le righe del report, nell'ordine dato. */
function addReportLines(batch: ReturnType<PocketBase["createBatch"]>, reportId: string, lines: ResolvedReportLine[]): void {
  lines.forEach((line, index) => {
    batch.collection("inventory_report_lines").create({
      id: generateRecordId(),
      report: reportId,
      product: line.product_id,
      product_name: line.product_name,
      unit: line.unit ?? "",
      state: line.state,
      quantity: line.quantity,
      supplier: line.supplier_id,
      supplier_name: line.supplier_name,
      category: line.category,
      sort: index,
    });
  });
}

async function summarize(db: PocketBase, reportId: string, lines: ResolvedReportLine[]): Promise<SubmittedInventoryReport> {
  const rows = mergeReportLines(lines);
  return {
    id: reportId,
    toOrder: rows.filter((r) => (r.to_order ?? 0) > 0).length,
    present: rows.filter((r) => (r.stock ?? 0) > 0).length,
    toOrderBySupplier: countToOrderBySupplier(rows, await listSuppliers(db)),
  };
}

/** Salva un report di giacenza: testata e righe in una batch (righe da resolveReportLines). */
export async function submitInventoryReport(
  db: PocketBase,
  input: InventoryReportInputType,
  actor: InventoryActor,
): Promise<SubmittedInventoryReport> {
  const reportId = generateRecordId();
  const resolved = await resolveReportLines(db, input, actor);

  const batch = db.createBatch();
  batch.collection("inventory_reports").create({
    id: reportId,
    created_by: actor.id,
    created_by_name: actor.full_name,
    report_date: dayStartPb(input.report_date),
    notes: input.notes ?? "",
    status: "inviato",
  });
  addReportLines(batch, reportId, resolved);
  await batch.send();

  return summarize(db, reportId, resolved);
}

/**
 * Modifica un report già inviato: data, note e righe (le righe vecchie sono sostituite), in una batch.
 * Il report torna "inviato" (se l'admin l'aveva già visto, deve rivederlo). Autore e data di creazione restano.
 */
export async function updateInventoryReport(
  db: PocketBase,
  reportId: string,
  input: InventoryReportInputType,
  actor: InventoryActor,
): Promise<SubmittedInventoryReport> {
  const resolved = await resolveReportLines(db, input, actor);
  const oldLines = await listAll(db, "inventory_report_lines", db.filter("report = {:r}", { r: reportId }), { fields: "id" });
  // Una sola batch (tutto o niente): testata + righe vecchie da eliminare + righe nuove entro maxRequests (500).
  if (1 + oldLines.length + resolved.length > BATCH_MAX_REQUESTS) {
    throw new UserFacingError("Il report ha troppe righe per essere modificato in una volta: invia una nuova giacenza.");
  }

  const batch = db.createBatch();
  batch.collection("inventory_reports").update(reportId, {
    report_date: dayStartPb(input.report_date),
    notes: input.notes ?? "",
    status: "inviato",
    seen_by: "",
    seen_at: "",
  });
  for (const line of oldLines) batch.collection("inventory_report_lines").delete(line.id);
  addReportLines(batch, reportId, resolved);
  await batch.send();

  return summarize(db, reportId, resolved);
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
