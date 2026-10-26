import { EVENT_TYPES, type BookingDetail, type ClientSuggestion, type Room, type RoomBookingSlot } from "@/lib/types";

// Modello puro (senza React) dei form prenotazione: validazione lato client, mappa errori del server, avvisi di sala.

export type Errors = Record<string, string[]>;

export interface AllergyRow {
  key: string;
  subject_name: string;
  condition: string;
  notes: string;
}

export interface NewClientDraft {
  full_name: string;
  phone: string;
  email: string;
}

let rowSeq = 0;
/** Chiave stabile per le righe dei form (liste dinamiche). */
export function nextRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export const first = (messages: string[] | undefined): string | undefined => messages?.[0];

/** aria-describedby coerente con Field (errore prima dell'hint). */
export function describedBy(id: string, hasError: boolean, hasHint: boolean): string | undefined {
  if (hasError) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}

/** "19:30:00" -> "19:30" per gli input type="time". */
export function timeInputValue(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

// ---------------------------------------------------------------------------
// Tipo evento: suggerimenti + testo libero per "Altro"
// ---------------------------------------------------------------------------

const KNOWN_EVENT_TYPES = EVENT_TYPES as readonly string[];

export interface EventTypeState {
  choice: string;
  custom: string;
}

/** Stato iniziale del selettore tipo evento a partire dal valore salvato. */
export function eventTypeState(saved: string | null | undefined): EventTypeState {
  if (!saved) return { choice: "", custom: "" };
  if (KNOWN_EVENT_TYPES.includes(saved)) return { choice: saved, custom: "" };
  return { choice: "Altro", custom: saved };
}

/** Valore inviato al server: il suggerimento scelto, oppure il testo libero per "Altro". Vuoto se non scelto. */
export function resolveEventType(state: EventTypeState): string {
  if (!state.choice) return "";
  if (state.choice === "Altro") return state.custom.trim() || "Altro";
  return state.choice;
}

// ---------------------------------------------------------------------------
// Allergie
// ---------------------------------------------------------------------------

export function allergyRowsFrom(booking: BookingDetail | undefined): AllergyRow[] {
  return (booking?.allergies ?? []).map((a) => ({
    key: nextRowKey(),
    subject_name: a.subject_name ?? "",
    condition: a.condition,
    notes: a.notes ?? "",
  }));
}

export const isBlankAllergy = (a: AllergyRow): boolean =>
  !a.subject_name.trim() && !a.condition.trim() && !a.notes.trim();

export function allergyPayload(rows: AllergyRow[]) {
  return rows
    .filter((a) => !isBlankAllergy(a))
    .map((a) => ({
      subject_name: a.subject_name.trim() || null,
      condition: a.condition.trim(),
      notes: a.notes.trim() || null,
    }));
}

export function validateAllergies(rows: AllergyRow[]): Errors {
  const errors: Errors = {};
  rows.forEach((a, index) => {
    if (!isBlankAllergy(a) && !a.condition.trim()) {
      errors[`allergies.${index}.condition`] = ["Indicare la condizione"];
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Cliente nuovo
// ---------------------------------------------------------------------------

export function validateNewClient(c: NewClientDraft): Errors {
  const errors: Errors = {};
  if (!c.full_name.trim()) errors["new_client.full_name"] = ["Inserisci il nome del cliente"];
  if (c.phone.trim().length < 6) errors["new_client.phone"] = ["Telefono obbligatorio (minimo 6 caratteri)"];
  return errors;
}

/** Nome completo di un cliente della rubrica ("Mario Rossi"). */
export function suggestionFullName(c: Pick<ClientSuggestion, "first_name" | "last_name">): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

/** Campi del cliente nuovo dopo la scelta di un suggerimento: email solo se il cliente ne ha una. */
export function draftFromSuggestion(c: ClientSuggestion, current: NewClientDraft): NewClientDraft {
  return {
    full_name: suggestionFullName(c),
    phone: c.phone,
    email: c.email ?? current.email,
  };
}

export function newClientPayload(c: NewClientDraft) {
  return {
    full_name: c.full_name.trim(),
    phone: c.phone.trim(),
    email: c.email.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Errori del server
// ---------------------------------------------------------------------------

/**
 * Gli errori di allergie arrivano con l'indice della lista filtrata (senza righe vuote):
 * riporto l'indice della riga reale nel form.
 */
export function mapServerErrors(fieldErrors: Errors | undefined, rows: AllergyRow[]): Errors {
  const activeIndexes = rows.flatMap((a, i) => (isBlankAllergy(a) ? [] : [i]));
  const out: Errors = {};
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const match = /^allergies\.(\d+)\.(.+)$/.exec(key);
    if (match) {
      const original = activeIndexes[Number(match[1])] ?? Number(match[1]);
      out[`allergies.${original}.${match[2]}`] = messages;
    } else {
      out[key] = messages;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Avvisi di sala (non bloccanti)
// ---------------------------------------------------------------------------

export function roomWarnings(input: {
  roomId: string | null;
  eventDate: string;
  covers: number;
  rooms: Room[];
  occupancy: RoomBookingSlot[];
  bookingId?: string;
}): string[] {
  const room = input.rooms.find((r) => r.id === input.roomId);
  if (!room || !input.eventDate) return [];
  const warnings: string[] = [];

  const clashes = input.occupancy.filter(
    (b) => b.room_id === room.id && b.event_date === input.eventDate && b.id !== input.bookingId,
  );
  if (clashes.length > 0) {
    const names = clashes.map((b) => b.event_name?.trim() || b.client_name).join(", ");
    warnings.push(`${room.name} è già assegnata in questa data a: ${names}. Ogni sala è riservata a un singolo evento.`);
  }

  if (input.covers > room.capacity) {
    warnings.push(`${input.covers} coperti superano la capienza di ${room.name} (${room.capacity}).`);
  }
  return warnings;
}

/** Messaggio di avviso da query string (es. preventivo non creato), letto dalla pagina di dettaglio. */
export function encodeWarnings(warnings: string[]): string {
  return encodeURIComponent(JSON.stringify(warnings));
}

export function decodeWarnings(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
