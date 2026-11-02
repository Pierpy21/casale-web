import Link from "next/link";
import { format, isSameMonth } from "date-fns";
import { Plus } from "lucide-react";
import type { BookingListItem } from "@/lib/types";
import { cn } from "@/components/ui";
import { summarizeDay } from "./DaySummary";
import { capitalize, formatIt, toISO } from "./agenda-utils";

export interface MonthViewProps {
  /** Mese visualizzato (qualsiasi giorno del mese). */
  monthDate: Date;
  /** Giorni della griglia lun-dom (multiplo di 7). */
  days: Date[];
  today: string;
  byDate: Map<string, BookingListItem[]>;
  isAdmin: boolean;
  onOpenDay: (iso: string) => void;
}

/** Coperti in forma leggibile per l'etichetta accessibile: "nessun coperto", "1 coperto", "48 coperti". */
function coversLabel(covers: number): string {
  if (covers === 0) return "nessun coperto";
  return `${covers} ${covers === 1 ? "coperto" : "coperti"}`;
}

interface CoversColumnProps {
  /** Etichetta estesa (cella larga) e abbreviata (cella stretta). */
  full: string;
  short: string;
  covers: number;
  /** Colore del numero: eventi = mustard, prenotazioni = petrol. */
  tone: string;
}

/**
 * Una colonna della cella: coperti in serif sopra, etichetta piccola sotto.
 * Con zero coperti la colonna resta vuota, così le posizioni sono fisse in tutto il mese.
 */
function CoversColumn({ full, short, covers, tone }: CoversColumnProps) {
  if (covers === 0) return <div />;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center leading-none">
      <span className={cn("font-serif text-[20px] tabular-nums", tone)}>{covers}</span>
      <span className="block max-w-full truncate text-[10px] font-medium uppercase tracking-[0.06em] text-slate-dark">
        <span className="hidden @min-[8rem]:inline">{full}</span>
        <span className="@min-[8rem]:hidden">{short}</span>
      </span>
    </div>
  );
}

/**
 * Griglia mensile lun-dom, desktop. Ogni cella mostra i coperti del giorno divisi tra eventi e prenotazioni normali
 * (solo le voci non zero). Un giorno vuoto crea un evento (admin); un giorno con prenotazioni apre la vista giorno, e il "+" crea un altro evento.
 */
export function MonthView({ monthDate, days, today, byDate, isAdmin, onOpenDay }: MonthViewProps) {
  const weekdayLabels = days.slice(0, 7).map((day) => formatIt(day, "EEE"));

  return (
    <section aria-label="Calendario mensile" className="pb-4">
      <div className="grid grid-cols-7 border-l border-t border-sand">
        {weekdayLabels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="border-b border-r border-sand bg-cream px-2 py-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-bronze"
          >
            {label}
          </div>
        ))}

        {days.map((day) => {
          const iso = toISO(day);
          const items = byDate.get(iso) ?? [];
          const inMonth = isSameMonth(day, monthDate);
          const isToday = iso === today;
          const label = capitalize(formatIt(day, "EEEE d MMMM"));
          const { eventCovers, alCartaCovers } = summarizeDay(items);
          const summary = [
            eventCovers > 0 && `eventi ${coversLabel(eventCovers)}`,
            alCartaCovers > 0 && `prenotazioni ${coversLabel(alCartaCovers)}`,
          ].filter(Boolean);

          // @container: le etichette estese / abbreviate dipendono dalla larghezza reale della cella.
          const cellClass = cn(
            "@container flex h-[6rem] min-w-0 flex-col gap-1.5 overflow-hidden border-b border-r border-sand p-1.5 text-left transition-colors duration-200",
            inMonth ? "bg-paper" : "bg-cream/60",
          );
          const dayNumber = (
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-[2px] text-[13px] tabular-nums",
                isToday ? "bg-petrol font-medium text-paper" : inMonth ? "text-ink" : "text-slate",
              )}
            >
              {format(day, "d")}
            </span>
          );

          if (items.length === 0) {
            if (isAdmin) {
              return (
                <Link
                  key={iso}
                  href={`/admin/prenotazioni/nuova?tipo=evento&date=${iso}`}
                  aria-label={`Nuovo evento, ${label}`}
                  className={cn(cellClass, "hover:bg-cream/70")}
                >
                  {dayNumber}
                </Link>
              );
            }
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onOpenDay(iso)}
                aria-label={`Apri ${label}`}
                className={cn(cellClass, "hover:bg-cream/70")}
              >
                {dayNumber}
              </button>
            );
          }

          return (
            <div key={iso} className={cn(cellClass, "relative")}>
              {/* Tutta la cella apre la vista giorno: il contenuto sopra non intercetta il click, tranne il "+". */}
              <button
                type="button"
                onClick={() => onOpenDay(iso)}
                aria-label={`${label}: ${summary.length > 0 ? summary.join(", ") : coversLabel(0)}`}
                className="absolute inset-0 transition-colors hover:bg-cream/70"
              />
              <div className="pointer-events-none relative flex items-start justify-between">
                {dayNumber}
                {isAdmin && (
                  <Link
                    href={`/admin/prenotazioni/nuova?tipo=evento&date=${iso}`}
                    aria-label={`Nuovo evento, ${label}`}
                    className="pointer-events-auto grid size-6 place-items-center rounded-[2px] text-petrol transition-colors hover:bg-cream"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                  </Link>
                )}
              </div>

              {(eventCovers > 0 || alCartaCovers > 0) && (
                <div className="pointer-events-none grid flex-1 grid-cols-2 items-end">
                  <CoversColumn full="Eventi" short="Ev." covers={eventCovers} tone="text-mustard" />
                  <CoversColumn full="Prenot." short="Pr." covers={alCartaCovers} tone="text-petrol" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
