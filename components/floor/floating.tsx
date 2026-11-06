"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/components/ui/cn";

/*
 * Comandi flottanti sovrapposti alla piantina e alla stanza: piccoli, carta semi-opaca con ombra leggera,
 * tocco ≥ 40 px. Nessuna fusione di classi (cn concatena): ogni tono ha il suo set completo di colori.
 */

/** Superficie delle pillole informative (nome sala, riepilogo). */
export const FLOAT_SURFACE = "rounded-lg border border-ink/10 bg-paper/90 shadow-sm shadow-ink/15 backdrop-blur-[2px]";

const BUTTON_BASE =
  "inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium shadow-sm shadow-ink/15 backdrop-blur-[2px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:opacity-50";

const TONES = {
  default: "border-ink/10 bg-paper/90 text-ink hover:bg-field",
  /** Menu aperto o filtro attivo. */
  active: "border-ink bg-ink text-paper hover:bg-ink-deep",
  primary: "border-petrol bg-petrol text-paper hover:bg-petrol-hover",
} as const;

export type FloatTone = keyof typeof TONES;

export interface FloatButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Testo del pulsante; resta il nome accessibile anche quando è nascosto. */
  label: string;
  icon?: ReactNode;
  /** always: testo sempre visibile. sm: solo icona su telefono. never: solo icona. */
  showLabel?: "always" | "sm" | "never";
  tone?: FloatTone;
  /** Contenuto dopo il testo (es. contatore). */
  badge?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function FloatButton({ label, icon, showLabel = "sm", tone = "default", badge, className, ref, title, ...props }: FloatButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      title={showLabel === "always" ? title : title ?? label}
      className={cn(BUTTON_BASE, TONES[tone], className)}
      {...props}
    >
      {icon}
      <span className={cn(showLabel === "never" ? "sr-only" : showLabel === "sm" ? "max-sm:sr-only" : undefined)}>{label}</span>
      {badge}
    </button>
  );
}

/** Contatore tondo dentro un FloatButton (es. "Da sistemare 3"). */
export function CountBadge({ count, alert }: { count: number; alert?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 tabular-nums",
        alert ? "bg-warning text-ink" : "bg-cream text-slate-dark",
      )}
    >
      {count}
    </span>
  );
}

/** Avviso d'errore flottante in fondo alla scena, chiudibile. */
export function FloatingError({ message, onDismiss, className }: { message: string; onDismiss: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "absolute inset-x-2 z-30 mx-auto flex max-w-md items-start gap-2 rounded-lg border border-danger/40 bg-paper px-3 py-2 text-[13px] text-danger shadow-md shadow-ink/20",
        className,
      )}
    >
      <p className="min-w-0 flex-1 py-1.5">{message}</p>
      <button
        type="button"
        aria-label="Chiudi avviso"
        onClick={onDismiss}
        className="grid size-9 shrink-0 place-items-center rounded-[2px] text-slate-dark hover:bg-cream"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** Legenda (contenuto del popover "i"): tavolo libero, prenotato, in attesa, sala riservata da un evento. */
export function FloorLegend() {
  const item = "flex items-center gap-2.5 text-[14px] text-ink";
  return (
    <ul aria-label="Legenda" className="flex flex-col gap-2.5">
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] border border-ink/30 bg-field" />
        Libero
      </li>
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] bg-petrol" />
        Prenotato
      </li>
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] bg-warning" />
        In attesa (opzione)
      </li>
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] border border-mustard/50 bg-mustard/25" />
        Sala riservata (evento)
      </li>
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] bg-mustard" />
        Tavolo di un evento
      </li>
      <li className={item}>
        <span aria-hidden="true" className="size-4 shrink-0 rounded-[2px] border border-dashed border-petrol bg-field" />
        Da salvare (anteprima)
      </li>
      <li className="pt-1 text-[13px] leading-relaxed text-slate-dark">Griglia a puntini: 1 metro. Tocca un tavolo per aprire il suo menu.</li>
    </ul>
  );
}
