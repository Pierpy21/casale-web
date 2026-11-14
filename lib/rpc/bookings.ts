import "server-only";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { generateRecordId, dayStartPb, nn, num, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";
import { countWhere, fetchOne, listAll } from "@/lib/pocketbase/queries";
import { mapBooking } from "@/lib/pocketbase/mappers";
import { bookingPersonName } from "@/components/bookings/format";
import { eventStatusFor, statusAfterPayments } from "@/lib/booking-status";
import {
  allergiesSummary,
  bookingAuditValues,
  diffBookingFields,
  dishesSummary,
  nullIfEmpty,
  type AuditEntry,
} from "@/lib/booking-audit";
import type { BookingAllergyDraft, BookingStatus, Course } from "@/lib/types";
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

/** Menù composto per un nuovo evento: il menù (non per bambini, attivo, custom) e i suoi piatti, nella stessa batch. */
export interface CustomMenuDraft {
  name: string;
  price_per_person: number;
  dishes: DishLike[];
}

type Batch = ReturnType<PocketBase["createBatch"]>;

/** Riga di booking_changes nella batch. Senza bookingId (eliminazione) la riga resta come storico. */
export function queueAudit(
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

/** Controlla che il menù sia del tipo richiesto (adulti o bambini). Ritorna il record, o null se la prenotazione non ha menù. */
async function assertMenuKind(db: PocketBase, menuId: string | null, kids: boolean, message: string): Promise<PbRecord | null> {
  if (!menuId) return null;
  const menu = await fetchOne(db, "menus", menuId);
  if (!menu || Boolean(menu.is_kids) !== kids) throw new UserFacingError(message);
  return menu;
}

/** Il menù è composto per un solo evento (menus.custom). */
async function isCustomMenu(db: PocketBase, menuId: string | null): Promise<boolean> {
  if (!menuId) return false;
  const menu = await fetchOne(db, "menus", menuId);
  return Boolean(menu?.custom);
}

/**
 * Firma dei piatti per il confronto con il menù, raggruppata per portata.
 * Per ogni portata: i nomi (trim, spazi interni compressi, righe vuote escluse) nell'ordine di sort
 * (a parità, ordine alfabetico del nome), uniti con \u0000 in una chiave "portata|nome1\u0000nome2…".
 * L'ordine globale di sort non conta: menù e prenotazione salvano i sort in modo diverso.
 * Le chiavi delle portate sono ordinate, così il risultato non dipende dall'ordine di arrivo.
 * Funzione pura. La stessa logica è nella migrazione 1793000026 (backfill) e 1793000027 (ricalcolo), da tenere allineata.
 */
export function dishSignature(dishes: { course: string; name: string; sort: number }[]): string[] {
  const byCourse = new Map<string, { sort: number; name: string }[]>();
  for (const d of dishes) {
    const name = String(d.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const list = byCourse.get(d.course) ?? [];
    list.push({ sort: Number(d.sort) || 0, name });
    byCourse.set(d.course, list);
  }
  return [...byCourse.entries()]
    .map(([course, list]) => {
      const names = list
        .sort((a, b) => a.sort - b.sort || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((x) => x.name);
      return `${course}|${names.join("\u0000")}`;
    })
    .sort();
}

/** True se i due elenchi di piatti non coincidono (portata, nome e ordine dei piatti in ogni portata). Funzione pura. */
export function dishesDiffer(
  a: { course: string; name: string; sort: number }[],
  b: { course: string; name: string; sort: number }[],
): boolean {
  const sa = dishSignature(a);
  const sb = dishSignature(b);
  return sa.length !== sb.length || sa.some((key, i) => key !== sb[i]);
}

/**
 * Valore di dishes_customized per dei piatti appena scritti: false senza menù o con menù composto;
 * altrimenti true solo se i piatti differiscono dalle voci del menù.
 */
async function dishesCustomizedFor(db: PocketBase, menuId: string | null, dishes: DishLike[]): Promise<boolean> {
  if (!menuId) return false;
  const menu = await fetchOne(db, "menus", menuId);
  if (!menu || Boolean(menu.custom)) return false;
  return dishesDiffer(dishes, await menuDishes(db, menuId));
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

/**
 * Menù composto nuovo: record del menù (custom, attivo, non per bambini, senza prezzo di catalogo) e le sue voci.
 * Le voci non sono collegate al catalogo piatti (dish vuoto): il menù dell'evento è uno snapshot, e una modifica
 * del catalogo non deve cambiarne il contenuto.
 */
function queueCustomMenu(batch: Batch, menuId: string, draft: CustomMenuDraft): void {
  batch.collection("menus").create({
    id: menuId,
    name: draft.name,
    season: "",
    price_per_person: draft.price_per_person,
    is_kids: false,
    active: true,
    custom: true,
    sort: 0,
  });
  for (const d of draft.dishes) {
    batch.collection("menu_items").create({
      id: generateRecordId(),
      menu: menuId,
      course: d.course,
      name: d.name,
      sort: d.sort,
      description: d.description ?? "",
      dish: "",
    });
  }
}

/**
 * Elimina il menù composto della prenotazione quando non lo usa più nessun'altra prenotazione (cambio di menù o
 * eliminazione dell'evento). Menù del catalogo: nessuna scrittura. Va chiamata prima dell'invio della batch.
 */
async function queueCustomMenuRemoval(db: PocketBase, batch: Batch, menuId: string | null, bookingId: string): Promise<void> {
  if (!menuId || !(await isCustomMenu(db, menuId))) return;
  const others = await countWhere(db, "bookings", db.filter("menu = {:m} && id != {:b}", { m: menuId, b: bookingId }));
  if (others > 0) return;
  const items = await listAll(db, "menu_items", db.filter("menu = {:m}", { m: menuId }), { fields: "id" });
  for (const item of items) batch.collection("menu_items").delete(item.id);
  batch.collection("menus").delete(menuId);
}

/**
 * Cliente di rubrica di un evento o appuntamento: quello scelto, oppure quello con lo stesso telefono, oppure uno nuovo (nella batch).
 * Non si chiama per le prenotazioni normali (vedi upsertBooking). Il telefono del cliente nuovo è obbligatorio (validazione).
 */
async function planClient(db: PocketBase, input: BookingInputType, batch: Batch): Promise<string> {
  if (input.client_id) {
    const existing = await fetchOne(db, "clients", input.client_id);
    if (!existing) throw new UserFacingError("Cliente non trovato");
    return input.client_id;
  }
  const wanted = input.new_client;
  if (!wanted) throw new UserFacingError("Indica il cliente");
  // Il cellulare identifica il cliente: il riuso avviene per telefono (solo cifre, indipendente da spazi e +39).
  const phoneDigits = normalizePhone(wanted.phone);
  if (phoneDigits) {
    const clients = await listAll(db, "clients", "", { fields: "id,phone" });
    const match = clients.find((c) => {
      const digits = normalizePhone(String(c.phone ?? ""));
      return digits !== "" && digits === phoneDigits;
    });
    if (match) return match.id;
  }

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

/**
 * Campi della prenotazione. Normali: cliente vuoto, ospite (nome e cellulare) sulla prenotazione.
 * Evento e appuntamento: cliente di rubrica, ospite vuoto. Il cambio di tipo in modifica azzera ciò che non serve.
 * Pasto (evento e normale) e orario (appuntamento) si escludono: l'altro campo resta vuoto.
 */
function bookingRecordFields(
  input: BookingInputType,
  actor: Actor,
  clientId: string | null,
  menuId: string | null,
  kidsMenuId: string | null,
  status: BookingStatus,
) {
  const normal = input.kind === "normale";
  const appointment = input.kind === "appuntamento";
  return {
    client: normal ? "" : (clientId ?? ""),
    guest_name: normal ? (input.guest_name ?? "") : "",
    guest_phone: normal ? (input.guest_phone ?? "") : "",
    kind: input.kind,
    event_type: input.event_type ?? "",
    event_date: dayStartPb(input.event_date),
    meal: appointment ? "" : (input.meal ?? ""),
    event_time: appointment ? (input.event_time ?? "") : "",
    room: input.room_id ?? "",
    // Tavolo: normali dal payload (assente = non si tocca); appuntamenti mai; eventi: li gestisce la Mappa sala
    // (tavolo principale + extra_tables), quindi il modulo non li tocca (vedi il cambio sala in saveBooking).
    ...(input.kind === "normale"
      ? input.table_number !== undefined
        ? { table_number: input.table_number ?? 0 }
        : {}
      : input.kind === "appuntamento"
        ? { table_number: 0, extra_tables: [] }
        : {}),
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

/**
 * Crea (id null) o modifica una prenotazione con allergie, piatti e audit in un'unica batch. Ritorna l'id.
 * `customMenu` (solo creazione di un evento): crea anche il menù composto e lo collega, nella stessa batch.
 * Piatti: il menù composto porta i suoi; altrimenti `input.dishes` se presenti; altrimenti la copia del menù
 * alla creazione o quando il menù cambia. `dishes_customized` si ricalcola dal contenuto (vedi dishesCustomizedFor).
 */
export async function upsertBooking(
  db: PocketBase,
  input: BookingInputType,
  id: string | null,
  actor: Actor,
  customMenu: CustomMenuDraft | null = null,
): Promise<string> {
  // Menù solo per gli eventi: per normali e appuntamenti vengono scartati.
  const isEvent = input.kind === "evento";
  if (customMenu && (id || !isEvent)) throw new UserFacingError("Il menù composto si crea solo con un nuovo evento.");
  // Id del menù composto nuovo: nasce qui, così la prenotazione può referenziarlo nella stessa batch.
  const newCustomMenuId = customMenu ? generateRecordId() : null;
  const menuId = newCustomMenuId ?? (isEvent ? input.menu_id ?? null : null);
  const kidsMenuId = isEvent ? input.kids_menu_id ?? null : null;

  const bookingId = id ?? generateRecordId();
  let before: PbRecord | null = null;
  let oldDishes: PbRecord[] = [];
  let oldAllergies: PbRecord[] = [];
  if (id) {
    before = await loadBooking(db, id);
    [oldDishes, oldAllergies] = await Promise.all([bookingDishRows(db, id), bookingAllergyRows(db, id)]);
  }
  const menu = newCustomMenuId ? null : await assertMenuKind(db, menuId, false, "Il menù selezionato non è un menù adulti");
  // Un menù composto appartiene a un solo evento: non si può scegliere quello di un'altra prenotazione.
  if (menu && Boolean(menu.custom) && menuId !== nn(before?.menu)) {
    throw new UserFacingError("Il menù selezionato è il menù composto di un altro evento.");
  }
  await assertMenuKind(db, kidsMenuId, true, "Il menù bambini selezionato non è un menù bambini");

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
  // Prenotazione normale: nessun cliente di rubrica (l'ospite sta sulla prenotazione).
  const clientId = input.kind === "normale" ? null : await planClient(db, input, batch);
  // Menù composto: prima della prenotazione che lo referenzia (la batch esegue in ordine).
  if (customMenu && newCustomMenuId) queueCustomMenu(batch, newCustomMenuId, customMenu);

  // Piatti da scrivere (null = non cambiano) e il loro flag "modificato" (null = il flag non cambia).
  let dishes: DishLike[] | null = null;
  let dishesCustomized: boolean | null = null;
  if (customMenu) {
    dishes = customMenu.dishes;
    dishesCustomized = false;
  } else if (isEvent && input.dishes) {
    dishes = input.dishes;
    dishesCustomized = await dishesCustomizedFor(db, menuId, input.dishes);
  } else if (isEvent && menuId && (!id || menuId !== nn(before?.menu))) {
    // Copia del menù: i piatti tornano uguali al menù.
    dishes = await menuDishes(db, menuId);
    dishesCustomized = false;
  }

  const fields = {
    ...bookingRecordFields(input, actor, clientId, menuId, kidsMenuId, status),
    ...(dishesCustomized === null ? {} : { dishes_customized: dishesCustomized }),
  };
  // Evento spostato in un'altra sala (o diventato evento): i numeri dei tavoli non valgono più, si tolgono.
  if (input.kind === "evento" && (!before || String(before.room ?? "") !== String(fields.room ?? "") || String(before.kind) !== "evento")) {
    Object.assign(fields, { table_number: 0, extra_tables: [] });
  }

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
      guest_name: input.kind === "normale" ? (input.guest_name ?? null) : null,
      guest_phone: input.kind === "normale" ? (input.guest_phone ?? null) : null,
      kind: input.kind,
      event_type: input.event_type ?? null,
      event_date: input.event_date,
      meal: input.meal ?? null,
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
    // Tavolo: stessa riga di registro di assignBookingTable, solo se il payload lo cambia.
    if ("table_number" in fields) {
      const oldTable = mapBooking(before as PbRecord).table_number;
      const newTable = (fields.table_number ?? 0) > 0 ? (fields.table_number ?? null) : null;
      if (oldTable !== newTable) {
        queueAudit(batch, actor, {
          bookingId,
          field: "Tavolo",
          old: oldTable === null ? null : String(oldTable),
          new: newTable === null ? null : String(newTable),
        });
      }
    }
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

  if (dishes) queueDishes(batch, actor, bookingId, oldDishes, dishes);
  // Menù cambiato: il menù composto precedente si elimina se nessun'altra prenotazione lo usa.
  if (before && nn(before.menu) !== menuId) await queueCustomMenuRemoval(db, batch, nn(before.menu), bookingId);

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

/**
 * Assegna (o libera, con table null) il tavolo di una prenotazione normale, con audit (campo "Tavolo").
 * 0 nel record = nessun tavolo. I controlli di ruolo e di tipo sono fatti dal chiamante (app/actions/bookings.ts).
 */
export async function assignBookingTable(
  db: PocketBase,
  bookingId: string,
  table: number | null,
  actor: Actor,
): Promise<void> {
  const booking = await loadBooking(db, bookingId);
  const current = num(booking.table_number) > 0 ? num(booking.table_number) : null;
  if (current === table) return;
  const batch = db.createBatch();
  batch.collection("bookings").update(bookingId, { table_number: table ?? 0, updated_by: actor.id });
  queueAudit(batch, actor, {
    bookingId,
    field: "Tavolo",
    old: current === null ? null : String(current),
    new: table === null ? null : String(table),
  });
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

/**
 * Allergie della prenotazione in una sola batch: le righe con `id` esistente si aggiornano (solo se cambiano),
 * le altre si creano, quelle non più presenti si eliminano. Audit: una riga "allergie" se il riepilogo cambia.
 * Ritorna false se non c'è nulla da salvare (nessuna scrittura).
 */
export async function saveBookingAllergies(
  db: PocketBase,
  bookingId: string,
  drafts: BookingAllergyDraft[],
  actor: Actor,
): Promise<boolean> {
  await loadBooking(db, bookingId);
  const oldRows = await bookingAllergyRows(db, bookingId);
  const oldById = new Map(oldRows.map((r) => [r.id, r]));
  const kept = new Set<string>();
  const batch = db.createBatch();
  let writes = 0;

  for (const d of drafts) {
    const subject = d.subject_name ?? "";
    const notes = d.notes ?? "";
    const existing = d.id ? oldById.get(d.id) : undefined;
    if (existing && !kept.has(existing.id)) {
      kept.add(existing.id);
      const same =
        (nn(existing.subject_name) ?? "") === subject &&
        String(existing.condition ?? "") === d.condition &&
        (nn(existing.notes) ?? "") === notes;
      if (!same) {
        batch.collection("booking_allergies").update(existing.id, { subject_name: subject, condition: d.condition, notes });
        writes++;
      }
    } else {
      batch.collection("booking_allergies").create({
        id: generateRecordId(),
        booking: bookingId,
        subject_name: subject,
        condition: d.condition,
        notes,
      });
      writes++;
    }
  }
  for (const r of oldRows) {
    if (kept.has(r.id)) continue;
    batch.collection("booking_allergies").delete(r.id);
    writes++;
  }
  if (writes === 0) return false;

  const oldSummary = allergiesSummary(oldRows.map((r) => ({ subject_name: nn(r.subject_name), condition: String(r.condition ?? "") })));
  const newSummary = allergiesSummary(drafts.map((d) => ({ subject_name: d.subject_name ?? null, condition: d.condition })));
  if (oldSummary !== newSummary) {
    queueAudit(batch, actor, {
      bookingId,
      table: "booking_allergies",
      field: "allergie",
      old: nullIfEmpty(oldSummary),
      new: nullIfEmpty(newSummary),
    });
  }
  batch.collection("bookings").update(bookingId, { updated_by: actor.id });
  await batch.send();
  return true;
}

/**
 * Sostituisce i piatti della prenotazione con audit. `dishes_customized` si ricalcola dal contenuto: true solo se i
 * piatti differiscono dalle voci del menù; sempre false senza menù o con menù composto.
 */
export async function saveBookingDishes(db: PocketBase, id: string, dishes: DishLike[], actor: Actor): Promise<void> {
  const booking = await loadBooking(db, id);
  const oldRows = await bookingDishRows(db, id);
  const customized = await dishesCustomizedFor(db, nn(booking.menu), dishes);
  const batch = db.createBatch();
  queueDishes(batch, actor, id, oldRows, dishes);
  batch.collection("bookings").update(id, { updated_by: actor.id, dishes_customized: customized });
  await batch.send();
}

/** Ripristina i piatti dal menù principale della prenotazione (uguali al menù: il flag torna falso). */
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
  // Nome di chi era prenotato: l'ospite (prenotazioni normali) oppure il cliente di rubrica.
  const personName =
    bookingPersonName({
      kind: String(booking.kind || "evento"),
      guest_name: nn(booking.guest_name),
      client: client ? { first_name: String(client.first_name ?? ""), last_name: nn(client.last_name) } : null,
    }) || "cliente sconosciuto";
  const label = `Prenotazione del ${toDateOnly(booking.event_date)} — ${personName}`;
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
  // Menù composto dell'evento: va via con l'evento (se nessun'altra prenotazione lo usa).
  await queueCustomMenuRemoval(db, batch, nn(booking.menu), id);
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
