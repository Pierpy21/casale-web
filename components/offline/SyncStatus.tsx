"use client";

import Link from "next/link";
import { useOfflineQueue } from "./OfflineProvider";

/**
 * Pillola globale dello stato di sincronizzazione. Fissa sopra la barra inferiore mobile
 * (sotto il pulsante +) e in basso a destra su desktop, a sinistra del pulsante +.
 * Compare solo quando c'è qualcosa da dire: modifiche in coda, sincronizzazione, offline.
 * Il contenitore è fisso (fuori dal flusso della griglia del layout) e resta montato per l'aria-live.
 */
export function SyncStatus() {
  const { pendingCount, attentionCount, syncing, paused, online } = useOfflineQueue();

  let label: string | null = null;
  let dot = "bg-sand";
  if (paused) {
    label = "Accedi di nuovo per inviare";
    dot = "bg-danger";
  } else if (attentionCount > 0) {
    label = `${attentionCount} da risolvere`;
    dot = "bg-warning";
  } else if (syncing) {
    label = "Sincronizzazione…";
    dot = "bg-sand animate-pulse";
  } else if (pendingCount > 0) {
    label = `${pendingCount} ${pendingCount === 1 ? "modifica in attesa" : "modifiche in attesa"}`;
  } else if (!online) {
    label = "Offline";
    dot = "bg-warning";
  }

  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-4 z-20 max-w-[calc(100vw-9rem)] lg:bottom-8 lg:left-auto lg:right-28 lg:max-w-none"
    >
      {label && (
        <Link
          href="/admin/sincronizzazione"
          className="inline-flex max-w-full items-center gap-2 rounded-[2px] border border-sand/40 bg-ink px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-logo-cream shadow-lg shadow-ink/30 transition-colors duration-300 hover:bg-petrol focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
        >
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </Link>
      )}
    </div>
  );
}
