"use client";

import { Minus, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/components/ui/cn";

export interface InventoryQuantityStepperProps {
  /** Id univoco del campo numerico (es. "stock-<productId>"). */
  id: string;
  /** Etichetta visibile, es. "Giacenza" o "Da ordinare". */
  label: string;
  /** Nome del prodotto, usato solo nelle etichette accessibili dei pulsanti. */
  itemName: string;
  /** Quantità intera >= 0. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const STEP_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center text-petrol transition-colors duration-200 hover:bg-petrol/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent";

/**
 * Stepper compatto per una quantità di giacenza: [ − | numero | + ], con il numero digitabile.
 * Il campo può essere svuotato mentre si digita: al commit (blur o Invio) un valore vuoto torna a 0.
 */
export function InventoryQuantityStepper({ id, label, itemName, value, onChange, disabled }: InventoryQuantityStepperProps) {
  const labelId = `${id}-label`;
  // null = nessuna modifica in corso; stringa = testo digitato (anche vuoto).
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setDraft(null);
    if (next !== value) onChange(next);
  };

  const displayed = draft ?? String(value);
  const lowerLabel = label.toLowerCase();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-dark">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "flex h-11 min-w-0 items-stretch overflow-hidden rounded-btn border border-slate/70 bg-paper transition-colors duration-200 hover:border-slate focus-within:ring-2 focus-within:ring-petrol/40",
          disabled && "opacity-60",
        )}
      >
        <button
          type="button"
          aria-label={`Diminuisci ${lowerLabel} di ${itemName}`}
          disabled={disabled || value <= 0}
          onClick={() => {
            setDraft(null);
            onChange(Math.max(0, value - 1));
          }}
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
          disabled={disabled}
          value={displayed}
          aria-label={`${label} di ${itemName}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setDraft(digits);
            const parsed = Number.parseInt(digits, 10);
            if (Number.isFinite(parsed) && parsed !== value) onChange(parsed);
          }}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1 text-center text-[18px] font-medium tabular-nums text-ink focus:outline-none disabled:cursor-not-allowed"
        />

        <button
          type="button"
          aria-label={`Aumenta ${lowerLabel} di ${itemName}`}
          disabled={disabled}
          onClick={() => {
            setDraft(null);
            onChange(value + 1);
          }}
          className={cn(STEP_BUTTON, "border-l border-sand")}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
