import Link from "next/link";
import { clientFullName, formatCovers, formatTime } from "@/components/bookings/format";
import { Disclosure } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { BookingListItem } from "@/lib/types";

export interface DayBookingsDisclosureProps {
  /** Eyebrow sopra il titolo, es. "Oggi · 4 marzo" oppure "Mercoledì 4 marzo". */
  dayLabel: string;
  /** Solo prenotazioni normali del giorno (niente eventi, niente appuntamenti). */
  bookings: BookingListItem[];
  className?: string;
}

/** Tendina chiusa di default con le prenotazioni normali del giorno: ora, cliente, coperti, sala. */
export function DayBookingsDisclosure({ dayLabel, bookings, className }: DayBookingsDisclosureProps) {
  const sorted = [...bookings].sort((a, b) => (a.event_time ?? "99:99").localeCompare(b.event_time ?? "99:99"));

  return (
    <Disclosure
      className={cn("rounded-btn border border-sand bg-paper shadow-sm shadow-ink/5", className)}
      summaryClassName="min-h-11 rounded-btn px-4 py-3 text-ink hover:bg-cream focus-visible:ring-inset"
      summary={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{dayLabel}</span>
          <span className="font-serif text-lg leading-tight">Prenotazioni del giorno</span>
        </span>
      }
      aside={<span className="text-[13px] tabular-nums text-slate-dark">{sorted.length}</span>}
    >
      {sorted.length === 0 ? (
        <p className="border-t border-sand px-4 py-3 text-[14px] text-slate-dark">Nessuna prenotazione normale per questo giorno.</p>
      ) : (
        <ul className="divide-y divide-sand border-t border-sand">
          {sorted.map((booking) => {
            const time = formatTime(booking.event_time);
            return (
              <li key={booking.id} className="min-w-0">
                <Link
                  href={`/admin/prenotazioni/${booking.id}`}
                  className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[14px] text-ink transition-colors duration-200 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol"
                >
                  <span className="w-14 shrink-0 font-serif text-lg tabular-nums">{time ?? "—"}</span>
                  <span className="min-w-0 flex-1 break-words font-medium">{clientFullName(booking)}</span>
                  <span className="shrink-0 tabular-nums text-slate-dark">{formatCovers(booking)}</span>
                  <span className="w-full break-words text-[13px] text-slate-dark sm:w-auto sm:shrink-0">
                    {booking.room?.name ?? "Sala da assegnare"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Disclosure>
  );
}
