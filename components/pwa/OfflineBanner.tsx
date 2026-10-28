"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  readOfflineStatus,
  subscribeOfflineStatus,
  type OfflineStatus,
} from "./offline-sw-client";

/** Fuso dell'agenda (come AGENDA_TZ in components/agenda/agenda-utils.ts). */
const AGENDA_TIME_ZONE = "Europe/Rome";

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline(): boolean {
  // Lato server si assume online: nessuna differenza di idratazione.
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AGENDA_TIME_ZONE,
  }).format(date);
}

/**
 * Avviso di lettura offline. Compare quando il dispositivo è offline oppure quando la pagina corrente
 * è stata servita dalla cache (rete lenta o assente). Non renderizza nulla quando tutto è online e aggiornato.
 * Montarlo in cima al contenuto principale: è sticky sotto l'header mobile e non copre la barra inferiore.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [status, setStatus] = useState<OfflineStatus | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeOfflineStatus((next) => {
      if (active) setStatus(next);
    });
    void readOfflineStatus().then((next) => {
      if (active && next) setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const fromCache = status?.fromCache === true;
  if (online && !fromCache) return null;

  const time = formatTime(status?.cachedAt ?? null);
  const timeSuffix = time ? ` · dati aggiornati alle ${time}` : "";

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 flex items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-[13px] leading-snug text-ink lg:top-0 lg:px-8"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning" />
      {online ? (
        <>
          <p className="min-w-0 flex-1">
            Connessione instabile · stai vedendo dati salvati{time ? ` alle ${time}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-[2px] border border-ink/30 px-3 py-1 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors duration-200 hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol motion-reduce:transition-none"
          >
            Aggiorna
          </button>
        </>
      ) : (
        <p className="min-w-0 flex-1">
          Sei offline{timeSuffix}. Le modifiche verranno inviate al ritorno della rete.
        </p>
      )}
    </div>
  );
}
