import type { BookingDetail, BookingKind, ClientOption, Dish, Menu, Room, RoomBookingSlot } from "@/lib/types";
import type { NewClientDraft } from "./booking-form-model";
import { EventForm } from "./EventForm";
import { SimpleBookingForm } from "./SimpleBookingForm";

export interface BookingFormProps {
  mode: "create" | "edit";
  /** Tipo della prenotazione: in modifica è quello salvato. */
  kind: BookingKind;
  booking?: BookingDetail;
  /** Rubrica: solo in modifica (cambio cliente). In creazione il cliente è sempre nuovo. */
  clients: ClientOption[];
  rooms: Room[];
  menus: Menu[];
  occupancy: RoomBookingSlot[];
  initialDate: string;
  /** Creazione da una scheda cliente: dati del cliente già compilati. */
  prefill?: NewClientDraft;
  /** Creazione: l'admin invia il cliente scelto dai suggerimenti come client_id (la sala come nuovo cliente). */
  isAdmin?: boolean;
  /** Solo eventi in creazione: catalogo piatti per personalizzare i piatti dell'evento. */
  dishCatalog?: Dish[];
}

/** Sceglie il form in base al tipo: evento (menù, preventivo) oppure prenotazione normale / appuntamento. */
export function BookingForm({ mode, kind, booking, clients, rooms, menus, occupancy, initialDate, prefill, isAdmin, dishCatalog }: BookingFormProps) {
  if (kind === "evento") {
    return (
      <EventForm
        mode={mode}
        booking={booking}
        clients={clients}
        rooms={rooms}
        menus={menus}
        occupancy={occupancy}
        initialDate={initialDate}
        prefill={prefill}
        isAdmin={isAdmin}
        dishCatalog={dishCatalog}
      />
    );
  }
  return (
    <SimpleBookingForm
      kind={kind}
      mode={mode}
      booking={booking}
      clients={clients}
      rooms={rooms}
      occupancy={occupancy}
      initialDate={initialDate}
      prefill={prefill}
      isAdmin={isAdmin}
    />
  );
}
