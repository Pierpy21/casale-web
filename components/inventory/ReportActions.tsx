"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markInventoryReportSeen } from "@/app/actions/inventory";
import { Alert, Button } from "@/components/ui";

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
