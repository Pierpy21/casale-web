import { Stat, cn } from "@/components/ui";
import type { CoversStats, StatsKind } from "@/lib/types";

export interface StatsSummaryProps {
  totals: CoversStats["totals"];
  /** Filtro tipo della pagina: nasconde le parti che non c'entrano (niente zeri). Default: tutti. */
  kind?: StatsKind;
}

const COVERS_LABEL: Record<StatsKind, string> = {
  tutti: "Coperti",
  evento: "Coperti eventi",
  normale: "Coperti prenotazioni",
};

const COVERS_TEXT: Record<StatsKind, string> = {
  tutti: "text-ink",
  evento: "text-mustard",
  normale: "text-petrol",
};

/** Percentuale intera di `part` su `total` (0 se il totale è zero). */
function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Riepilogo del periodo: una card "Coperti" con il totale e, con tipo "tutti", la ripartizione
 * eventi (senape) / prenotazioni (petrolio). Accanto, i conteggi di eventi e prenotazioni.
 */
export function StatsSummary({ totals, kind = "tutti" }: StatsSummaryProps) {
  const eventCovers = kind === "normale" ? 0 : totals.event_covers;
  const bookingCovers = kind === "evento" ? 0 : totals.normal_covers;
  const covers = eventCovers + bookingCovers;
  const eventShare = percentOf(eventCovers, covers);
  const bookingShare = covers > 0 ? 100 - eventShare : 0;

  const sideStats: { label: string; value: number }[] = [];
  if (kind !== "normale") sideStats.push({ label: "Eventi", value: totals.events });
  if (kind !== "evento") sideStats.push({ label: "Prenotazioni", value: totals.normal_bookings });

  return (
    <section aria-label="Riepilogo del periodo" className="grid min-w-0 gap-3 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-5 rounded-btn border border-sand bg-paper p-4 shadow-sm shadow-ink/5 sm:p-5 lg:col-span-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{COVERS_LABEL[kind]}</p>
          <p className={cn("font-serif text-5xl leading-none tabular-nums sm:text-6xl", COVERS_TEXT[kind])}>{covers}</p>
          {covers === 0 && <p className="text-[13px] leading-snug text-slate-dark">Nessun coperto in questo periodo.</p>}
        </div>

        {kind === "tutti" && (
          <div className="flex min-w-0 flex-col gap-3">
            <div aria-hidden="true" className="flex h-2.5 w-full overflow-hidden rounded-full bg-cream">
              <span className="h-full bg-mustard transition-[width] duration-500 ease-out" style={{ width: `${eventShare}%` }} />
              <span className="h-full bg-petrol transition-[width] duration-500 ease-out" style={{ width: `${bookingShare}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-mustard" />
                  Eventi
                </dt>
                <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-serif text-2xl leading-none tabular-nums text-mustard sm:text-3xl">
                  {eventCovers}
                  <span className="font-sans text-[12px] text-slate-dark">{eventShare}%</span>
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-petrol" />
                  Prenotazioni
                </dt>
                <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-serif text-2xl leading-none tabular-nums text-petrol sm:text-3xl">
                  {bookingCovers}
                  <span className="font-sans text-[12px] text-slate-dark">{bookingShare}%</span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-1 lg:content-start">
        {sideStats.map((stat) => (
          <Stat
            key={stat.label}
            label={stat.label}
            value={stat.value}
            className={sideStats.length === 1 ? "col-span-2 lg:col-span-1" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
