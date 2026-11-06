import "server-only";
import type PocketBase from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { dayEndPb, dayStartPb, generateRecordId, nn, num, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll } from "@/lib/pocketbase/queries";
import { extraTableNumbersOf, mealOf, occupiedTableNumbersOf } from "@/lib/pocketbase/mappers";
import type { BookingMeal } from "@/lib/types";
import { MAX_EVENT_TABLES, type LayoutAssignmentsInputType, type LayoutScopeInputType, type RoomLayoutInputType, type RoomTableDraftInputType } from "@/lib/validation";
import { queueAudit, type Actor } from "./bookings";

// Scritture della mappa sala (lib/data/floor.ts per le letture). I controlli di ruolo e di input sono in app/actions/floor.ts.
// Disposizione: lo "scope" è la disposizione standard della sala (layout_date vuoto) oppure quella speciale di un giorno e pasto.
// Ogni lettura e modifica di tavoli è limitata allo scope; i tavoli della disposizione effettiva di un giorno sono quelli
// speciali di quel giorno/pasto se esistono, altrimenti quelli standard (vedi effectiveRoomTables).
// Tavoli di un evento: bookings.table_number = principale, bookings.extra_tables = gli altri (stessa sala).

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Due elenchi di numeri uguali (stesso ordine). */
function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Elenco di tavoli per l'audit: "3, 4, 5"; vuoto → null. */
function listText(numbers: readonly number[]): string | null {
  return numbers.length > 0 ? numbers.join(", ") : null;
}

/** Nome della sala per l'audit (null se assente). */
async function roomNameOf(db: PocketBase, id: string | null): Promise<string | null> {
  if (!id) return null;
  const row = await fetchOne(db, "rooms", id);
  return row ? String(row.name ?? "") : null;
}

/** Filtro dei tavoli di una sala nello scope: disposizione standard (layout_date vuoto) o di un giorno e pasto. */
function scopeFilter(db: PocketBase, roomId: string, scope: LayoutScopeInputType): string {
  const room = db.filter("room = {:r}", { r: roomId });
  const where = scope
    ? db.filter("layout_date = {:d} && layout_meal = {:m}", { d: scope.date, m: scope.meal })
    : "layout_date = ''";
  return `${room} && ${where}`;
}

/** Etichetta leggibile di una prenotazione: ospite per le normali, tipo evento e cognome del cliente per gli eventi (`client` espanso). */
function bookingLabel(r: PbRecord): string {
  if (nn(r.kind) === "normale") return nn(r.guest_name)?.trim() || "un'altra prenotazione";
  const client = r.expand?.client as PbRecord | undefined;
  const name = nn(client?.last_name)?.trim() || nn(client?.first_name)?.trim() || "cliente";
  return `${nn(r.event_type) ?? "Evento"} ${name}`;
}

/** Motivo (in minuscolo) per cui una prenotazione non si può sistemare su un tavolo; null = si può. */
function notSeatableReason(booking: PbRecord): string | null {
  const kind = nn(booking.kind) ?? "evento";
  if (kind !== "normale" && kind !== "evento") return "gli appuntamenti non si sistemano sui tavoli.";
  if (String(booking.status) === "annullato") return "la prenotazione è annullata.";
  return null;
}

/** Motivo (in minuscolo) per cui la prenotazione non è del giorno/pasto della disposizione salvata; null = coerente. */
function scopeMismatchReason(booking: PbRecord, scope: LayoutScopeInputType): string | null {
  if (!scope) return null;
  if (toDateOnly(booking.event_date) !== scope.date) return "la prenotazione è di un altro giorno.";
  const bookingMeal = mealOf(booking);
  if (bookingMeal && bookingMeal !== scope.meal) return `la prenotazione è a ${bookingMeal}.`;
  return null;
}

/**
 * Tavoli attivi della sala nella disposizione effettiva di un giorno e pasto: quelli speciali del giorno/pasto se
 * esistono, altrimenti quelli standard. `meal` null = nessun pasto: vale solo la standard.
 */
export async function effectiveRoomTables(
  db: PocketBase,
  roomId: string,
  date: string,
  meal: BookingMeal | null,
): Promise<PbRecord[]> {
  const room = db.filter("room = {:r} && active = {:a}", { r: roomId, a: true });
  const where = meal
    ? db.filter("(layout_date = '' || (layout_date = {:d} && layout_meal = {:m}))", { d: date, m: meal })
    : "layout_date = ''";
  const rows = await listAll(db, "room_tables", `${room} && ${where}`, { fields: "id,number,layout_date" });
  const dayRows = rows.filter((r) => nn(r.layout_date) !== null);
  return dayRows.length > 0 ? dayRows : rows.filter((r) => nn(r.layout_date) === null);
}

/**
 * Salva la disposizione di una sala (solo nello scope indicato) in un'unica batch. Regole:
 * - tavolo con id: aggiornato (numero, posti, forma, posizione, rotazione, attivo); id di un altro scope = errore;
 * - tavolo senza id: riusa il record dello scope con lo stesso numero (anche disattivato), altrimenti ne crea uno;
 * - record dello scope non più nella disposizione: active = false (il record resta). Se il suo numero serve a un tavolo
 *   della disposizione, prima viene spostato su un numero libero (l'indice unico non lo permetterebbe altrimenti);
 * - tavoli il cui numero cambia: prima su un numero provvisorio, poi sul numero definitivo (così due tavoli possono scambiarsi i numeri).
 * Dopo il salvataggio dei tavoli applica le sistemazioni (seatBookingRecord); se una fallisce l'errore nomina la prenotazione.
 */
export async function saveRoomLayoutRecords(
  db: PocketBase,
  roomId: string,
  tables: RoomLayoutInputType,
  scope: LayoutScopeInputType,
  assignments: LayoutAssignmentsInputType,
  actor: Actor,
): Promise<void> {
  // Controlli sulle sistemazioni prima di scrivere, così gli errori evidenti non lasciano salvataggi parziali.
  const bookingIds = assignments.map((a) => a.bookingId);
  if (new Set(bookingIds).size !== bookingIds.length) {
    throw new UserFacingError("Una prenotazione compare più di una volta nelle sistemazioni.");
  }
  const prepared: { tableNumber: number; booking: PbRecord }[] = [];
  for (const a of assignments) {
    const booking = await fetchOne(db, "bookings", a.bookingId, "client");
    if (!booking) throw new UserFacingError(`Prenotazione non trovata (tavolo ${a.tableNumber}).`);
    const reason = notSeatableReason(booking) ?? scopeMismatchReason(booking, scope);
    if (reason) throw new UserFacingError(`Sistemazione di ${bookingLabel(booking)} non possibile: ${reason}`);
    prepared.push({ tableNumber: a.tableNumber, booking });
  }

  const existing = await listAll(db, "room_tables", scopeFilter(db, roomId, scope), { fields: "id,number,active" });
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byNumber = new Map(existing.map((r) => [num(r.number), r]));

  for (const draft of tables) {
    if (draft.id && !byId.has(draft.id)) throw new UserFacingError("Tavolo non trovato in questa disposizione. Ricarica la pagina e riprova.");
  }

  // Abbinamento tavolo della bozza → record esistente (null = nuovo record).
  const keptIds = new Set(tables.map((t) => t.id).filter((id): id is string => Boolean(id)));
  const targetIds = new Set<string>();
  const plan: { draft: RoomTableDraftInputType; row: PbRecord | null }[] = tables.map((draft) => {
    let row: PbRecord | null = null;
    if (draft.id) {
      row = byId.get(draft.id) ?? null;
    } else {
      const candidate = byNumber.get(draft.number);
      if (candidate && !keptIds.has(candidate.id) && !targetIds.has(candidate.id)) row = candidate;
    }
    if (row) targetIds.add(row.id);
    return { draft, row };
  });

  const finalNumbers = new Set(tables.map((t) => t.number));
  const nextFree = freeNumberSource(new Set([...byNumber.keys(), ...finalNumbers]));
  const scopeData = scope ? { layout_date: scope.date, layout_meal: scope.meal } : { layout_date: "", layout_meal: "" };
  const batch = db.createBatch();
  const col = () => batch.collection("room_tables");

  // 1. Record dello scope non più nella disposizione: disattivati (e spostati se il loro numero serve a un tavolo).
  for (const row of existing) {
    if (targetIds.has(row.id)) continue;
    const blocking = finalNumbers.has(num(row.number));
    if (!blocking && !Boolean(row.active)) continue;
    const data: Record<string, unknown> = { active: false };
    if (blocking) data.number = nextFree();
    col().update(row.id, data);
  }

  // 2. Tavoli esistenti il cui numero cambia: numero provvisorio libero.
  for (const { draft, row } of plan) {
    if (row && num(row.number) !== draft.number) col().update(row.id, { number: nextFree() });
  }

  // 3. Dati definitivi; i tavoli nuovi per ultimi, con lo scope della disposizione.
  for (const { draft, row } of plan) {
    const fields = {
      number: draft.number,
      seats: draft.seats,
      shape: draft.shape,
      x: draft.x,
      y: draft.y,
      rotation: draft.rotation,
      active: true,
    };
    if (row) col().update(row.id, fields);
    else col().create({ id: generateRecordId(), room: roomId, ...fields, ...scopeData });
  }

  await batch.send();

  // 4. Sistemazioni: dopo i tavoli, perché il tavolo deve esistere nella disposizione effettiva del giorno.
  for (const { tableNumber, booking } of prepared) {
    const bookingId = booking.id;
    try {
      await seatBookingRecord(db, bookingId, roomId, tableNumber, actor, scope?.meal ?? null);
    } catch (err) {
      if (err instanceof UserFacingError) {
        throw new UserFacingError(
          `Tavoli salvati, ma la sistemazione di ${bookingLabel(booking)} non è riuscita: ${err.message}`,
        );
      }
      throw err;
    }
  }
}

/** Generatore di numeri tavolo liberi (dal 9999 in giù), esclusi quelli in `used`. Serve a spostare un tavolo
 * su un numero provvisorio nello stesso salvataggio: l'indice unico (room, layout, number) non ammette due tavoli con lo stesso numero. */
function freeNumberSource(used: Set<number>): () => number {
  let next = 9999;
  return () => {
    while (next >= 1 && used.has(next)) next -= 1;
    if (next < 1) throw new UserFacingError("Non ci sono numeri liberi per riordinare i tavoli.");
    used.add(next);
    return next;
  };
}

/**
 * Elimina (non disattiva) i tavoli della disposizione speciale di un giorno e pasto di una sala. Poi, per prenotazioni ed
 * eventi di quel giorno/pasto nella sala, toglie i tavoli che non esistono più nella disposizione standard (principale e
 * extra). Se il principale sparisce, il primo extra rimasto diventa il principale. Audit: "Tavolo" se cambia il principale,
 * "Tavoli" se cambia l'elenco degli extra (come seatBookingRecord).
 */
export async function resetDayLayoutRecords(
  db: PocketBase,
  roomId: string,
  date: string,
  meal: BookingMeal,
  actor: Actor,
): Promise<void> {
  const dayRows = await listAll(
    db,
    "room_tables",
    db.filter("room = {:r} && layout_date = {:d} && layout_meal = {:m}", { r: roomId, d: date, m: meal }),
    { fields: "id" },
  );
  const standardNumbers = new Set((await effectiveRoomTables(db, roomId, date, null)).map((t) => num(t.number)));
  // Pasto vuoto sul record = vale per entrambi i pasti (come in getFloorPlan e nell'occupazione).
  const booked = await listAll(
    db,
    "bookings",
    db.filter(
      "room = {:r} && (meal = {:m} || meal = '') && status != {:s} && (kind = {:k1} || kind = {:k2}) && event_date >= {:from} && event_date <= {:to}",
      {
        r: roomId,
        m: meal,
        s: "annullato",
        k1: "normale",
        k2: "evento",
        from: dayStartPb(date),
        to: dayEndPb(date),
      },
    ),
    { fields: "id,kind,table_number,extra_tables" },
  );

  type Change = { booking: PbRecord; principal: number; extras: number[]; oldPrincipal: number; oldExtras: number[] };
  const changes: Change[] = [];
  for (const b of booked) {
    const oldPrincipal = num(b.table_number) > 0 ? num(b.table_number) : 0;
    const oldExtras = extraTableNumbersOf(b);
    const keptExtras = oldExtras.filter((n) => standardNumbers.has(n));
    const principalGone = oldPrincipal > 0 && !standardNumbers.has(oldPrincipal);
    const principal = principalGone ? (keptExtras[0] ?? 0) : oldPrincipal;
    const extras = principalGone ? keptExtras.slice(1) : keptExtras;
    if (principal === oldPrincipal && sameList(extras, oldExtras)) continue;
    changes.push({ booking: b, principal, extras, oldPrincipal, oldExtras });
  }
  if (dayRows.length === 0 && changes.length === 0) return;

  const batch = db.createBatch();
  for (const row of dayRows) batch.collection("room_tables").delete(row.id);
  for (const c of changes) {
    const id = c.booking.id;
    const data: Record<string, unknown> = { updated_by: actor.id };
    if (c.principal !== c.oldPrincipal) data.table_number = c.principal;
    if (!sameList(c.extras, c.oldExtras)) data.extra_tables = c.extras;
    batch.collection("bookings").update(id, data);
    if (c.principal !== c.oldPrincipal) {
      queueAudit(batch, actor, {
        bookingId: id,
        field: "Tavolo",
        old: c.oldPrincipal > 0 ? String(c.oldPrincipal) : null,
        new: c.principal > 0 ? String(c.principal) : null,
      });
    }
    if (!sameList(c.extras, c.oldExtras)) {
      queueAudit(batch, actor, {
        bookingId: id,
        field: "Tavoli",
        old: listText(occupiedTableNumbersOf(c.booking)),
        new: listText([...(c.principal > 0 ? [c.principal] : []), ...c.extras]),
      });
    }
  }
  await batch.send();
}

/**
 * Prenotazioni ed eventi non annullati della sala nel giorno, escluso `bookingId`. `meal` null = tutti i pasti; altrimenti
 * quelli del pasto indicato e quelli senza pasto (vale per entrambi).
 */
async function dayBookingsInRoom(
  db: PocketBase,
  bookingId: string,
  roomId: string,
  date: string,
  meal: BookingMeal | null,
): Promise<PbRecord[]> {
  const sameRoomDay = db.filter(
    "(kind = {:k1} || kind = {:k2}) && status != {:s} && room = {:r} && event_date >= {:from} && event_date <= {:to} && id != {:id}",
    {
      k1: "normale",
      k2: "evento",
      s: "annullato",
      r: roomId,
      from: dayStartPb(date),
      to: dayEndPb(date),
      id: bookingId,
    },
  );
  const mealClause = meal ? db.filter("(meal = {:m} || meal = '')", { m: meal }) : "";
  const filter = [sameRoomDay, mealClause].filter(Boolean).join(" && ");
  return listAll(db, "bookings", filter, { sort: "id", expand: "client" });
}

/**
 * Prenotazione (normale o evento) che occupa già il tavolo nello stesso giorno: stessa sala, tavolo principale oppure tra i
 * tavoli extra di un evento. La verifica degli extra è in codice (non con filtri JSON).
 * `meal` null (pasto non indicato) = confligge con qualunque pasto; altrimenti con il pasto indicato e con quelle senza pasto.
 * Esclude `bookingId` (la prenotazione che si sta sistemando). Null = tavolo libero.
 */
export async function tableOccupant(
  db: PocketBase,
  bookingId: string,
  roomId: string,
  table: number,
  date: string,
  meal: BookingMeal | null,
): Promise<PbRecord | null> {
  const rows = await dayBookingsInRoom(db, bookingId, roomId, date, meal);
  return rows.find((r) => occupiedTableNumbersOf(r).includes(table)) ?? null;
}

/**
 * Sistema (o libera, con table null) una prenotazione in una sala. Imposta room e table_number insieme, con le stesse
 * righe di registro di assignBookingRoom ("Sala") e assignBookingTable ("Tavolo"), solo se cambiano.
 * Evento: table null svuota anche extra_tables; cambiare sala li scarta; un tavolo già tra gli extra viene tolto dagli extra
 * (audit "Tavoli" se cambia l'elenco).
 * Controlli: prenotazione normale o evento (non appuntamento, non annullata); il tavolo deve esistere nella disposizione
 * effettiva del giorno e pasto (`meal`, altrimenti quello della prenotazione) e non essere occupato.
 * Il ruolo è verificato dal chiamante.
 */
export async function seatBookingRecord(
  db: PocketBase,
  bookingId: string,
  roomId: string,
  table: number | null,
  actor: Actor,
  meal: BookingMeal | null = null,
): Promise<void> {
  const booking = await fetchOne(db, "bookings", bookingId);
  if (!booking) throw new UserFacingError("Prenotazione non trovata.");
  const oldRoomId = nn(booking.room);
  const oldTable = num(booking.table_number) > 0 ? num(booking.table_number) : null;
  const isEvent = (nn(booking.kind) ?? "evento") === "evento";
  const oldExtras = extraTableNumbersOf(booking);
  const oldFull = occupiedTableNumbersOf(booking);
  const newExtras = !isEvent || table === null || oldRoomId !== roomId ? [] : oldExtras.filter((n) => n !== table);
  const extrasChanged = isEvent && !sameList(oldExtras, newExtras);
  if (oldRoomId === roomId && oldTable === table && !extrasChanged) return;

  const reason = notSeatableReason(booking);
  if (reason) throw new UserFacingError(capitalize(reason));
  const bookingMeal = mealOf(booking);
  if (meal && bookingMeal && meal !== bookingMeal) {
    throw new UserFacingError(`La prenotazione è a ${bookingMeal}, non a ${meal}.`);
  }

  const room = await fetchOne(db, "rooms", roomId);
  if (!room || !Boolean(room.active)) throw new UserFacingError("La sala selezionata non esiste o non è attiva.");

  if (table !== null) {
    const day = toDateOnly(booking.event_date);
    const effectiveMeal = meal ?? bookingMeal;
    const layout = await effectiveRoomTables(db, roomId, day, effectiveMeal);
    if (!layout.some((t) => num(t.number) === table)) throw new UserFacingError(`Il tavolo ${table} non esiste in questa sala.`);
    const occupant = await tableOccupant(db, bookingId, roomId, table, day, effectiveMeal);
    if (occupant) throw new UserFacingError(`Il tavolo ${table} è già occupato da ${bookingLabel(occupant)}.`);
  }

  const [oldRoomName, newRoomName] = await Promise.all([roomNameOf(db, oldRoomId), roomNameOf(db, roomId)]);

  const batch = db.createBatch();
  batch.collection("bookings").update(bookingId, {
    room: roomId,
    table_number: table ?? 0,
    updated_by: actor.id,
    ...(extrasChanged ? { extra_tables: newExtras } : {}),
  });
  if (oldRoomId !== roomId) {
    queueAudit(batch, actor, { bookingId, field: "Sala", old: oldRoomName, new: newRoomName });
  }
  if (oldTable !== table) {
    queueAudit(batch, actor, {
      bookingId,
      field: "Tavolo",
      old: oldTable === null ? null : String(oldTable),
      new: table === null ? null : String(table),
    });
  }
  if (extrasChanged) {
    queueAudit(batch, actor, {
      bookingId,
      field: "Tavoli",
      old: listText(oldFull),
      new: listText(table === null ? [] : [table, ...newExtras]),
    });
  }
  await batch.send();
}

/**
 * Tavoli di un evento nella sala per un giorno e pasto (solo admin, il ruolo è verificato dal chiamante). `tableNumbers` in
 * ordine: il primo è il tavolo principale (table_number), gli altri in extra_tables. [] = nessun tavolo (la sala resta).
 * Controlli: evento non annullato e del pasto indicato; numeri interi 1–9999 senza ripetizioni (max MAX_EVENT_TABLES); ogni
 * tavolo deve esistere nella disposizione effettiva del giorno/pasto (effectiveRoomTables) e non essere occupato da altre
 * prenotazioni o eventi. Audit: "Sala" se cambia, "Tavoli" se cambia l'elenco (es. "3, 4, 5").
 */
export async function setEventTablesRecord(
  db: PocketBase,
  eventId: string,
  roomId: string,
  tableNumbers: number[],
  meal: BookingMeal,
  actor: Actor,
): Promise<void> {
  if (tableNumbers.length > MAX_EVENT_TABLES) {
    throw new UserFacingError(`Un evento può occupare al massimo ${MAX_EVENT_TABLES} tavoli.`);
  }
  if (new Set(tableNumbers).size !== tableNumbers.length) {
    throw new UserFacingError("Lo stesso tavolo non può comparire due volte.");
  }
  if (tableNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 9999)) {
    throw new UserFacingError("Numero del tavolo non valido: usa un numero da 1 a 9999.");
  }

  const booking = await fetchOne(db, "bookings", eventId);
  if (!booking) throw new UserFacingError("Evento non trovato.");
  if ((nn(booking.kind) ?? "evento") !== "evento") throw new UserFacingError("Solo gli eventi possono occupare più tavoli.");
  if (String(booking.status) === "annullato") throw new UserFacingError("L'evento è annullato.");
  const bookingMeal = mealOf(booking);
  if (bookingMeal && bookingMeal !== meal) throw new UserFacingError(`L'evento è a ${bookingMeal}, non a ${meal}.`);

  const room = await fetchOne(db, "rooms", roomId);
  if (!room || !Boolean(room.active)) throw new UserFacingError("La sala selezionata non esiste o non è attiva.");

  const day = toDateOnly(booking.event_date);
  if (tableNumbers.length > 0) {
    const layoutNumbers = new Set((await effectiveRoomTables(db, roomId, day, meal)).map((t) => num(t.number)));
    const others = await dayBookingsInRoom(db, eventId, roomId, day, meal);
    for (const n of tableNumbers) {
      if (!layoutNumbers.has(n)) throw new UserFacingError(`Il tavolo ${n} non esiste in questa sala.`);
      const occupant = others.find((r) => occupiedTableNumbersOf(r).includes(n));
      if (occupant) throw new UserFacingError(`Il tavolo ${n} è già occupato da ${bookingLabel(occupant)}.`);
    }
  }

  const oldRoomId = nn(booking.room);
  const oldList = occupiedTableNumbersOf(booking);
  const roomChanged = oldRoomId !== roomId;
  const listChanged = !sameList(oldList, tableNumbers);
  if (!roomChanged && !listChanged) return;

  const [oldRoomName, newRoomName] = await Promise.all([roomNameOf(db, oldRoomId), roomNameOf(db, roomId)]);

  const batch = db.createBatch();
  batch.collection("bookings").update(eventId, {
    room: roomId,
    table_number: tableNumbers[0] ?? 0,
    extra_tables: tableNumbers.slice(1),
    updated_by: actor.id,
  });
  if (roomChanged) {
    queueAudit(batch, actor, { bookingId: eventId, field: "Sala", old: oldRoomName, new: newRoomName });
  }
  if (listChanged) {
    queueAudit(batch, actor, { bookingId: eventId, field: "Tavoli", old: listText(oldList), new: listText(tableNumbers) });
  }
  await batch.send();
}
