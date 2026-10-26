"use client";

import { Check, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markInventoryReportSeen } from "@/app/actions/inventory";
import { Alert, Button } from "@/components/ui";
import { inventoryPdfHref } from "./inventory-links";

/**
 * Condividi: con la Web Share API si invia il PDF come file (se navigator.canShare lo supporta);
 * altrimenti si apre il PDF in una nuova scheda.
 */
export function ShareReportButton({ reportId, reportDate }: { reportId: string; reportDate: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pdfHref = inventoryPdfHref(reportId);

  const openPdf = () => {
    window.open(pdfHref, "_blank", "noopener");
  };

  const share = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(pdfHref, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`PDF non disponibile (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], `giacenza-${reportDate}.pdf`, { type: "application/pdf" });
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Giacenza ${reportDate}` });
        return;
      }
      openPdf();
    } catch (err) {
      // Annullato dall'utente: nessun avviso. Altri errori: si prova ad aprire il PDF.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[giacenza] condivisione non riuscita:", err);
      setNotice("Condivisione non disponibile: il PDF si apre in una nuova scheda.");
      openPdf();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button variant="outline" size="md" onClick={share} disabled={busy} aria-busy={busy || undefined}>
        <Share2 aria-hidden="true" className="size-5" />
        {busy ? "Preparazione…" : "Condividi"}
      </Button>
      {notice && <Alert tone="info">{notice}</Alert>}
    </div>
  );
}

/** Segna il report come visto (solo admin). Dopo l'azione la pagina si ricarica dal server. */
export function MarkSeenButton({ reportId, seen }: { reportId: string; seen: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (seen) {
    return (
      <p className="inline-flex items-center gap-2 text-[15px] font-medium text-success">
        <Check aria-hidden="true" className="size-5" />
        Visto dall’amministrazione
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        variant="primary"
        size="md"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markInventoryReportSeen(reportId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <Check aria-hidden="true" className="size-5" />
        {pending ? "Salvataggio…" : "Segna come visto"}
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
