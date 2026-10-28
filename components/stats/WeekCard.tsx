"use client";

import { useId, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { WeekStats } from "@/lib/types";
import { FOCUS } from "./shared";
import { WeekBar } from "./WeekBar";
import { WeekDetails } from "./WeekDetails";
import { isEmptyWeek, rangeLabel, weekTotal, type WeekScale } from "./week-format";

export interface WeekCardProps {
  week: WeekStats;
  /** Scala comune del periodo: massimo delle barre, totale e media. */
  scale: WeekScale;
}

/**
 * Card di una settimana (vista desktop): intervallo, totale in grande, barra con numeri sempre visibili.
 * Hover/focus rivela i dettagli in un pannello; il click li fissa aperti (aria-expanded).
 */
export function WeekCard({ week, scale }: WeekCardProps) {
  const [expanded, setExpanded] = useState(false);
  const uid = useId();
  const buttonId = `${uid}-summary`;
  const panelId = `${uid}-details`;
  const title = rangeLabel(week, week);

  if (isEmptyWeek(week)) {
    return (
      <li className="flex min-w-0 flex-col gap-0.5 rounded-btn border border-dashed border-sand px-3 py-2.5 text-slate">
        <span className="text-[12px] leading-snug">{title}</span>
        <span className="text-[11px]">Nessuna attività</span>
      </li>
    );
  }

  return (
    <li className="group relative min-w-0 hover:z-20 focus-within:z-20">
      <button
        id={buttonId}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "flex min-h-11 w-full min-w-0 flex-col gap-3 rounded-btn border bg-paper p-3 text-left shadow-sm shadow-ink/5 transition-colors duration-200 hover:border-petrol/50",
          expanded ? "border-petrol" : "border-sand",
          FOCUS,
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="min-w-0 break-words text-[12px] font-medium leading-snug text-slate-dark">{title}</span>
          <span className="font-serif text-2xl leading-none tabular-nums text-ink">
            {weekTotal(week)}
            <span className="ml-1 font-sans text-[12px] text-slate-dark">coperti</span>
          </span>
        </span>
        <WeekBar week={week} scale={scale} />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={cn(
          "rounded-btn border border-sand bg-paper p-3 shadow-lg shadow-ink/10",
          expanded
            ? "mt-1.5 block"
            : "absolute inset-x-0 top-full z-20 mt-1.5 hidden group-focus-within:block group-hover:block",
        )}
      >
        <WeekDetails week={week} />
      </div>
    </li>
  );
}
