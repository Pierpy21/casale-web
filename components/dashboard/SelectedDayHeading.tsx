import { addDays } from "date-fns";
import { capitalize, formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import type { BookingListItem, Room } from "@/lib/types";

export interface SelectedDayHeadingProps {
  /** Giorno selezionato (YYYY-MM-DD). */
  selectedDay: string;
  todayIso: string;
  rooms: Room[];
  /** Solo eventi: la sala occupata è quella con un evento nel giorno selezionato. */
  bookings: BookingListItem[];
}

/** Etichetta sopra il giorno: "Oggi", "Domani" oppure "Giorno selezionato". */
function dayEyebrow(selectedDay: string, todayIso: string): string {
  if (selectedDay === todayIso) return "Oggi";
  const tomorrow = toISO(addDays(toDate(todayIso), 1));
  if (selectedDay === tomorrow) return "Domani";
  return "Giorno selezionato";
}

/** Titolo del giorno selezionato, posto subito sopra il calendario delle sale (matrice o elenco). */
export function SelectedDayHeading({ selectedDay, todayIso, rooms, bookings }: SelectedDayHeadingProps) {
  const roomIds = new Set(bookings.filter((b) => b.event_date === selectedDay && b.room_id).map((b) => b.room_id));
  const occupiedCount = rooms.filter((room) => roomIds.has(room.id)).length;

  return (
    <div aria-live="polite" className="flex min-w-0 flex-col gap-1 border-b border-sand pb-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
        {dayEyebrow(selectedDay, todayIso)}
      </p>
      <h3 className="break-words text-xl">{capitalize(formatIt(toDate(selectedDay), "EEEE d MMMM"))}</h3>
      <p className="text-[13px] text-slate-dark">
        {rooms.length === 0 ? "Nessuna sala attiva" : `${occupiedCount} su ${rooms.length} sale occupate`}
      </p>
    </div>
  );
}
