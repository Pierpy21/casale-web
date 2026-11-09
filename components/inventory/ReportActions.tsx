"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteInventoryReport, markInventoryReportSeen } from "@/app/actions/inventory";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { ConfirmAction } from "@/components/bookings/ConfirmAction";
import { Alert, Button } from "@/components/ui";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation } from "@/lib/offline/submit";

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
            const result = await submitMutation("inventory.markInventoryReportSeen", markInventoryReportSeen, [reportId], {
              label: "Report giacenza · segnato come visto",
              entity: { type: "inventory_report", id: reportId },
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (isBrowserOnline() && !isQueued(result)) router.refresh();
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

/**
 * Elimina la giacenza (testata e righe), solo admin e amministratore cucina. Dopo la conferma (anche se la modifica
 * è in coda offline) si torna all'elenco delle giacenze.
 */
export function DeleteReportButton({ reportId, reportDate }: { reportId: string; reportDate: string }) {
  const router = useRouter();
  const day = formatIt(toDate(reportDate), "EEEE d MMMM yyyy");

  return (
    <ConfirmAction
      label="Elimina giacenza"
      variant="danger"
      title="Eliminare la giacenza?"
      description={`La giacenza del ${day} e tutte le sue righe verranno eliminate. L’operazione non si può annullare.`}
      confirmLabel="Elimina definitivamente"
      pendingLabel="Eliminazione…"
      run={() =>
        submitMutation("inventory.deleteInventoryReport", deleteInventoryReport, [reportId], {
          label: "Giacenza eliminata",
          entity: { type: "inventory_report", id: reportId },
        })
      }
      onSuccess={() => {
        router.replace("/admin/giacenza");
        router.refresh();
      }}
    />
  );
}
