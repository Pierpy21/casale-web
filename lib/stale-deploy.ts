/**
 * Rilevamento dei errori causati da un nuovo deploy mentre l'app è ancora aperta
 * in un client vecchio (version skew): RSC/Server Action non più disponibili o
 * chunk JS con hash cambiati. Modulo puro, sicuro sia lato client sia lato server.
 */

const STALE_DEPLOY_PATTERNS = [
  "unexpected response was received from the server",
  "chunkloaderror",
  "loading chunk",
  "failed to fetch dynamically imported module",
  "failed to find server action",
  "is not a valid server action",
];

const RELOAD_STORAGE_KEY = "agenda-stale-reload";
const RELOAD_COOLDOWN_MS = 30_000;

export function isStaleDeployError(error: unknown): boolean {
  if (!error) return false;

  let text = "";
  if (typeof error === "string") {
    text = error;
  } else if (typeof error === "object") {
    const { name, message } = error as { name?: unknown; message?: unknown };
    text = [name, message]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }

  if (!text) return false;
  const haystack = text.toLowerCase();
  return STALE_DEPLOY_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/**
 * Ricarica la pagina al massimo una volta ogni 30 secondi per evitare loop.
 * Ritorna true se ha avviato il ricaricamento, false se non deve (o non può) ricaricare.
 */
export function reloadOnceForStaleDeploy(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY));
    const now = Date.now();
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Storage non disponibile: senza memoria del tentativo non ricarichiamo, per evitare loop.
    return false;
  }

  window.location.reload();
  return true;
}
