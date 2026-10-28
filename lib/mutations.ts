import "server-only";
import { after } from "next/server";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import type { MutationOptions, QueuedActionName } from "@/lib/offline/contract";
import { toIsoDateTime, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import type { ActionResult } from "@/lib/types";

// Idempotenza e controllo di conflitto per le scritture che arrivano dalla coda offline (lib/offline/contract.ts).
// Chi chiama un'azione senza opzioni (uso online) non cambia comportamento: nessun id, nessun confronto.
// Regola: una modifica il cui esito non è certo non viene mai rieseguita.

const APPLIED = "applied_mutations";

// UUID v4 (il client lo genera con crypto.randomUUID): versione 4 e variante RFC 4122.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Una prenotazione "pending" più recente di così è (forse) ancora in esecuzione. Oltre, l'esito è incerto. */
const CLAIM_TTL_MS = 2 * 60 * 1000;
/** Registrazioni più vecchie di così si eliminano (pulizia best-effort). */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Pulizia al massimo una volta all'ora per istanza del server. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;
/** Scritture della riga: primo tentativo subito, poi dopo 1 s e dopo 4 s (circa 5 s in tutto). */
const SAVE_DELAYS_MS = [1000, 4000];
/** Ulteriori tentativi in background (dopo la risposta) se i primi falliscono. */
const LATER_DELAYS_MS = [10_000, 30_000, 90_000];

const UNCERTAIN =
  "Esito incerto: la modifica potrebbe essere già stata salvata. Controlla i dati prima di rifarla, poi scarta questa modifica.";
const IN_PROGRESS = "Modifica già in invio, riprova tra poco.";
const TRANSIENT = "Servizio momentaneamente non disponibile. Riprova tra poco.";
const UNAVAILABLE = "Sincronizzazione non disponibile: aggiornamento del server in corso. Riprova più tardi.";

/** Log una sola volta per processo: la migrazione 1793000012 può non essere ancora stata applicata. */
let missingCollectionWarned = false;
let lastPruneAt = 0;

/** Esito della prenotazione dell'id: cosa fare prima di eseguire l'azione. */
type Claim =
  /** Id prenotato da questa richiesta: l'azione va eseguita, poi la riga viene chiusa, sbloccata o marcata incerta. */
  | { kind: "claimed"; id: string }
  /** Già applicata: si restituisce il risultato salvato. */
  | { kind: "done"; result: ActionResult<unknown> }
  /** Un'altra richiesta la sta eseguendo adesso (riga pending recente). */
  | { kind: "in_progress" }
  /** Esecuzione interrotta o eccezione di run(): l'esito non è noto. Non si esegue. */
  | { kind: "uncertain" }
  /** Errore transitorio del database (lettura o creazione della riga): nessuna esecuzione. */
  | { kind: "transient" }
  /** Collezione applied_mutations assente (migrazione non applicata). */
  | { kind: "unavailable" };

/** Id di modifica valido (UUID v4). */
export function isMutationId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function isMissingCollection(err: unknown): boolean {
  return err instanceof ClientResponseError && err.status === 404;
}

function warnMissingCollection(): void {
  if (missingCollectionWarned) return;
  missingCollectionWarned = true;
  console.warn("[mutations] collezione applied_mutations assente: migrazione 1793000012 da applicare. Idempotenza disattivata.");
}

async function findRow(db: PocketBase, mutationId: string): Promise<PbRecord | undefined> {
  // getList (non getFirstListItem): nessun 404 quando non c'è la riga, quindi un 404 indica collezione assente.
  const found = await db.collection(APPLIED).getList(1, 1, {
    filter: db.filter("mutation_id = {:id}", { id: mutationId }),
    fields: "id,status,result,claimed_at",
    skipTotal: true,
  });
  return found.items[0] as unknown as PbRecord | undefined;
}

/** Riga già presente: classificazione senza scritture. Nessuna riga viene mai ripresa. */
function classifyExisting(row: PbRecord): Claim {
  if (row.status === "done") {
    return { kind: "done", result: (row.result ?? { ok: true, data: undefined }) as ActionResult<unknown> };
  }
  // Eccezione già catturata da withMutation: l'esecuzione è finita, nessun'altra è in corso.
  if (isMarkedUncertain(row.result)) return { kind: "uncertain" };
  const claimedMs = typeof row.claimed_at === "string" ? Date.parse(row.claimed_at) : NaN;
  if (Number.isNaN(claimedMs)) return { kind: "uncertain" };
  if (Date.now() - claimedMs < CLAIM_TTL_MS) return { kind: "in_progress" };
  // Pending vecchia: il processo è morto o completeClaim è fallito dopo la scrittura. Non si riesegue.
  return { kind: "uncertain" };
}

function isMarkedUncertain(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { uncertain?: unknown }).uncertain === true;
}

/** Prenota l'id prima di eseguire: l'inserimento è protetto dall'indice unico su mutation_id. */
async function claimMutation(db: PocketBase, mutationId: string, action: QueuedActionName, actorId: string | null): Promise<Claim> {
  try {
    const row = await findRow(db, mutationId);
    if (row) return classifyExisting(row);
    try {
      const created = await db.collection(APPLIED).create({
        mutation_id: mutationId,
        action,
        actor: actorId ?? "",
        status: "pending",
        claimed_at: new Date().toISOString(),
      });
      return { kind: "claimed", id: created.id };
    } catch (err) {
      // 400: indice unico violato, un'altra richiesta ha prenotato lo stesso id un attimo prima.
      if (!(err instanceof ClientResponseError) || err.status !== 400) throw err;
      const other = await findRow(db, mutationId);
      // Riga sparita nel frattempo (sblocco o pulizia dell'altra richiesta): si riprova più tardi.
      if (!other) return { kind: "transient" };
      return classifyExisting(other);
    }
  } catch (err) {
    if (isMissingCollection(err)) return { kind: "unavailable" };
    console.error("[mutations] prenotazione della modifica:", mutationId, action, err);
    return { kind: "transient" };
  }
}

/** Testo breve dell'errore, da salvare nella riga. */
function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.slice(0, 300);
}

/** Ritenta in background dopo la risposta. Se fallisce anche così, la riga resta pending e scatta l'esito incerto. */
function scheduleLater(label: string, op: () => Promise<unknown>): void {
  const task = async (): Promise<void> => {
    for (const ms of LATER_DELAYS_MS) {
      await sleep(ms);
      try {
        await op();
        return;
      } catch {
        // Nuovo tentativo al giro successivo.
      }
    }
    console.error("[mutations] registrazione ancora non riuscita dopo i tentativi in background:", label);
  };
  // after() esiste solo in una richiesta: fuori da essa si usa un task senza attesa.
  try {
    after(task);
  } catch {
    void task();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Esegue op: primo tentativo subito, poi con attese crescenti; se tutti falliscono, programma altri tentativi. */
async function persistWithRetry(label: string, op: () => Promise<unknown>): Promise<void> {
  try {
    await op();
    return;
  } catch (err) {
    console.warn("[mutations] scrittura non riuscita, nuovo tentativo:", label, err);
  }
  for (const ms of SAVE_DELAYS_MS) {
    await sleep(ms);
    try {
      await op();
      return;
    } catch {
      // Prossimo tentativo.
    }
  }
  scheduleLater(label, op);
}

/** Chiude la prenotazione con il risultato. La modifica è già applicata: non si annulla, si ritenta. */
function completeClaim(db: PocketBase, claimId: string, mutationId: string, action: QueuedActionName, data: unknown): Promise<void> {
  // Solo { ok, data }: il risultato salvato deve restare piccolo.
  return persistWithRetry(`done ${action} ${mutationId}`, () =>
    db.collection(APPLIED).update(claimId, { status: "done", result: { ok: true, data } }),
  );
}

/** Marca la riga come esito incerto (eccezione di run): i reinvii non la rieseguono. */
function markUncertain(db: PocketBase, claimId: string, mutationId: string, action: QueuedActionName, err: unknown): Promise<void> {
  return persistWithRetry(`incerta ${action} ${mutationId}`, () =>
    db.collection(APPLIED).update(claimId, { status: "pending", result: { ok: false, uncertain: true, error: errorText(err) } }),
  );
}

/** Sblocca l'id dopo un fallimento dichiarato (nessuna scrittura): la coda può correggere e reinviare. */
function releaseClaim(db: PocketBase, claimId: string, mutationId: string, action: QueuedActionName): Promise<void> {
  return persistWithRetry(`sblocco ${action} ${mutationId}`, () =>
    db
      .collection(APPLIED)
      .delete(claimId)
      .catch((err) => {
        // 404: la riga è già sparita (pulizia): nulla da sbloccare.
        if (!isMissingCollection(err)) throw err;
      }),
  );
}

/** Data PocketBase (UTC) per i filtri: "YYYY-MM-DD HH:MM:SS.sssZ". */
function toPbDateTime(date: Date): string {
  return date.toISOString().replace("T", " ");
}

/** Elimina le registrazioni più vecchie di RETENTION_MS. Al massimo 10 pagine di 200 per esecuzione. */
async function pruneApplied(db: PocketBase, before: Date): Promise<void> {
  const filter = db.filter("created < {:d}", { d: toPbDateTime(before) });
  for (let round = 0; round < 10; round++) {
    const page = await db.collection(APPLIED).getList(1, 200, { filter, fields: "id", skipTotal: true });
    if (page.items.length === 0) return;
    for (const row of page.items) await db.collection(APPLIED).delete(row.id);
  }
}

/** Pulizia non bloccante: al più una volta all'ora, errori solo nei log. */
function maybePrune(db: PocketBase): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  pruneApplied(db, new Date(now - RETENTION_MS)).catch((err) => {
    if (!isMissingCollection(err)) console.warn("[mutations] pulizia applied_mutations non riuscita:", err);
  });
}

/**
 * Esegue una scrittura con idempotenza (claim-before-run). Mai due esecuzioni per lo stesso id.
 * - Senza `opts.mutationId`: esegue `run` come prima.
 * - Riga done: risultato salvato, `run` non eseguito.
 * - Riga pending recente: `code: "in_progress"`, `run` non eseguito.
 * - Riga pending vecchia, o marcata incerta (eccezione precedente): esito incerto (senza code), `run` non eseguito.
 * - Errore del database in lettura/creazione: `code: "in_progress"`, `run` non eseguito.
 * - Nuova riga: esegue `run` e poi
 *   · ok:true → done + risultato (se la registrazione fallisce, si ritenta; la risposta resta ok);
 *   · ok:false → sblocca la riga (nessuna scrittura è avvenuta);
 *   · eccezione → riga marcata incerta, risposta "Esito incerto" (senza code).
 * - Collezione `applied_mutations` assente: un reinvio (`replay: true`) non esegue e risponde `in_progress`;
 *   una prima chiamata dal form esegue senza idempotenza (con un avviso nei log).
 */
export async function withMutation<T>(
  db: PocketBase,
  opts: MutationOptions | undefined,
  action: QueuedActionName,
  actorId: string | null,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const mutationId = opts?.mutationId;
  if (mutationId === undefined) return run();
  if (!isMutationId(mutationId)) return { ok: false, error: "Identificativo della modifica non valido." };

  maybePrune(db);
  const claim = await claimMutation(db, mutationId, action, actorId);

  if (claim.kind === "done") return claim.result as ActionResult<T>;
  if (claim.kind === "in_progress") return { ok: false, error: IN_PROGRESS, code: "in_progress" };
  if (claim.kind === "transient") return { ok: false, error: TRANSIENT, code: "in_progress" };
  if (claim.kind === "uncertain") return { ok: false, error: UNCERTAIN };
  if (claim.kind === "unavailable") {
    if (opts?.replay === true) return { ok: false, error: UNAVAILABLE, code: "in_progress" };
    warnMissingCollection();
    return run();
  }

  let result: ActionResult<T>;
  try {
    result = await run();
  } catch (err) {
    // Esito incerto: la scrittura può essere avvenuta in parte. La riga resta, così il reinvio non riesegue.
    console.error("[mutations] esecuzione non riuscita:", mutationId, action, err);
    await markUncertain(db, claim.id, mutationId, action, err);
    return { ok: false, error: UNCERTAIN };
  }

  if (!result.ok) {
    // Fallimento dichiarato (validazione, permessi, conflitto): per costruzione non ha scritto.
    await releaseClaim(db, claim.id, mutationId, action);
    return result;
  }
  await completeClaim(db, claim.id, mutationId, action, result.data);
  return result;
}

/** Nome dell'utente per il messaggio di conflitto, oppure null. */
async function nameOf(db: PocketBase, userId: string): Promise<string | null> {
  try {
    const user = await fetchOne(db, "users", userId);
    const name = String(user?.full_name ?? "").trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Controllo di conflitto (solo se `opts.expectedUpdated` è impostato e `force` non è true).
 * Se `record` è cambiato dopo la lettura dell'utente, restituisce il fallimento `conflict`: l'azione deve
 * restituirlo SUBITO, senza scrivere. Null = nessun conflitto, si può scrivere.
 * Per i figli (coperti, piatti, allergie, note) `record` è la prenotazione genitore.
 */
export async function checkConflict(
  db: PocketBase,
  opts: MutationOptions | undefined,
  record: PbRecord,
): Promise<ActionResult<never> | null> {
  const expected = opts?.expectedUpdated;
  if (!expected || opts?.force === true) return null;

  const current = typeof record.updated === "string" ? record.updated : "";
  // Record senza `updated` (dati precedenti alla migrazione): nessun confronto possibile.
  // Il confronto normalizza entrambi i valori: PocketBase usa "2026-10-28 12:00:00.000Z", il client ISO con "T".
  if (!current || toIsoDateTime(current) === toIsoDateTime(expected)) return null;

  const byId = typeof record.updated_by === "string" ? record.updated_by : "";
  const who = byId ? await nameOf(db, byId) : null;
  return {
    ok: false,
    error: `Modifica non salvata: il dato è stato modificato da ${who ?? "un altro utente"} nel frattempo. Ricarica e riprova.`,
    code: "conflict",
    conflict: { currentUpdated: toIsoDateTime(current), updatedByName: who },
  };
}

/**
 * Come checkConflict, ma legge prima il record per id. Record mancante: nessun conflitto
 * (la scrittura risponderà "non trovato", come oggi).
 */
export async function checkConflictById(
  db: PocketBase,
  collection: string,
  id: string,
  opts: MutationOptions | undefined,
): Promise<ActionResult<never> | null> {
  if (!opts?.expectedUpdated || opts.force === true) return null;
  const record = await fetchOne(db, collection, id);
  if (!record) return null;
  return checkConflict(db, opts, record);
}
