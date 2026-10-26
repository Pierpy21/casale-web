import "server-only";
import type PocketBase from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { dayStartPb, generateRecordId, nn, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import type { InventoryReportInputType } from "@/lib/validation";

// Giacenza: catalogo prodotti (nome univoco senza distinzione di maiuscole) e report di invio.

export interface InventoryActor {
  id: string;
  full_name: string;
}

/** Chiave di unicita' del nome prodotto (minuscolo, spazi compressi). */
export function productNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

/**
 * Trova il prodotto per nome o lo crea (attivo). Un prodotto disattivato viene riattivato:
 * chi lo scrive nel report lo vuole di nuovo in lista.
 */
export async function ensureProduct(
  db: PocketBase,
  name: string,
  unit: string | null,
  category: string | null,
  actor: InventoryActor,
): Promise<{ id: string; name: string; unit: string | null }> {
  const display = name.trim().replace(/\s+/g, " ");
  const key = productNameKey(display);
  const existing = await db
    .collection("inventory_products")
    .getFirstListItem(db.filter("name_key = {:k}", { k: key }))
    .catch(() => null);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.active !== true) patch.active = true;
    if (unit && !nn(existing.unit)) patch.unit = unit;
    if (Object.keys(patch).length > 0) await db.collection("inventory_products").update(existing.id, patch);
    return { id: existing.id, name: String(existing.name), unit: nn(existing.unit) ?? unit };
  }
  const created = await db.collection("inventory_products").create({
    name: display,
    name_key: key,
    unit: unit ?? "",
    category: category ?? "",
    active: true,
    created_by: actor.id,
  });
  return { id: created.id, name: display, unit };
}

export async function deactivateProduct(db: PocketBase, id: string): Promise<void> {
  const product = await fetchOne(db, "inventory_products", id);
  if (!product) throw new UserFacingError("Prodotto non trovato.");
  await db.collection("inventory_products").update(id, { active: false });
}

/**
 * Salva un report di giacenza: testata e righe in una batch. I prodotti scritti a testo libero
 * vengono creati (o riattivati) prima. Ritorna id del report e conteggi per la notifica.
 */
export async function submitInventoryReport(
  db: PocketBase,
  input: InventoryReportInputType,
  actor: InventoryActor,
): Promise<{ id: string; toOrder: number; present: number }> {
  const reportId = generateRecordId();
  const resolved: Array<{ product: string | null; name: string; unit: string | null; state: string; quantity: number }> = [];

  for (const line of input.lines) {
    if (line.product_id) {
      const product = await fetchOne(db, "inventory_products", line.product_id);
      if (!product) throw new UserFacingError("Uno dei prodotti non esiste più: ricarica la lista.");
      resolved.push({
        product: product.id,
        name: String(product.name),
        unit: nn(product.unit) ?? line.unit ?? null,
        state: line.state,
        quantity: line.quantity,
      });
    } else {
      const product = await ensureProduct(db, line.product_name ?? "", line.unit ?? null, null, actor);
      resolved.push({ product: product.id, name: product.name, unit: product.unit, state: line.state, quantity: line.quantity });
    }
  }

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
      product: line.product ?? "",
      product_name: line.name,
      unit: line.unit ?? "",
      state: line.state,
      quantity: line.quantity,
      sort: index,
    });
  });
  await batch.send();

  return {
    id: reportId,
    toOrder: resolved.filter((l) => l.state === "da_ordinare").length,
    present: resolved.filter((l) => l.state === "presente").length,
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
