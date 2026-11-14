import { AGENDA_MEAL_OPTIONS, type AgendaMealFilter } from "./agenda-utils";
import { cn } from "@/components/ui/cn";

export interface AgendaMealSwitchProps {
  value: AgendaMealFilter;
  onChange: (value: AgendaMealFilter) => void;
  className?: string;
}

/**
 * Filtro pasto "Tutti · Pranzo · Cena" della giornata, sulla stessa riga della legenda stati.
 * Stile delle pillole della barra (piene in inchiostro se attive, contorno se no), più piccole.
 * Tap target di 44px su touch; su desktop si riducono.
 */
export function AgendaMealSwitch({ value, onChange, className }: AgendaMealSwitchProps) {
  return (
    <div role="group" aria-label="Filtra per pasto" className={cn("flex shrink-0 flex-wrap items-center gap-1.5", className)}>
      {AGENDA_MEAL_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-200 desk:min-h-0 desk:px-3 desk:py-1 desk:text-[12px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
              active
                ? "border-ink bg-ink text-paper"
                : "border-field-edge bg-paper text-ink hover:border-field-edge-hover hover:bg-cream",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
