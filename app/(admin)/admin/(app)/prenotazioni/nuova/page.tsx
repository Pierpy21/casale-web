import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseDateParam } from "@/components/agenda/agenda-utils";
import { BookingForm } from "@/components/bookings/BookingForm";
import { occupancyWindow } from "@/components/bookings/booking-window";
import { requireProfile } from "@/lib/auth";
import { getRoomBookingSlots } from "@/lib/data/bookings";
import { getClient } from "@/lib/data/clients";
import { getMenus, getRooms } from "@/lib/data/catalog";
import { canCreateAnyBooking, canCreateBooking, isAdmin } from "@/lib/permissions";
import type { BookingKind } from "@/lib/types";

export const metadata: Metadata = {
  title: "Crea · Casale del Notaio",
};

type SearchParams = Promise<{ tipo?: string; date?: string; client?: string }>;

/**
 * Tipo richiesto dall'URL. L'admin crea un evento se il tipo manca;
 * la sala crea sempre prenotazioni normali.
 */
function requestedKind(tipo: string | undefined, admin: boolean): BookingKind {
  if (!admin) return "normale";
  if (tipo === "normale" || tipo === "appuntamento") return tipo;
  return "evento";
}

export default async function NewBookingPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (!canCreateAnyBooking(profile)) redirect("/admin/agenda");

  const params = await searchParams;
  const kind = requestedKind(params.tipo, isAdmin(profile));
  if (!canCreateBooking(profile, kind)) redirect("/admin/agenda");

  const date = parseDateParam(params.date);
  const range = occupancyWindow();
  // Da una scheda cliente (admin): i dati del cliente vengono precompilati nel blocco "Nome / Cellulare / Email".
  const sourceClient = isAdmin(profile) && params.client ? await getClient(params.client) : null;
  const prefill = sourceClient
    ? {
        full_name: `${sourceClient.first_name} ${sourceClient.last_name}`.trim(),
        phone: sourceClient.phone,
        email: sourceClient.email ?? "",
      }
    : undefined;

  const [rooms, menus, occupancy] = await Promise.all([
    getRooms({ includeInactive: true }),
    kind === "evento" ? getMenus({ includeInactive: true }) : Promise.resolve([]),
    kind === "appuntamento" ? Promise.resolve([]) : getRoomBookingSlots(range.from, range.to),
  ]);

  return (
    <BookingForm
      mode="create"
      kind={kind}
      clients={[]}
      rooms={rooms}
      menus={menus}
      occupancy={occupancy}
      initialDate={date}
      prefill={prefill}
      isAdmin={isAdmin(profile)}
    />
  );
}
