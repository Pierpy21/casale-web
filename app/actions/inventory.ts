"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { canManageInventory, canUseInventory, isAdmin } from "@/lib/permissions";
import { getInventoryProducts, getInventoryReport, getInventoryReports } from "@/lib/data/inventory";
import { formatToOrderSummary } from "@/lib/inventory-utils";
import { checkConflictById, withMutation } from "@/lib/mutations";
import type { MutationOptions } from "@/lib/offline/contract";
import { fetchOne } from "@/lib/pocketbase/queries";
import { notify } from "@/lib/notify";
import {
  InventoryNameTakenError,
  deactivateProduct,
  ensureProduct,
  markReportSeen,
  submitInventoryReport as writeInventoryReport,
  updateProduct,
  type InventoryProductRef,
} from "@/lib/rpc/inventory";
import { InventoryProductInput, InventoryProductUpdateInput, InventoryReportInput } from "@/lib/validation";
import type { ActionResult, InventoryProduct, InventoryReport, InventorySupplier } from "@/lib/types";

// Giacenza: admin e cucina. Solo l'admin modifica il catalogo (fornitore, categoria, ordine, attivo),
// disattiva prodotti e segna i report come visti. La cucina non modifica prenotazioni.

type SubmittedReport = {
  id: string;
  to_order: number;
  present: number;
  to_order_by_supplier: Partial<Record<InventorySupplier, number>>;
};

function revalidateInventory(): void {
  revalidatePath("/admin/giacenza");
}

/** Elenco prodotti attivi (admin puo' chiedere anche i disattivati). Ordine: categoria, ordine manuale, nome. */
export async function listInventoryProducts(opts?: {
  includeInactive?: boolean;
}): Promise<ActionResult<InventoryProduct[]>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;
  return { ok: true, data: await getInventoryProducts({ includeInactive: opts?.includeInactive }) };
}

/**
 * Crea un prodotto (o lo riattiva se esiste gia' con lo stesso nome). Il fornitore lo sceglie solo l'admin;
 * per la cucina resta "altro". Categoria vuota → altro.
 */
export async function createInventoryProduct(input: unknown, opts?: MutationOptions): Promise<ActionResult<InventoryProductRef>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "inventory.createInventoryProduct", auth.profile.id, async (): Promise<ActionResult<InventoryProductRef>> => {
    const parsed = InventoryProductInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    try {
      const product = await ensureProduct(
        auth.db,
        {
          name: parsed.data.name,
          unit: parsed.data.unit ?? null,
          category: parsed.data.category ?? null,
          supplier: isAdmin(auth.profile) ? (parsed.data.supplier ?? null) : null,
        },
        { id: auth.profile.id, full_name: auth.profile.full_name },
      );
      revalidateInventory();
      return { ok: true, data: product };
    } catch (err) {
      return dbFail(err);
    }
  });
}

/** Modifica un prodotto del catalogo (solo admin). Nome già usato da un altro prodotto → fieldErrors.name. */
export async function updateInventoryProduct(id: string, input: unknown, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prodotto non valido.");
  const auth = await authorize(canManageInventory, "Solo l'amministratore può modificare i prodotti.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "inventory.updateInventoryProduct", auth.profile.id, async (): Promise<ActionResult> => {
    const parsed = InventoryProductUpdateInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    const conflict = await checkConflictById(auth.db, "inventory_products", id, opts);
    if (conflict) return conflict;

    try {
      await updateProduct(auth.db, id, parsed.data);
    } catch (err) {
      if (err instanceof InventoryNameTakenError) {
        return { ok: false, error: err.message, fieldErrors: { name: [err.message] } };
      }
      return dbFail(err);
    }
    revalidateInventory();
    return { ok: true, data: undefined };
  });
}

/** Disattiva un prodotto (scompare dalla lista di scelta; i report storici restano). Solo admin. */
export async function deactivateInventoryProduct(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prodotto non valido.");
  const auth = await authorize(canManageInventory, "Solo l'amministratore può disattivare i prodotti.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "inventory.deactivateInventoryProduct", auth.profile.id, async (): Promise<ActionResult> => {
    // Coda offline: prodotto già eliminato (solo nel reinvio) = successo. Dal form resta com'era.
    if (opts?.replay === true && !(await fetchOne(auth.db, "inventory_products", id))) return { ok: true, data: undefined };
    const conflict = await checkConflictById(auth.db, "inventory_products", id, opts);
    if (conflict) return conflict;

    try {
      await deactivateProduct(auth.db, id);
    } catch (err) {
      return dbFail(err);
    }
    revalidateInventory();
    return { ok: true, data: undefined };
  });
}

/**
 * Invia il report di giacenza (testata + righe in una batch) e avvisa l'admin con una notifica push.
 * Input: { report_date: "YYYY-MM-DD", notes?, lines: [{ product_id? | product_name?, unit?, category?, stock?: number>=0, to_order?: number>=0 }] }
 * (almeno uno tra stock e to_order > 0 per riga). Formato precedente accettato: { product_id? | product_name?, unit?, state, quantity > 0 }.
 */
export async function submitInventoryReport(input: unknown, opts?: MutationOptions): Promise<ActionResult<SubmittedReport>> {
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "inventory.submitInventoryReport", auth.profile.id, async (): Promise<ActionResult<SubmittedReport>> => {
    const parsed = InventoryReportInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    const actor = { id: auth.profile.id, full_name: auth.profile.full_name };
    let result: Awaited<ReturnType<typeof writeInventoryReport>>;
    try {
      result = await writeInventoryReport(auth.db, parsed.data, actor);
    } catch (err) {
      return dbFail(err);
    }

    revalidateInventory();
    const date = parsed.data.report_date;
    const summary = formatToOrderSummary(result.toOrderBySupplier);
    const body = `${summary ? `Da ordinare: ${summary}` : "Nessun prodotto da ordinare"} · ${result.present} presenti — da ${actor.full_name}`;
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
    return {
      ok: true,
      data: {
        id: result.id,
        to_order: result.toOrder,
        present: result.present,
        to_order_by_supplier: result.toOrderBySupplier,
      },
    };
  });
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

/** Un report con le sue righe (ogni riga porta fornitore e categoria). */
export async function getInventoryReportAction(id: string): Promise<ActionResult<InventoryReport>> {
  if (!isRecordId(id)) return fail("Report non valido.");
  const auth = await authorize(canUseInventory, "Non sei autorizzato alla giacenza.");
  if (!auth.ok) return auth;
  const report = await getInventoryReport(id);
  if (!report) return fail("Report non trovato.");
  return { ok: true, data: report };
}

/** Segna il report come visto (solo admin). */
export async function markInventoryReportSeen(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Report non valido.");
  const auth = await authorize(canManageInventory, "Solo l'amministratore può segnare i report.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "inventory.markInventoryReportSeen", auth.profile.id, async (): Promise<ActionResult> => {
    try {
      await markReportSeen(auth.db, id, { id: auth.profile.id, full_name: auth.profile.full_name });
    } catch (err) {
      return dbFail(err);
    }
    revalidateInventory();
    return { ok: true, data: undefined };
  });
}
