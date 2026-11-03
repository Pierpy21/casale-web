"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { capitalize, formatIt } from "@/components/agenda/agenda-utils";
import { cn } from "@/components/ui/cn";

export interface MonthYearPickerProps {
  /** Giorno selezionato: il pulsante mostra il suo mese e anno. */
  value: Date;
  /** Scelta di mese (0-11) e anno. */
  onPick: (year: number, month: number) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, month) => capitalize(formatIt(new Date(2000, month, 1), "LLL")));

/**
 * Mese e anno cliccabili: aprono un pannello con l'anno (frecce) e i 12 mesi.
 * Si chiude scegliendo un mese, con Esc o con un clic fuori.
 */
export function MonthYearPicker({ value, onPick }: MonthYearPickerProps) {
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
        aria-label={`${capitalize(formatIt(value, "LLLL yyyy"))}: scegli mese e anno`}
        className="inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-3 text-[16px] font-medium text-ink transition-colors duration-200 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
      >
        <span aria-live="polite" className="truncate">
          {capitalize(formatIt(value, "LLLL yyyy"))}
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-petrol transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Scegli mese e anno"
          className="absolute left-1/2 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-sand bg-paper p-3 shadow-lg shadow-ink/15"
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
