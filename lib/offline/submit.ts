/**
 * Punto d'ingresso unico per le scritture dei componenti: submitMutation.
 *  - Online: chiama l'azione direttamente, con l'ultimo argomento `{ mutationId, expectedUpdated?, force? }`.
 *    Gli esiti del server (ok:false, conflitti) tornano invariati al form.
 *  - Offline, o errore di rete durante la chiamata: la modifica va in coda (IndexedDB) e il risultato è
 *    { ok: true, queued: true, data }. Per le creazioni, `data.id` è un id temporaneo (tmp_…).
 *
 * Importante: `args` deve contenere TUTTI gli argomenti posizionali che precedono le opzioni (anche
 * quelli facoltativi, come `undefined`), perché le opzioni vengono aggiunte in coda: createBooking(input, undefined).
 */
import type { EntityRef, MutationOptions, QueuedActionName } from "./contract";
import type { ActionResult } from "@/lib/types";
import { isBrowserOnline, isNetworkError } from "./network";
import { enqueueMutation, listMutations, newTempId, newUuid } from "./queue";
import { ACTION_REGISTRY } from "./registry";

/** Metadati della scrittura, usati solo se finisce in coda. */
export interface SubmitMeta {
  /** Testo leggibile per l'elenco "Modifiche in attesa", es. "Coperti · Matrimonio Rossi". */
  label: string;
  /** Record toccato: per mostrare le modifiche in attesa nella pagina giusta. */
  entity?: EntityRef;
  /** `updated` del record come lo vedeva l'utente (vedi MutationOptions.expectedUpdated). */
  expectedUpdated?: string | null;
  /** Solo per le creazioni: assegna un id temporaneo, sostituito con quello reale dopo l'invio. */
  createsTempId?: boolean;
  /** Salta il controllo di conflitto (scelta "Sovrascrivi"). */
  force?: boolean;
  /**
   * Argomenti della copia in coda, se diversi da `args`. Es. le notifiche: online si invia `undefined` (tutte),
   * in coda serve lo snapshot degli id letti al tap.
   */
  queueArgs?: unknown[];
}

/** Risultato di una scrittura accodata: il form lo mostra come "salvato sul dispositivo". */
export interface QueuedResult<T = unknown> {
  ok: true;
  queued: true;
  /** Per le creazioni: `{ id: tmp_… }`. Altrimenti undefined. */
  data: T;
  mutationId: string;
  tempId?: string;
}

export type SubmitResult<T = unknown> = ActionResult<T> | QueuedResult<T>;

export function isQueued<T>(result: SubmitResult<T>): result is QueuedResult<T> {
  return "queued" in result && result.queued === true;
}

/** Profilo a cui appartiene la coda (impostato dal provider della coda all'avvio). */
let currentProfileId: string | null = null;
/** Avvia un giro di sincronizzazione (registrato dal provider). */
let kickSync: (() => void) | null = null;

export function bindOfflineProfile(profileId: string | null): void {
  currentProfileId = profileId;
}

export function registerSyncKick(fn: (() => void) | null): void {
  kickSync = fn;
}

/** Valore di `updated_at` di un record, se presente (il campo è letto con sicurezza dal tipo). */
export function updatedAtOf(record: object | null | undefined): string | undefined {
  const value = (record as { updated_at?: unknown } | null | undefined)?.updated_at;
  return typeof value === "string" && value ? value : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Action<T> = (...args: any[]) => Promise<ActionResult<T>>;

/**
 * Dopo un errore di rete di una chiamata ONLINE il server può aver eseguito comunque la modifica:
 * il primo reinvio aspetta un po', per non arrivare mentre la prima esecuzione è ancora in corso.
 */
const ONLINE_NETWORK_RETRY_DELAY_MS = 15_000;

/** Messaggio se la chiamata online è caduta per rete e anche il salvataggio in coda è fallito. */
const UNCERTAIN_SAVE_ERROR =
  "Esito incerto: la connessione si è interrotta durante il salvataggio. Controlla se la modifica è stata salvata prima di ripeterla.";

export async function submitMutation<T>(
  name: QueuedActionName,
  fn: Action<T>,
  args: unknown[],
  meta: SubmitMeta,
): Promise<SubmitResult<T>> {
  const mutationId = newUuid();
  const tempId = meta.createsTempId ? newTempId() : undefined;
  let onlineNetworkError = false;

  if (isBrowserOnline()) {
    const opts: MutationOptions = { mutationId };
    if (meta.expectedUpdated) opts.expectedUpdated = meta.expectedUpdated;
    if (meta.force) opts.force = true;
    try {
      return await fn(...args, opts);
    } catch (err) {
      // Errore non di rete (bug, errore del server): comportamento di sempre, nessuna coda.
      if (!isNetworkError(err)) throw err;
      onlineNetworkError = true;
    }
  }

  const notBefore = onlineNetworkError ? Date.now() + ONLINE_NETWORK_RETRY_DELAY_MS : undefined;
  return queueMutation<T>(name, meta.queueArgs ?? args, meta, mutationId, tempId, notBefore, onlineNetworkError);
}

/**
 * `uncertain`: la chiamata online è caduta per rete, quindi il server potrebbe aver già applicato la modifica.
 * Se anche il salvataggio in coda fallisce, l'utente deve sapere che l'esito è incerto (niente "riprova" alla cieca).
 */
async function queueMutation<T>(
  name: QueuedActionName,
  args: unknown[],
  meta: SubmitMeta,
  mutationId: string,
  tempId: string | undefined,
  notBefore: number | undefined,
  uncertain: boolean,
): Promise<SubmitResult<T>> {
  const profileId = currentProfileId;
  if (!profileId) {
    return { ok: false, error: uncertain ? UNCERTAIN_SAVE_ERROR : "Sessione non pronta: ricarica la pagina e riprova." };
  }
  if (!(name in ACTION_REGISTRY)) {
    console.error(`[offline] azione non registrata: ${name}`);
  }

  try {
    // Il controllo di conflitto vale solo per la prima modifica in coda su un record: le successive sono
    // continuazioni dello stesso utente e partirebbero sempre "in conflitto" con la prima.
    const pending = await listMutations(profileId);
    const sameEntity = meta.entity
      ? pending.some((m) => m.entity?.type === meta.entity?.type && m.entity?.id === meta.entity?.id)
      : false;
    const expectedUpdated = !sameEntity && meta.expectedUpdated ? meta.expectedUpdated : undefined;

    await enqueueMutation({
      id: mutationId,
      profileId,
      action: name,
      args,
      expectedUpdated,
      force: meta.force ? true : undefined,
      label: meta.label,
      entity: meta.entity,
      createsTempId: tempId,
      createdAt: Date.now(),
      notBefore,
    });
  } catch (err) {
    // IndexedDB non disponibile o pieno (Safari in navigazione privata, quota): niente eccezione al form.
    console.error("[offline] salvataggio in coda fallito", err);
    return {
      ok: false,
      error: uncertain ? UNCERTAIN_SAVE_ERROR : "Impossibile salvare la modifica sul dispositivo: serve la connessione.",
    };
  }
  kickSync?.();

  return {
    ok: true,
    queued: true,
    mutationId,
    tempId,
    data: (tempId ? { id: tempId } : undefined) as T,
  };
}
