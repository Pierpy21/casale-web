"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Link per scaricare un documento generato dal server (PDF, DOCX).
 * Su computer resta un normale download. Su telefono/tablet il download diretto non è affidabile
 * (nell'app installata su iOS non succede nulla): si scarica il file e si apre il foglio di condivisione
 * (Salva su File, WhatsApp, Mail…); se non è supportato, il file si apre in una nuova scheda.
 */
export function DocumentDownload({
  href,
  fileName,
  mimeType,
  className,
  children,
}: {
  href: string;
  fileName: string;
  mimeType: string;
  className?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch || typeof navigator.share !== "function") return; // download normale
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(href, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Documento non disponibile (${response.status})`);
      const file = new File([await response.blob()], fileName, { type: mimeType });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
      openBlob(file);
    } catch (err) {
      // Condivisione annullata dall'utente: nessuna azione.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[documento] condivisione non riuscita:", err);
      window.location.href = href;
    } finally {
      setBusy(false);
    }
  };

  return (
    <a href={href} download={fileName} onClick={onClick} aria-busy={busy || undefined} className={cn(className, busy && "opacity-70")}>
      {busy ? "Preparazione…" : children}
    </a>
  );
}

function openBlob(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener");
  // Lascia il tempo alla nuova scheda di leggere il file prima di liberarlo.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
