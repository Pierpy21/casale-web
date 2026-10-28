import { Disclosure, EmptyState } from "@/components/ui";
import type { WeekStats } from "@/lib/types";
import { WeekBar } from "./WeekBar";
import { WeekCard } from "./WeekCard";
import { WeekDetails } from "./WeekDetails";
import { buildWeekScale, formatNumber, isEmptyWeek, rangeLabel, weekTotal } from "./week-format";

export interface WeeklyBreakdownProps {
  weeks: WeekStats[];
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

/** Legenda sempre visibile sopra l'elenco: colori, significato delle percentuali e media del periodo. */
function WeekLegend({ average }: { average: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-btn bg-cream/60 px-3 py-2.5 text-[12px] leading-snug text-ink">
      <ul aria-label="Legenda" className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-petrol" />
          Coperti eventi
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-bronze" />
          Coperti prenotazioni
        </li>
      </ul>
      <p className="text-slate-dark">
        La percentuale è la quota della settimana sul totale del periodo. Media del periodo:{" "}
        <span className="font-medium tabular-nums text-ink">{formatNumber(average)} coperti a settimana</span>.
      </p>
    </div>
  );
}

/**
 * Settimana per settimana.
 * Desktop (lg+): griglia di card, numeri sempre visibili sulle barre, dettagli su hover/focus o al click.
 * Mobile/tablet: lista compatta, ogni settimana si espande al tocco.
 */
export function WeeklyBreakdown({ weeks }: WeeklyBreakdownProps) {
  if (weeks.length === 0) {
    return <EmptyState title="Nessuna settimana nel periodo" description="Cambia periodo per vedere i coperti." />;
  }

  const scale = buildWeekScale(weeks);
  const rows = buildMobileRows(weeks);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <WeekLegend average={scale.average} />

      <ol className="flex min-w-0 flex-col gap-2.5 lg:hidden">
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
                summaryClassName="flex min-h-11 w-full min-w-0 flex-col gap-3 p-4 text-left"
                contentClassName="px-4 pb-4"
                summary={
                  <>
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-[14px] font-medium text-ink">{rangeLabel(row.week, row.week)}</span>
                      <span className="shrink-0 font-serif text-2xl leading-none tabular-nums">
                        {weekTotal(row.week)}
                        <span className="ml-1 font-sans text-[12px] text-slate-dark">coperti</span>
                      </span>
                    </span>
                    <WeekBar week={row.week} scale={scale} />
                  </>
                }
              >
                <WeekDetails week={row.week} />
              </Disclosure>
            </li>
          ),
        )}
      </ol>

      <ol className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-3 xl:grid-cols-4">
        {weeks.map((week) => (
          <WeekCard key={week.week_start} week={week} scale={scale} />
        ))}
      </ol>
    </div>
  );
}
