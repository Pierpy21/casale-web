"use client";

import { Download, Share, SquarePlus, EllipsisVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/Modal";
import {
  isIosDevice,
  isIosSafari,
  promptInstall,
  useInstallState,
  useIsStandalone,
} from "./install-store";

type InstructionMode = "ios-safari" | "ios-other" | "generic";

export interface InstallAppButtonProps {
  variant: "sidebar" | "menu";
  /** Chiamato prima dell'azione (es. per chiudere il foglio "Altro" del menu mobile). */
  onBeforeAction?: () => void;
}

/** Voce permanente per installare l'app: sempre visibile finché non è già installata. */
export function InstallAppButton({ variant, onBeforeAction }: InstallAppButtonProps) {
  const { deferred, installed } = useInstallState();
  const standalone = useIsStandalone();
  const [instructions, setInstructions] = useState<InstructionMode | null>(null);

  if (standalone || installed) return null;

  const onClick = async () => {
    onBeforeAction?.();
    if (deferred) {
      await promptInstall();
      return;
    }
    if (isIosDevice()) {
      setInstructions(isIosSafari() ? "ios-safari" : "ios-other");
      return;
    }
    setInstructions("generic");
  };

  const label = "Installa l'app";
  const Icon = Download;

  return (
    <>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-3 rounded-[2px] border border-sand/50 px-3 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-sand transition-colors duration-300 hover:border-sand/80 hover:bg-sand/10 hover:text-logo-cream"
        >
          <Icon aria-hidden="true" className="size-[18px] shrink-0" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-3 rounded-[2px] px-3 py-3.5 text-left text-[13px] font-medium uppercase tracking-[0.12em] text-ink hover:bg-cream"
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          {label}
        </button>
      )}

      {instructions && (
        <InstallInstructions mode={instructions} onClose={() => setInstructions(null)} />
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-petrol font-sans text-[12px] font-medium text-paper">
        {n}
      </span>
      <span className="min-w-0 text-[14px] leading-relaxed text-ink">{children}</span>
    </li>
  );
}

/** Istruzioni illustrate. Portale nel body: resta visibile anche se il foglio "Altro" si chiude. */
function InstallInstructions({ mode, onClose }: { mode: InstructionMode; onClose: () => void }) {
  if (typeof document === "undefined") return null;

  const title =
    mode === "generic" ? "Installa l'app" : "Aggiungi alla schermata Home";

  return createPortal(
    <Modal open onClose={onClose} title={title}>
      {mode === "ios-safari" && (
        <ol className="flex flex-col gap-4">
          <Step n={1}>
            Tocca l&rsquo;icona{" "}
            <span className="inline-flex items-center gap-1 rounded-[2px] border border-sand bg-cream px-1.5 py-0.5 align-middle">
              <Share aria-hidden="true" className="size-4 text-petrol" />
              <span className="sr-only">Condividi</span>
            </span>{" "}
            in basso nella barra di Safari.
          </Step>
          <Step n={2}>
            Scorri e scegli{" "}
            <span className="inline-flex items-center gap-1 font-medium text-petrol">
              <SquarePlus aria-hidden="true" className="size-4" />
              Aggiungi alla schermata Home
            </span>
            .
          </Step>
          <Step n={3}>Conferma con &ldquo;Aggiungi&rdquo; in alto a destra.</Step>
        </ol>
      )}

      {mode === "ios-other" && (
        <div className="flex flex-col gap-4 text-[14px] leading-relaxed text-ink">
          <p>
            Su iPhone l&rsquo;installazione funziona solo da Safari. Questo browser non può aggiungere l&rsquo;app
            alla schermata Home.
          </p>
          <p>
            <strong className="font-medium">Apri il sito in Safari</strong>, poi tocca l&rsquo;icona Condividi e
            scegli &ldquo;Aggiungi alla schermata Home&rdquo;.
          </p>
        </div>
      )}

      {mode === "generic" && (
        <div className="flex flex-col gap-4 text-[14px] leading-relaxed text-ink">
          <p>Dal menu del browser scegli una di queste voci:</p>
          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <EllipsisVertical aria-hidden="true" className="size-5 shrink-0 text-petrol" />
              <span>
                <strong className="font-medium">Installa app</strong> oppure{" "}
                <strong className="font-medium">Aggiungi a schermata Home</strong>
              </span>
            </li>
          </ul>
          <p className="text-[13px] text-slate-dark">
            Su Android il menu è il pulsante ⋮ in alto a destra. Su computer è nella barra degli indirizzi.
          </p>
        </div>
      )}
    </Modal>,
    document.body,
  );
}
