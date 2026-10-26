"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import {
  isIosSafari,
  isStandaloneNow,
  promptInstall,
  useInstallState,
} from "./install-store";

const DISMISS_KEY = "agenda-install-dismissed-until-v2";
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_IOS_MS = 1500;

type Mode = "android" | "ios";

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function isDismissed(): boolean {
  try {
    const until = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    return Date.now() < until;
  } catch {
    return false;
  }
}

function rememberDismiss(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    // Storage non disponibile (modalità privata): il banner ricompare alla prossima visita.
  }
}

/**
 * Invito a installare l'app sul telefono. Solo mobile (< lg), mai in modalità standalone.
 * Usa lo stesso store della voce di menu (install-store.ts): "Non ora" lo nasconde per 3 giorni,
 * la voce "Installa l'app" nel menu resta sempre disponibile.
 */
export function InstallPrompt() {
  const { deferred, installed } = useInstallState();
  const [eligible, setEligible] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [iosReady, setIosReady] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  const [shown, setShown] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isMobileViewport() || isStandaloneNow() || isDismissed()) return;
    setEligible(true);
    if (!isIosSafari()) return;
    setIosSafari(true);
    const timer = window.setTimeout(() => setIosReady(true), SHOW_DELAY_IOS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const mode: Mode | null =
    !eligible || hiddenNow || installed
      ? null
      : deferred
        ? "android"
        : iosSafari && iosReady
          ? "ios"
          : null;

  // Animazione d'ingresso: monta con opacità 0, poi rende visibile al frame successivo.
  useEffect(() => {
    if (!mode) {
      setShown(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setShown(true);
      dialogRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  if (!mode) return null;

  const dismiss = () => {
    rememberDismiss();
    setHiddenNow(true);
  };

  const install = async () => {
    setHiddenNow(true);
    const outcome = await promptInstall();
    if (outcome === "dismissed") rememberDismiss();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      className={cn(
        "no-print fixed inset-x-3 z-40 mx-auto max-w-md rounded-btn border border-sand bg-paper p-5 text-ink shadow-2xl shadow-ink/30 outline-none lg:hidden",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0 overflow-hidden rounded-[2px] bg-ink">
          <Image
            src="/icons/icon-192.png?v=2"
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-serif text-xl leading-tight">
            Installa l&rsquo;Agenda sul telefono
          </h2>
          <p id={descId} className="text-[14px] leading-relaxed text-slate">
            {mode === "android"
              ? "Accesso rapido dalla schermata Home, a schermo intero, come un'app."
              : "Tocca l'icona Condividi e poi “Aggiungi alla schermata Home”."}
          </p>
        </div>
      </div>

      {mode === "android" ? (
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Non ora
          </Button>
          <Button variant="primary" size="sm" onClick={install}>
            Installa
          </Button>
        </div>
      ) : (
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Non ora
          </Button>
        </div>
      )}
    </div>
  );
}
