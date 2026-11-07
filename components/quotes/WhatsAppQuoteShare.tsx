"use client";

import { useState, type ReactNode } from "react";
import { useOnline } from "@/components/offline/useOnline";
import { whatsappUrl } from "@/components/bookings/format";
import { cn } from "@/components/ui/cn";
import { formatEUR, quoteFileName } from "@/lib/quote-utils";
import type { BookingStatus } from "@/lib/types";

/** Chrome, Firefox ed Edge su iPhone/iPad: non condividono file con navigator.share (vedi DocumentDownload). */
function isIosOtherBrowser(): boolean {
  return /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}

/** Testo breve per il cliente, con la firma del Casale. */
function quoteMessage({
  clientName,
  number,
  eventDate,
  total,
}: {
  clientName: string;
  number: string;
  eventDate: string;
  total: number | null;
}): string {
  const lines = [
    clientName ? `Gentile ${clientName},` : "Buongiorno,",
    `le invio in allegato l'ordine di servizio n. ${number} per l'evento del ${eventDate}.`,
  ];
  if (total !== null && total > 0) lines.push(`Il totale è di ${formatEUR(total)} IVA inclusa.`);
  lines.push("Per qualsiasi domanda resto a disposizione.", "", "Casale del Notaio");
  return lines.join("\n");
}

export interface WhatsAppQuoteShareProps {
  quoteId: string;
  /** Numero del preventivo, es. "2026-001" (serve anche per il nome del file). */
  number: string;
  /** Stato dell'evento: serve per il nome del file. */
  status: BookingStatus;
  /** Cellulare del cliente. Null: WhatsApp si apre senza numero, per scegliere il contatto. */
  phone: string | null;
  /** Nome del cliente per il saluto. Stringa vuota: saluto generico. */
  clientName: string;
  /** Data dell'evento già formattata, es. "sabato 12 settembre 2026". */
  eventDate: string;
  /** Totale IVA inclusa del preventivo salvato (null se non c'è). */
  total: number | null;
  className?: string;
  children: ReactNode;
  /** Chiamato a fine flusso sul telefono (per chiudere un menu che lo contiene). Su computer non viene chiamato, così la nota "PDF scaricato" resta visibile. */
  onActivate?: () => void;
}

/**
 * Invia il preventivo su WhatsApp.
 * Telefono/tablet con condivisione di file: si apre il foglio di condivisione con il PDF (WhatsApp è tra le app).
 * Altrimenti (computer o condivisione file non disponibile): si apre WhatsApp con il messaggio precompilato
 * e si scarica il PDF da allegare nella chat. Offline non è disponibile: il PDF si genera sul server.
 */
export function WhatsAppQuoteShare({
  quoteId,
  number,
  status,
  phone,
  clientName,
  eventDate,
  total,
  className,
  children,
  onActivate,
}: WhatsAppQuoteShareProps) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const online = useOnline();

  if (!online) {
    // Con flex-wrap l'avviso va su una riga propria, come in DocumentDownload.
    return (
      <button type="button" disabled className={cn(className, "flex-wrap cursor-not-allowed opacity-50")}>
        {children}
        <span className="ml-1 basis-full text-center text-[12px] font-normal normal-case tracking-normal text-slate-dark">· Disponibile solo online</span>
      </button>
    );
  }

  const href = `/api/quotes/${quoteId}/pdf`;
  const fileName = quoteFileName(number, "pdf", status);

  const whatsAppHref = () => whatsappUrl(phone, quoteMessage({ clientName, number, eventDate, total }));

  // Download normale del PDF (link programmatico), da allegare in WhatsApp Web o in altra app.
  const downloadPdf = () => {
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Computer: WhatsApp (Web o app) in un'altra scheda e PDF scaricato da allegare.
  const desktopFallback = () => {
    window.open(whatsAppHref(), "_blank", "noopener,noreferrer");
    downloadPdf();
    setDownloaded(true);
  };

  // Telefono senza condivisione di file: dopo un await window.open verrebbe bloccato e il download diretto
  // non è affidabile, quindi si apre WhatsApp nella stessa scheda con il solo messaggio.
  const touchFallback = () => {
    window.location.href = whatsAppHref();
  };

  const onClick = async () => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch) {
      desktopFallback();
      return;
    }
    if (busy) return;

    setBusy(true);
    setDownloaded(false);
    try {
      if (typeof navigator.share === "function" && !isIosOtherBrowser()) {
        const response = await fetch(href, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`Preventivo non disponibile (${response.status})`);
        const file = new File([await response.blob()], fileName, { type: "application/pdf" });
        if (file.size > 0 && navigator.canShare?.({ files: [file] })) {
          // Solo il file, senza titolo né testo: con un titolo alcuni browser condividono anche un testo separato.
          await navigator.share({ files: [file] });
          return;
        }
      }
      touchFallback();
    } catch (err) {
      // Condivisione annullata dall'utente: nessuna azione.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[whatsapp] condivisione non riuscita:", err);
      touchFallback();
    } finally {
      setBusy(false);
      onActivate?.();
    }
  };

  // Il wrapper tiene la nota sotto il pulsante senza entrare nello stile del pulsante (che può essere whitespace-nowrap).
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <button type="button" onClick={onClick} aria-busy={busy || undefined} className={cn(className, busy && "opacity-70")}>
        {busy ? "Preparazione…" : children}
      </button>
      {downloaded && (
        <span role="status" className="text-[13px] text-success">
          PDF scaricato: allegalo nella chat WhatsApp.
        </span>
      )}
    </span>
  );
}
