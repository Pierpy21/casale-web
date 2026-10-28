"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueuedMutation } from "@/lib/offline/contract";
import { isBrowserOnline } from "@/lib/offline/network";
import { bindOfflineProfile, registerSyncKick } from "@/lib/offline/submit";
import { discardMutation, listMutations, patchMutation, subscribeQueue } from "@/lib/offline/queue";
import { cancelSyncWake, registerSyncWake, resetBackoff, runSync } from "@/lib/offline/sync";
import { bypassOfflineCacheOnce } from "@/components/pwa/offline-sw-client";

/** Controllo periodico della coda mentre l'app è aperta (iOS non ha background sync). */
const TICK_MS = 60_000;
/** Dopo un invio riuscito le pagine si ricaricano dalla rete per qualche secondo (niente copia in cache). */
const BYPASS_CACHE_MS = 10_000;

export interface OfflineContextValue {
  /** Tutte le modifiche in coda del profilo, in ordine di creazione. */
  items: QueuedMutation[];
  online: boolean;
  /** Un giro di invio è in corso. */
  syncing: boolean;
  /** Coda ferma: la sessione è scaduta. Si riprende con "Riprova" o al rientro. */
  paused: boolean;
  /** Modifiche non ancora inviate (in attesa o in invio). */
  pendingCount: number;
  /** Conflitti ed errori che richiedono una scelta dell'utente. */
  attentionCount: number;
  syncNow: () => void;
  retry: (id: string) => Promise<void>;
  overwrite: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * Stato della coda offline per tutta l'area admin (montato nel layout).
 * Triggers del reinvio: montaggio, ritorno della rete, scheda visibile, focus, ogni 60 s.
 * Dopo un invio riuscito fa router.refresh() così le pagine mostrano i dati reali.
 */
export function OfflineProvider({ profileId, children }: { profileId: string; children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [paused, setPaused] = useState(false);

  const routerRef = useRef(router);
  const pausedRef = useRef(false);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const runNow = useCallback(
    async (opts: { force?: boolean; resume?: boolean } = {}) => {
      if (opts.resume) {
        pausedRef.current = false;
        setPaused(false);
      }
      if (pausedRef.current && !opts.force) return;

      // Controllo rapido: niente indicatore "Sincronizzazione…" se non c'è nulla da inviare.
      const queued = await listMutations(profileId);
      if (!queued.some((m) => m.status === "pending" || m.status === "sending")) return;

      setSyncing(true);
      try {
        const run = await runSync(profileId, { force: opts.force });
        if (run.kind === "skipped") return;
        if (run.kind === "paused") {
          pausedRef.current = true;
          setPaused(true);
        } else if (run.kind === "done") {
          pausedRef.current = false;
          setPaused(false);
        }
        if (run.sent > 0) {
          // Il service worker deve lasciar passare il refresh in rete, altrimenti mostrerebbe la copia vecchia.
          await bypassOfflineCacheOnce(BYPASS_CACHE_MS);
          routerRef.current.refresh();
        }
      } finally {
        setSyncing(false);
      }
    },
    [profileId],
  );

  useEffect(() => {
    bindOfflineProfile(profileId);
    registerSyncKick(() => void runNow());
    registerSyncWake(() => void runNow());

    let disposed = false;
    const refreshList = () => {
      void listMutations(profileId).then((list) => {
        if (!disposed) setItems(list);
      });
    };
    const unsubscribe = subscribeQueue(refreshList);
    refreshList();
    setOnline(isBrowserOnline());

    const onOnline = () => {
      setOnline(true);
      resetBackoff();
      void runNow({ force: true });
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void runNow();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void runNow(), TICK_MS);

    void runNow({ force: true });

    return () => {
      disposed = true;
      unsubscribe();
      registerSyncKick(null);
      registerSyncWake(null);
      cancelSyncWake();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [profileId, runNow]);

  const syncNow = useCallback(() => {
    void runNow({ force: true, resume: true });
  }, [runNow]);

  const retry = useCallback(
    async (id: string) => {
      // Riprova esplicita: niente attesa residua del reinvio automatico.
      await patchMutation(id, { status: "pending", lastError: undefined, conflict: undefined, notBefore: undefined });
      resetBackoff();
      await runNow({ force: true, resume: true });
    },
    [runNow],
  );

  const overwrite = useCallback(
    async (id: string) => {
      // Stessa modifica, senza controllo di conflitto: scelta esplicita dell'utente.
      await patchMutation(id, {
        status: "pending",
        force: true,
        lastError: undefined,
        conflict: undefined,
        notBefore: undefined,
      });
      resetBackoff();
      await runNow({ force: true, resume: true });
    },
    [runNow],
  );

  const discard = useCallback(
    async (id: string) => {
      // Se la modifica scartata era la prima del record, la successiva eredita il controllo di conflitto.
      await discardMutation(id);
      // Le modifiche che aspettavano questa possono partire subito.
      void runNow();
    },
    [runNow],
  );

  const value = useMemo<OfflineContextValue>(() => {
    const pendingCount = items.filter((m) => m.status === "pending" || m.status === "sending").length;
    const attentionCount = items.filter((m) => m.status === "conflict" || m.status === "error").length;
    return { items, online, syncing, paused, pendingCount, attentionCount, syncNow, retry, overwrite, discard };
  }, [items, online, syncing, paused, syncNow, retry, overwrite, discard]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** Stato della coda offline. Va usato dentro OfflineProvider (area admin). */
export function useOfflineQueue(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOfflineQueue va usato dentro OfflineProvider");
  return ctx;
}
