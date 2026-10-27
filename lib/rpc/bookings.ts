import "server-only";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { generateRecordId, dayStartPb, nn, num, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";
import { countWhere, fetchOne, listAll } from "@/lib/pocketbase/queries";
import { mapBooking } from "@/lib/pocketbase/mappers";
import { eventStatusFor, statusAfterPayments } from "@/lib/booking-status";
import {
  allergiesSummary,
  bookingAuditValues,
  diffBookingFields,
  dishesSummary,
  nullIfEmpty,
  type AuditEntry,
} from "@/lib/booking-audit";
import type { BookingStatus, Course } from "@/lib/types";
import type { BookingInputType } from "@/lib/validation";

// Sostituisce le RPC SQL legacy (upsert_booking, save_booking_dishes, reset_booking_dishes,
// update_booking_covers) e i trigger di audit. Ogni scrittura multi-record va in una batch
// PocketBase (transazionale): record + righe booking_changes insieme.
// I controlli di ruolo sono fatti dal chiamante (app/actions) prima di entrare qui.

export interface Actor {
  id: string;
  full_name: string;
}

export interface DishLike {
  course: Course;
  name: string;
  sort: number;
  description?: string | null;
}

type Batch = ReturnType<PocketBase["createBatch"]>;

/** Riga di booking_changes nella batch. Senza bookingId (eliminazione) la riga resta come storico. */
function queueAudit(
  batch: Batch,
  actor: Actor,
  e: { bookingId?: string | null; label?: string | null; table?: string; field: string; old: string | null; new: string | null },
): void {
  const body: Record<string, unknown> = {
    booking_label: e.label ?? "",
    changed_by: actor.id,
    changed_by_name: actor.full_name || "sistema",
    table_name: e.table ?? "bookings",
    field: e.field,
    old_value: e.old ?? "",
    new_value: e.new ?? "",
  };
  if (e.bookingId) body.booking = e.bookingId;
  batch.collection("booking_changes").create(body);
}

function queueAuditEntries(batch: Batch, actor: Actor, bookingId: string, entries: AuditEntry[]): void {
  for (const e of entries) queueAudit(batch, actor, { bookingId, field: e.field, old: e.old, new: e.new });
}

async function loadBooking(db: PocketBase, id: string): Promise<PbRecord> {
  const record = await fetchOne(db, "bookings", id);
  if (!record) throw new UserFacingError("Prenotazione non trovata");
  return record;
}

async function assertMenuKind(db: PocketBase, menuId: string | null, kids: boolean, message: string): Promise<void> {
  if (!menuId) return;
  const menu = await fetchOne(db, "menus", menuId);
  if (!menu || Boolean(menu.is_kids) !== kids) throw new UserFacingError(message);
}

/** Piatti del menù come copia per la prenotazione (menu_dishes_json in SQL). */
export async function menuDishes(db: PocketBase, menuId: string): Promise<DishLike[]> {
  const items = await listAll(db, "menu_items", db.filter("menu = {:id}", { id: menuId }), { sort: "sort" });
  return items.map((r) => ({
    course: r.course as Course,
    name: String(r.name ?? ""),
    sort: num(r.sort),
    description: nn(r.description),
  }));
}

/** Righe dei piatti di una prenotazione. */
async function bookingDishRows(db: PocketBase, bookingId: string): Promise<PbRecord[]> {
  return listAll(db, "booking_dishes", db.filter("booking = {:id}", { id: bookingId }));
}

async function bookingAllergyRows(db: PocketBase, bookingId: string): Promise<PbRecord[]> {
  return listAll(db, "booking_allergies", db.filter("booking = {:id}", { id: bookingId }));
}

/**
 * Sostituisce i piatti: cancella quelli vecchi, crea i nuovi e registra una sola riga "piatti" se il riepilogo cambia.
 */
function queueDishes(batch: Batch, actor: Actor, bookingId: string, oldRows: PbRecord[], dishes: DishLike[]): void {
  const oldSummary = dishesSummary(
    oldRows.map((r) => ({ course: r.course as Course, name: String(r.name ?? ""), sort: num(r.sort) })),
  );
  const newSummary = dishesSummary(dishes);
  for (const r of oldRows) batch.collection("booking_dishes").delete(r.id);
  for (const d of dishes) {
    batch.collection("booking_dishes").create({
      id: generateRecordId(),
      booking: bookingId,
      course: d.course,
      name: d.name,
      sort: d.sort,
      description: d.description ?? "",
    });
  }
  if (oldSummary !== newSummary) {
    queueAudit(batch, actor, {
      bookingId,
      table: "booking_dishes",
      field: "piatti",
      old: nullIfEmpty(oldSummary),
      new: nullIfEmpty(newSummary),
    });
  }
}

/** Cliente della prenotazione: quello di rubrica, oppure quello con lo stesso telefono, oppure uno nuovo (nella batch). */
async function planClient(db: PocketBase, input: BookingInputType, batch: Batch): Promise<string> {
  if (input.client_id) {
    const existing = await fetchOne(db, "clients", input.client_id);
    if (!existing) throw new UserFacingError("Cliente non trovato");
    return input.client_id;
  }
  const wanted = input.new_client;
  if (!wanted) throw new UserFacingError("Indica il cliente");
  const phoneDigits = normalizePhone(wanted.phone);
  const clients = await listAll(db, "clients", "", { fields: "id,phone" });
  const match = clients.find((c) => normalizePhone(String(c.phone ?? "")) === phoneDigits);
  if (match) return match.id;

  const clientId = generateRecordId();
  batch.collection("clients").create({
    id: clientId,
    first_name: wanted.first_name,
    last_name: wanted.last_name,
    phone: wanted.phone,
    email: wanted.email ?? "",
    tax_code: "",
    vat_number: "",
    notes: "",
  });
  return clientId;
}

/** Solo cifre: confronto dei telefoni indipendente da spazi, +39, trattini. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Numero di acconti di una prenotazione. */
export async function countPayments(db: PocketBase, bookingId: string): Promise<number> {
  return countWhere(db, "payments", db.filter("booking = {:id}", { id: bookingId }));
}

function bookingRecordFields(
  input: BookingInputType,
  actor: Actor,
  clientId: string,
  menuId: string | null,
  kidsMenuId: string | null,
  status: BookingStatus,
) {
  return {
    client: clientId,
    kind: input.kind,
    event_type: input.event_type ?? "",
    event_name: input.event_name ?? "",
    event_date: dayStartPb(input.event_date),
    event_time: input.event_time ?? "",
    room: input.room_id ?? "",
    adults: input.adults,
    children: input.children,
    kids_menus: input.kids_menus,
    menu: menuId ?? "",
    kids_menu: kidsMenuId ?? "",
    setup_colors: input.setup_colors,
    setup_notes: input.setup_notes ?? "",
    status,
    notes: input.notes ?? "",
    updated_by: actor.id,
  };
}

/** Crea (id null) o modifica una prenotazione con allergie, piatti e audit in un'unica batch. Ritorna l'id. */
export async function upsertBooking(
  db: PocketBase,
  input: BookingInputType,
  id: string | null,
  actor: Actor,
): Promise<string> {
  // Menù solo per gli eventi: per normali e appuntamenti vengono scartati.
  const isEvent = input.kind === "evento";
  const menuId = isEvent ? input.menu_id ?? null : null;
  const kidsMenuId = isEvent ? input.kids_menu_id ?? null : null;
  await assertMenuKind(db, menuId, false, "Il menù selezionato non è un menù adulti");
  await assertMenuKind(db, kidsMenuId, true, "Il menù bambini selezionato non è un menù bambini");

  const bookingId = id ?? generateRecordId();
  let before: PbRecord | null = null;
  let oldDishes: PbRecord[] = [];
  let oldAllergies: PbRecord[] = [];
  if (id) {
    before = await loadBooking(db, id);
    [oldDishes, oldAllergies] = await Promise.all([bookingDishRows(db, id), bookingAllergyRows(db, id)]);
  }

  // Stato: per gli eventi viene ricalcolato dagli acconti; le normali sono sempre confermate (vedi validazione).
  const paidCount = id ? await countPayments(db, id) : 0;
  if (isEvent && input.status === "saldato" && paidCount === 0) {
    throw new UserFacingError("Per segnare l'evento come saldato serve almeno un acconto.");
  }
  const status: BookingStatus = isEvent
    ? eventStatusFor({
        requested: input.status,
        previous: before ? (String(before.status) as BookingStatus) : null,
        paidCount,
      })
    : input.status;

  const batch = db.createBatch();
  // Cliente nuovo: il record cliente viene messo nella stessa batch, prima della prenotazione.
  const clientId = await planClient(db, input, batch);
  const fields = bookingRecordFields(input, actor, clientId, menuId, kidsMenuId, status);

  if (!id) {
    batch.collection("bookings").create({ id: bookingId, ...fields, created_by: actor.id });
    queueAudit(batch, actor, {
      bookingId,
      field: "creazione",
      old: null,
      new: `Prenotazione del ${input.event_date}`,
    });
  } else {
    batch.collection("bookings").update(bookingId, fields);
    const before_ = bookingAuditValues(mapBooking(before as PbRecord));
    const after_ = bookingAuditValues({
      client_id: clientId,
      kind: input.kind,
      event_type: input.event_type ?? null,
      event_name: input.event_name ?? null,
      event_date: input.event_date,
      event_time: input.event_time ?? null,
      room_id: input.room_id ?? null,
      adults: input.adults,
      children: input.children,
      kids_menus: input.kids_menus,
      menu_id: menuId,
      kids_menu_id: kidsMenuId,
      setup_colors: input.setup_colors,
      setup_notes: input.setup_notes ?? null,
      status,
      notes: input.notes ?? null,
    });
    queueAuditEntries(batch, actor, bookingId, diffBookingFields(before_, after_));
  }

  // Allergie: sostituzione completa, una sola riga riassuntiva.
  const oldAllSummary = allergiesSummary(
    oldAllergies.map((r) => ({ subject_name: nn(r.subject_name), condition: String(r.condition ?? "") })),
  );
  const newAllSummary = allergiesSummary(
    input.allergies.map((a) => ({ subject_name: a.subject_name ?? null, condition: a.condition })),
  );
  for (const r of oldAllergies) batch.collection("booking_allergies").delete(r.id);
  for (const a of input.allergies) {
    batch.collection("booking_allergies").create({
      id: generateRecordId(),
      booking: bookingId,
      subject_name: a.subject_name ?? "",
      condition: a.condition,
      notes: a.notes ?? "",
    });
  }
  if (oldAllSummary !== newAllSummary) {
    queueAudit(batch, actor, {
      bookingId,
      table: "booking_allergies",
      field: "allergie",
      old: nullIfEmpty(oldAllSummary),
      new: nullIfEmpty(newAllSummary),
    });
  }

  // Piatti: se forniti li sostituisce; altrimenti li copia dal menù alla creazione o quando il menù cambia.
  let dishes: DishLike[] | null = null;
  if (isEvent && input.dishes) {
    dishes = input.dishes;
  } else if (isEvent && menuId && (!id || menuId !== nn(before?.menu))) {
    dishes = await menuDishes(db, menuId);
  }
  if (dishes) queueDishes(batch, actor, bookingId, oldDishes, dishes);

  await batch.send();
  return bookingId;
}

/**
 * Riallinea lo stato di un evento agli acconti (dopo addPayment / deletePayment): senza acconti torna "opzione"
 * se era confermato o saldato; con acconti "opzione" diventa "confermato". Annullati e saldati con acconti restano.
 * Il cambio di stato viene registrato nel registro modifiche. Nessun effetto sulle prenotazioni normali.
 */
export async function syncEventStatusFromPayments(db: PocketBase, bookingId: string, actor: Actor): Promise<void> {
  const booking = await loadBooking(db, bookingId);
  if (String(booking.kind || "evento") !== "evento") return;
  const current = String(booking.status) as BookingStatus;
  const next = statusAfterPayments(current, await countPayments(db, bookingId));
  if (next === current) return;

  const batch = db.createBatch();
  batch.collection("bookings").update(bookingId, { status: next, updated_by: actor.id });
  queueAudit(batch, actor, { bookingId, field: "status", old: current, new: next });
  await batch.send();
}

/**
 * Assegna (o libera, con roomId null) la sala di una prenotazione normale, con audit (campo "Sala", nomi delle sale).
 * I controlli di ruolo e di tipo sono fatti dal chiamante (app/actions/bookings.ts).
 */
export async function assignBookingRoom(
  db: PocketBase,
  bookingId: string,
  roomId: string | null,
  actor: Actor,
): Promise<void> {
  const booking = await loadBooking(db, bookingId);
  const currentRoomId = nn(booking.room);
  if (currentRoomId === roomId) return;

  const roomName = async (id: string | null): Promise<string | null> => {
    if (!id) return null;
    const room = await fetchOne(db, "rooms", id);
    return room ? String(room.name ?? "") : null;
  };
  const [oldName, newName] = await Promise.all([roomName(currentRoomId), roomName(roomId)]);

  const batch = db.createBatch();
  batch.collection("bookings").update(bookingId, { room: roomId ?? "", updated_by: actor.id });
  queueAudit(batch, actor, { bookingId, field: "Sala", old: oldName, new: newName });
  await batch.send();
}

/** Imposta lo stato di una prenotazione (solo se cambia), con audit. Le regole per tipo sono in app/actions. */
export async function setBookingStatusRecord(
  db: PocketBase,
  bookingId: string,
  next: BookingStatus,
  actor: Actor,
): Promise<void> {
  const booking = await loadBooking(db, bookingId);
  const current = String(booking.status) as BookingStatus;
  if (current === next) return;
  const batch = db.createBatch();
  batch.collection("bookings").update(bookingId, { status: next, updated_by: actor.id });
  queueAudit(batch, actor, { bookingId, field: "status", old: current, new: next });
  await batch.send();
}

/** Coperti (admin o sala): aggiorna adulti/bambini/menù bambini con audit. */
export async function updateBookingCovers(
  db: PocketBase,
  id: string,
  covers: { adults: number; children: number; kids_menus: number },
  actor: Actor,
): Promise<void> {
  const before = mapBooking(await loadBooking(db, id));
  const diffs = diffBookingFields(
    bookingAuditValues(before),
    bookingAuditValues({ ...before, adults: covers.adults, children: covers.children, kids_menus: covers.kids_menus }),
  );
  const batch = db.createBatch();
  batch.collection("bookings").update(id, {
    adults: covers.adults,
    children: covers.children,
    kids_menus: covers.kids_menus,
    updated_by: actor.id,
  });
  queueAuditEntries(batch, actor, id, diffs);
  await batch.send();
}

/** Sostituisce i piatti della prenotazione (admin o chef) con audit. */
export async function saveBookingDishes(db: PocketBase, id: string, dishes: DishLike[], actor: Actor): Promise<void> {
  await loadBooking(db, id);
  const oldRows = await bookingDishRows(db, id);
  const batch = db.createBatch();
  queueDishes(batch, actor, id, oldRows, dishes);
  batch.collection("bookings").update(id, { updated_by: actor.id });
  await batch.send();
}

/** Ripristina i piatti dal menù principale della prenotazione. */
export async function resetBookingDishesFromMenu(db: PocketBase, id: string, actor: Actor): Promise<void> {
  const booking = await loadBooking(db, id);
  const menuId = nn(booking.menu);
  if (!menuId) throw new UserFacingError("Nessun menù associato alla prenotazione");
  await saveBookingDishes(db, id, await menuDishes(db, menuId), actor);
}

/**
 * Eliminazione definitiva della prenotazione, con preventivi e acconti collegati (e le loro ricevute) nella stessa batch.
 * Cascade PocketBase: piatti e allergie. La riga di audit resta senza booking, con booking_label.
 */
export async function deleteBookingRecord(db: PocketBase, id: string, actor: Actor): Promise<void> {
  const booking = await loadBooking(db, id);
  const byBooking = { filter: db.filter("booking = {:id}", { id }), fields: "id" };
  const [quotes, payments] = await Promise.all([
    db.collection("quotes").getFullList(byBooking),
    db.collection("payments").getFullList(byBooking),
  ]);
  const clientId = nn(booking.client);
  const client = clientId ? await fetchOne(db, "clients", clientId) : null;
  const clientName = client ? `${client.first_name} ${client.last_name}` : "cliente sconosciuto";
  const label = `Prenotazione del ${toDateOnly(booking.event_date)} — ${clientName}`;
  const linked = [
    quotes.length > 0 ? `${quotes.length} ${quotes.length === 1 ? "preventivo" : "preventivi"}` : null,
    payments.length > 0 ? `${payments.length} ${payments.length === 1 ? "acconto" : "acconti"}` : null,
  ].filter(Boolean);
  const auditNew = linked.length > 0 ? `eliminati anche ${linked.join(" e ")}` : null;

  const batch = db.createBatch();
  queueAudit(batch, actor, { label, field: "eliminazione", old: label, new: auditNew });
  for (const q of quotes) batch.collection("quotes").delete(q.id);
  for (const p of payments) batch.collection("payments").delete(p.id);
  batch.collection("bookings").delete(id);
  try {
    await batch.send();
  } catch (err) {
    // Backstop: quotes.booking e payments.booking sono required senza cascade, quindi PocketBase
    // rifiuta l'eliminazione se nel frattempo sono comparsi altri preventivi o acconti.
    if (err instanceof ClientResponseError && err.status === 400) throw restrictError();
    throw err;
  }
}

function restrictError(): UserFacingError {
  return new UserFacingError(
    "Impossibile eliminare la prenotazione: nel frattempo sono stati aggiunti preventivi o acconti. Ricarica la pagina e riprova.",
  );
}
