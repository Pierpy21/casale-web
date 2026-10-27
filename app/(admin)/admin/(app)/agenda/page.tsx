import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getRooms } from "@/lib/data/catalog";
import { getBookingsInRange } from "@/lib/data/bookings";
import { canAssignRoom, isAdmin } from "@/lib/permissions";
import { AgendaBoard } from "@/components/agenda/AgendaBoard";
import { KitchenAgenda } from "@/components/agenda/KitchenAgenda";
import {
  monthGridRange,
  parseDateParam,
  parseView,
  todayISO,
} from "@/components/agenda/agenda-utils";

export const metadata: Metadata = {
  title: "Agenda · Casale del Notaio",
};

type SearchParams = Promise<{ date?: string; view?: string }>;

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const today = todayISO();

  // Cucina: vista giornaliera orientata ai menù (solo lettura).
  if (profile.role === "cucina") {
    const day = parseDateParam(params.date);
    const bookings = await getBookingsInRange(day, day);
    return <KitchenAgenda date={day} today={today} bookings={bookings} />;
  }

  const admin = isAdmin(profile);
  const view = parseView(params.view);
  const selected = parseDateParam(params.date);
  // Si carica l'intera griglia mensile (con i giorni dei mesi adiacenti): il resto della navigazione è client-side.
  const loadedRange = monthGridRange(selected);
  const [bookings, rooms] = await Promise.all([getBookingsInRange(loadedRange.from, loadedRange.to), getRooms({ includeInactive: true })]);

  return (
    <AgendaBoard
      key={`${selected}|${view}`}
      bookings={bookings}
      initialDate={selected}
      initialView={view}
      loadedRange={loadedRange}
      today={today}
      isAdmin={admin}
      rooms={rooms}
      canAssignRooms={canAssignRoom(profile, "normale")}
    />
  );
}
