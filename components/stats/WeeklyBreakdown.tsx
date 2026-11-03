import { Disclosure, EmptyState } from "@/components/ui";
import type { StatsKind, WeekStats } from "@/lib/types";
import { WeekBar } from "./WeekBar";
import { WeekCard } from "./WeekCard";
import { WeekDetails } from "./WeekDetails";
import { buildWeekScale, formatNumber, isEmptyWeek, rangeLabel, weekTotal } from "./week-format";

export interface WeeklyBreakdownProps {
  weeks: WeekStats[];
  /** Filtro tipo della pagina: decide quali conteggi mostrare in ogni settimana. */
  kind?: StatsKind;
}

type MobileRow = { kind: "week"; week: WeekStats } | { kind: "empty"; from: WeekStats; to: WeekStats };

/** Sulla lista mobile le settimane vuote diventano una riga discreta; quelle consecutive si raggruppano. */
function buildMobileRows(weeks: WeekStats[]): MobileRow[] {
  const rows: MobileRow[] = [];
  for (const week of weeks) {
    if (!isEmptyWeek(week)) {
      rows.push({ kind: "week", week });
      continue;
    }
    const last = rows.at(-1);
    if (last?.kind === "empty") {
      last.to = week;
    } else {
      rows.push({ kind: "empty", from: week, to: week });
    }
  }
  return rows;
}

/** Nota unica sopra l'elenco: come si legge la barra e la media del periodo (i colori sono nel riepilogo). */
function WeekNote({ average }: { average: number }) {
  return (
    <p className="text-[13px] leading-snug text-slate-dark">
      La barra mostra la quota di ogni settimana sul totale del periodo. Media:{" "}
      <span className="font-medium tabular-nums text-ink">{formatNumber(average)} coperti a settimana</span>.
    </p>
  );
}

/**
 * Settimana per settimana.
 * Desktop (lg+): griglia di card, numeri sempre visibili sulle barre, dettagli su hover/focus o al click.
 * Mobile/tablet: lista compatta, ogni settimana si espande al tocco.
 */
export function WeeklyBreakdown({ weeks, kind = "tutti" }: WeeklyBreakdownProps) {
  if (weeks.length === 0) {
    return <EmptyState title="Nessuna settimana nel periodo" description="Cambia periodo per vedere i coperti." />;
  }

  const scale = buildWeekScale(weeks);
  const rows = buildMobileRows(weeks);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <WeekNote average={scale.average} />

      <ol className="flex min-w-0 flex-col gap-2 lg:hidden">
        {rows.map((row) =>
          row.kind === "empty" ? (
            <li
              key={row.from.week_start}
              className="min-w-0 rounded-btn border border-dashed border-sand px-4 py-2.5 text-[13px] leading-snug text-slate-dark wrap-anywhere"
            >
              {rangeLabel(row.from, row.to)} · nessuna attività
            </li>
          ) : (
            <li key={row.week.week_start} className="min-w-0">
              <Disclosure
                className="rounded-btn border border-sand bg-paper shadow-sm shadow-ink/5"
                summaryClassName="min-h-11 items-start p-4"
                contentClassName="px-4 pb-4"
                summary={
                  // Colonna dentro il riepilogo: la barra occupa tutta la larghezza e la freccia resta a destra.
                  <span className="flex min-w-0 flex-col gap-3">
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-[14px] font-medium text-ink">{rangeLabel(row.week, row.week)}</span>
                      <span className="shrink-0 font-serif text-2xl leading-none tabular-nums">
                        {weekTotal(row.week)}
                        <span className="ml-1 font-sans text-[12px] text-slate-dark">coperti</span>
                      </span>
                    </span>
                    <WeekBar week={row.week} scale={scale} kind={kind} />
                  </span>
                }
              >
                <WeekDetails week={row.week} kind={kind} />
              </Disclosure>
            </li>
          ),
        )}
      </ol>

      <ol className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-3 xl:grid-cols-4">
        {weeks.map((week) => (
          <WeekCard key={week.week_start} week={week} scale={scale} kind={kind} />
        ))}
      </ol>
    </div>
  );
}
