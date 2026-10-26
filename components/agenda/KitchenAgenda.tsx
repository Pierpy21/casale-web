import Link from "next/link";
import { KindBadge } from "@/components/bookings/KindBadge";
import { bookingTitle, formatCovers, formatTime, groupDishes, totalCovers } from "@/components/bookings/format";
import { cn } from "@/components/ui/cn";
import { BOOKING_KIND_LABELS, type BookingListItem } from "@/lib/types";
import { agendaHref, capitalize, formatIt, shiftPeriod, toDate } from "./agenda-utils";
import { MenuChips, summarizeDay } from "./DaySummary";

export interface KitchenAgendaProps {
  /** Giorno mostrato (YYYY-MM-DD). */
  date: string;
  today: string;
  /** Prenotazioni del giorno, già ordinate per ora (senza annullate). */
  bookings: BookingListItem[];
}

const NAV_LINK =
  "inline-flex min-h-12 items-center justify-center border-2 border-ink px-5 text-[16px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-paper";

/**
 * Agenda per la cucina: un giorno alla volta, schede grandi e leggibili (ora, coperti, menù, piatti per portata, allergie).
 * Sola lettura: nessun controllo di modifica, nessun dato di contatto del cliente.
 */
export function KitchenAgenda({ date, today, bookings }: KitchenAgendaProps) {
  const selected = toDate(date);
  // Stessi conti della striscia del giorno: niente annullate né appuntamenti.
  const summary = summarizeDay(bookings);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex min-w-0 flex-col gap-5 border-b-4 border-ink pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {date === today && (
            <p className="text-[16px] font-bold uppercase tracking-[0.12em] text-petrol">Oggi</p>
          )}
          <h1 className="font-serif text-4xl leading-tight wrap-anywhere sm:text-5xl">
            {capitalize(formatIt(selected, "EEEE d MMMM"))}
          </h1>
          <p className="text-[20px] text-ink">
            {bookings.length === 0
              ? "Nessuna prenotazione"
              : `${summary.bookingsCount} ${summary.bookingsCount === 1 ? "servizio" : "servizi"} · ${summary.covers} coperti`}
          </p>
        </div>

        <nav aria-label="Cambia giorno" className="flex flex-wrap gap-2">
          <Link href={agendaHref({ date: shiftPeriod(date, "day", -1), view: "day" })} className={NAV_LINK}>
            ← Giorno prima
          </Link>
          <Link href={agendaHref({ date: today, view: "day" })} className={NAV_LINK}>
            Oggi
          </Link>
          <Link href={agendaHref({ date: shiftPeriod(date, "day", 1), view: "day" })} className={NAV_LINK}>
            Giorno dopo →
          </Link>
        </nav>
      </header>

      <MenuChips menus={summary.menus} size="lg" />

      {bookings.length === 0 ? (
        <p className="border-2 border-dashed border-ink/40 px-6 py-12 text-center text-[22px] text-ink">
          Nessuna prenotazione in questa giornata.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <KitchenCard booking={booking} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KitchenCard({ booking: b }: { booking: BookingListItem }) {
  const time = formatTime(b.event_time);
  const isEvent = b.kind === "evento";
  const groups = isEvent ? groupDishes(b.dishes) : [];
  const covers = totalCovers(b);
  const headline = isEvent ? (b.menu?.name ?? "Menù da definire") : bookingTitle(b);

  return (
    <article
      aria-label={`${BOOKING_KIND_LABELS[b.kind]} ${time ?? ""}, ${headline}`}
      className={cn("flex min-w-0 flex-col gap-5 border-2 border-ink bg-paper p-5 sm:p-7", b.status === "annullato" && "opacity-60")}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="font-serif text-6xl leading-none tabular-nums text-ink sm:text-7xl">{time ?? "—"}</p>
        <KindBadge kind={b.kind} className="text-[13px]" />
      </header>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-3xl font-bold leading-tight wrap-anywhere sm:text-4xl">{headline}</h2>
        {isEvent && b.event_name && <p className="text-[20px] text-ink wrap-anywhere">{b.event_name}</p>}
        <p className="text-[22px] text-ink">
          <span className="font-bold tabular-nums">{covers}</span> coperti
          {covers > 0 && <span className="text-[18px]"> ({formatCovers(b)})</span>}
          {b.kids_menus > 0 && (
            <span className="font-semibold"> · menù bambini ×{b.kids_menus}</span>
          )}
        </p>
        {b.room && <p className="text-[18px] text-ink">Sala: {b.room.name}</p>}
      </div>

      {b.allergies.length > 0 && (
        <section aria-label="Allergie" className="flex flex-col gap-2 border-l-[8px] border-danger bg-danger/10 px-5 py-4">
          <p className="text-[16px] font-bold uppercase tracking-[0.1em] text-danger">Attenzione · allergie</p>
          <ul className="flex flex-col gap-1.5 text-[20px] font-semibold leading-snug text-ink">
            {b.allergies.map((allergy) => (
              <li key={allergy.id} className="wrap-anywhere">
                {allergy.condition}
                {allergy.subject_name && <span className="font-normal"> · {allergy.subject_name}</span>}
                {allergy.notes && <span className="font-normal text-[18px]"> ({allergy.notes})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 border-t-2 border-ink pt-5 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.course} className="flex min-w-0 flex-col gap-1.5">
              <dt className="text-[15px] font-bold uppercase tracking-[0.12em] text-petrol">{group.label}</dt>
              <dd>
                <ul className="flex flex-col gap-1 text-[22px] leading-snug text-ink">
                  {group.items.map((dish) => (
                    <li key={dish.id} className="wrap-anywhere">
                      {dish.name}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
