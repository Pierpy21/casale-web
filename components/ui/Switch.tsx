"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type" | "children"> {
  /** Stato corrente (aria-checked). */
  checked: boolean;
  /** Chiamata con il nuovo valore (click, Spazio o Invio). */
  onCheckedChange: (checked: boolean) => void;
  /** Nome accessibile dell'interruttore, es. "Menù Autunno". */
  label: string;
  /** Testo visibile quando attivo. */
  onLabel?: string;
  /** Testo visibile quando non attivo. */
  offLabel?: string;
}

/** Interruttore on/off (role="switch") con stato testuale, in stile Menù & Sale. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  onLabel = "Attivo",
  offLabel = "Disattivato",
  disabled,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex shrink-0 items-center gap-3 rounded-[2px] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-wait disabled:opacity-70",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-300",
          checked ? "border-petrol bg-petrol" : "border-slate/60 bg-cream",
        )}
      >
        <span
          className={cn(
            // Pista 24px con bordo 1px = 22px interni: pallino 20px a 1px dai bordi, centrato in entrambe le posizioni.
            "absolute left-px top-px size-5 rounded-full bg-paper shadow-sm transition-transform duration-300 ease-out",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
      <span
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.14em]",
          checked ? "text-petrol" : "text-slate-dark",
        )}
      >
        {checked ? onLabel : offLabel}
      </span>
    </button>
  );
}
