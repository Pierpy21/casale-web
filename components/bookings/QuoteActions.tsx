"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, ExternalLink, FilePlus, FileText } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type FocusEvent } from "react";
import { createQuoteFromBooking } from "@/app/actions/quotes";
import { Alert, DocumentDownload, buttonClasses, cn } from "@/components/ui";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import { DOCX_MIME, quoteFileName } from "@/lib/quote-utils";

export interface PreventivoMenuProps {
  bookingId: string;
  /** Preventivo più recente, null se non ce n'è nessuno. */
  latest: { id: string; number: string } | null;
  /** Numero totale di preventivi della prenotazione (per la nota nel menu). */
  quotesCount: number;
}

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-[2px] px-2.5 text-left text-[14px] font-medium text-ink transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-petrol";
const ICON = "size-4 shrink-0 text-bronze";

/**
 * Pulsante "Preventivo" accanto al nome dell'evento (solo admin, solo eventi), compatto.
 * Con un preventivo: Scarica PDF, Scarica DOCX, Apri preventivo (il più recente).
 * Senza preventivo: Crea preventivo. Si chiude con Esc, con un clic fuori o dopo una scelta.
 * Il menu è ancorato al bordo destro del pulsante, quindi resta sempre nello schermo.
 */
export function PreventivoMenu({ bookingId, latest, quotesCount }: PreventivoMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // All'apertura il focus va sulla prima voce del menu.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        // Esc riporta il focus sul pulsante che ha aperto il menu.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitMutation("quotes.createQuoteFromBooking", createQuoteFromBooking, [bookingId], {
        label: "Nuovo preventivo",
        entity: { type: "booking", id: bookingId },
        createsTempId: true,
      });
      if (result.ok) {
        setOpen(false);
        // Offline il preventivo non ha ancora un id reale: si resta sulla prenotazione (in cache).
        if (isQueued(result)) {
          router.push(`/admin/prenotazioni/${bookingId}`);
          return;
        }
        router.push(`/admin/preventivi/${result.data.id}`);
      } else {
        setError(result.error);
      }
    });
  };

  // Il menu si chiude anche quando il focus esce dal contenitore (Tab fuori, altro controllo).
  const closeOnFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !rootRef.current?.contains(next)) setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0" onBlur={closeOnFocusOut}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Preventivo"
        title="Preventivo"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-busy={pending || undefined}
        onClick={() => setOpen((o) => !o)}
        className={buttonClasses("outline", "sm", "min-h-11 shrink-0")}
      >
        <FileText aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">{pending ? "Creazione…" : "Preventivo"}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={panelId}
          className="absolute right-0 top-full z-30 mt-2 flex w-[min(17rem,calc(100vw-2rem))] flex-col gap-1 rounded-[2px] border border-sand bg-paper p-1.5 shadow-md shadow-ink/10"
        >
          {latest ? (
            <>
              <div className="flex flex-col gap-0.5 px-2.5 pb-1.5 pt-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-bronze">Preventivo più recente</span>
                <span className="text-[14px] text-ink wrap-anywhere">n. {latest.number}</span>
                {quotesCount > 1 && (
                  <span className="text-[12px] text-slate-dark">
                    {quotesCount} preventivi: elenco in Pagamenti e acconti
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 border-t border-sand pt-1">
                <DocumentDownload
                  href={`/api/quotes/${latest.id}/pdf`}
                  fileName={quoteFileName(latest.number, "pdf")}
                  mimeType="application/pdf"
                  className={ITEM}
                  onActivate={() => setOpen(false)}
                >
                  <Download aria-hidden="true" className={ICON} />
                  Scarica PDF
                </DocumentDownload>
                <DocumentDownload
                  href={`/api/quotes/${latest.id}/docx`}
                  fileName={quoteFileName(latest.number, "docx")}
                  mimeType={DOCX_MIME}
                  className={ITEM}
                  onActivate={() => setOpen(false)}
                >
                  <Download aria-hidden="true" className={ICON} />
                  Scarica DOCX
                </DocumentDownload>
                <Link href={`/admin/preventivi/${latest.id}`} className={ITEM} onClick={() => setOpen(false)}>
                  <ExternalLink aria-hidden="true" className={ICON} />
                  Apri preventivo
                </Link>
              </div>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={create} className={cn(ITEM, "disabled:opacity-50")}>
              <FilePlus aria-hidden="true" className={ICON} />
              Crea preventivo
            </button>
          )}
          {error && (
            <div className="px-1 pb-1 pt-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
