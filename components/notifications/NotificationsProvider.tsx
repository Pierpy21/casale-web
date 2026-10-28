"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { markNotificationsRead, pollNotifications } from "@/app/actions/notifications";
import { isBrowserOnline } from "@/lib/offline/network";
import { submitMutation } from "@/lib/offline/submit";
import type { AppNotification } from "@/lib/types";

/** Quante notifiche tenere in memoria nel pannello (come il caricamento iniziale). */
const MAX_ITEMS = 30;
/** Intervallo di polling quando la scheda è visibile. */
const POLL_INTERVAL_MS = 20_000;
/** Massimo ritardo dopo errori ripetuti. */
const MAX_BACKOFF_MS = 5 * 60_000;
/** Margine sull'istante di riferimento: evita di perdere notifiche create nello stesso secondo. */
const SINCE_SLACK_MS = 2_000;

interface NotificationsContextValue {
  items: AppNotification[];
  unreadCount: number;
  /** Cresce a ogni notifica nuova: serve a far partire l'animazione del badge. */
  pulse: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export interface NotificationsProviderProps {
  profileId: string;
  initialItems: AppNotification[];
  initialUnread: number;
  children: ReactNode;
}

/**
 * Stato delle notifiche per tutta l'app (campanella desktop e mobile condividono lo stesso stato).
 * Aggiornamento: polling della server action pollNotifications (cookie httpOnly, nessun token nel browser).
 * - ogni 20 s a scheda visibile; sospeso quando la scheda è nascosta;
 * - un poll immediato al ritorno visibile e al focus; nessuna richiesta in parallelo;
 * - backoff esponenziale dopo errori; stop (con un solo redirect al login) se la sessione è scaduta.
 * Lettura: ottimistica, con rollback se il server rifiuta.
 */
export function NotificationsProvider({ initialItems, initialUnread, children }: NotificationsProviderProps) {
  const [items, setItems] = useState<AppNotification[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [pulse, setPulse] = useState(0);
  // Istante dell'ultima notifica vista (o di montaggio se non ce ne sono).
  const newestSeen = useRef<string>(initialItems[0]?.created_at ?? new Date().toISOString());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let failures = 0;
    let stopped = false;

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    /** Un poll. Non lancia: gli errori alimentano il backoff. */
    const poll = async (): Promise<void> => {
      inFlight = true;
      try {
        const since = new Date(Date.parse(newestSeen.current) - SINCE_SLACK_MS).toISOString();
        const result = await pollNotifications(since);
        if (!result.ok) throw new Error(result.error);
        if (result.data.expired) {
          stopped = true;
          clearTimer();
          // Un solo redirect: la pagina di login non monta questo provider, quindi non c'è loop.
          window.location.replace("/admin/login");
          return;
        }
        failures = 0;
        const fresh = result.data.items;
        if (fresh.length > 0) {
          newestSeen.current = fresh[0].created_at;
          setItems((list) => {
            const known = new Set(list.map((n) => n.id));
            const added = fresh.filter((n) => !known.has(n.id));
            return [...added, ...list].slice(0, MAX_ITEMS);
          });
          setPulse((p) => p + 1);
        }
        setUnreadCount(result.data.unread);
      } catch (err) {
        failures += 1;
        console.warn("[notifications] polling fallito:", err);
      } finally {
        inFlight = false;
      }
    };

    const delayMs = () => (failures === 0 ? POLL_INTERVAL_MS : Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS));

    /** Esegue un poll e programma il successivo (solo se la scheda è visibile e la sessione è attiva). */
    const cycle = async (): Promise<void> => {
      await poll();
      schedule();
    };

    const schedule = () => {
      clearTimer();
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void cycle(), delayMs());
    };

    /** Poll immediato (ritorno visibile, focus), a meno che ce ne sia già uno in corso. */
    const pollNow = () => {
      if (stopped || inFlight) return;
      clearTimer();
      void cycle();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        pollNow();
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", pollNow);
    schedule();

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", pollNow);
    };
  }, []);

  const markRead = useCallback(
    (id: string) => {
      const target = items.find((n) => n.id === id);
      if (!target || target.read_at) return;
      const readAt = new Date().toISOString();
      setItems((list) => list.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
      void submitMutation("notifications.markNotificationsRead", markNotificationsRead, [[id]], { label: "Notifica letta" }).then((result) => {
        if (result.ok) return;
        // Rollback: la notifica torna non letta.
        setItems((list) => list.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
        setUnreadCount((count) => count + 1);
      });
    },
    [items],
  );

  const markAllRead = useCallback(() => {
    if (unreadCount === 0) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    // Online: come prima, il server segna tutte le non lette (anche quelle oltre le 30 in memoria).
    // Offline, o se la chiamata online cade per rete e finisce in coda: vale l'istantanea delle non lette note al tap,
    // così le notifiche arrivate nel frattempo restano non lette.
    const online = isBrowserOnline();
    if (!online && unreadIds.length === 0) return;
    const snapshot = new Set(unreadIds);
    const previousCount = unreadCount;
    const readAt = new Date().toISOString();
    setItems((list) => list.map((n) => (snapshot.has(n.id) ? { ...n, read_at: readAt } : n)));
    setUnreadCount((count) => (online ? 0 : Math.max(0, count - unreadIds.length)));
    void submitMutation(
      "notifications.markNotificationsRead",
      markNotificationsRead,
      [online ? undefined : unreadIds],
      { label: "Notifiche lette", queueArgs: [unreadIds] },
    ).then((result) => {
      if (result.ok) return;
      // Rollback solo delle notifiche della richiesta: le altre (arrivate nel frattempo) non si toccano.
      setItems((list) => list.map((n) => (snapshot.has(n.id) ? { ...n, read_at: null } : n)));
      setUnreadCount(online ? previousCount : (count) => count + unreadIds.length);
    });
  }, [items, unreadCount]);

  const value = useMemo(
    () => ({ items, unreadCount, pulse, markRead, markAllRead }),
    [items, unreadCount, pulse, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications va usato dentro NotificationsProvider");
  return ctx;
}
