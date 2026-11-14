import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/bookings/BookingForm";
import { occupancyWindow } from "@/components/bookings/booking-window";
import { isUuid } from "@/lib/action-utils";
import { requireAdmin } from "@/lib/auth";
import { getBooking, getRoomBookingSlots } from "@/lib/data/bookings";
import { getMenus, getRooms } from "@/lib/data/catalog";
import { getClientOptions } from "@/lib/data/clients";

export const metadata: Metadata = {
  title: "Modifica prenotazione · Casale del Notaio",
};

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const booking = await getBooking(id);
  if (!booking) notFound();

  const range = occupancyWindow(booking.event_date);
  const [clients, rooms, menus, occupancy] = await Promise.all([
    getClientOptions(),
    getRooms({ includeInactive: true }),
    getMenus({ includeInactive: true }),
    getRoomBookingSlots(range.from, range.to),
  ]);

  // Menù composto di questo evento: non è tra i menù scelti, ma deve restare selezionabile nel form (altrimenti il salvataggio lo perderebbe).
  const menuOptions = booking.menu?.custom ? [...menus, booking.menu] : menus;

  // Il form dipende dal tipo salvato (evento, prenotazione o appuntamento).
  return (
    <BookingForm
      mode="edit"
      kind={booking.kind}
      booking={booking}
      clients={clients}
      rooms={rooms}
      menus={menuOptions}
      occupancy={occupancy}
      initialDate={booking.event_date}
    />
  );
}
