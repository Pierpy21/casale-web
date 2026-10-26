"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createQuoteFromBooking } from "@/app/actions/quotes";
import { Alert, Button } from "@/components/ui";

/** Crea il preventivo dalla prenotazione (righe automatiche) e apre l'editor. */
export function CreateQuoteButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          variant="primary"
          size="md"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createQuoteFromBooking(bookingId);
              if (result.ok) {
                router.push(`/admin/preventivi/${result.data.id}`);
              } else {
                setError(result.error);
              }
            });
          }}
        >
          {pending ? "Creazione in corso…" : "Crea preventivo"}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
