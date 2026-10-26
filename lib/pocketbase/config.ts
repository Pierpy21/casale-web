// Configurazione PocketBase condivisa (server, middleware e browser). Nessun segreto qui.

/** Cookie httpOnly con il token di autenticazione dell'utente (path "/" per Server Actions e route handler). */
export const AUTH_COOKIE_NAME = "pb_auth";
/** Durata del cookie: 3 giorni, come authToken.duration della collezione users. */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 3;

/** URL di PocketBase usato dal server Next (POCKETBASE_URL, di norma l'URL pubblico HTTPS). */
export function pocketbaseServerUrl(): string {
  const url = process.env.POCKETBASE_URL?.trim();
  if (!url) throw new Error("POCKETBASE_URL non configurata");
  return url.replace(/\/+$/, "");
}

/**
 * URL pubblico di PocketBase: serve agli URL assoluti delle foto del sito (il browser non lo usa per le notifiche).
 * In produzione e' obbligatorio NEXT_PUBLIC_POCKETBASE_URL (niente ripiego sull'URL interno,
 * che il browser non raggiungerebbe). In sviluppo si usa POCKETBASE_URL.
 */
export function pocketbasePublicUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_POCKETBASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_POCKETBASE_URL non configurata: impostala con l'URL HTTPS pubblico di PocketBase.");
  }
  return pocketbaseServerUrl();
}
