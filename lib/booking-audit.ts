// Audit delle prenotazioni (puro, usabile ovunque). Replica i trigger SQL legacy:
// - bookings: una riga per campo cambiato (esclusi updated_*), field = nome colonna SQL;
// - allergie: una sola riga riassuntiva field "allergie";
// - piatti: una sola riga riassuntiva field "piatti";
// - creazione / eliminazione: una riga ciascuna.
import { COURSE_ORDER, type Course, type Booking } from "@/lib/types";

export interface AuditEntry {
  field: string;
  old: string | null;
  new: string | null;
}

export const BOOKING_AUDIT_FIELDS = [
  "kind",
  "event_type",
  "client_id",
  "event_name",
  "event_date",
  "event_time",
  "room_id",
  "adults",
  "children",
  "kids_menus",
  "menu_id",
  "kids_menu_id",
  "setup_colors",
  "setup_notes",
  "status",
  "notes",
] as const;

const courseRank = (c: Course): number => {
  const i = COURSE_ORDER.indexOf(c);
  return i === -1 ? COURSE_ORDER.length : i;
};

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Subject: condizione; ..." come allergies_summary() in SQL (soggetto null prima). */
export function allergiesSummary(rows: { subject_name: string | null; condition: string }[]): string {
  return [...rows]
    .sort((a, b) => {
      const sa = a.subject_name ?? null;
      const sb = b.subject_name ?? null;
      if (sa === null && sb !== null) return -1;
      if (sa !== null && sb === null) return 1;
      const bySubject = (sa ?? "").localeCompare(sb ?? "");
      return bySubject || a.condition.localeCompare(b.condition);
    })
    .map((r) => (r.subject_name ? `${r.subject_name}: ${r.condition}` : r.condition))
    .join("; ");
}

/** "Corso: piatto; ..." come dishes_summary() in SQL. */
export function dishesSummary(rows: { course: Course; name: string; sort: number }[]): string {
  return [...rows]
    .sort(
      (a, b) =>
        courseRank(a.course) - courseRank(b.course) || a.sort - b.sort || a.name.localeCompare(b.name),
    )
    .map((d) => `${capitalize(d.course)}: ${d.name}`)
    .join("; ");
}

/** Valori testuali dei campi auditati di una prenotazione (come to_jsonb()->>campo in SQL). */
export function bookingAuditValues(b: Pick<Booking, (typeof BOOKING_AUDIT_FIELDS)[number]>): Record<string, string | null> {
  return {
    kind: b.kind || null,
    event_type: b.event_type || null,
    client_id: b.client_id || null,
    event_name: b.event_name || null,
    event_date: b.event_date || null,
    event_time: b.event_time ? b.event_time.slice(0, 5) : null,
    room_id: b.room_id || null,
    adults: String(b.adults),
    children: String(b.children),
    kids_menus: String(b.kids_menus),
    menu_id: b.menu_id || null,
    kids_menu_id: b.kids_menu_id || null,
    setup_colors: JSON.stringify(b.setup_colors ?? []),
    setup_notes: b.setup_notes || null,
    status: b.status,
    notes: b.notes || null,
  };
}

/** Un evento per ogni campo che cambia (null/"" equivalenti). */
export function diffBookingFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const field of BOOKING_AUDIT_FIELDS) {
    const o = before[field] ?? null;
    const n = after[field] ?? null;
    if (o !== n) out.push({ field, old: o, new: n });
  }
  return out;
}

/** Stringa vuota → null, come nullif(..., '') nel SQL. */
export const nullIfEmpty = (s: string): string | null => (s === "" ? null : s);
