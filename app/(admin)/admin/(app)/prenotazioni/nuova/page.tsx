import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseDateParam } from "@/components/agenda/agenda-utils";
import { NewBookingForm } from "@/components/bookings/NewBookingForm";
import { occupancyWindow } from "@/components/bookings/booking-window";
import { requireProfile } from "@/lib/auth";
import { getRoomBookingSlots } from "@/lib/data/bookings";
import { getClient } from "@/lib/data/clients";
import { getDishes, getMenus, getRooms } from "@/lib/data/catalog";
import { canCreateAnyBooking, canCreateBooking, canEditDishes, isAdmin } from "@/lib/permissions";
import type { BookingKind, Profile } from "@/lib/types";

export const metadata: Metadata = {
  title: "Crea · Casale del Notaio",
};

type SearchParams = Promise<{ tipo?: string; date?: string; client?: string }>;

/**
 * Tipo richiesto dall'URL, se il ruolo può crearlo. Senza tipo (o con un tipo non consentito) l'admin crea un evento,
 * gli altri ruoli una prenotazione normale.
 */
function requestedKind(tipo: string | undefined, profile: Profile): BookingKind {
  if (tipo === "normale" || tipo === "evento" || tipo === "appuntamento") {
    if (canCreateBooking(profile, tipo)) return tipo;
  }
  return isAdmin(profile) ? "evento" : "normale";
}

export default async function NewBookingPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (!canCreateAnyBooking(profile)) redirect("/admin/agenda");

  const params = await searchParams;
  const kind = requestedKind(params.tipo, profile);
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

  const [rooms, menus, occupancy, dishCatalog] = await Promise.all([
    getRooms({ includeInactive: true }),
    kind === "evento" ? getMenus({ includeInactive: true }) : Promise.resolve([]),
    kind === "appuntamento" ? Promise.resolve([]) : getRoomBookingSlots(range.from, range.to),
    // Catalogo piatti per personalizzare i piatti dell'evento già in creazione.
    kind === "evento" && canEditDishes(profile) ? getDishes() : Promise.resolve([]),
  ]);

  return (
    <NewBookingForm
      mode="create"
      kind={kind}
      clients={[]}
      rooms={rooms}
      menus={menus}
      occupancy={occupancy}
      initialDate={date}
      prefill={prefill}
      isAdmin={isAdmin(profile)}
      dishCatalog={dishCatalog}
    />
  );
}
