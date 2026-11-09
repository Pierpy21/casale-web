import Link from "next/link";
import { cn } from "@/components/ui";
import { canChooseInventoryGrouping, isAdmin } from "@/lib/permissions";
import type { Profile } from "@/lib/types";
import type { InventoryReportGrouping } from "./InventoryReportSections";

/** Parametro dell'URL per il raggruppamento della giacenza: ?raggruppa=categoria | fornitore. */
export const INVENTORY_GROUPING_PARAM = "raggruppa";

/**
 * Raggruppamento effettivo della giacenza. Solo admin e amministratore cucina lo scelgono (con il parametro);
 * tutti gli altri vedono sempre per categoria. Default: fornitore per l'admin, categoria per l'amministratore cucina.
 */
export function resolveInventoryGrouping(profile: Profile, raw: string | undefined): InventoryReportGrouping {
  if (!canChooseInventoryGrouping(profile)) return "category";
  if (raw === "fornitore") return "supplier";
  if (raw === "categoria") return "category";
  return isAdmin(profile) ? "supplier" : "category";
}

const OPTIONS: Array<{ grouping: InventoryReportGrouping; label: string; param: string }> = [
  { grouping: "category", label: "Per categoria", param: "categoria" },
  { grouping: "supplier", label: "Per fornitore", param: "fornitore" },
];

export interface InventoryGroupingToggleProps {
  /** Raggruppamento attivo. */
  grouping: InventoryReportGrouping;
  /** Percorso della pagina (senza query): i link restano sulla stessa pagina. */
  basePath: string;
}

/**
 * Scelta del raggruppamento (categoria o fornitore) per admin e amministratore cucina.
 * Due link (niente stato client): la pagina riceve ?raggruppa= e rende la giacenza con il raggruppamento scelto.
 */
export function InventoryGroupingToggle({ grouping, basePath }: InventoryGroupingToggleProps) {
  return (
    <nav aria-label="Raggruppa la giacenza" className="no-print">
      <ul className="inline-flex max-w-full flex-wrap gap-1 rounded-btn border border-sand bg-paper p-1">
        {OPTIONS.map((option) => {
          const active = option.grouping === grouping;
          return (
            <li key={option.grouping}>
              <Link
                href={`${basePath}?${INVENTORY_GROUPING_PARAM}=${option.param}`}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-btn px-4 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
                  active ? "bg-petrol text-white" : "text-ink hover:bg-cream",
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
