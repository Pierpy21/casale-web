import Link from "next/link";
import { cn } from "@/components/ui/cn";
import type { StatsKind, StatsPeriod } from "@/lib/types";
import { FOCUS, KINDS, SEGMENT_LIST, segmentLinkClass, statsHref } from "./shared";

export interface StatsFiltersProps {
  periodo: StatsPeriod;
  tipo: StatsKind;
  /** Vero se il periodo mostrato è quello che contiene oggi: in quel caso non serve il link "Oggi". */
  current: boolean;
  /** Primo giorno del periodo mostrato: il cambio di tipo resta sullo stesso periodo. */
  anchor: string;
}

const SECTIONS = [
  { href: "#riepilogo", label: "Riepilogo" },
  { href: "#settimane", label: "Settimane" },
  { href: "#menu", label: "Menù" },
];

const CHIP = "inline-flex min-h-11 items-center rounded-btn border border-field-edge bg-paper px-4 text-[12px] font-medium uppercase tracking-[0.12em] text-petrol transition-colors duration-200 hover:border-field-edge-hover hover:bg-cream";

/** Filtro tipo di prenotazione, salto a "Oggi" e ancore alle sezioni della pagina. Solo link. */
export function StatsFilters({ periodo, tipo, current, anchor }: StatsFiltersProps) {
  return (
    <section aria-label="Filtra e vai alle sezioni" className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Tipo di prenotazione" className="min-w-0 lg:w-96">
        <ul className={SEGMENT_LIST}>
          {KINDS.map((option) => {
            const active = option.value === tipo;
            return (
              <li key={option.value} className="min-w-0">
                <Link
                  href={statsHref(periodo, option.value, anchor)}
                  aria-current={active ? "page" : undefined}
                  className={segmentLinkClass(active)}
                >
                  {option.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <nav aria-label="Sezioni della pagina" className="min-w-0">
          <ul className="flex min-w-0 flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a href={section.href} className={cn(CHIP, FOCUS)}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {!current && (
          <Link href={statsHref(periodo, tipo)} className={cn(CHIP, "border-petrol/40 text-petrol", FOCUS)}>
            Torna a oggi
          </Link>
        )}
      </div>
    </section>
  );
}
