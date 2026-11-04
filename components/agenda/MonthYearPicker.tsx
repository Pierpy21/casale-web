"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { capitalize, formatIt } from "./agenda-utils";
import { cn } from "@/components/ui/cn";

export interface MonthYearPickerProps {
  /** Giorno selezionato: il pulsante mostra il suo mese e anno. */
  value: Date;
  /** Scelta di mese (0-11) e anno. */
  onPick: (year: number, month: number) => void;
  /** Allineamento del pannello rispetto al pulsante (default centrato). */
  align?: "center" | "start";
  /** Classi del testo del pulsante (default 16px medio, come nella dashboard). */
  labelClassName?: string;
  /** Testo del pulsante al posto di "mese anno" (es. il periodo della settimana in agenda). */
  label?: string;
}

const MONTHS = Array.from({ length: 12 }, (_, month) => capitalize(formatIt(new Date(2000, month, 1), "LLL")));

/**
 * Mese e anno cliccabili: aprono un pannello con l'anno (frecce) e i 12 mesi.
 * Si chiude scegliendo un mese, con Esc o con un clic fuori.
 */
export function MonthYearPicker({ value, onPick, align = "center", labelClassName, label }: MonthYearPickerProps) {
  const text = label ?? capitalize(formatIt(value, "LLLL yyyy"));
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    // All'apertura il pannello parte dall'anno del giorno selezionato.
    if (!open) setYear(value.getFullYear());
    setOpen((o) => !o);
  };

  const currentMonth = value.getMonth();
  const currentYear = value.getFullYear();

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${text}: scegli mese e anno`}
        className={cn(
          "inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol",
          align === "center" ? "px-3 hover:bg-paper" : "-ml-2 px-2 hover:bg-cream",
        )}
      >
        <span aria-live="polite" className={cn("truncate", labelClassName ?? "text-[16px] font-medium")}>
          {text}
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-petrol transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Scegli mese e anno"
          className={cn(
            "absolute top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-sand bg-paper p-3 shadow-lg shadow-ink/15",
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Anno precedente" className={YEAR_BUTTON}>
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <p aria-live="polite" className="font-serif text-xl tabular-nums text-ink">
              {year}
            </p>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Anno successivo" className={YEAR_BUTTON}>
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </div>
          <ul className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((label, month) => {
              const active = year === currentYear && month === currentMonth;
              return (
                <li key={label}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onPick(year, month);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol",
                      active ? "bg-petrol text-paper" : "text-ink hover:bg-cream",
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

const YEAR_BUTTON =
  "inline-flex size-10 items-center justify-center rounded-lg text-ink transition-colors duration-200 hover:bg-cream hover:text-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol";
