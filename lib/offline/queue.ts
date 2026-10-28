/**
 * Archivio della coda offline su IndexedDB (nessuna dipendenza esterna).
 * Due store: `mutations` (QueuedMutation, indicizzate per profilo) e `idmap` (id temporaneo → id reale).
 * Ogni scrittura notifica i listener locali e, via BroadcastChannel, le altre schede aperte.
 * Modulo solo lato client.
 */
import { TEMP_ID_PREFIX, type QueuedMutation } from "./contract";

/**
 * Elemento della coda come salvato su IndexedDB: il contratto più i campi locali del reinvio.
 * Questi campi non fanno parte di contract.ts (il server non li vede mai).
 */
export type StoredMutation = QueuedMutation & {
  /**
   * Non reinviare prima di questo istante (ms epoch). Usato dopo un errore di rete di una chiamata ONLINE:
   * il server potrebbe averla eseguita comunque, quindi si lascia tempo prima del primo reinvio.
   */
  notBefore?: number;
  /** Ultimo ritardo applicato per `code: "in_progress"` (raddoppia a ogni nuovo tentativo, fino a 5 minuti). */
  busyDelayMs?: number;
};

const DB_NAME = "casale-offline";
const DB_VERSION = 1;
const STORE_MUTATIONS = "mutations";
const STORE_IDMAP = "idmap";
const CHANNEL_NAME = "casale-offline-queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
          const store = db.createObjectStore(STORE_MUTATIONS, { keyPath: "id" });
          store.createIndex("profileId", "profileId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_IDMAP)) {
          db.createObjectStore(STORE_IDMAP);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------
// Notifiche di cambio
// ---------------------------------------------------------------------

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
  channel?.postMessage("changed");
}

/** Ascolta i cambiamenti della coda (anche da altre schede). Ritorna la funzione di cancellazione. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => listeners.forEach((l) => l());
  }
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------
// Argomenti: FormData ↔ oggetto clonabile
// ---------------------------------------------------------------------

interface EncodedFormData {
  __formData: [string, unknown][];
}

function isEncodedFormData(value: unknown): value is EncodedFormData {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { __formData?: unknown }).__formData)
  );
}

/** Prepara gli argomenti per IndexedDB: i FormData diventano { __formData }, File/Blob restano nativi. */
export function encodeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => (arg instanceof FormData ? { __formData: Array.from(arg.entries()) } : arg));
}

/** Inverso di encodeArgs: ricostruisce i FormData prima dell'invio. */
export function decodeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (!isEncodedFormData(arg)) return arg;
    const form = new FormData();
    for (const [key, value] of arg.__formData) {
      if (typeof value === "string" || value instanceof Blob) {
        form.append(key, value);
      } else {
        form.append(key, String(value));
      }
    }
    return form;
  });
}

// ---------------------------------------------------------------------
// Coda
// ---------------------------------------------------------------------

/** Dati di una nuova modifica (lo stato iniziale è sempre "pending"). */
export type NewMutation = Omit<StoredMutation, "status" | "attempts" | "args"> & { args: unknown[] };

/** Id temporaneo per un record creato offline (prefisso TEMP_ID_PREFIX + UUID senza trattini). */
export function newTempId(): string {
  return `${TEMP_ID_PREFIX}${newUuid().replace(/-/g, "")}`;
}

/** UUID v4 (crypto.randomUUID se disponibile, altrimenti da getRandomValues). */
export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function enqueueMutation(mutation: NewMutation): Promise<void> {
  const db = await openDb();
  const record: StoredMutation = {
    ...mutation,
    args: encodeArgs(mutation.args),
    status: "pending",
    attempts: 0,
  };
  const tx = db.transaction(STORE_MUTATIONS, "readwrite");
  tx.objectStore(STORE_MUTATIONS).put(record);
  await done(tx);
  emit();
}

/** Tutte le modifiche del profilo, in ordine di creazione (FIFO). */
export async function listMutations(profileId: string): Promise<StoredMutation[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_MUTATIONS, "readonly");
  const records = (await requestToPromise(
    tx.objectStore(STORE_MUTATIONS).index("profileId").getAll(profileId),
  )) as StoredMutation[];
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

async function getMutation(id: string): Promise<StoredMutation | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_MUTATIONS, "readonly");
  return (await requestToPromise(tx.objectStore(STORE_MUTATIONS).get(id))) as StoredMutation | undefined;
}

/** Aggiorna campi di una modifica (lettura e scrittura nella stessa transazione). */
export async function patchMutation(id: string, patch: Partial<StoredMutation>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MUTATIONS, "readwrite");
  const store = tx.objectStore(STORE_MUTATIONS);
  const getReq = store.get(id);
  getReq.onsuccess = () => {
    const current = getReq.result as QueuedMutation | undefined;
    if (current) store.put({ ...current, ...patch });
  };
  await done(tx);
  emit();
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MUTATIONS, "readwrite");
  tx.objectStore(STORE_MUTATIONS).delete(id);
  await done(tx);
  emit();
}

/**
 * Scarta una modifica. Solo la prima modifica di un record porta `expectedUpdated` (controllo di conflitto):
 * se è quella scartata, la successiva sullo stesso record eredita il valore, così il controllo non si perde.
 */
export async function discardMutation(id: string): Promise<void> {
  const current = await getMutation(id);
  if (current?.entity && current.expectedUpdated) {
    const queue = await listMutations(current.profileId);
    const index = queue.findIndex((m) => m.id === id);
    const follower = queue
      .slice(index + 1)
      .find((m) => m.entity?.type === current.entity?.type && m.entity?.id === current.entity?.id);
    if (follower && !follower.expectedUpdated) {
      await patchMutation(follower.id, { expectedUpdated: current.expectedUpdated });
    }
  }
  await removeMutation(id);
}

// ---------------------------------------------------------------------
// Mappa id temporanei → id reali
// ---------------------------------------------------------------------

export async function getIdMap(): Promise<Record<string, string>> {
  const db = await openDb();
  const tx = db.transaction(STORE_IDMAP, "readonly");
  const store = tx.objectStore(STORE_IDMAP);
  const keys = (await requestToPromise(store.getAllKeys())) as string[];
  const values = (await requestToPromise(store.getAll())) as string[];
  const map: Record<string, string> = {};
  keys.forEach((key, i) => {
    map[key] = values[i];
  });
  return map;
}

export async function setRealId(tempId: string, realId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_IDMAP, "readwrite");
  tx.objectStore(STORE_IDMAP).put(realId, tempId);
  await done(tx);
}
