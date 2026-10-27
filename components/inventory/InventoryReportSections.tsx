import { DocumentDownload, buttonClasses, cn } from "@/components/ui";
import { groupOrderRowsBySupplier, mergeReportLines, type InventoryOrderRow } from "@/lib/inventory-utils";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryReport,
  type InventorySupplier,
} from "@/lib/types";
import { inventoryPdfFileName, inventoryPdfHref } from "./inventory-links";

/** Admin: per fornitore (con PDF della lista d'ordine). Cucina: per categoria. */
export type InventoryReportGrouping = "supplier" | "category";

interface ReportSection {
  id: string;
  label: string;
  rows: InventoryOrderRow[];
  /** Presente solo nel raggruppamento per fornitore: serve per il PDF della lista d'ordine. */
  supplier?: InventorySupplier;
}

const quantity = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString("it-IT", { maximumFractionDigits: 3 });

const byName = (a: InventoryOrderRow, b: InventoryOrderRow) => a.name.localeCompare(b.name, "it");

function buildSections(report: InventoryReport, grouping: InventoryReportGrouping): ReportSection[] {
  const rows = mergeReportLines(report.lines);
  if (grouping === "supplier") {
    return groupOrderRowsBySupplier(rows).map((group) => ({
      id: `fornitore-${group.key}`,
      label: group.label,
      rows: group.items,
      supplier: group.key,
    }));
  }
  return INVENTORY_CATEGORIES.map((category) => ({
    id: `categoria-${category}`,
    label: INVENTORY_CATEGORY_LABELS[category],
    rows: rows.filter((row) => row.category === category).sort(byName),
  })).filter((section) => section.rows.length > 0);
}

/** Corpo del report: una tabella per fornitore (admin) o per categoria (cucina). */
export function InventoryReportSections({ report, grouping }: { report: InventoryReport; grouping: InventoryReportGrouping }) {
  const sections = buildSections(report, grouping);

  if (sections.length === 0) {
    return <p className="text-[16px] text-slate-dark">Nessun prodotto in questo report.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-10">
      {sections.map((section) => {
        const toOrder = section.rows.filter((row) => (row.to_order ?? 0) > 0).length;
        return (
          <section key={section.id} aria-labelledby={section.id} className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sand pb-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id={section.id} className="text-2xl leading-tight wrap-anywhere">
                  {section.label}
                </h2>
                <p className="text-[13px] tabular-nums text-slate-dark">
                  <span className={cn(toOrder > 0 && "font-semibold text-ink")}>{toOrder} da ordinare</span>
                  {" · "}
                  {section.rows.length} {section.rows.length === 1 ? "prodotto" : "prodotti"}
                </p>
              </div>
              {section.supplier && (
                <DocumentDownload
                  href={inventoryPdfHref(report.id, section.supplier)}
                  fileName={inventoryPdfFileName(report.report_date, section.supplier)}
                  mimeType="application/pdf"
                  className={buttonClasses("outline", "sm", "min-h-11")}
                >
                  PDF ordine
                </DocumentDownload>
              )}
            </div>
            <OrderTable rows={section.rows} />
          </section>
        );
      })}
    </div>
  );
}

function OrderTable({ rows }: { rows: InventoryOrderRow[] }) {
  return (
    <div className="overflow-x-auto border border-sand bg-paper">
      <table className="w-full border-collapse text-left text-[15px]">
        <thead className="bg-cream/60 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-dark">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Articolo
            </th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
              Unità
            </th>
            <th scope="col" className="w-24 px-3 py-2.5 text-right font-medium sm:w-32">
              Giacenza
            </th>
            <th scope="col" className="w-28 px-3 py-2.5 text-right font-medium sm:w-36">
              Da ordinare
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand">
          {rows.map((row) => {
            const toOrder = (row.to_order ?? 0) > 0;
            return (
              <tr key={row.key} className={cn(toOrder && "bg-warning/10")}>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="block wrap-anywhere text-ink">{row.name}</span>
                  {row.unit && <span className="block text-[13px] text-slate-dark sm:hidden">{row.unit}</span>}
                </th>
                <td className="hidden px-4 py-3 text-slate-dark sm:table-cell">{row.unit ?? ""}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-dark">{quantity(row.stock)}</td>
                <td className={cn("px-3 py-3 text-right tabular-nums", toOrder ? "text-[17px] font-bold text-ink" : "text-slate")}>
                  {quantity(row.to_order)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
