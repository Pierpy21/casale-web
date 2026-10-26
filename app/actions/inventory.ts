"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { canManageInventory, canUseInventory } from "@/lib/permissions";
import { getInventoryProducts, getInventoryReport, getInventoryReports } from "@/lib/data/inventory";
import { notify } from "@/lib/notify";
import { deactivateProduct, ensureProduct, markReportSeen, submitInventoryReport as writeInventoryReport } from "@/lib/rpc/inventory";
import { InventoryProductInput, InventoryReportInput } from "@/lib/validation";
import type { ActionResult, InventoryProduct, InventoryReport } from "@/lib/types";

// Giacenza: admin e cucina. Solo l'admin disattiva prodotti e segna i report come visti.
// La cucina non modifica prenotazioni: questa sezione e' l'unico suo punto di scrittura.

function revalidateInventory(): void {
  revalidatePath("/admin/giacenza");
}

/** Elenco prodotti attivi (admin puo' chiedere anche i disattivati). */
export async function listInventoryProducts(opts?: {
  includeInactive?: boolean;
}): Promise<ActionResult<InventoryProduct[]>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;
  return { ok: true, data: await getInventoryProducts({ includeInactive: opts?.includeInactive }) };
}

/** Crea un prodotto (o lo riattiva se esiste gia' con lo stesso nome). */
export async function createInventoryProduct(input: unknown): Promise<ActionResult<{ id: string; name: string; unit: string | null }>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;

  const parsed = InventoryProductInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const product = await ensureProduct(
      auth.db,
      parsed.data.name,
      parsed.data.unit ?? null,
      parsed.data.category ?? null,
      { id: auth.profile.id, full_name: auth.profile.full_name },
    );
    revalidateInventory();
    return { ok: true, data: product };
  } catch (err) {
    return dbFail(err);
  }
}

/** Disattiva un prodotto (scompare dalla lista di scelta; i report storici restano). Solo admin. */
export async function deactivateInventoryProduct(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prodotto non valido.");
  const auth = await authorize(canManageInventory, "Solo l'amministratore può disattivare i prodotti.");
  if (!auth.ok) return auth;
  try {
    await deactivateProduct(auth.db, id);
  } catch (err) {
    return dbFail(err);
  }
  revalidateInventory();
  return { ok: true, data: undefined };
}

/**
 * Invia il report di giacenza (testata + righe in una batch) e avvisa l'admin con una notifica push.
 * Input: { report_date: "YYYY-MM-DD", notes?, lines: [{ product_id? | product_name, unit?, state: "presente"|"da_ordinare", quantity > 0 }] }
 */
export async function submitInventoryReport(
  input: unknown,
): Promise<ActionResult<{ id: string; to_order: number; present: number }>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;

  const parsed = InventoryReportInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  const actor = { id: auth.profile.id, full_name: auth.profile.full_name };
  let result: { id: string; toOrder: number; present: number };
  try {
    result = await writeInventoryReport(auth.db, parsed.data, actor);
  } catch (err) {
    return dbFail(err);
  }

  revalidateInventory();
  const date = parsed.data.report_date;
  const body = `${result.toOrder} da ordinare · ${result.present} presenti — da ${actor.full_name}`;
  after(() =>
    notify({
      type: "inventory_report",
      bookingId: null,
      title: `Giacenza ${date}`,
      body,
      actor,
      recipients: "all-except-actor",
      roles: ["admin"],
      url: `/admin/giacenza/${result.id}`,
    }),
  );
  return { ok: true, data: { id: result.id, to_order: result.toOrder, present: result.present } };
}

/** Storico dei report, più recenti per primi (senza righe), con filtro per data e paginazione. */
export async function listInventoryReports(opts?: {
  page?: number;
  perPage?: number;
  from?: string;
  to?: string;
}): Promise<ActionResult<{ items: InventoryReport[]; totalItems: number; totalPages: number }>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;
  const parsed = z
    .object({
      page: z.number().int().min(1).optional(),
      perPage: z.number().int().min(1).max(50).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .safeParse(opts ?? {});
  if (!parsed.success) return invalidInput(parsed.error);
  return { ok: true, data: await getInventoryReports(parsed.data) };
}

/** Un report con le sue righe. */
export async function getInventoryReportAction(id: string): Promise<ActionResult<InventoryReport>> {
  if (!isRecordId(id)) return fail("Report non valido.");
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;
  const report = await getInventoryReport(id);
  if (!report) return fail("Report non trovato.");
  return { ok: true, data: report };
}

/** Segna il report come visto (solo admin). */
export async function markInventoryReportSeen(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Report non valido.");
  const auth = await authorize(canManageInventory, "Solo l'amministratore può segnare i report.");
  if (!auth.ok) return auth;
  try {
    await markReportSeen(auth.db, id, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }
  revalidateInventory();
  return { ok: true, data: undefined };
}
