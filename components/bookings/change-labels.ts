import { STATUS_LABELS, type BookingStatus } from "@/lib/types";

/** Etichette italiane dei campi registrati in booking_changes (nomi colonna del DB). */
const FIELD_LABELS: Record<string, string> = {
  event_name: "Nome evento",
  event_date: "Data evento",
  event_time: "Ora",
  client_id: "Cliente",
  kind: "Tipo prenotazione",
  event_type: "Tipo evento",
  room_id: "Sala",
  adults: "Adulti",
  children: "Bambini",
  kids_menus: "Menù bambini",
  menu_id: "Menù",
  kids_menu_id: "Tipo menù bambini",
  setup_colors: "Colori allestimento",
  setup_notes: "Descrizione allestimento",
  status: "Stato",
  notes: "Note",
  allergie: "Allergie e patologie",
  piatti: "Piatti",
  creazione: "Creazione",
  eliminazione: "Eliminazione",
};

/** Campi a valore singolo (nessun "da → a"): creazione ed eliminazione della prenotazione. */
export const SINGLE_VALUE_FIELDS = new Set(["creazione", "eliminazione"]);

export function changeFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Mappe id → nome per rendere leggibili sala, menù e cliente nel registro. */
export interface NameLookup {
  rooms: Record<string, string>;
  menus: Record<string, string>;
  clients: Record<string, string>;
}

const ROME_TIMESTAMP = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatChangeTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : ROME_TIMESTAMP.format(date);
}

function formatIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Valore grezzo del DB → testo leggibile in base al campo. Id non risolvibili restano così come sono. */
export function formatChangeValue(field: string, value: string | null, lookup: NameLookup): string {
  if (value === null || value === "") return "—";
  switch (field) {
    case "room_id":
      return lookup.rooms[value] ?? value;
    case "menu_id":
    case "kids_menu_id":
      return lookup.menus[value] ?? value;
    case "client_id":
      return lookup.clients[value] ?? value;
    case "status":
      return STATUS_LABELS[value as BookingStatus] ?? value;
    case "event_date":
      return formatIsoDate(value);
    case "event_time":
      return value.slice(0, 5);
    case "setup_colors": {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.length > 0 ? parsed.join(", ") : "—";
      } catch {
        // valore non JSON: lo mostro così com'è
      }
      return value;
    }
    default:
      return value;
  }
}
