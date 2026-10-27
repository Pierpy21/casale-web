import type { BookingKind, Profile } from "./types";

// Puro (senza server-only): usabile anche nei Client Component.
// Riepilogo ruoli:
// - admin: tutto (prenotazioni di ogni tipo, preventivi, pagamenti, rubrica, catalogo, operatori, giacenza).
// - sala: vede tutte le prenotazioni; modifica solo i coperti; crea solo prenotazioni normali (cliente via nuovo cliente).
// - cucina: sola lettura delle prenotazioni; usa la giacenza. Il flag is_chef non dà più permessi.

/** Attivo e admin. */
export function isAdmin(p: Profile): boolean {
  return p.active && p.role === "admin";
}

/** Admin o sala: possono modificare solo i coperti (anche sugli eventi). */
export function canEditCovers(p: Profile): boolean {
  return p.active && (p.role === "admin" || p.role === "sala");
}

/** Modifica piatti: solo admin (la cucina non modifica più le prenotazioni). */
export function canEditDishes(p: Profile): boolean {
  return isAdmin(p);
}

/** Creazione prenotazione di un tipo: admin tutti; sala solo prenotazioni normali. */
export function canCreateBooking(p: Profile, kind: BookingKind): boolean {
  if (!p.active) return false;
  if (p.role === "admin") return true;
  return p.role === "sala" && kind === "normale";
}

/** Può creare almeno un tipo di prenotazione (controllo iniziale prima di leggere il tipo). */
export function canCreateAnyBooking(p: Profile): boolean {
  return p.active && (p.role === "admin" || p.role === "sala");
}

/** Modifica completa, cambio stato, eliminazione: solo admin. */
export function canEditBookingFully(p: Profile): boolean {
  return isAdmin(p);
}

/** Rubrica clienti (lista, modifica, eliminazione): solo admin. Sala e cucina creano i clienti solo dentro una prenotazione. */
export function canManageClients(p: Profile): boolean {
  return isAdmin(p);
}

/** Preventivi e pagamenti: solo admin. */
export function canManageQuotesAndPayments(p: Profile): boolean {
  return isAdmin(p);
}

/**
 * Assegnazione della sala: solo sulle prenotazioni normali, per admin e sala (attiva).
 * La cucina e le altre combinazioni non possono cambiare la sala da qui.
 */
export function canAssignRoom(p: Profile, kind: BookingKind): boolean {
  if (kind !== "normale") return false;
  return isAdmin(p) || (p.active && p.role === "sala");
}

/** Giacenza: admin e cucina (leggere, inviare report). */
export function canUseInventory(p: Profile): boolean {
  return p.active && (p.role === "admin" || p.role === "cucina");
}

/** Gestione del catalogo giacenza (disattivare prodotti) e segnatura dei report come visti: solo admin. */
export function canManageInventory(p: Profile): boolean {
  return isAdmin(p);
}
