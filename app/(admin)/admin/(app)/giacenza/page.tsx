import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { todayISO } from "@/components/agenda/agenda-utils";
import { InventoryHistory, type InventoryHistoryRow } from "@/components/inventory/InventoryHistory";
import { InventoryReportForm } from "@/components/inventory/InventoryReportForm";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { getInventoryProducts, getInventoryReport, getInventoryReports } from "@/lib/data/inventory";
import { canManageInventory, canUseInventory } from "@/lib/permissions";
import { countToOrderBySupplier, formatToOrderSummary, mergeReportLines } from "@/lib/inventory-utils";

export const metadata: Metadata = {
  title: "Giacenza · Casale del Notaio",
};

const PER_PAGE = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Promise<{ page?: string; from?: string; to?: string }>;

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (!canUseInventory(profile)) redirect("/admin/agenda");

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = params.from && ISO_DATE.test(params.from) ? params.from : undefined;
  const to = params.to && ISO_DATE.test(params.to) ? params.to : undefined;

  const [products, history] = await Promise.all([
    getInventoryProducts(),
    getInventoryReports({ page, perPage: PER_PAGE, from, to }),
  ]);

  // La lista dei report non include le righe: per i conteggi si leggono i singoli report della pagina.
  const details = await Promise.all(history.items.map((report) => getInventoryReport(report.id)));
  const rows: InventoryHistoryRow[] = history.items.map((report, index) => {
    const order = mergeReportLines(details[index]?.lines ?? []);
    return {
      report,
      toOrder: order.filter((row) => (row.to_order ?? 0) > 0).length,
      present: order.filter((row) => (row.stock ?? 0) > 0).length,
      toOrderSummary: formatToOrderSummary(countToOrderBySupplier(order)),
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        compact
        eyebrow="Cucina e amministrazione"
        title="Giacenza"
        actions={
          canManageInventory(profile) ? (
            <ButtonLink href="/admin/giacenza/prodotti" variant="outline" size="sm">
              Gestisci prodotti
            </ButtonLink>
          ) : undefined
        }
      />

      <section aria-labelledby="nuova-giacenza" className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1 border-b border-sand pb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Inventario</p>
          <h2 id="nuova-giacenza" className="text-2xl">
            Nuova giacenza
          </h2>
        </div>
        <InventoryReportForm products={products} today={todayISO()} groupBy={canManageInventory(profile) ? "supplier" : "category"} />
      </section>

      <InventoryHistory
        rows={rows}
        page={page}
        totalPages={history.totalPages}
        totalItems={history.totalItems}
        from={from}
        to={to}
      />
    </div>
  );
}
