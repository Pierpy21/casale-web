"use client";

import { Minus, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/components/ui/cn";

export interface CountStepperProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  error?: string;
}

const STEP_BUTTON =
  "grid size-11 shrink-0 place-items-center text-petrol transition-colors duration-200 hover:bg-petrol/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent";

/**
 * Stepper per i conteggi (coperti). Controllo segmentato [ − | valore | + ].
 * Il campo può essere svuotato mentre si digita: al commit (blur o Invio) il valore
 * viene clampato tra min e max, e un valore vuoto o non valido torna a min.
 */
export function CountStepper({ id, label, value, onChange, min = 0, max, hint, error }: CountStepperProps) {
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // null = nessuna modifica in corso, mostra `value`; stringa = testo digitato (anche vuoto).
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n));
  const inRange = (n: number) => n >= min && (max === undefined || n <= max);
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    const next = clamp(Number.isFinite(parsed) ? parsed : min);
    setDraft(null);
    if (next !== value) onChange(next);
  };

  // Invio conferma: il blur è l'unico punto di commit.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const displayed = draft ?? String(value);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label id={labelId} htmlFor={id} className="min-w-0 break-words text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">
        {label}
      </label>

      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-[2px] border bg-paper transition-colors duration-200 focus-within:ring-2 focus-within:ring-petrol/40",
          error ? "border-danger" : "border-slate/70 hover:border-slate",
        )}
      >
        <button
          type="button"
          aria-label={`Diminuisci ${label.toLowerCase()}`}
          onClick={() => {
            setDraft(null);
            onChange(clamp(value - 1));
          }}
          disabled={value <= min}
          className={cn(STEP_BUTTON, "border-r border-sand")}
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>

        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={displayed}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            setDraft(digits);
            const parsed = Number.parseInt(digits, 10);
            // Aggiorna subito i totali solo con valori validi; il clamp avviene al commit.
            if (Number.isFinite(parsed) && inRange(parsed) && parsed !== value) onChange(parsed);
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-full min-w-0 flex-1 bg-transparent px-1 text-center text-xl font-medium tabular-nums text-ink focus:outline-none"
        />

        <button
          type="button"
          aria-label={`Aumenta ${label.toLowerCase()}`}
          onClick={() => {
            setDraft(null);
            onChange(clamp(value + 1));
          }}
          disabled={max !== undefined && value >= max}
          className={cn(STEP_BUTTON, "border-l border-sand")}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>

      <p
        id={error ? errorId : hint ? hintId : undefined}
        className={cn("min-h-5 min-w-0 break-words text-[13px]", error ? "text-danger" : "text-slate")}
      >
        {error ?? hint ?? ""}
      </p>
    </div>
  );
}
