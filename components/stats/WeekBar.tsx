import { cn } from "@/components/ui/cn";
import type { WeekStats } from "@/lib/types";
import { formatNumber, shareOfPeriod, vsAverage, weekTotal, type WeekScale } from "./week-format";

export interface WeekBarProps {
  week: WeekStats;
  scale: WeekScale;
  className?: string;
}

/**
 * Barra della settimana con numeri espliciti: coperti eventi (petrol) e prenotazioni (bronzo),
 * quota sul totale del periodo e confronto con la media settimanale.
 * Usa solo elementi inline/block (span) perché può stare dentro un pulsante.
 * La barra è decorativa (aria-hidden): i valori sono scritti accanto.
 */
export function WeekBar({ week, scale, className }: WeekBarProps) {
  const total = weekTotal(week);
  const width = scale.max > 0 ? Math.min(100, (total / scale.max) * 100) : 0;
  const eventShare = total > 0 ? (week.event_covers / total) * 100 : 0;
  const share = shareOfPeriod(week, scale);
  const comparison = vsAverage(week, scale);

  return (
    <span className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span aria-hidden="true" className="flex h-2.5 w-full overflow-hidden rounded-full bg-cream">
        <span className="flex h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out" style={{ width: `${width}%` }}>
          <span className="h-full bg-petrol" style={{ width: `${eventShare}%` }} />
          <span className="h-full flex-1 bg-bronze" />
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[12px] leading-snug tabular-nums text-ink">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-petrol" />
          <span>
            Eventi <strong className="font-medium">{formatNumber(week.event_covers)}</strong>
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-bronze" />
          <span>
            Prenotazioni <strong className="font-medium">{formatNumber(week.normal_covers)}</strong>
          </span>
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px] leading-snug text-slate-dark">
        <span className="tabular-nums">{share}% del totale del periodo</span>
        {total > 0 && (
          <span className={cn("font-medium", comparison === "above" ? "text-petrol" : "text-slate-dark")}>
            {comparison === "above" && "Sopra la media"}
            {comparison === "below" && "Sotto la media"}
            {comparison === "even" && "In linea con la media"}
          </span>
        )}
      </span>
    </span>
  );
}
