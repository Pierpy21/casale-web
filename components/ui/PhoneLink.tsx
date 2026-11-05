"use client";

import { Check, Copy, MessageCircle, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { whatsappUrl } from "@/components/bookings/format";
import { normalizePhoneInput, telHref } from "@/lib/phone";
import { cn } from "./cn";

/** Quanto resta visibile il segno di copia riuscita. */
const COPIED_MS = 1500;

/**
 * Copia testo negli ambienti senza Clipboard API (http, iOS PWA): textarea nascosta e execCommand.
 * True se la copia è riuscita.
 */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permesso negato o contesto non adatto: si ripiega sul metodo vecchio qui sotto.
    }
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  // Fuori schermo ma non display:none (altrimenti iOS non seleziona); 16px evita lo zoom su iOS.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  area.style.fontSize = "16px";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

export interface PhoneLinkProps {
  /** Numero come salvato (viene normalizzato per il link e per la copia). */
  phone: string;
  className?: string;
  /** Pulsante WhatsApp accanto al numero (default sì). No dove la pagina ha già il suo pulsante WhatsApp. */
  whatsapp?: boolean;
}

const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol";

/**
 * Numero di telefono cliccabile (tel:) con pulsanti WhatsApp, "Chiama" (stesso tel:, ma visibile come pulsante) e "Copia" accanto. Il numero copiato è quello normalizzato.
 * Il link e il pulsante hanno almeno 44 px di altezza per il tocco.
 */
export function PhoneLink({ phone, className, whatsapp = true }: PhoneLinkProps) {
  const number = normalizePhoneInput(phone);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleCopy() {
    const ok = await copyText(number);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <span className={cn("inline-flex max-w-full min-w-0 items-center gap-1 align-middle", className)}>
      <a
        href={telHref(number)}
        className="inline-flex min-h-11 min-w-0 items-center wrap-anywhere font-medium text-petrol underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
      >
        {number}
      </a>
      {whatsapp && (
        <a
          href={whatsappUrl(number)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Scrivi su WhatsApp"
          title="Scrivi su WhatsApp"
          className={cn(ICON_BUTTON, "text-[#128C7E] hover:bg-cream")}
        >
          <MessageCircle aria-hidden="true" className="size-4" />
        </a>
      )}
      <a
        href={telHref(number)}
        aria-label="Chiama"
        title="Chiama"
        className={cn(ICON_BUTTON, "text-petrol hover:bg-cream")}
      >
        <Phone aria-hidden="true" className="size-4" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copia numero"
        title="Copia numero"
        className={cn(
          ICON_BUTTON,
          copied ? "text-success" : "text-slate-dark hover:bg-cream hover:text-ink",
        )}
      >
        {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
      </button>
      {copied && (
        <span role="status" className="sr-only">
          Numero copiato
        </span>
      )}
    </span>
  );
}
