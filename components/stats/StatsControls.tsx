import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import type { StatsKind, StatsPeriod } from "@/lib/types";
import { FOCUS, KIND_DOT, KINDS, PERIODS, statsHref } from "./shared";

export interface StatsControlsProps {
  periodo: StatsPeriod;
  tipo: StatsKind;
  /** Primo del mese di ancoraggio (YYYY-MM-01) del periodo mostrato: granularità e tipo lo conservano. */
  anchor: string;
  prevAnchor: string;
  nextAnchor: string;
  label: string;
  /** Vero se il periodo mostrato contiene oggi: in quel caso non serve il link "Oggi". */
  current: boolean;
}

const ARROW =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn border border-field-edge bg-paper text-petrol transition-colors duration-200 hover:border-field-edge-hover hover:bg-cream";

/* Granularità: testo con sottolineatura (tab), chiaramente diversa dai filtri tipo (pillole). */
const TAB = "flex min-h-11 items-end justify-center border-b-2 px-2 pb-2.5 text-[14px] font-medium transition-colors duration-200 sm:px-3";

const CHIP =
  "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-200 sm:px-4";

/**
 * Unica barra sticky della pagina: periodo (frecce + nome + "Oggi"), granularità (tab) e tipo (pillole).
 * Telefono: tre righe (periodo, tab a tutta larghezza, pillole). Da sm: due righe. Da 2xl: una riga.
 * Deve restare figlio diretto del contenitore della pagina perché sia sticky.
 * Solo link: lo stato sta nell'URL.
 */
export function StatsControls({ periodo, tipo, anchor, prevAnchor, nextAnchor, label, current }: StatsControlsProps) {
  return (
    <section
      aria-label="Periodo e filtri"
      // Sfondo pieno (niente backdrop-blur: su mobile ricalcolarlo durante lo scroll fa tremare la barra) e
      // 1px sotto l'header mobile, come la ricerca della giacenza: nessuna giunzione con i pixel frazionari.
      className="sticky top-[calc(env(safe-area-inset-top)+4rem-1px)] z-20 flex min-w-0 flex-col gap-1.5 rounded-btn border border-sand bg-paper p-1.5 shadow-sm shadow-ink/5 sm:gap-2 sm:p-2 lg:top-3 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-4 2xl:p-2.5"
    >
      <div className="flex min-w-0 items-center gap-2 2xl:shrink-0">
        <Link href={statsHref(periodo, tipo, prevAnchor)} aria-label="Periodo precedente" className={cn(ARROW, FOCUS)}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1 px-1 text-center 2xl:flex-none 2xl:px-3">
          <p aria-live="polite" className="min-w-0 break-words font-serif text-lg leading-tight text-ink sm:text-xl">
            {label}
          </p>
          {!current && (
            <Link
              href={statsHref(periodo, tipo)}
              className={cn("inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-petrol underline underline-offset-4", FOCUS)}
            >
              Oggi
            </Link>
          )}
        </div>
        <Link href={statsHref(periodo, tipo, nextAnchor)} aria-label="Periodo successivo" className={cn(ARROW, FOCUS)}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <nav aria-label="Granularità del periodo" className="min-w-0 sm:shrink-0">
          <ul className="grid grid-cols-3 border-b border-sand sm:flex sm:gap-1">
            {PERIODS.map((option) => {
              const active = option.value === periodo;
              return (
                <li key={option.value} className="min-w-0">
                  <Link
                    href={statsHref(option.value, tipo, anchor)}
                    aria-current={active ? "page" : undefined}
                    className={cn(TAB, FOCUS, active ? "border-petrol text-ink" : "border-transparent text-slate-dark hover:text-ink")}
                  >
                    {option.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-label="Tipo di prenotazione" className="min-w-0">
          <ul className="flex flex-wrap gap-1.5 sm:justify-end">
            {KINDS.map((option) => {
              const active = option.value === tipo;
              const dot = KIND_DOT[option.value];
              return (
                <li key={option.value}>
                  <Link
                    href={statsHref(periodo, option.value, anchor)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      CHIP,
                      FOCUS,
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-field-edge bg-paper text-ink hover:border-field-edge-hover hover:bg-cream",
                    )}
                  >
                    {dot && <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", dot)} />}
                    {option.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </section>
  );
}
