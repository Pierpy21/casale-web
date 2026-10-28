"use client";

import { useEffect } from "react";
import { notifyServiceWorkerUser, warmOfflineCache } from "./offline-sw-client";

/** Primo pre-caricamento: qualche secondo dopo il montaggio, così non compete con il primo render. */
const WARM_FIRST_DELAY_MS = 5000;
/** Ripetizione del pre-caricamento (il service worker applica comunque il limite di 30 minuti). */
const WARM_INTERVAL_MS = 30 * 60 * 1000;

export interface OfflineProviderProps {
  /** Id del profilo loggato: la cache offline è separata per utente (null = nessuna cache). */
  profileId: string | null;
  /** URL admin da preparare offline, es. da buildAgendaWarmUrls() in offline-warm-urls.ts. */
  warmUrls?: string[];
}

/**
 * Non renderizza nulla: comunica al service worker l'utente corrente e, dopo il caricamento online,
 * chiede di pre-caricare le pagine indicate. Montato una volta nel layout autenticato.
 */
export function OfflineProvider({ profileId, warmUrls = [] }: OfflineProviderProps) {
  // Chiave stabile: l'effetto si rilancia solo se cambia l'elenco degli URL.
  const warmKey = warmUrls.join("\n");

  useEffect(() => {
    // Ogni montaggio del layout (anche dopo una sessione scaduta, che il SW ha dimenticato) e ogni cambio di profilo
    // comunicano l'utente: set-user con lo stesso id non fa nulla.
    void notifyServiceWorkerUser(profileId);
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !warmKey) return;
    const urls = warmKey.split("\n");
    const run = () => {
      if (navigator.onLine) void warmOfflineCache(urls);
    };
    const firstTimer = window.setTimeout(run, WARM_FIRST_DELAY_MS);
    const interval = window.setInterval(run, WARM_INTERVAL_MS);
    window.addEventListener("online", run);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
      window.removeEventListener("online", run);
    };
  }, [profileId, warmKey]);

  return null;
}
