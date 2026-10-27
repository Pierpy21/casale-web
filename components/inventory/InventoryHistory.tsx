import Link from "next/link";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { Badge, ButtonLink, EmptyState, Field, Input, buttonClasses } from "@/components/ui";
import type { InventoryReport } from "@/lib/types";

export interface InventoryHistoryRow {
  report: InventoryReport;
  /** Prodotti da ordinare del report (il dato della lista non contiene le righe). */
  toOrder: number;
  /** Prodotti con giacenza indicata. */
  present: number;
  /** "Viagrande 5, Amadori 3" (vuoto se non c'è nulla da ordinare). */
  toOrderSummary: string;
}

export interface InventoryHistoryProps {
  rows: InventoryHistoryRow[];
  page: number;
  totalPages: number;
  totalItems: number;
  from?: string;
  to?: string;
}

/** Storico report: filtro per data (GET, senza JavaScript) e paginazione. */
export function InventoryHistory({ rows, page, totalPages, totalItems, from, to }: InventoryHistoryProps) {
  const hrefFor = (target: number): string => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/giacenza?${query}` : "/admin/giacenza";
  };

  return (
    <section aria-labelledby="storico-title" id="storico" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1 border-b border-sand pb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Archivio</p>
        <h2 id="storico-title" className="text-2xl">
          Storico giacenze
        </h2>
      </div>

      <form method="get" action="/admin/giacenza" aria-label="Filtra per data" className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto]">
        <Field label="Dal" htmlFor="filter-from">
          <Input id="filter-from" type="date" name="from" defaultValue={from ?? ""} />
        </Field>
        <Field label="Al" htmlFor="filter-to">
          <Input id="filter-to" type="date" name="to" defaultValue={to ?? ""} />
        </Field>
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses("outline", "md", "min-h-11 flex-1 sm:flex-none")}>
            Filtra
          </button>
          {(from || to) && (
            <Link href="/admin/giacenza" className={buttonClasses("ghost", "md", "min-h-11")}>
              Azzera
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna giacenza"
          description={from || to ? "Nessun report nel periodo selezionato." : "Quando verrà inviata una giacenza comparirà qui."}
        />
      ) : (
        <>
          <p className="text-[13px] text-slate-dark tabular-nums">{totalItems} report in archivio</p>
          <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
            {rows.map(({ report, toOrder, present, toOrderSummary }) => (
              <li key={report.id}>
                <Link
                  href={`/admin/giacenza/${report.id}`}
                  className="flex min-h-16 flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-cream sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-serif text-xl leading-tight text-ink">
                      {capitalize(formatIt(toDate(report.report_date), "EEEE d MMMM yyyy"))}
                    </span>
                    <span className="text-[13px] text-slate-dark wrap-anywhere">Da {report.created_by_name}</span>
                    <span className="text-[14px] text-ink wrap-anywhere">
                      {toOrder > 0 ? (
                        <>
                          Da ordinare: <span className="font-semibold">{toOrderSummary}</span>
                        </>
                      ) : (
                        <span className="text-slate-dark">Nessun prodotto da ordinare</span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 text-[14px]">
                    <span className="tabular-nums text-slate-dark">
                      {present} {present === 1 ? "presente" : "presenti"}
                    </span>
                    {report.status === "visto" ? (
                      <Badge tone="success">Visto</Badge>
                    ) : (
                      <Badge tone="neutral">Inviato</Badge>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginazione storico" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <ButtonLink href={hrefFor(page - 1)} variant="outline" size="sm">
              ← Precedenti
            </ButtonLink>
          ) : (
            <span />
          )}
          <p className="text-[13px] tabular-nums text-slate-dark">
            Pagina {page} di {totalPages}
          </p>
          {page < totalPages ? (
            <ButtonLink href={hrefFor(page + 1)} variant="outline" size="sm">
              Successivi →
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
