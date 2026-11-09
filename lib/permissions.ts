import type { BookingKind, Profile } from "./types";

// Puro (senza server-only): usabile anche nei Client Component.
// Riepilogo ruoli:
// - admin: tutto (prenotazioni di ogni tipo, preventivi, pagamenti, rubrica, catalogo, operatori, giacenza).
// - sala: vede tutte le prenotazioni; modifica solo i coperti; crea solo prenotazioni normali (cliente via nuovo cliente);
//   nella Mappa sala ha gli stessi poteri dell'admin (disposizione, tavoli generati, eventi sui tavoli).
// - cucina: sola lettura delle prenotazioni; usa la giacenza. Il flag is_chef non dà più permessi.
// - amministratore_cucina: tutto ciò che ha la cucina, più: crea prenotazioni normali ed eventi (mai appuntamenti, mai
//   preventivi/pagamenti/acconti), assegna la sala alle normali, allergie su normali ed eventi, e nella giacenza sceglie
//   se raggruppare per categoria o per fornitore.

/** Ruoli di cucina (cucina e amministratore cucina): stessa vista "cucina" di agenda e prenotazioni, niente contatti. */
export function isKitchenRole(p: Pick<Profile, "role">): boolean {
  return p.role === "cucina" || p.role === "amministratore_cucina";
}

/** Amministratore cucina attivo. */
export function isKitchenAdmin(p: Profile): boolean {
  return p.active && p.role === "amministratore_cucina";
}

/**
 * Allergie e intolleranze di una prenotazione: admin sempre; sala attiva solo su eventi e prenotazioni normali
 * (mai sugli appuntamenti). La cucina è in sola lettura.
 */
export function canEditAllergies(p: Profile, kind: BookingKind): boolean {
  if (!p.active) return false;
  if (p.role === "admin") return true;
  return (p.role === "sala" || p.role === "amministratore_cucina") && kind !== "appuntamento";
}

/** Gli appuntamenti sono visibili solo all'admin: mai a sala e cucina (letture, notifiche, modifiche). */
export function canSeeAppointments(p: Profile): boolean {
  return p.role === "admin";
}

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

/** Creazione prenotazione di un tipo: admin tutti; sala solo prenotazioni normali; amministratore cucina normali ed eventi. */
export function canCreateBooking(p: Profile, kind: BookingKind): boolean {
  if (!p.active) return false;
  if (p.role === "admin") return true;
  if (p.role === "amministratore_cucina") return kind === "normale" || kind === "evento";
  return p.role === "sala" && kind === "normale";
}

/** Può creare almeno un tipo di prenotazione (controllo iniziale prima di leggere il tipo). */
export function canCreateAnyBooking(p: Profile): boolean {
  return p.active && (p.role === "admin" || p.role === "sala" || p.role === "amministratore_cucina");
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
  return isAdmin(p) || (p.active && (p.role === "sala" || p.role === "amministratore_cucina"));
}

/** Foglio eventi del giorno (export PDF/DOCX per la cucina): admin e cucina attivi. La sala non lo esporta. */
export function canViewEventSheet(p: Profile): boolean {
  return p.active && (p.role === "admin" || isKitchenRole(p));
}

/** Giacenza: admin, cucina e amministratore cucina (leggere, inviare report). */
export function canUseInventory(p: Profile): boolean {
  return p.active && (p.role === "admin" || isKitchenRole(p));
}

/** Statistiche (coperti e menù, nessun importo): admin e cucina. */
export function canViewStats(p: Profile): boolean {
  return p.active && (p.role === "admin" || isKitchenRole(p));
}

/** Modifica di un report di giacenza già inviato: chiunque usi la giacenza (admin e tutta la cucina). */
export function canEditInventoryReport(p: Profile): boolean {
  return canUseInventory(p);
}

/** Giacenza: scelta del raggruppamento (categoria o fornitore) nel compilare e consultare: admin e amministratore cucina. */
export function canChooseInventoryGrouping(p: Profile): boolean {
  return isAdmin(p) || isKitchenAdmin(p);
}

/** Gestione del catalogo giacenza (disattivare prodotti) e segnatura dei report come visti: solo admin. */
export function canManageInventory(p: Profile): boolean {
  return isAdmin(p);
}

/** Note interne sulle prenotazioni: admin e cucina attiva. */
export function canAddBookingNote(p: Profile): boolean {
  return isAdmin(p) || (p.active && isKitchenRole(p));
}

/** Registro delle modifiche alle prenotazioni: solo admin (la sala non lo vede). */
export function canViewActivityLog(p: Profile): boolean {
  return isAdmin(p);
}

/**
 * Mappa sala (piantina, occupazione per giorno e pasto) e sistemazione delle prenotazioni normali sui tavoli:
 * admin e sala attivi. La cucina non vede la mappa.
 */
export function canViewFloorPlan(p: Profile): boolean {
  return p.active && (p.role === "admin" || p.role === "sala");
}

/**
 * Mappa sala completa: disposizione dei tavoli (standard e del giorno), tavoli generati, eventi sui tavoli (anche più tavoli):
 * admin e sala attivi (la sala ha nella mappa gli stessi poteri dell'admin).
 */
export function canEditFloorLayout(p: Profile): boolean {
  return canViewFloorPlan(p);
}

/** Sistemazione sui tavoli della mappa: admin e sala attivi, prenotazioni normali ed eventi (mai appuntamenti). */
export function canSeatBooking(p: Profile, kind: BookingKind): boolean {
  return canViewFloorPlan(p) && kind !== "appuntamento";
}
