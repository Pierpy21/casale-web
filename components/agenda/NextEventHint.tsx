import { differenceInCalendarDays } from "date-fns";
import { ArrowRight } from "lucide-react";
import { bookingTitle, formatTime } from "@/components/bookings/format";
import { EmptyState, cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief } from "@/lib/types";
import { capitalize, formatIt, toDate, type AgendaKindFilter } from "./agenda-utils";

const BOX = "flex w-72 max-w-full items-center justify-between gap-4 rounded-xl border border-sand bg-cream/60 px-4 py-3 text-left min-h-[44px]";

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
      <div className={cn(BOX, "justify-center text-center")}>
        <p className="text-[14px] text-slate">Nessun evento in programma</p>
      </div>
    );
  }

  const date = toDate(nextEvent.event_date);
  const days = differenceInCalendarDays(date, toDate(selected));
  const relative = days === 1 ? "domani" : `tra ${days} giorni`;
  const time = formatTime(nextEvent.event_time);

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
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Prossimo evento</span>
        <span className="text-[14px] text-ink tabular-nums">
          {capitalize(formatIt(date, "EEEE d MMMM"))} · {relative}
          {time ? ` · ore ${time}` : ""}
        </span>
        <span className="truncate font-serif text-lg text-ink">{nextEvent.title}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-petrol" />
    </button>
  );
}

/** Prossimo evento dopo `selected`: prima tra i banchetti caricati, poi `afterRange` (oltre la griglia caricata). */
export function nextEventFrom(bookings: BookingListItem[], selected: string, afterRange: NextEventBrief | null): NextEventBrief | null {
  const first = bookings
    .filter((b) => b.kind === "evento" && b.status !== "annullato" && b.event_date > selected)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time ?? "99:99").localeCompare(b.event_time ?? "99:99"))[0];
  if (!first) return afterRange;
  return { id: first.id, event_date: first.event_date, event_time: first.event_time, title: bookingTitle(first) };
}

/**
 * Giorno vuoto dell'agenda (tutti i ruoli): "Niente da vedere qui" e il prossimo evento.
 * Con il filtro "prenotazioni" il prossimo evento sarebbe nascosto dal filtro stesso: si invita a cambiarlo.
 */
export function EmptyDay({
  kind,
  nextEvent,
  selected,
  onOpen,
}: {
  kind: AgendaKindFilter;
  nextEvent: NextEventBrief | null;
  selected: string;
  onOpen: (iso: string) => void;
}) {
  if (kind === "prenotazioni") {
    return <EmptyState title="Niente da vedere qui" description="Cambia il filtro per vedere anche gli eventi." />;
  }
  return <EmptyState title="Niente da vedere qui" action={<NextEventHint nextEvent={nextEvent} selected={selected} onOpen={onOpen} />} />;
}
