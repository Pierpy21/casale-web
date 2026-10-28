import "server-only";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { addDaysISO, romeToday } from "@/lib/dates";
import { dayStartPb, nn, num, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import { buildDefaultQuoteLines, formatEUR } from "@/lib/quote-utils";
import type { QuoteLine } from "@/lib/types";
import type { QuoteDraftInputType, QuoteInputType } from "@/lib/validation";

// Preventivi (solo eventi). Numerazione YYYY-NNNN: il vincolo UNIQUE su quotes.number e' la fonte di verita'.
// Se due richieste calcolano lo stesso numero, la seconda riceve un errore di unicita' e riprova.

const MAX_ATTEMPTS = 5;

export interface QuoteActor {
  id: string;
}

function isNumberConflict(err: unknown): boolean {
  if (!(err instanceof ClientResponseError) || err.status !== 400) return false;
  const data = (err.response?.data ?? {}) as Record<string, { code?: string }>;
  return data.number?.code === "validation_not_unique";
}

/** Prossimo progressivo dell'anno: max(contatore, ultimo numero esistente) + 1. */
async function nextSequence(db: PocketBase, year: number): Promise<number> {
  const counter = await db.collection("quote_counters").getFirstListItem(db.filter("year = {:y}", { y: year })).catch(() => null);
  const counterValue = counter ? num(counter.last_number) : 0;

  const prefix = `${year}-`;
  const last = await db
    .collection("quotes")
    .getList(1, 1, {
      filter: db.filter("number >= {:from} && number <= {:to}", { from: `${prefix}0000`, to: `${prefix}9999` }),
      sort: "-number",
      skipTotal: true,
    })
    .catch(() => null);
  const top = last?.items[0] as PbRecord | undefined;
  const topValue = top ? Number(String(top.number).slice(prefix.length)) : 0;

  return Math.max(counterValue, Number.isFinite(topValue) ? topValue : 0) + 1;
}

/** Aggiorna (o crea) il contatore dell'anno: solo informativo, la fonte di verita' sono i preventivi. */
async function bumpCounter(db: PocketBase, year: number, sequence: number): Promise<void> {
  try {
    const counter = await db.collection("quote_counters").getFirstListItem(db.filter("year = {:y}", { y: year })).catch(() => null);
    if (counter) {
      if (num(counter.last_number) < sequence) {
        await db.collection("quote_counters").update(counter.id, { last_number: sequence });
      }
    } else {
      await db.collection("quote_counters").create({ year, last_number: sequence });
    }
  } catch (err) {
    console.error("[quotes] contatore non aggiornato:", err);
  }
}

/**
 * Crea un preventivo per un evento. Senza `draft`: righe automatiche dai menu della prenotazione,
 * IVA 10%, sconto 0. Con `draft`: righe, sconto, IVA, validita' e note indicati.
 * Validita' di default: 30 giorni dalla data di emissione (fuso di Roma).
 */
export async function createQuote(
  db: PocketBase,
  bookingId: string,
  actor: QuoteActor,
  draft: QuoteDraftInputType | null,
): Promise<string> {
  const booking = await fetchOne(db, "bookings", bookingId);
  if (!booking) throw new UserFacingError("Prenotazione non trovata");
  if (String(booking.kind || "evento") !== "evento") {
    throw new UserFacingError("I preventivi si emettono solo per gli eventi.");
  }

  let lines: QuoteLine[];
  if (draft) {
    lines = draft.lines;
  } else {
    const menuId = nn(booking.menu);
    const kidsId = nn(booking.kids_menu);
    const menu = menuId ? await fetchOne(db, "menus", menuId) : null;
    const kids = kidsId ? await fetchOne(db, "menus", kidsId) : null;
    lines = buildDefaultQuoteLines({
      adults: num(booking.adults),
      kids_menus: num(booking.kids_menus),
      menu: menu ? { name: String(menu.name), price_per_person: num(menu.price_per_person) } : null,
      kids_menu: kids ? { name: String(kids.name), price_per_person: num(kids.price_per_person) } : null,
    });
  }
  // Preventivo automatico senza menù (evento senza menù): 0 righe automatiche, il preventivo si crea comunque.
  if (draft && lines.length === 0) {
    throw new UserFacingError("Nessuna riga da preventivare: aggiungi almeno una riga.");
  }

  const issued = romeToday();
  const validUntil = draft?.valid_until ?? addDaysISO(issued, 30);
  const year = Number(issued.slice(0, 4));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const sequence = await nextSequence(db, year);
    const number = `${year}-${String(sequence).padStart(4, "0")}`;
    try {
      const record = await db.collection("quotes").create({
        booking: bookingId,
        number,
        issued_at: dayStartPb(issued),
        valid_until: dayStartPb(validUntil),
        lines,
        discount: draft?.discount ?? 0,
        vat_rate: draft?.vat_rate ?? 10,
        // 0 = nessun prezzo finale (in PocketBase lo zero e' il valore vuoto dei campi numero).
        final_total: draft?.final_total ?? 0,
        notes: draft?.notes ?? "",
        created_by: actor.id,
      });
      await bumpCounter(db, year, sequence);
      return record.id;
    } catch (err) {
      if (!isNumberConflict(err)) throw err;
    }
  }
  throw new UserFacingError("Impossibile assegnare il numero del preventivo. Riprova.");
}

/** Preventivo con le righe automatiche (azione "Crea preventivo" dalla prenotazione). */
export async function createQuoteFromBooking(db: PocketBase, bookingId: string, actor: QuoteActor): Promise<string> {
  return createQuote(db, bookingId, actor, null);
}

/** Modifica righe, date, sconto, IVA e note. Ritorna l'id della prenotazione collegata. */
export async function updateQuoteRecord(db: PocketBase, id: string, input: QuoteInputType): Promise<string> {
  const quote = await fetchOne(db, "quotes", id);
  if (!quote) throw new UserFacingError("Preventivo non trovato.");
  await db.collection("quotes").update(id, {
    issued_at: dayStartPb(input.issued_at),
    valid_until: input.valid_until ? dayStartPb(input.valid_until) : "",
    lines: input.lines,
    discount: input.discount,
    vat_rate: input.vat_rate,
    final_total: input.final_total ?? 0,
    notes: input.notes ?? "",
  });
  return String(quote.booking);
}

export async function deleteQuoteRecord(db: PocketBase, id: string): Promise<string> {
  const quote = await fetchOne(db, "quotes", id);
  if (!quote) throw new UserFacingError("Preventivo non trovato.");
  await db.collection("quotes").delete(id);
  return String(quote.booking);
}

/**
 * Prezzo finale di un evento (IVA inclusa) sul preventivo più recente della prenotazione.
 * Se il preventivo non esiste lo crea come la creazione automatica. `finalTotal` null = calcolo automatico (0 in DB).
 * Registra l'audit "Prezzo finale" nella stessa batch. Ritorna l'id del preventivo.
 */
export async function setEventFinalTotal(
  db: PocketBase,
  bookingId: string,
  finalTotal: number | null,
  actor: QuoteActor & { full_name: string },
): Promise<string> {
  const booking = await fetchOne(db, "bookings", bookingId);
  if (!booking) throw new UserFacingError("Prenotazione non trovata");
  if (String(booking.kind || "evento") !== "evento") {
    throw new UserFacingError("Il prezzo finale si imposta solo sugli eventi.");
  }

  const latest = (
    await db.collection("quotes").getList(1, 1, {
      filter: db.filter("booking = {:id}", { id: bookingId }),
      sort: "-created,-id",
      skipTotal: true,
    })
  ).items[0] as PbRecord | undefined;

  // Nessun preventivo e nessun prezzo da impostare (ripristino al calcolo automatico): non creare nulla.
  if (!latest && finalTotal === null) throw new UserFacingError("Nessun preventivo da ripristinare");

  const quoteId = latest ? latest.id : await createQuote(db, bookingId, { id: actor.id }, null);
  const oldTotal = latest && num(latest.final_total) > 0 ? num(latest.final_total) : null;
  if (oldTotal === finalTotal) return quoteId;

  const batch = db.createBatch();
  batch.collection("quotes").update(quoteId, { final_total: finalTotal ?? 0 });
  batch.collection("booking_changes").create({
    booking: bookingId,
    booking_label: "",
    changed_by: actor.id,
    changed_by_name: actor.full_name || "sistema",
    table_name: "quotes",
    field: "Prezzo finale",
    old_value: oldTotal === null ? "" : formatEUR(oldTotal),
    new_value: finalTotal === null ? "" : formatEUR(finalTotal),
  });
  await batch.send();
  return quoteId;
}
