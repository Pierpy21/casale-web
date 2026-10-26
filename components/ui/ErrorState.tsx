"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./cn";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  reset?: () => void;
  /** true mentre la pagina si sta ricaricando per un nuovo deploy: mostra un avviso sobrio. */
  updating?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Qualcosa non ha funzionato",
  message = "Non è stato possibile caricare i dati. Riprova tra poco.",
  reset,
  updating = false,
  className,
}: ErrorStateProps) {
  if (updating) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-col items-center gap-3 px-6 py-12 text-center text-slate-dark",
          className,
        )}
      >
        <p className="text-[15px]">Aggiornamento dell&apos;app in corso…</p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-[2px] border border-danger/30 bg-danger/5 px-6 py-12 text-center",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-7 text-danger" />
      <h2 className="text-xl text-ink">{title}</h2>
      <p className="max-w-sm text-[15px] text-slate-dark">{message}</p>
      {reset && (
        <Button variant="outline" size="sm" className="mt-2" onClick={reset}>
          Riprova
        </Button>
      )}
    </div>
  );
}
