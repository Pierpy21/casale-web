"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient } from "@/app/actions/clients";
import { Alert, Button, Modal } from "@/components/ui";

export interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
}

/** Elimina il cliente dopo conferma. Se ha prenotazioni, l'errore del server viene mostrato nella finestra. */
export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setError(null);
    setOpen(true);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteClient(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin/clienti");
    });
  }

  return (
    <>
      <Button variant="danger" size="md" onClick={handleOpen}>
        Elimina cliente
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Eliminare il cliente?"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setOpen(false)} disabled={pending}>
              Annulla
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleDelete}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending ? "Eliminazione…" : "Elimina"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
          <p>
            Stai per eliminare <strong className="font-medium">{clientName}</strong>. L&rsquo;operazione non
            può essere annullata.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </Modal>
    </>
  );
}
