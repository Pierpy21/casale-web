/**
 * Comunicazione tra le pagine dell'agenda e il service worker (public/sw.js).
 * Tutte le funzioni non lanciano mai: senza service worker (sviluppo, primo caricamento, sito pubblico)
 * non fanno nulla e restituiscono un esito negativo.
 */

/** Esito dell'ultima richiesta della pagina: servita dalla cache offline o dalla rete. */
export interface OfflineStatus {
  fromCache: boolean;
  /** Istante ISO del salvataggio in cache (solo se fromCache). */
  cachedAt: string | null;
}

/** Tempo massimo di attesa della risposta del service worker. */
const ACK_TIMEOUT_MS = 1500;

interface NavigatorWithConnection extends Navigator {
  connection?: { saveData?: boolean; effectiveType?: string };
}

type WorkerMessage =
  | { type: "set-user"; profileId: string | null }
  | { type: "clear-user-data" }
  | { type: "warm-cache"; urls: string[] }
  | { type: "get-status" }
  | { type: "bypass-cache-once"; ms: number };

/** Service worker attivo per lo scope della pagina corrente (null se non registrato). */
async function activeWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active ?? null;
  } catch {
    return null;
  }
}

/** Invia un messaggio e attende la risposta, al massimo timeoutMs. Risolve null in caso di timeout o assenza di SW. */
function ask<T>(message: WorkerMessage, timeoutMs: number): Promise<T | null> {
  return activeWorker()
    .then((worker) => {
      if (!worker) return null;
      return new Promise<T | null>((resolve) => {
        const channel = new MessageChannel();
        const finish = (value: T | null) => {
          window.clearTimeout(timer);
          channel.port1.close();
          resolve(value);
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        channel.port1.onmessage = (event: MessageEvent<T>) => finish(event.data);
        worker.postMessage(message, [channel.port2]);
      });
    })
    .catch(() => null);
}

/**
 * Comunica al service worker quale profilo è loggato: la cache offline delle pagine è separata per utente.
 * Con null (o un cambio di profilo) il service worker elimina le cache dei profili precedenti.
 */
export async function notifyServiceWorkerUser(profileId: string | null): Promise<boolean> {
  const ack = await ask<{ ok?: boolean }>({ type: "set-user", profileId }, ACK_TIMEOUT_MS);
  return ack?.ok === true;
}

/**
 * Elimina le cache delle pagine dell'utente corrente. Da chiamare PRIMA di inviare il form di logout:
 * attende la conferma per un tempo breve, così il logout non si blocca mai.
 */
export async function clearOfflineUserData(timeoutMs = 800): Promise<boolean> {
  const ack = await ask<{ ok?: boolean }>({ type: "clear-user-data" }, timeoutMs);
  return ack?.ok === true;
}

/**
 * Per qualche secondo le navigazioni e le richieste RSC vanno direttamente in rete, senza ripiegare sulla cache.
 * Serve dopo un invio della coda: la pagina deve mostrare i dati appena salvati, non una copia vecchia.
 * Restituisce true se il service worker ha confermato.
 */
export async function bypassOfflineCacheOnce(ms: number): Promise<boolean> {
  const ack = await ask<{ ok?: boolean }>({ type: "bypass-cache-once", ms }, ACK_TIMEOUT_MS);
  return ack?.ok === true;
}

/** Condizioni di rete che sconsigliano il pre-caricamento (risparmio dati, connessione lenta, offline). */
function canPrefetchNow(): boolean {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection?.saveData) return false;
  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

/**
 * Chiede al service worker di pre-caricare in background gli URL admin indicati (solo HTML).
 * Il service worker limita la frequenza (al massimo una volta ogni 30 minuti) e le richieste in parallelo.
 * Restituisce true se il pre-caricamento è stato avviato.
 */
export async function warmOfflineCache(urls: string[]): Promise<boolean> {
  if (urls.length === 0 || !canPrefetchNow()) return false;
  const ack = await ask<{ started?: boolean }>(
    { type: "warm-cache", urls: Array.from(new Set(urls)) },
    ACK_TIMEOUT_MS,
  );
  return ack?.started === true;
}

/** Esito corrente della pagina (interrogato al montaggio: il service worker può averlo già deciso). */
export async function readOfflineStatus(): Promise<OfflineStatus | null> {
  const ack = await ask<OfflineStatus>({ type: "get-status" }, ACK_TIMEOUT_MS);
  return ack ?? null;
}

/** Ascolta gli aggiornamenti di stato inviati dal service worker (navigazioni e RSC). Restituisce la funzione di pulizia. */
export function subscribeOfflineStatus(listener: (status: OfflineStatus) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; fromCache?: unknown; cachedAt?: unknown } | null;
    if (!data || data.type !== "offline-status") return;
    listener({
      fromCache: data.fromCache === true,
      cachedAt: typeof data.cachedAt === "string" ? data.cachedAt : null,
    });
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
