import { Stat } from "@/components/ui";
import type { CoversStats, StatsKind } from "@/lib/types";

export interface StatsSummaryProps {
  totals: CoversStats["totals"];
  /** Filtro tipo della pagina: decide il testo di sotto al totale. Default: tutti. */
  kind?: StatsKind;
}

const TOTAL_HINT: Record<StatsKind, string> = {
  tutti: "Eventi e prenotazioni",
  evento: "Solo eventi",
  normale: "Solo prenotazioni",
};

/** Riepilogo numerico del periodo: coperti (eventi, prenotazioni, totale) e numero di eventi e prenotazioni. */
export function StatsSummary({ totals, kind = "tutti" }: StatsSummaryProps) {
  const covers = totals.event_covers + totals.normal_covers;
  return (
    <section aria-label="Riepilogo del periodo" className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
      <Stat label="Coperti totali" value={covers} hint={TOTAL_HINT[kind]} className="col-span-2 lg:col-span-1" />
      <Stat label="Coperti eventi" value={totals.event_covers} />
      <Stat label="Coperti prenotazioni" value={totals.normal_covers} />
      <Stat label="Eventi" value={totals.events} />
      <Stat label="Prenotazioni" value={totals.normal_bookings} />
    </section>
  );
}
