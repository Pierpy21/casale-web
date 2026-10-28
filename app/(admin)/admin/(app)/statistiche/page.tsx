import type { Metadata } from "next";
import { MenuConsumptionList } from "@/components/stats/MenuConsumptionList";
import { SectionHeading } from "@/components/stats/SectionHeading";
import { StatsControls } from "@/components/stats/StatsControls";
import { StatsFilters } from "@/components/stats/StatsFilters";
import { StatsSummary } from "@/components/stats/StatsSummary";
import { WeeklyBreakdown } from "@/components/stats/WeeklyBreakdown";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getCoversStats } from "@/lib/data/bookings";
import { parseStatsKind, parseStatsPeriod, resolveStatsRange } from "@/lib/stats-period";

export const metadata: Metadata = {
  title: "Statistiche · Casale del Notaio",
};

type SearchParams = Promise<{ periodo?: string; tipo?: string; da?: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Offset delle ancore: sotto i controlli sticky (mobile: header + barra; desktop: solo barra).
const SECTION_ANCHOR = "scroll-mt-56 lg:scroll-mt-32";

export default async function StatistichePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await searchParams;
  const periodo = parseStatsPeriod(params.periodo);
  const tipo = parseStatsKind(params.tipo);
  // Ancoraggio: sempre il primo del mese, così le frecce restano allineate al periodo.
  const anchor = params.da && ISO_DATE.test(params.da) ? `${params.da.slice(0, 7)}-01` : undefined;
  const range = resolveStatsRange(periodo, anchor);
  const current = range.from === resolveStatsRange(periodo).from;

  const stats = await getCoversStats({ from: range.from, to: range.to, kind: tipo });

  return (
    <div className="-mt-2 flex min-w-0 flex-col gap-5 lg:-mt-4">
      <PageHeader
        compact
        eyebrow="Direzione"
        title="Statistiche"
        description={`Coperti, eventi e menù consumati · ${range.label}.`}
      />

      <StatsControls
        periodo={periodo}
        tipo={tipo}
        anchor={range.from}
        prevAnchor={range.prevAnchor}
        nextAnchor={range.nextAnchor}
        label={range.label}
      />

      <StatsFilters periodo={periodo} tipo={tipo} current={current} anchor={range.from} />

      <section id="riepilogo" aria-labelledby="riepilogo-titolo" className={`flex min-w-0 flex-col gap-4 ${SECTION_ANCHOR}`}>
        <SectionHeading id="riepilogo-titolo" eyebrow="Sintesi" title="Riepilogo" />
        <StatsSummary totals={stats.totals} kind={tipo} />
      </section>

      <section id="settimane" aria-labelledby="settimane-titolo" className={`flex min-w-0 flex-col gap-4 ${SECTION_ANCHOR}`}>
        <SectionHeading id="settimane-titolo" eyebrow="Dettaglio" title="Settimana per settimana" />
        <WeeklyBreakdown weeks={stats.weeks} />
      </section>

      <section id="menu" aria-labelledby="menu-titolo" className={`flex min-w-0 flex-col gap-4 ${SECTION_ANCHOR}`}>
        <SectionHeading id="menu-titolo" eyebrow="Cucina" title="Menù consumati" />
        <MenuConsumptionList menus={stats.menus} />
      </section>
    </div>
  );
}
