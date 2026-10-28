import { format } from "date-fns";
import { it } from "date-fns/locale";
import { STATUS_LABELS, type BookingKind, type BookingStatus, type NotificationType } from "./types";

// Testi delle notifiche (puri). Il menù è il dato in evidenza nel titolo.

/** Dati minimi di una prenotazione per costruire le notifiche. */
export interface BookingBrief {
  id: string;
  kind: BookingKind;
  event_type: string | null;
  event_name: string | null;
  event_time: string | null;
  event_date: string; // YYYY-MM-DD
  status: BookingStatus;
  client_name: string;
  room_name: string | null;
  menu_name: string | null;
  adults: number;
  children: number;
  kids_menus: number;
  allergy_count: number;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 300;

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Sab 14 nov" a partire da YYYY-MM-DD (senza slittamenti di fuso). */
export function formatEventDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return capitalize(format(new Date(y, m - 1, d), "EEE d MMM", { locale: it }));
}

export function totalCovers(b: Pick<BookingBrief, "adults" | "children">): number {
  return b.adults + b.children;
}

function allergyText(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "1 allergia" : `${n} allergie`;
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Titolo e corpo per un evento di prenotazione. `actorName` è l'autore dell'azione (se noto). */
export function buildBookingNotice(
  type: Exclude<NotificationType, "event_reminder" | "inventory_report">,
  b: BookingBrief,
  actorName: string | null,
): { title: string; body: string } {
  const menu = b.menu_name;
  const withMenu = (prefix: string) => (menu ? `${prefix} · ${menu}` : prefix);

  let title: string;
  switch (type) {
    case "booking_created":
      if (b.kind === "appuntamento") {
        title = `Nuovo appuntamento · ${b.event_name ?? "senza titolo"}`;
      } else if (b.kind === "normale") {
        title = b.event_time ? `Nuova prenotazione · ${b.event_time.slice(0, 5)}` : "Nuova prenotazione";
      } else {
        title = menu ? `Nuovo banchetto · ${menu}` : "Nuovo banchetto";
      }
      break;
    case "booking_updated":
      title = withMenu("Prenotazione modificata");
      break;
    case "booking_status":
      title = withMenu(`Stato: ${STATUS_LABELS[b.status]}`);
      break;
    case "booking_cancelled":
      title = withMenu("Prenotazione annullata");
      break;
    case "booking_deleted":
      title = withMenu("Prenotazione eliminata");
      break;
    case "covers_updated":
      title = withMenu("Coperti aggiornati");
      break;
    case "dishes_updated":
      title = withMenu("Piatti aggiornati");
      break;
  }

  const parts = [
    formatEventDay(b.event_date),
    b.room_name ?? "sala da definire",
    `${totalCovers(b)} coperti`,
    b.client_name,
  ].filter(Boolean);
  let body = parts.join(" · ");
  if (actorName) body += ` — da ${actorName}`;

  return { title: clip(title, TITLE_MAX), body: clip(body, BODY_MAX) };
}

/** Promemoria del giorno dopo: "Domani · Menù 2" / "Sala Grande · 44 coperti (A 40 + B 4) · 2 allergie". */
export function buildReminderNotice(b: BookingBrief): { title: string; body: string } {
  if (b.kind === "appuntamento") {
    // Appuntamento: ora e cliente, senza coperti ne' sala.
    const time = b.event_time ? b.event_time.slice(0, 5) : "orario da definire";
    return {
      title: clip("Domani · Appuntamento", TITLE_MAX),
      body: clip([time, b.client_name].filter(Boolean).join(" · "), BODY_MAX),
    };
  }
  const title = `Domani · ${b.menu_name ?? "Evento"}`;
  const parts = [
    b.room_name ?? "sala da definire",
    `${totalCovers(b)} coperti (A ${b.adults} + B ${b.children})`,
    allergyText(b.allergy_count),
  ].filter(Boolean);
  return { title: clip(title, TITLE_MAX), body: clip(parts.join(" · "), BODY_MAX) };
}
