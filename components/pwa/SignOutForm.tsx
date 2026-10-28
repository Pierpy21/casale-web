"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import { useOnline } from "@/components/offline/useOnline";
import { clearOfflineUserData } from "./offline-sw-client";

/** Spiegazione mostrata (tooltip e lettori di schermo) quando il logout non può partire. */
const OFFLINE_REASON = "Per uscire serve la connessione";

interface SignOutFormProps {
  /** Server action di uscita (signOut). */
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}

/**
 * Form di uscita che elimina prima le cache offline dell'utente.
 * Al submit blocca l'invio, attende (con timeout breve) il service worker e poi invia il form davvero.
 * React non esegue l'action se l'evento è già stato annullato: il secondo invio, programmatico, passa.
 * Offline il logout non può raggiungere il server: il form è disabilitato e le cache restano intatte.
 */
export function SignOutForm({ action, className, children }: SignOutFormProps) {
  const online = useOnline();
  const formRef = useRef<HTMLFormElement>(null);
  const preparingRef = useRef(false);
  const preparedRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (preparedRef.current) return;
    event.preventDefault();
    if (!online || preparingRef.current) return;
    preparingRef.current = true;
    await clearOfflineUserData();
    preparingRef.current = false;
    preparedRef.current = true;
    try {
      formRef.current?.requestSubmit();
    } finally {
      preparedRef.current = false;
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={handleSubmit}
      className={className}
      title={online ? undefined : OFFLINE_REASON}
    >
      {/* Fieldset disabilitato: disabilita pulsanti e controlli figli senza dover conoscerne la struttura. */}
      <fieldset disabled={!online} className="contents">
        {children}
      </fieldset>
      {!online && <span className="sr-only">{OFFLINE_REASON}</span>}
    </form>
  );
}
