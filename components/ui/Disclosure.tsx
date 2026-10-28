"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface DisclosureProps {
  /** Intestazione cliccabile. Il testo usa la tipografia del brand (vedi `summaryClassName`). */
  summary: ReactNode;
  children: ReactNode;
  /** Stato iniziale quando non è controllato. */
  defaultOpen?: boolean;
  /** Stato controllato. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classi del contenitore esterno. */
  className?: string;
  /**
   * Classi del pulsante di intestazione. Sostituiscono le classi tipografiche di default
   * (label maiuscola 12px slate-dark), quindi per un titolo serif passa anche le sue classi.
   */
  summaryClassName?: string;
  /** Classi dell'area espansa. */
  contentClassName?: string;
  /** Badge o contatore a destra, prima della freccia. */
  aside?: ReactNode;
}

const BASE_SUMMARY =
  "flex w-full min-w-0 items-center justify-between gap-3 rounded-btn text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol";

const DEFAULT_SUMMARY =
  "min-h-11 text-[12px] font-medium uppercase tracking-[0.12em] text-slate-dark hover:text-ink";

/** Tendina accessibile (pulsante + aria-expanded/aria-controls) senza marker di sistema. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  summaryClassName,
  contentClassName,
  aside,
}: DisclosureProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const panelId = `${useId()}-panel`;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(BASE_SUMMARY, summaryClassName ?? DEFAULT_SUMMARY)}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <span className="flex shrink-0 items-center gap-2">
          {aside}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-petrol transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={cn("min-h-0 overflow-hidden", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
