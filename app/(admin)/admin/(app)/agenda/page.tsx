import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getRooms } from "@/lib/data/catalog";
import { getBookingsInRange } from "@/lib/data/bookings";
import { getBookingNotesFor } from "@/lib/data/notes";
import { canAddBookingNote, canAssignRoom, isAdmin } from "@/lib/permissions";
import { AgendaBoard } from "@/components/agenda/AgendaBoard";
import { KitchenAgenda } from "@/components/agenda/KitchenAgenda";
import {
  monthGridRange,
  parseDateParam,
  parseKindFilter,
  parseView,
  todayISO,
} from "@/components/agenda/agenda-utils";

export const metadata: Metadata = {
  title: "Agenda · Casale del Notaio",
};

type SearchParams = Promise<{ date?: string; view?: string; tipo?: string }>;

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const today = todayISO();
  const kind = parseKindFilter(params.tipo);

  // Cucina: calendario con schede dei banchetti (uguali a sala e admin), note cucina in tendina.
  if (profile.role === "cucina") {
    const day = parseDateParam(params.date);
    const kitchenRange = monthGridRange(day);
    const kitchenBookings = await getBookingsInRange(kitchenRange.from, kitchenRange.to);
    const kitchenNotes = await getBookingNotesFor(kitchenBookings.map((b) => b.id));
    return (
      <KitchenAgenda
        key={`${day}|${kind}`}
        initialDate={day}
        initialKind={kind}
        today={today}
        loadedRange={kitchenRange}
        bookings={kitchenBookings}
        notes={Object.values(kitchenNotes).flat()}
        canAddNote={canAddBookingNote(profile)}
        currentUserId={profile.id}
      />
    );
  }

  const admin = isAdmin(profile);
  const view = parseView(params.view);
  const selected = parseDateParam(params.date);
  // Si carica l'intera griglia mensile (con i giorni dei mesi adiacenti): il resto della navigazione è client-side.
  const loadedRange = monthGridRange(selected);
  const [bookings, rooms] = await Promise.all([getBookingsInRange(loadedRange.from, loadedRange.to), getRooms({ includeInactive: true })]);

  return (
    <AgendaBoard
      key={`${selected}|${view}|${kind}`}
      bookings={bookings}
      initialDate={selected}
      initialView={view}
      initialKind={kind}
      loadedRange={loadedRange}
      today={today}
      isAdmin={admin}
      rooms={rooms}
      canAssignRooms={canAssignRoom(profile, "normale")}
    />
  );
}
