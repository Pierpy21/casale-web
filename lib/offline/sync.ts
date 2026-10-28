/**
 * Motore di sincronizzazione della coda offline.
 *  - Replay FIFO per profilo, una modifica alla volta, per NOME dell'azione (registry.ts).
 *  - Ogni reinvio dalla coda porta `replay: true` (tolleranze e idempotenza lato server).
 *  - Prima di inviare sostituisce gli id temporanei (tmp_…) con quelli reali (mappa idmap).
 *  - Esiti: ok → rimossa; conflict → stato "conflict"; unauthenticated → coda in pausa;
 *    in_progress → resta in coda, riprova con attesa crescente (mai un errore); altro ok:false → stato "error";
 *    errore di rete → resta in coda, con backoff.
 *  - Blocco per record: le modifiche successive sullo stesso record aspettano finché la precedente non è risolta
 *    (anche se è già ferma in conflitto o errore). Il motivo è mostrato in `lastError`, lo stato non cambia.
 *  - Un solo giro alla volta: navigator.locks tra schede (se disponibile) e un flag in memoria nella scheda.
 *    Anche senza lock un reinvio doppio è innocuo: il server riconosce il mutationId già applicato.
 *  - Dopo ogni giro programma un risveglio per le modifiche con `notBefore` o in attesa dopo `in_progress`.
 * Modulo solo lato client.
 */
import type { ActionResult } from "@/lib/types";
import { errorMessage, isBrowserOnline, isNetworkError } from "./network";
import { decodeArgs, getIdMap, listMutations, patchMutation, removeMutation, setRealId, type StoredMutation } from "./queue";
import { ACTION_REGISTRY } from "./registry";
import { isTempId, type EntityRef, type MutationOptions } from "./contract";

const LOCK_NAME = "casale-offline-sync";
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** Primo ritardo per `in_progress` (il server sta ancora eseguendo lo stesso mutationId), poi raddoppia. */
const BUSY_BASE_DELAY_MS = 15_000;
const MAX_BUSY_DELAY_MS = 5 * 60_000;

const BLOCKED_REASON = "In attesa: risolvi prima la modifica precedente";
const CREATOR_FAILED_REASON = "In attesa: la creazione collegata non è andata a buon fine";
const BUSY_REASON = "Il server sta ancora completando questa modifica: riprovo tra poco.";

let running = false;
let failures = 0;
let backoffUntil = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let wakeHandler: (() => void) | null = null;

/**
 * Chi avvia i risvegli programmati (il provider della coda): così il giro passa anche da setSyncing
 * e dal refresh delle pagine. Senza handler si chiama runSync direttamente.
 */
export function registerSyncWake(fn: (() => void) | null): void {
  wakeHandler = fn;
}

/** Esito di un giro: `skipped` se non è partito (già in corso, offline, in backoff, altra scheda). */
export type SyncRun = { kind: "skipped" } | { kind: "done" | "network" | "paused"; sent: number };

export function entityKey(entity: EntityRef): string {
  return `${entity.type}:${entity.id}`;
}

/** Annulla il backoff (rete tornata o "Riprova" dell'utente). */
export function resetBackoff(): void {
  failures = 0;
  backoffUntil = 0;
}

/** Annulla il risveglio programmato (uscita o cambio di profilo). */
export function cancelSyncWake(): void {
  if (wakeTimer !== null) clearTimeout(wakeTimer);
  wakeTimer = null;
}

/** Avvia un giro di invio per il profilo. `force` ignora il backoff. */
export async function runSync(profileId: string, opts: { force?: boolean } = {}): Promise<SyncRun> {
  if (!isBrowserOnline()) return { kind: "skipped" };
  if (!opts.force && Date.now() < backoffUntil) return { kind: "skipped" };
  if (running) return { kind: "skipped" };

  running = true;
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const run = locks
      ? await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => (lock ? drain(profileId) : null))
      : await drain(profileId);
    if (!run) return { kind: "skipped" };

    if (run.kind === "network") {
      failures += 1;
      backoffUntil = Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
    } else if (run.kind === "done") {
      resetBackoff();
    }
    await scheduleNextWake(profileId);
    return run;
  } finally {
    running = false;
  }
}

/**
 * Prossimo istante utile per un nuovo giro: il primo `notBefore` ancora futuro tra le modifiche in attesa,
 * e mai prima della fine del backoff di rete. Null se non c'è nulla da attendere.
 */
async function nextWakeAt(profileId: string): Promise<number | null> {
  const now = Date.now();
  const times = (await listMutations(profileId))
    .filter((m) => (m.status === "pending" || m.status === "sending") && m.notBefore && m.notBefore > now)
    .map((m) => m.notBefore as number);
  if (times.length === 0) return null;
  return Math.max(Math.min(...times), backoffUntil);
}

async function scheduleNextWake(profileId: string): Promise<void> {
  const at = await nextWakeAt(profileId);
  cancelSyncWake();
  if (at === null) return;
  wakeTimer = setTimeout(
    () => {
      wakeTimer = null;
      if (wakeHandler) wakeHandler();
      else void runSync(profileId);
    },
    Math.max(0, at - Date.now()) + 100,
  );
}

/** Sostituisce ricorsivamente gli id temporanei noti; quelli non ancora risolti vanno in `unresolved`. */
function rewriteTempIds(value: unknown, ids: Record<string, string>, unresolved: string[]): unknown {
  if (typeof value === "string") {
    if (!isTempId(value)) return value;
    const real = ids[value];
    if (real) return real;
    unresolved.push(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteTempIds(v, ids, unresolved));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, rewriteTempIds(v, ids, unresolved)]),
    );
  }
  return value;
}

async function drain(profileId: string): Promise<SyncRun> {
  const items = await listMutations(profileId);
  const idmap = await getIdMap();
  const creators = new Map<string, StoredMutation>();
  for (const item of items) {
    if (item.createsTempId) creators.set(item.createsTempId, item);
  }
  // Id temporanei dei creatori già in conflitto o in errore (e di quelli che falliscono in questo giro).
  const failedCreators = new Set<string>();
  for (const item of items) {
    if (item.createsTempId && (item.status === "conflict" || item.status === "error")) {
      failedCreators.add(item.createsTempId);
    }
  }
  // Record con una modifica già ferma (conflitto o errore salvati, o in attesa di un reinvio):
  // le successive sullo stesso record aspettano che la precedente sia risolta.
  const blocked = new Set<string>();
  for (const item of items) {
    if (item.entity && (item.status === "conflict" || item.status === "error")) blocked.add(entityKey(item.entity));
  }
  // Ogni scrittura aggiorna `updated` del record: solo la prima modifica del record in questo giro
  // porta il controllo di conflitto; le successive sarebbero in conflitto con la prima.
  const touched = new Set<string>();
  let sent = 0;

  /** Ferma una modifica (conflitto o errore): le successive sullo stesso record aspettano. */
  const markFailed = async (item: StoredMutation, key: string | null, patch: Partial<StoredMutation>) => {
    await patchMutation(item.id, patch);
    if (key) blocked.add(key);
    if (item.createsTempId) failedCreators.add(item.createsTempId);
  };

  /** Motivo di attesa mostrato in lastError: si scrive solo se cambia, per non far rumore sull'IndexedDB. */
  const setReason = async (item: StoredMutation, reason: string) => {
    if (item.lastError === reason) return;
    await patchMutation(item.id, { lastError: reason });
  };

  for (const item of items) {
    // "sending" è rimasto da un invio interrotto (scheda chiusa): con il lock tenuto, si può riprovare.
    if (item.status !== "pending" && item.status !== "sending") continue;
    const key = item.entity ? entityKey(item.entity) : null;

    if (key && blocked.has(key)) {
      await setReason(item, BLOCKED_REASON);
      continue;
    }
    if (item.notBefore && item.notBefore > Date.now()) {
      // Chiamata online finita in errore di rete: il server potrebbe star ancora eseguendola.
      if (key) blocked.add(key);
      continue;
    }

    const unresolved: string[] = [];
    const args = decodeArgs(rewriteTempIds(item.args, idmap, unresolved) as unknown[]);
    if (unresolved.length > 0) {
      // Dipende da un record creato offline (ancora non inviato o fallito).
      const creatorDiscarded = unresolved.some((id) => !creators.has(id));
      const creatorFailed = unresolved.some((id) => failedCreators.has(id));
      if (creatorDiscarded) {
        // Il creatore è stato scartato: non si sbloccherà mai, la modifica va in errore e l'utente la scarta.
        await markFailed(item, key, { status: "error", lastError: CREATOR_FAILED_REASON });
      } else if (creatorFailed) {
        await setReason(item, CREATOR_FAILED_REASON);
      }
      if (key) blocked.add(key);
      continue;
    }

    const fn = ACTION_REGISTRY[item.action];
    if (!fn) {
      await markFailed(item, key, {
        status: "error",
        lastError: "Azione non disponibile in questa versione dell'app: scartala.",
      });
      continue;
    }

    await patchMutation(item.id, { status: "sending", attempts: item.attempts + 1, lastError: undefined });
    const opts: MutationOptions = { mutationId: item.id, replay: true };
    const firstOnEntity = !key || !touched.has(key);
    if (key) touched.add(key);
    if (item.expectedUpdated && firstOnEntity) opts.expectedUpdated = item.expectedUpdated;
    if (item.force) opts.force = true;

    let result: ActionResult<unknown>;
    try {
      result = await fn(...args, opts);
    } catch (err) {
      if (isNetworkError(err)) {
        await patchMutation(item.id, { status: "pending", lastError: "Rete non disponibile: riprovo appena torna." });
        return { kind: "network", sent };
      }
      await markFailed(item, key, { status: "error", lastError: errorMessage(err) });
      continue;
    }

    if (result.ok) {
      if (item.createsTempId) {
        const realId = (result.data as { id?: unknown } | undefined)?.id;
        if (typeof realId === "string" && realId) {
          await setRealId(item.createsTempId, realId);
          idmap[item.createsTempId] = realId;
          // Le modifiche in coda sul record appena creato passano all'id reale.
          for (const other of items) {
            if (other.id !== item.id && other.entity?.id === item.createsTempId) {
              await patchMutation(other.id, { entity: { ...other.entity, id: realId } });
            }
          }
        }
      }
      await removeMutation(item.id);
      sent += 1;
      continue;
    }

    if (result.code === "conflict") {
      await markFailed(item, key, {
        status: "conflict",
        lastError: result.error,
        conflict: result.conflict
          ? { currentUpdated: result.conflict.currentUpdated, updatedByName: result.conflict.updatedByName ?? null }
          : undefined,
      });
      continue;
    }

    if (result.code === "in_progress") {
      // Il server sta ancora eseguendo lo stesso mutationId: non è un errore, si riprova più tardi.
      // Il messaggio del server (più preciso) ha la precedenza sul testo generico.
      const delay = item.busyDelayMs ? Math.min(item.busyDelayMs * 2, MAX_BUSY_DELAY_MS) : BUSY_BASE_DELAY_MS;
      await patchMutation(item.id, {
        status: "pending",
        lastError: result.error || BUSY_REASON,
        busyDelayMs: delay,
        notBefore: Date.now() + delay,
      });
      if (key) blocked.add(key);
      continue;
    }

    if (result.code === "unauthenticated") {
      await patchMutation(item.id, { status: "pending", lastError: "Accedi di nuovo per inviare le modifiche." });
      return { kind: "paused", sent };
    }

    // Errore del server senza codice (anche "Esito incerto: …"): stato errore, mai reinvio automatico.
    // Decide l'utente con "Riprova" o "Scarta", dopo aver controllato il record.
    await markFailed(item, key, { status: "error", lastError: result.error });
  }

  return { kind: "done", sent };
}
