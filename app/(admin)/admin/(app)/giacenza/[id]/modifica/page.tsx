import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { capitalize, formatIt, toDate, todayISO } from "@/components/agenda/agenda-utils";
import { InventoryGroupingToggle, resolveInventoryGrouping } from "@/components/inventory/InventoryGroupingToggle";
import { InventoryReportForm } from "@/components/inventory/InventoryReportForm";
import type { InventoryDraftCount } from "@/components/inventory/inventory-draft";
import { isUuid } from "@/lib/action-utils";
import { requireProfile } from "@/lib/auth";
import { getInventoryProducts, getInventoryReport, getInventorySuppliers } from "@/lib/data/inventory";
import { compareInventoryProducts } from "@/lib/inventory-utils";
import { canChooseInventoryGrouping, canEditInventoryReport, canUseInventory } from "@/lib/permissions";
import type { InventoryProduct } from "@/lib/types";

export const metadata: Metadata = {
  title: "Modifica giacenza · Casale del Notaio",
};

/** Modifica di un report già inviato: stesso modulo della nuova giacenza, compilato con le righe salvate. */
export default async function EditInventoryReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ raggruppa?: string }>;
}) {
  const profile = await requireProfile();
  if (!canUseInventory(profile)) redirect("/admin/agenda");

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const grouping = resolveInventoryGrouping(profile, (await searchParams).raggruppa);

  const [report, activeProducts, suppliers] = await Promise.all([
    getInventoryReport(id),
    getInventoryProducts(),
    getInventorySuppliers({ includeInactive: true }),
  ]);
  if (!report) notFound();
  if (!canEditInventoryReport(profile)) redirect(`/admin/giacenza/${id}`);

  // Quantità salvate per prodotto. I prodotti disattivati nel frattempo restano nell'elenco (dallo snapshot della riga).
  const counts: Record<string, InventoryDraftCount> = {};
  const products: InventoryProduct[] = [...activeProducts];
  const known = new Set(activeProducts.map((p) => p.id));
  for (const line of report.lines) {
    if (!line.product_id) continue;
    const count = (counts[line.product_id] ??= { stock: 0, to_order: 0 });
    if (line.state === "presente") count.stock += line.quantity;
    else count.to_order += line.quantity;
    if (!known.has(line.product_id)) {
      known.add(line.product_id);
      products.push({
        id: line.product_id,
        name: line.product_name,
        unit: line.unit,
        category: line.category,
        supplier_id: line.supplier_id,
        sort: line.sort,
        active: false,
        updated_at: "",
      });
    }
  }
  products.sort(compareInventoryProducts);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-3 border-b border-sand pb-5">
        <Link href={`/admin/giacenza/${id}`} className="w-fit rounded-[2px] text-[13px] font-medium text-petrol underline-offset-4 hover:underline">
          ← Torna alla giacenza
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Modifica giacenza</p>
        <h1 className="text-3xl leading-tight wrap-anywhere sm:text-4xl">
          {capitalize(formatIt(toDate(report.report_date), "EEEE d MMMM yyyy"))}
        </h1>
      </header>
      {canChooseInventoryGrouping(profile) && <InventoryGroupingToggle grouping={grouping} basePath={`/admin/giacenza/${report.id}/modifica`} />}
      <InventoryReportForm
        products={products}
        suppliers={suppliers}
        today={todayISO()}
        groupBy={grouping}
        edit={{ reportId: report.id, reportDate: report.report_date, notes: report.notes ?? "", counts }}
      />
    </div>
  );
}
