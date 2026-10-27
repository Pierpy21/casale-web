import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { dayEndPb, dayStartPb, isRecordId } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll } from "@/lib/pocketbase/queries";
import { mapInventoryLine, mapInventoryProduct, mapInventoryReport } from "@/lib/pocketbase/mappers";
import { canUseInventory, isAdmin } from "@/lib/permissions";
import { compareInventoryProducts } from "@/lib/inventory-utils";
import type { InventoryProduct, InventoryReport } from "@/lib/types";

// Giacenza: leggibile da admin e cucina. Gli accessi passano dal client di servizio dopo il controllo del profilo.

export async function getInventoryProducts(opts?: { includeInactive?: boolean }): Promise<InventoryProduct[]> {
  const me = await getCurrentProfile();
  if (!me || !canUseInventory(me)) return [];
  const db = await getAdminPb();
  const includeInactive = Boolean(opts?.includeInactive) && isAdmin(me);
  const filter = includeInactive ? "" : db.filter("active = {:a}", { a: true });
  const records = await listAll(db, "inventory_products", filter);
  return records.map(mapInventoryProduct).sort(compareInventoryProducts);
}

/** Storico dei report (senza righe), più recenti per primi, con filtro per data e paginazione. */
export async function getInventoryReports(opts: {
  page?: number;
  perPage?: number;
  from?: string;
  to?: string;
}): Promise<{ items: InventoryReport[]; totalItems: number; totalPages: number }> {
  const me = await getCurrentProfile();
  if (!me || !canUseInventory(me)) return { items: [], totalItems: 0, totalPages: 0 };
  const db = await getAdminPb();

  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) {
    clauses.push("report_date >= {:from}");
    params.from = dayStartPb(opts.from);
  }
  if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    clauses.push("report_date <= {:to}");
    params.to = dayEndPb(opts.to);
  }
  const filter = clauses.length > 0 ? db.filter(clauses.join(" && "), params) : "";

  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const perPage = Math.max(1, Math.min(50, Math.floor(opts.perPage ?? 20)));
  const res = await db.collection("inventory_reports").getList(page, perPage, {
    filter: filter || undefined,
    sort: "-report_date,-created",
  });
  return {
    items: (res.items as unknown as Parameters<typeof mapInventoryReport>[0][]).map((r) => mapInventoryReport(r)),
    totalItems: res.totalItems,
    totalPages: res.totalPages,
  };
}

/** Un report con le sue righe (da ordinare prima, poi presenti). Null se non esiste o non e' leggibile. */
export async function getInventoryReport(id: string): Promise<InventoryReport | null> {
  if (!isRecordId(id)) return null;
  const me = await getCurrentProfile();
  if (!me || !canUseInventory(me)) return null;
  const db = await getAdminPb();
  const record = await fetchOne(db, "inventory_reports", id);
  if (!record) return null;
  const lines = (await listAll(db, "inventory_report_lines", db.filter("report = {:id}", { id }), { sort: "sort" }))
    .map(mapInventoryLine)
    .sort((a, b) => (a.state === b.state ? a.sort - b.sort : a.state === "da_ordinare" ? -1 : 1));
  return mapInventoryReport(record, lines);
}
