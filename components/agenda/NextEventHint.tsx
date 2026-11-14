import { differenceInCalendarDays } from "date-fns";
import { ArrowRight } from "lucide-react";
import { bookingPersonName, bookingTimeSortKey, mealLabel } from "@/components/bookings/format";
import { EmptyState, cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief } from "@/lib/types";
import { capitalize, formatIt, toDate, type AgendaKindFilter, type AgendaMealFilter } from "./agenda-utils";

const BOX = "flex w-72 max-w-full flex-col items-center justify-center gap-2 rounded-xl border border-sand bg-cream/60 px-4 py-3 text-center min-h-[44px]";

/**
 * Riquadro "Prossimo evento" per il giorno vuoto (admin). Cliccabile: porta a quel giorno.
 * Senza eventi futuri mostra solo il testo, non cliccabile.
 */
export function NextEventHint({
  nextEvent,
  selected,
  onOpen,
}: {
  nextEvent: NextEventBrief | null;
  /** Giorno selezionato (ISO), di riferimento per "domani" / "tra N giorni". */
  selected: string;
  onOpen: (iso: string) => void;
}) {
  if (!nextEvent) {
    return (
      <div className={BOX}>
        <p className="text-[14px] text-slate">Nessun evento in programma</p>
      </div>
    );
  }

  const date = toDate(nextEvent.event_date);
  const days = differenceInCalendarDays(date, toDate(selected));
  const relative = days === 1 ? "domani" : `tra ${days} giorni`;
  const meal = mealLabel(nextEvent.meal);

  return (
    <button
      type="button"
      onClick={() => onOpen(nextEvent.event_date)}
      aria-label={`Prossimo evento: ${nextEvent.title}, ${formatIt(date, "EEEE d MMMM")}, ${relative}`}
      className={cn(
        BOX,
        "transition-colors duration-200 hover:bg-sand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
      )}
    >
      <span className="flex w-full min-w-0 flex-col items-center gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Prossimo evento</span>
        <span className="text-[14px] text-ink tabular-nums">
          {capitalize(formatIt(date, "EEEE d MMMM"))} · {relative}
          {meal ? ` · ${meal}` : ""}
        </span>
        <span className="block w-full truncate font-serif text-lg text-ink">{nextEvent.title}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-petrol" />
    </button>
  );
}

/** Prossimo evento dopo `selected`: prima tra i banchetti caricati, poi `afterRange` (oltre la griglia caricata). */
export function nextEventFrom(bookings: BookingListItem[], selected: string, afterRange: NextEventBrief | null): NextEventBrief | null {
  const first = bookings
    .filter((b) => b.kind === "evento" && b.status !== "annullato" && b.event_date > selected)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || bookingTimeSortKey(a).localeCompare(bookingTimeSortKey(b)))[0];
  if (!first) return afterRange;
  return { id: first.id, event_date: first.event_date, meal: first.meal, title: bookingPersonName(first) };
}

/**
 * Giorno vuoto dell'agenda (tutti i ruoli): "Niente da vedere qui" e il prossimo evento.
 * Con il filtro "prenotazioni" il prossimo evento sarebbe nascosto dal filtro stesso: si invita a cambiarlo.
 */
export function EmptyDay({
  kind,
  meal = "tutti",
  hasBookings = false,
  nextEvent,
  selected,
  onOpen,
}: {
  kind: AgendaKindFilter;
  /** Filtro pasto attivo: con servizi nel giorno ma nessuno in questo pasto, il messaggio lo dice. */
  meal?: AgendaMealFilter;
  /** Il giorno ha prenotazioni (prima del filtro pasto). */
  hasBookings?: boolean;
  nextEvent: NextEventBrief | null;
  selected: string;
  onOpen: (iso: string) => void;
}) {
  if (meal !== "tutti" && hasBookings) {
    return (
      <EmptyState
        variant="plain"
        title={`Nessun servizio a ${meal} in questo giorno.`}
        description="Scegli Tutti per vedere l'intera giornata."
      />
    );
  }
  if (kind === "prenotazioni") {
    return <EmptyState variant="plain" title="Niente da vedere qui" description="Cambia il filtro per vedere anche gli eventi." />;
  }
  return (
    <EmptyState
      variant="plain"
      title="Niente da vedere qui"
      action={<NextEventHint nextEvent={nextEvent} selected={selected} onOpen={onOpen} />}
    />
  );
}
