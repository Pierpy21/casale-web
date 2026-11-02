import {
  COURSE_LABELS,
  COURSE_ORDER,
  type BookingDish,
  type BookingListItem,
  type Course,
} from "@/lib/types";

/** "19:30:00" -> "19:30". */
export function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** Notazione del Casale: A = adulti, B = bambini. */
export function formatCovers(b: Pick<BookingListItem, "adults" | "children">): string {
  return b.children > 0 ? `A ${b.adults} + B ${b.children}` : `A ${b.adults}`;
}

export function totalCovers(b: Pick<BookingListItem, "adults" | "children">): number {
  return b.adults + b.children;
}

/**
 * Campi della prenotazione che servono a mostrare chi è la persona: nome e telefono.
 * Compatibile con BookingListItem, BookingDetail e con i record ridotti (liste, notifiche).
 */
export interface BookingPersonSource {
  kind?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  client?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
}

/** "Nome Cognome" del cliente di rubrica; cognome facoltativo (niente spazio finale). */
function clientNameOf(client: BookingPersonSource["client"]): string {
  return [client?.first_name, client?.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}

/**
 * Nome della persona di una prenotazione. Normale: l'ospite scritto sulla prenotazione (con ripiego sul cliente
 * di rubrica se mancasse). Evento e appuntamento: il cliente di rubrica. Stringa vuota se non c'è nessun nome.
 */
export function bookingPersonName(b: BookingPersonSource): string {
  if (b.kind === "normale") return (b.guest_name ?? "").trim() || clientNameOf(b.client);
  return clientNameOf(b.client);
}

/** Cellulare della persona (stessa regola di bookingPersonName). Null se non c'è. */
export function bookingPhone(b: BookingPersonSource): string | null {
  const own = b.kind === "normale" ? (b.guest_phone ?? "").trim() : "";
  return own || (b.client?.phone ?? "").trim() || null;
}

export interface DishGroup {
  course: Course;
  label: string;
  items: BookingDish[];
}

/** Piatti raggruppati per portata, nell'ordine COURSE_ORDER. */
export function groupDishes(dishes: BookingDish[]): DishGroup[] {
  return COURSE_ORDER.map((course) => ({
    course,
    label: COURSE_LABELS[course],
    items: dishes
      .filter((dish) => dish.course === course)
      .sort((a, b) => a.sort - b.sort),
  })).filter((group) => group.items.length > 0);
}
