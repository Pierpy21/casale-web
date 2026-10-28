/**
 * Rilevamento della rete per la coda offline. Modulo puro (nessun import React), sicuro lato client.
 */
import { isStaleDeployError } from "@/lib/stale-deploy";

/** Messaggi dei fetch falliti nei browser principali (Chrome, Firefox, Safari/iOS). */
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network connection was lost/i;

/** False solo se il browser dichiara esplicitamente di essere offline. */
export function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * La richiesta non è arrivata al server (o il deploy è cambiato nel frattempo): la modifica si può
 * rimettere in coda senza rischio, perché il reinvio usa lo stesso mutationId.
 */
export function isNetworkError(err: unknown): boolean {
  if (!isBrowserOnline()) return true;
  if (isStaleDeployError(err)) return true;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return NETWORK_MESSAGE.test(message);
}

/** Messaggio leggibile di un errore inatteso. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Errore imprevisto";
}
