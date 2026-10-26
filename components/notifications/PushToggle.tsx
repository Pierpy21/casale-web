"use client";

import { BellRing, Check, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/app/actions/notifications";
import { Alert, Button, Skeleton } from "@/components/ui";

type PushState = "checking" | "unsupported" | "ios-install" | "unconfigured" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Chiave pubblica VAPID in base64url: una chiave P-256 non compressa è lunga 87 caratteri. */
const VAPID_KEY_PATTERN = /^[A-Za-z0-9_-]{80,100}$/;
const VAPID_VALID = !!VAPID_PUBLIC_KEY && VAPID_KEY_PATTERN.test(VAPID_PUBLIC_KEY);

const UNCONFIGURED_MESSAGE = "Le notifiche non sono ancora configurate sul server. Avvisa l’amministratore.";
const SW_READY_TIMEOUT_MS = 8000;

/** Errore di supporto: il service worker non diventa attivo entro il tempo massimo. */
const SW_TIMEOUT_NAME = "ServiceWorkerTimeout";

/** Errore di salvataggio della subscription lato server. */
class SaveSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveSubscriptionError";
  }
}

/** Chiave VAPID (base64url) in ArrayBuffer per pushManager.subscribe. */
function urlBase64ToApplicationKey(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) return String((err as { name: unknown }).name);
  return typeof err;
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Attende il service worker con un tetto di tempo: senza timeout la UI resterebbe bloccata. */
function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const error = new Error("Service worker non pronto");
      error.name = SW_TIMEOUT_NAME;
      reject(error);
    }, SW_READY_TIMEOUT_MS);
    navigator.serviceWorker.ready.then(
      (reg) => {
        window.clearTimeout(timer);
        resolve(reg);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** True se la subscription esistente è stata creata con la stessa chiave applicationServerKey. */
function sameApplicationServerKey(sub: PushSubscription, key: ArrayBuffer): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = new Uint8Array(key);
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

/**
 * Crea la subscription. Se il browser ne conserva una creata con un'altra chiave VAPID
 * (cambio di chiave sul server), la rimuove e riprova una volta.
 */
async function subscribeWithRecovery(reg: ServiceWorkerRegistration, applicationServerKey: ArrayBuffer): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing && !sameApplicationServerKey(existing, applicationServerKey)) {
    await existing.unsubscribe();
  }
  const options: PushSubscriptionOptionsInit = { userVisibleOnly: true, applicationServerKey };
  try {
    return await reg.pushManager.subscribe(options);
  } catch (err) {
    if (errorName(err) !== "InvalidStateError") throw err;
    const stale = await reg.pushManager.getSubscription();
    if (stale) await stale.unsubscribe();
    return reg.pushManager.subscribe(options);
  }
}

/** Messaggio per l'utente in base alla causa reale del fallimento (il nome è loggato in console). */
function describeEnableError(err: unknown): string {
  const name = errorName(err);
  if (name === SW_TIMEOUT_NAME) {
    return "Servizio notifiche non attivo: chiudi e riapri l’app.";
  }
  if (name === "AbortError" || name === "InvalidAccessError" || name === "NotAllowedError") {
    return "Il browser ha rifiutato l’iscrizione alle notifiche. Aggiorna Chrome e riprova; su telefono usa l’app installata dalla schermata Home.";
  }
  if (err instanceof SaveSubscriptionError) {
    return `Iscrizione non salvata: ${err.message}`;
  }
  return "Non è stato possibile attivare le notifiche. Riprova tra poco.";
}

function isIosInBrowser(): boolean {
  return isIosDevice() && !isStandalone();
}

/** Stato iniziale che non richiede la sottoscrizione: null = serve controllare il service worker. */
function staticState(): PushState | null {
  if (isIosInBrowser()) return "ios-install";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (!VAPID_VALID) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  return null;
}

/** Attivazione/disattivazione delle notifiche push sul dispositivo corrente. */
export function PushToggle() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fixed = staticState();
    if (fixed) {
      queueMicrotask(() => {
        if (!cancelled) setState(fixed);
      });
      return () => {
        cancelled = true;
      };
    }
    // "Attive" solo se l'iscrizione del telefono è valida E registrata sul server:
    // una sottoscrizione rimasta da un tentativo fallito viene risincronizzata o rimossa.
    serviceWorkerReady()
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (!sub) return "off" as const;
        const json = sub.toJSON();
        const keyMatches = sameApplicationServerKey(sub, urlBase64ToApplicationKey(VAPID_PUBLIC_KEY as string));
        if (!keyMatches || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          await sub.unsubscribe();
          return "off" as const;
        }
        const saved = await savePushSubscription(
          { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
          navigator.userAgent,
        );
        if (!saved.ok) {
          console.error("[push] risincronizzazione fallita:", saved.error);
          return "off" as const;
        }
        return "on" as const;
      })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: unknown) => {
        console.error("[push] stato iniziale non leggibile:", errorName(err), err);
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Il permesso va chiesto dentro il gesto dell'utente: nessun await prima di requestPermission().
  const enable = () => {
    if (!VAPID_PUBLIC_KEY || !VAPID_VALID) {
      console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY mancante o non valida");
      setState("unconfigured");
      return;
    }
    const publicKey = VAPID_PUBLIC_KEY;
    setBusy(true);
    setError(null);
    Notification.requestPermission()
      .then(async (permission) => {
        if (permission === "denied") {
          setState("denied");
          return;
        }
        if (permission !== "granted") {
          setState("off");
          return;
        }
        const reg = await serviceWorkerReady();
        const sub = await subscribeWithRecovery(reg, urlBase64ToApplicationKey(publicKey));
        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          await sub.unsubscribe();
          throw new Error("Iscrizione non valida: chiavi mancanti");
        }
        const saved = await savePushSubscription(
          { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
          navigator.userAgent,
        );
        if (!saved.ok) {
          await sub.unsubscribe();
          throw new SaveSubscriptionError(saved.error);
        }
        setState("on");
      })
      .catch((err: unknown) => {
        console.error("[push] attivazione fallita:", errorName(err), err);
        setError(describeEnableError(err));
      })
      .finally(() => setBusy(false));
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await serviceWorkerReady();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await deletePushSubscription(endpoint);
      }
      setState("off");
    } catch (err: unknown) {
      console.error("[push] disattivazione fallita:", errorName(err), err);
      setError("Non è stato possibile disattivare le notifiche. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "checking") return <Skeleton className="h-10 w-full" />;

  if (state === "unsupported") {
    return <p className="text-[13px] leading-relaxed text-slate-dark">Le notifiche push non sono disponibili su questo browser.</p>;
  }

  if (state === "unconfigured") {
    return <p className="text-[13px] leading-relaxed text-slate-dark">{UNCONFIGURED_MESSAGE}</p>;
  }

  if (state === "ios-install") {
    return (
      <div className="flex min-w-0 flex-col gap-2 rounded-btn bg-cream/70 px-4 py-3">
        <p className="break-words text-[14px] font-medium text-ink">Installa l’app per ricevere le notifiche</p>
        <p className="break-words text-[13px] leading-relaxed text-slate-dark">
          Tocca Condividi e poi «Aggiungi alla schermata Home». Apri l’app dalla nuova icona e attiva le notifiche da qui.
        </p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-[13px] leading-relaxed text-slate-dark">
        Le notifiche sono bloccate per questo sito. Riattivale dalle impostazioni del browser (icona del lucchetto nella barra degli indirizzi).
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {state === "on" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-[14px] font-medium text-success">
            <Check aria-hidden="true" className="size-4" />
            Notifiche attive su questo dispositivo
          </p>
          <Button variant="ghost" size="sm" onClick={disable} disabled={busy} aria-busy={busy || undefined}>
            Disattiva
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={enable} disabled={busy} aria-busy={busy || undefined} className="w-full">
          {busy ? (
            "Attivazione…"
          ) : (
            <>
              <Smartphone aria-hidden="true" className="size-4" />
              Attiva notifiche sul telefono
            </>
          )}
        </Button>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {state === "off" && !error && (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-slate">
          <BellRing aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Ricevi un avviso anche con l’app chiusa.
        </p>
      )}
    </div>
  );
}
