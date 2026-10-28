/**
 * Contratto comune della modalità offline (consultazione + modifiche in coda).
 * Modulo puro, importabile da client e server. È il punto d'incontro tra:
 *  - le azioni server (app/actions/*): accettano `MutationOptions` come ULTIMO argomento, facoltativo;
 *  - la coda sul dispositivo (lib/offline/*, components/offline/*): salva le chiamate fatte senza rete
 *    e le reinvia in ordine quando la rete torna.
 *
 * Regole:
 *  - Ogni chiamata di scrittura ha un `mutationId` univoco (UUID v4 generato sul client al momento del tap).
 *    Il server registra gli id già applicati: lo stesso id reinviato due volte non applica la modifica due volte
 *    e restituisce lo stesso risultato della prima volta.
 *  - Le modifiche a un record esistente possono indicare `expectedUpdated` (il campo `updated` del record come
 *    lo vedeva l'utente). Se sul server il record è cambiato nel frattempo, l'azione NON scrive e risponde con
 *    `code: "conflict"`. Con `force: true` il controllo è saltato (l'utente ha scelto "Sovrascrivi").
 *  - Senza opzioni il comportamento delle azioni resta identico. Le chiamate online dell'app passano comunque
 *    `mutationId` ed `expectedUpdated`: un form aperto su dati vecchi ora riceve "conflict" invece di sovrascrivere.
 *  - `replay: true` solo per i reinvii dalla coda: abilita le tolleranze dei reinvii (eliminazione di un record già
 *    eliminato = ok) e rifiuta di eseguire se l'idempotenza non è disponibile (collezione applied_mutations assente).
 *  - Il server "prenota" il mutationId prima di eseguire: un reinvio che arriva mentre la prima esecuzione è ancora
 *    in corso riceve `code: "in_progress"` e va riprovato più tardi (mai considerato un errore definitivo).
 */

/** Ultimo argomento facoltativo di ogni azione di scrittura. */
export interface MutationOptions {
  /** UUID v4 della modifica: idempotenza dei reinvii. */
  mutationId?: string;
  /**
   * Valore di `updated` (ISO, come restituito da PocketBase) del record modificato, letto quando l'utente
   * ha aperto il form. Se il record sul server ha un `updated` diverso: conflitto, nessuna scrittura.
   */
  expectedUpdated?: string;
  /** Salta il controllo di conflitto (scelta esplicita "Sovrascrivi" dell'utente). */
  force?: boolean;
  /** Reinvio dalla coda offline (non la prima chiamata dal form). */
  replay?: boolean;
}

/** Codici di fallimento aggiuntivi che la coda deve riconoscere (campo `code` di ActionResult). */
export type OfflineFailureCode =
  /** Il record è cambiato sul server dopo che l'utente l'aveva letto. `conflict` descrive lo stato attuale. */
  | "conflict"
  /** Sessione scaduta o utente disattivato: la coda si ferma finché l'utente non rientra. */
  | "unauthenticated"
  /** Stesso mutationId ancora in esecuzione sul server (o idempotenza non disponibile per un reinvio): riprova dopo. */
  | "in_progress";

/** Dettaglio di un conflitto, restituito insieme a `code: "conflict"`. */
export interface ConflictInfo {
  /** `updated` attuale del record sul server. */
  currentUpdated: string;
  /** Chi l'ha modificato per ultimo, se noto (nome visualizzato). */
  updatedByName?: string | null;
}

/**
 * Nome stabile di un'azione nella coda. Le azioni si reinviano per NOME (non per riferimento):
 * dopo un deploy gli id interni delle Server Action cambiano, i nomi no.
 * Formato: "<file>.<funzione>", es. "bookings.updateBooking".
 */
export type QueuedActionName = `${string}.${string}`;

/** Prefisso degli id temporanei dei record creati offline (es. un evento creato senza rete). */
export const TEMP_ID_PREFIX = "tmp_";

export function isTempId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(TEMP_ID_PREFIX);
}

/** Stato di una modifica in coda. */
export type QueuedStatus =
  /** In attesa di rete. */
  | "pending"
  /** In invio adesso. */
  | "sending"
  /** Il server l'ha rifiutata per un conflitto: serve una scelta (sovrascrivi / scarta). */
  | "conflict"
  /** Il server l'ha rifiutata (validazione, permessi, record eliminato…): l'utente la corregge o la scarta. */
  | "error";

/** Riferimento all'entità toccata: per mostrare "2 modifiche in attesa" sulla pagina giusta. */
export interface EntityRef {
  type: "booking" | "payment" | "quote" | "client" | "menu" | "dish" | "room" | "inventory_product" | "inventory_report" | "operator" | "note" | "notification";
  /** Id reale o temporaneo (TEMP_ID_PREFIX). */
  id: string;
}

/** Elemento della coda come viene salvato sul dispositivo (IndexedDB). */
export interface QueuedMutation {
  /** = MutationOptions.mutationId */
  id: string;
  /** Profilo che ha fatto la modifica: la coda è per utente. */
  profileId: string;
  action: QueuedActionName;
  /**
   * Argomenti dell'azione SENZA le MutationOptions finali (aggiunte al reinvio).
   * Devono essere clonabili (structured clone): oggetti semplici, Blob/File. I FormData si salvano come
   * { __formData: [ [chiave, string | File], ... ] } e si ricostruiscono al reinvio.
   */
  args: unknown[];
  expectedUpdated?: string;
  force?: boolean;
  /** Testo leggibile per l'elenco "Modifiche in attesa", es. "Coperti · Matrimonio Rossi". */
  label: string;
  entity?: EntityRef;
  /** Se la modifica crea un record: id temporaneo assegnato, sostituito con quello reale dopo l'invio. */
  createsTempId?: string;
  createdAt: number;
  status: QueuedStatus;
  /** Messaggio dell'ultimo errore o conflitto. */
  lastError?: string;
  conflict?: ConflictInfo;
  attempts: number;
}
