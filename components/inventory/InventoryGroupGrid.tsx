"use client";

import { cn } from "@/components/ui";

export interface InventoryGroupTile {
  key: string;
  label: string;
  /** Prodotti totali del gruppo (senza filtro). */
  total: number;
  /** Prodotti del gruppo già compilati nella bozza. */
  filled: number;
}

export interface InventoryGroupGridProps {
  groups: InventoryGroupTile[];
  onSelect: (key: string) => void;
}

/** Griglia di bottoni quadrati, uno per categoria o fornitore: usata solo su tablet. */
export function InventoryGroupGrid({ groups, onSelect }: InventoryGroupGridProps) {
  return (
    <ul role="list" className="grid grid-cols-3 gap-3 lg:grid-cols-4">
      {groups.map((group) => {
        const percent = group.total > 0 ? Math.min(100, Math.round((group.filled / group.total) * 100)) : 0;
        const hasFilled = group.filled > 0;
        return (
          <li key={group.key} className="min-w-0">
            <button
              type="button"
              data-group-key={group.key}
              onClick={() => onSelect(group.key)}
              aria-label={`${group.label}: ${group.total} ${group.total === 1 ? "prodotto" : "prodotti"}, ${group.filled} compilati`}
              className="flex aspect-square w-full min-w-0 flex-col justify-between rounded-2xl border border-sand bg-paper p-4 text-left shadow-[0_1px_2px_rgb(28_43_45/0.06)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-cream hover:shadow-[0_2px_6px_rgb(28_43_45/0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol active:scale-[0.98]"
            >
              <span className="line-clamp-3 wrap-anywhere font-serif text-2xl leading-tight text-ink">{group.label}</span>
              <span className="flex flex-col gap-2">
                <span className="text-[14px] tabular-nums text-slate-dark">
                  {group.total} {group.total === 1 ? "prodotto" : "prodotti"}
                </span>
                <span className={cn("flex items-center gap-2 text-[13px] tabular-nums", hasFilled ? "font-medium text-petrol" : "text-slate-dark")}>
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", hasFilled ? "bg-petrol" : "bg-sand")} />
                  {group.filled} di {group.total} compilati
                </span>
                <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-sand">
                  <span className="block h-full rounded-full bg-petrol transition-[width] duration-300" style={{ width: `${percent}%` }} />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
