"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { useOnline } from "@/components/offline/useOnline";
import { cn } from "./cn";

/** URL del documento da aprire nel visualizzatore del browser invece di scaricarlo (?inline=1). */
function inlineHref(href: string): string {
  const url = new URL(href, window.location.origin);
  url.searchParams.set("inline", "1");
  return url.pathname + url.search;
}

/**
 * Chrome, Firefox ed Edge su iPhone/iPad: non condividono file con navigator.share e non aprono
 * i blob: in un'altra scheda (ne esce un file vuoto, es. "pdf.txt"). Lì si apre il file del server.
 */
function isIosOtherBrowser(): boolean {
  return /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}

/**
 * Link per scaricare un documento generato dal server (PDF, DOCX).
 * Su computer resta un normale download. Su telefono/tablet il download diretto non è affidabile
 * (nell'app installata su iOS non succede nulla): con Safari/Android si apre il foglio di condivisione
 * (Salva su File, WhatsApp, Mail…); altrimenti il documento si apre nel visualizzatore del browser,
 * da cui si condivide o si salva.
 */
export function DocumentDownload({
  href,
  fileName,
  mimeType,
  className,
  children,
  onActivate,
}: {
  href: string;
  fileName: string;
  mimeType: string;
  className?: string;
  children: ReactNode;
  /** Chiamato a fine clic (su computer subito dopo, su telefono a fine flusso): es. per chiudere un menu che lo contiene. */
  onActivate?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  // Il documento si genera sul server: offline non è disponibile.
  if (!online) {
    return (
      <span aria-disabled="true" className={cn(className, "cursor-not-allowed opacity-50")}>
        {children}
        <span className="ml-1 text-[12px] font-normal normal-case tracking-normal text-slate-dark">· Disponibile solo online</span>
      </span>
    );
  }

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch) {
      // Computer: download normale. Il chiamante si chiude dopo il clic (differito, così il link non si smonta durante l'azione).
      setTimeout(() => onActivate?.(), 0);
      return;
    }
    event.preventDefault();
    if (busy) return;

    // Touch: il chiamante (onActivate) viene avvisato solo a flusso finito, così il link non si smonta durante il download.
    setBusy(true);
    try {
      if (typeof navigator.share !== "function" || isIosOtherBrowser()) {
        window.location.href = inlineHref(href);
        return;
      }
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Documento non disponibile (${response.status})`);
      const file = new File([await response.blob()], fileName, { type: mimeType });
      if (file.size > 0 && navigator.canShare?.({ files: [file] })) {
        // Solo il file: con un titolo alcuni browser condividono anche un testo separato.
        await navigator.share({ files: [file] });
        return;
      }
      window.location.href = inlineHref(href);
    } catch (err) {
      // Condivisione annullata dall'utente: nessuna azione.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[documento] condivisione non riuscita:", err);
      window.location.href = inlineHref(href);
    } finally {
      setBusy(false);
      onActivate?.();
    }
  };

  return (
    <a href={href} download={fileName} onClick={onClick} aria-busy={busy || undefined} className={cn(className, busy && "opacity-70")}>
      {busy ? "Preparazione…" : children}
    </a>
  );
}
