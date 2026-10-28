import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import type { StatsKind, StatsPeriod } from "@/lib/types";
import { FOCUS, PERIODS, SEGMENT_LIST, segmentLinkClass, statsHref } from "./shared";

export interface StatsControlsProps {
  periodo: StatsPeriod;
  tipo: StatsKind;
  /** Primo del mese di ancoraggio (YYYY-MM-01) del periodo mostrato. */
  anchor: string;
  prevAnchor: string;
  nextAnchor: string;
  label: string;
}

const ARROW =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn border border-field-edge bg-paper text-petrol transition-colors duration-200 hover:border-field-edge-hover hover:bg-cream";

/**
 * Controlli sempre visibili in alto: periodo (1 mese / 3 mesi / 1 anno) e frecce precedente/successiva.
 * È l'unico elemento sticky della pagina: deve restare figlio diretto del contenitore della pagina.
 * Solo link: lo stato sta nell'URL.
 */
export function StatsControls({ periodo, tipo, anchor, prevAnchor, nextAnchor, label }: StatsControlsProps) {
  return (
    <section
      aria-label="Periodo"
      className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 flex min-w-0 flex-col gap-2 rounded-btn border border-sand bg-paper/95 p-2 shadow-sm shadow-ink/5 backdrop-blur supports-[backdrop-filter]:bg-paper/85 lg:top-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:p-2.5"
    >
      <nav aria-label="Scegli periodo" className="min-w-0 lg:shrink-0">
        <ul className={SEGMENT_LIST}>
          {PERIODS.map((option) => {
            const active = option.value === periodo;
            return (
              <li key={option.value} className="min-w-0">
                <Link
                  href={statsHref(option.value, tipo, anchor)}
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

      <div className="flex min-w-0 items-center justify-between gap-2 lg:min-w-96 lg:flex-1 lg:justify-center">
        <Link href={statsHref(periodo, tipo, prevAnchor)} aria-label="Periodo precedente" className={cn(ARROW, FOCUS)}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <p aria-live="polite" className="min-w-0 flex-1 break-words text-center font-serif text-lg leading-tight text-ink sm:text-xl">
          {label}
        </p>
        <Link href={statsHref(periodo, tipo, nextAnchor)} aria-label="Periodo successivo" className={cn(ARROW, FOCUS)}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </div>
    </section>
  );
}
