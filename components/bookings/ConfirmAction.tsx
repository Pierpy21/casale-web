"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import type { ActionResult } from "@/lib/types";

export interface ConfirmActionProps {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: "danger" | "outline";
  run: () => Promise<ActionResult<unknown>>;
  onSuccess: () => void;
}

/** Bottone che apre una finestra di conferma e poi esegue un'azione server. */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  variant = "danger",
  run,
  onSuccess,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) {
        setOpen(false);
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button
        variant={variant === "danger" ? "danger" : "outline"}
        size="md"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Annulla
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              onClick={confirm}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending ? (pendingLabel ?? "Attendere…") : confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-slate-dark">{description}</p>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
      </Modal>
    </>
  );
}
