import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Riga di contesto sotto il numero (una riga, testo piccolo). */
  hint?: ReactNode;
  /** Evidenzia il valore (es. prenotazioni in attesa). */
  highlight?: boolean;
  className?: string;
}

/** Indicatore compatto: etichetta maiuscoletto bronzo, numero in serif tabulare. Usato in dashboard e riepilogo giornata. */
export function Stat({ label, value, hint, highlight = false, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-btn border border-sand bg-paper px-3 py-2.5 shadow-sm shadow-ink/5 sm:px-4 sm:py-3",
        highlight && "border-warning/60 bg-warning/10",
        className,
      )}
    >
      <p className="break-words text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-bronze sm:text-[11px] sm:tracking-[0.14em]">
        {label}
      </p>
      <p className="font-serif text-2xl leading-none tabular-nums text-ink sm:text-3xl">{value}</p>
      {hint !== undefined && hint !== null && hint !== false && (
        <p className="break-words text-[11px] leading-snug text-slate-dark sm:text-[12px]">{hint}</p>
      )}
    </div>
  );
}
