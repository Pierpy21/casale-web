import type { Metadata } from "next";
import { MenuConsumptionList } from "@/components/stats/MenuConsumptionList";
import { SectionHeading } from "@/components/stats/SectionHeading";
import { StatsControls } from "@/components/stats/StatsControls";
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
    <div className="-mt-2 flex min-w-0 flex-col gap-6 lg:-mt-4">
      <PageHeader compact eyebrow="Direzione" title="Statistiche" description="Coperti, eventi e menù consumati." />

      {/* Unico elemento sticky: deve restare figlio diretto del contenitore della pagina. */}
      <StatsControls
        periodo={periodo}
        tipo={tipo}
        anchor={range.from}
        prevAnchor={range.prevAnchor}
        nextAnchor={range.nextAnchor}
        label={range.label}
        current={current}
      />

      <section aria-labelledby="riepilogo-titolo" className="flex min-w-0 flex-col gap-3">
        <SectionHeading id="riepilogo-titolo" title="Riepilogo" />
        <StatsSummary totals={stats.totals} kind={tipo} />
      </section>

      <section aria-labelledby="settimane-titolo" className="flex min-w-0 flex-col gap-3">
        <SectionHeading id="settimane-titolo" title="Settimana per settimana" />
        <WeeklyBreakdown weeks={stats.weeks} kind={tipo} />
      </section>

      {/* I menù appartengono agli eventi: con il filtro "Prenotazioni" la sezione non serve. */}
      {tipo !== "normale" && (
        <section aria-labelledby="menu-titolo" className="flex min-w-0 flex-col gap-3">
          <SectionHeading id="menu-titolo" title="Menù consumati" />
          <MenuConsumptionList menus={stats.menus} />
        </section>
      )}
    </div>
  );
}
