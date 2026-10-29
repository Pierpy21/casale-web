/**
 * Registro delle azioni di scrittura riproducibili dalla coda, indicizzate per NOME ("file.funzione").
 * Il sync engine reinvia per nome: dopo un deploy gli id interni delle Server Action cambiano, i nomi no.
 * Aggiungere qui ogni nuova azione di scrittura che usa submitMutation.
 * Le azioni di login, logout e notifiche push restano online-only e non compaiono qui.
 */
import * as bookings from "@/app/actions/bookings";
import * as catalog from "@/app/actions/catalog";
import * as clients from "@/app/actions/clients";
import * as inventory from "@/app/actions/inventory";
import * as notifications from "@/app/actions/notifications";
import * as operators from "@/app/actions/operators";
import * as payments from "@/app/actions/payments";
import * as quotes from "@/app/actions/quotes";
import type { ActionResult } from "@/lib/types";

// Le firme variano per azione: il registro le accetta tutte, il controllo di tipo resta sulle azioni originali.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegisteredAction = (...args: any[]) => Promise<ActionResult<unknown>>;

export const ACTION_REGISTRY: Record<string, RegisteredAction> = {
  "bookings.createBooking": bookings.createBooking,
  "bookings.updateBooking": bookings.updateBooking,
  "bookings.deleteBooking": bookings.deleteBooking,
  "bookings.updateBookingCovers": bookings.updateBookingCovers,
  "bookings.updateBookingDishes": bookings.updateBookingDishes,
  "bookings.setBookingStatus": bookings.setBookingStatus,
  "bookings.assignBookingRoom": bookings.assignBookingRoom,
  "bookings.assignBookingTable": bookings.assignBookingTable,
  "bookings.resetDishesFromMenu": bookings.resetDishesFromMenu,
  "bookings.saveBookingAllergies": bookings.saveBookingAllergies,
  "bookings.addBookingNote": bookings.addBookingNote,
  "bookings.deleteBookingNote": bookings.deleteBookingNote,

  "catalog.upsertMenu": catalog.upsertMenu,
  "catalog.deleteMenu": catalog.deleteMenu,
  "catalog.setMenuActive": catalog.setMenuActive,
  "catalog.upsertRoom": catalog.upsertRoom,
  "catalog.setRoomActive": catalog.setRoomActive,
  "catalog.upsertDish": catalog.upsertDish,
  "catalog.deleteDish": catalog.deleteDish,

  "payments.addPayment": payments.addPayment,
  "payments.deletePayment": payments.deletePayment,

  "quotes.createQuoteFromBooking": quotes.createQuoteFromBooking,
  "quotes.updateQuote": quotes.updateQuote,
  "quotes.deleteQuote": quotes.deleteQuote,
  "quotes.setEventFinalPrice": quotes.setEventFinalPrice,

  "clients.createClient": clients.createClient,
  "clients.updateClient": clients.updateClient,
  "clients.deleteClient": clients.deleteClient,

  "notifications.markNotificationsRead": notifications.markNotificationsRead,

  "operators.createOperator": operators.createOperator,
  "operators.updateOperator": operators.updateOperator,
  "operators.resetOperatorPassword": operators.resetOperatorPassword,
  "operators.deleteOperator": operators.deleteOperator,
  "operators.setOperatorActive": operators.setOperatorActive,

  "inventory.createInventoryProduct": inventory.createInventoryProduct,
  "inventory.updateInventoryProduct": inventory.updateInventoryProduct,
  "inventory.deactivateInventoryProduct": inventory.deactivateInventoryProduct,
  "inventory.submitInventoryReport": inventory.submitInventoryReport,
  "inventory.markInventoryReportSeen": inventory.markInventoryReportSeen,
};
