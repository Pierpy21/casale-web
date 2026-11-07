import {
  BOOKING_MEAL_LABELS,
  COURSE_LABELS,
  COURSE_ORDER,
  type BookingDish,
  type BookingListItem,
  type Course,
} from "@/lib/types";
import { normalizePhoneInput } from "@/lib/phone";

/** "19:30:00" -> "19:30". */
export function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** Campi che dicono quando si svolge una prenotazione: pasto (evento e normale) oppure orario (appuntamento). */
export interface BookingWhenSource {
  kind?: string | null;
  meal?: string | null;
  event_time?: string | null;
}

/** "Pranzo" / "Cena" per il valore salvato; null se vuoto o sconosciuto. */
export function mealLabel(meal: string | null | undefined): string | null {
  return meal === "pranzo" || meal === "cena" ? BOOKING_MEAL_LABELS[meal] : null;
}

/**
 * Quando si svolge: "Pranzo" o "Cena" per evento e prenotazione normale, "HH:MM" per l'appuntamento.
 * Null se non indicato.
 */
export function bookingWhen(b: BookingWhenSource): string | null {
  if (b.kind === "appuntamento") return formatTime(b.event_time ?? null);
  return mealLabel(b.meal);
}

/**
 * Chiave per ordinare le prenotazioni di uno stesso giorno: pranzo e cena valgono come 12:30 e 20:00, così gli
 * appuntamenti si intercalano per orario (mattina prima del pranzo); in fondo quelle senza pasto né orario.
 * Stringhe confrontabili con < e >.
 */
export function bookingTimeSortKey(b: BookingWhenSource): string {
  if (b.kind === "appuntamento") return b.event_time ? `0${b.event_time.slice(0, 5)}1` : "1";
  if (b.meal === "pranzo") return "012:300";
  if (b.meal === "cena") return "020:000";
  return "1";
}

/** Notazione del Casale: A = adulti, B = menù bambini (i seggioloni non sono coperti). */
export function formatCovers(b: Pick<BookingListItem, "adults" | "kids_menus">): string {
  return b.kids_menus > 0 ? `A ${b.adults} + B ${b.kids_menus}` : `A ${b.adults}`;
}

/** Coperti per esteso, per la scheda della prenotazione: "Adulti 4 · Menù bambini 2 · Seggioloni 1" (seggioloni solo se presenti). */
export function formatCoversDetail(b: Pick<BookingListItem, "adults" | "kids_menus" | "children">): string {
  const parts = [`Adulti ${b.adults}`, `Menù bambini ${b.kids_menus}`];
  if (b.children > 0) parts.push(`Seggioloni ${b.children}`);
  return parts.join(" · ");
}

/** Coperti = adulti + menù bambini; i seggioloni non contano. */
export function totalCovers(b: Pick<BookingListItem, "adults" | "kids_menus">): number {
  return b.adults + b.kids_menus;
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

/** Numero WhatsApp in formato internazionale senza simboli (per wa.me). Default prefisso Italia. Vuoto se non ci sono cifre. */
export function whatsappNumber(phone: string): string {
  // Prima la normalizzazione: le cifre a tutta larghezza e gli spazi invisibili sarebbero altrimenti scartati.
  const normalized = normalizePhoneInput(phone);
  let digits = normalized.replace(/\D/g, "");
  // Con "+" o "00" il prefisso c'è già. Fino a 10 cifre è un numero italiano (anche 393…): si mette 39.
  // In Italia lo zero dei fissi resta nel numero internazionale (095… → 39095…).
  if (normalized.startsWith("+")) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length <= 10) digits = `39${digits}`;
  return digits;
}

/**
 * Link wa.me con testo facoltativo. Senza numero (o con un numero senza cifre) apre la scelta del contatto:
 * https://wa.me/?text=...
 */
export function whatsappUrl(phone: string | null, text?: string): string {
  const number = phone ? whatsappNumber(phone) : "";
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
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
