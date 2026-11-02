"use client";

import { LayoutGrid } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import type { InventoryGroupTile } from "./InventoryGroupGrid";

export interface InventoryGroupChipsProps {
  /** Tutti i gruppi, nell'ordine della griglia (anche quello aperto, che risulta attivo). */
  groups: InventoryGroupTile[];
  /** Gruppo aperto. */
  activeKey: string;
  /** Etichetta della pillola "torna alla griglia" (es. "Tutte le categorie"). */
  allLabel: string;
  onShowAll: () => void;
  onSelect: (key: string) => void;
  disabled: boolean;
}

/**
 * Barra orizzontale di pillole per cambiare gruppo senza tornare alla griglia (tablet, gruppo aperto).
 * La pillola attiva scorre al centro della barra; lo scroll resta dentro la barra, non sposta la pagina.
 */
export function InventoryGroupChips({ groups, activeKey, allLabel, onShowAll, onSelect, disabled }: InventoryGroupChipsProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLButtonElement>(`[data-chip-key="${CSS.escape(activeKey)}"]`);
    if (!bar || !chip) return;
    // offsetLeft è relativo alla barra (position: relative): basta impostare lo scroll orizzontale della barra.
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeKey]);

  const chipBase =
    "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50";

  return (
    <nav aria-label="Altri gruppi" className="-m-1 min-w-0">
      {/* Padding e margine negativo: il contorno del focus non viene tagliato dallo scroll. Scrollbar nascosta, si scorre col dito. */}
      <div
        ref={barRef}
        className="relative flex snap-x snap-proximity gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={onShowAll}
          disabled={disabled}
          className={cn(chipBase, "border-sand bg-paper text-ink hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol")}
        >
          <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-petrol" />
          {allLabel}
        </button>

        {groups.map((group) => {
          const active = group.key === activeKey;
          const color = group.color;
          const hasFilled = group.filled > 0;
          return (
            <button
              key={group.key}
              type="button"
              data-chip-key={group.key}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(group.key)}
              disabled={disabled}
              className={cn(
                chipBase,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
                color
                  ? active
                    ? cn(color.solid, "text-white")
                    : cn(color.edge, color.tint, color.tintHover, "text-ink")
                  : active
                    ? "border-petrol bg-petrol text-white"
                    : "border-sand bg-paper text-ink hover:bg-cream",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  active ? "bg-white" : color && hasFilled ? color.accent : color ? "bg-white ring-1 ring-inset ring-slate/40" : hasFilled ? "bg-petrol" : "bg-sand",
                )}
              />
              {group.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
