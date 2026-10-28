import { AGENDA_KIND_OPTIONS, type AgendaKindFilter } from "./agenda-utils";
import { cn } from "@/components/ui/cn";

export interface AgendaKindSwitchProps {
  value: AgendaKindFilter;
  onChange: (value: AgendaKindFilter) => void;
  className?: string;
}

/**
 * Filtro segmentato "Tutti · Eventi · Prenotazioni" di ogni agenda (stesso tema dello switch vista).
 * Su mobile occupa la larghezza disponibile in tre colonne, con tap target di 44px.
 */
export function AgendaKindSwitch({ value, onChange, className }: AgendaKindSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Filtra per tipo"
      className={cn("grid w-full grid-cols-3 gap-1 rounded-lg border border-petrol/40 bg-cream/60 p-1 lg:inline-flex lg:w-auto", className)}
    >
      {AGENDA_KIND_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 min-w-0 rounded-md px-1 text-[10px] font-medium uppercase tracking-[0.04em] transition-colors duration-200 min-[400px]:px-2 min-[400px]:text-[11px] min-[400px]:tracking-[0.08em] lg:min-h-0 lg:px-4 lg:py-2 lg:text-[12px] lg:tracking-[0.14em]",
              active ? "bg-petrol text-paper shadow-sm shadow-ink/10" : "text-petrol hover:bg-paper",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
