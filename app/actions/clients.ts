"use server";

import { revalidatePath } from "next/cache";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { ClientInput, type ClientInputType } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { canCreateAnyBooking, isAdmin } from "@/lib/permissions";
import { countWhere } from "@/lib/pocketbase/queries";
import type { ActionResult, ClientSuggestion } from "@/lib/types";

// Ricerca suggerimenti cliente (campo Nome nelle prenotazioni). Limiti in caratteri/risultati.
const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 80;
const SEARCH_LIMIT = 8;
const SEARCH_PHONE_MIN_DIGITS = 4;

const SearchQuery = z
  .string()
  .trim()
  .max(SEARCH_MAX_CHARS, "Ricerca troppo lunga (max 80 caratteri).");

/**
 * Filtro PocketBase per la ricerca: ogni parola (senza cifre) deve comparire in nome o cognome;
 * se la query contiene almeno 4 cifre, il telefono deve contenere le cifre. Null = nessuna ricerca possibile.
 */
function clientSearchFilter(db: PocketBase, query: string): string | null {
  // Token alfanumerici (la punteggiatura separa: "D'Angelo" -> "D", "Angelo"). Quelli con cifre non sono nomi.
  // Lettere latine incluse le accentate (target ES2017: niente \p{L}).
  const words = query.split(/[^a-zA-Z0-9À-ɏ]+/).filter(Boolean);
  const nameWords = words.filter((w) => !/[0-9]/.test(w));
  const digits = query.replace(/\D/g, "");
  const hasPhone = digits.length >= SEARCH_PHONE_MIN_DIGITS;
  if (nameWords.length === 0 && !hasPhone) return null;

  const parts: string[] = [];
  const params: Record<string, string> = {};
  nameWords.forEach((w, i) => {
    params[`w${i}`] = w;
    parts.push(`(first_name ~ {:w${i}} || last_name ~ {:w${i}})`);
  });
  const nameExpr = parts.join(" && ");

  if (!hasPhone) return db.filter(nameExpr, params);
  params.digits = digits;
  if (!nameExpr) return db.filter("phone ~ {:digits}", params);
  return db.filter(`(${nameExpr}) || phone ~ {:digits}`, params);
}

/** Cerca clienti per il campo Nome delle prenotazioni. Admin: con email; sala: solo nome e telefono. */
export async function searchClients(query: string): Promise<ActionResult<ClientSuggestion[]>> {
  const auth = await authorize(canCreateAnyBooking, "Non sei autorizzato a cercare clienti.");
  if (!auth.ok) return auth;

  const parsed = SearchQuery.safeParse(query);
  if (!parsed.success) return invalidInput(parsed.error);
  const term = parsed.data;
  if (term.length < SEARCH_MIN_CHARS) return { ok: true, data: [] };

  const filter = clientSearchFilter(auth.db, term);
  if (!filter) return { ok: true, data: [] };

  const admin = isAdmin(auth.profile);
  try {
    const res = await auth.db.collection("clients").getList(1, SEARCH_LIMIT, {
      filter,
      sort: "last_name,first_name",
      skipTotal: true,
      // Solo i campi necessari: mai tax_code, vat_number, notes (ed email per la sala).
      fields: admin ? "id,first_name,last_name,phone,email" : "id,first_name,last_name,phone",
    });
    const data: ClientSuggestion[] = res.items.map((r) => ({
      id: r.id,
      first_name: String(r.first_name ?? ""),
      last_name: String(r.last_name ?? ""),
      phone: String(r.phone ?? ""),
      email: admin && typeof r.email === "string" && r.email.length > 0 ? r.email : null,
    }));
    return { ok: true, data };
  } catch (err) {
    return dbFail(err);
  }
}

function clientFields(data: ClientInputType) {
  return {
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    email: data.email ?? "",
    tax_code: data.tax_code ?? "",
    vat_number: data.vat_number ?? "",
    notes: data.notes ?? "",
  };
}

export async function createClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = ClientInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const record = await auth.db.collection("clients").create(clientFields(parsed.data));
    revalidatePath("/admin/clienti");
    return { ok: true, data: { id: record.id } };
  } catch (err) {
    return dbFail(err);
  }
}

export async function updateClient(id: string, input: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Cliente non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = ClientInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await auth.db.collection("clients").update(id, clientFields(parsed.data));
  } catch (err) {
    return dbFail(err);
  }

  revalidatePath("/admin/clienti");
  revalidatePath(`/admin/clienti/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteClient(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Cliente non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  // Restrict: il cliente con prenotazioni non si elimina (PocketBase non blocca la relazione da solo).
  const bookings = await countWhere(auth.db, "bookings", auth.db.filter("client = {:id}", { id }));
  if (bookings > 0) return fail("Impossibile eliminare: il cliente ha prenotazioni collegate.");

  try {
    await auth.db.collection("clients").delete(id);
  } catch (err) {
    // Backstop: bookings.client e' required senza cascade, quindi PocketBase rifiuta la delete
    // se nel frattempo e' comparsa una prenotazione (race con la pre-verifica).
    if (err instanceof ClientResponseError && err.status === 400) {
      return fail("Impossibile eliminare: il cliente ha prenotazioni collegate.");
    }
    return dbFail(err);
  }

  revalidatePath("/admin/clienti");
  return { ok: true, data: undefined };
}
