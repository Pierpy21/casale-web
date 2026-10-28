import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLink, buttonClasses, cn } from "@/components/ui";
import { AgendaNavLink } from "./AgendaNavLink";
import { shiftPeriod, type AgendaKindFilter, type AgendaView } from "./agenda-utils";

const VIEWS: Array<{ value: AgendaView; label: string }> = [
  { value: "month", label: "Mese" },
  { value: "week", label: "Settimana" },
  { value: "day", label: "Giorno" },
];

export interface AgendaToolbarProps {
  view: AgendaView;
  selected: string;
  today: string;
  title: string;
  isAdmin: boolean;
  /** Filtro corrente, mantenuto nei link di navigazione. */
  kind: AgendaKindFilter;
  onNavigate: (iso: string, view: AgendaView) => void;
}

/** Toolbar desktop: ‹ Oggi › + titolo del periodo, switch vista segmentato, nuova prenotazione. Il filtro tipo sta sotto il calendario. */
export function AgendaToolbar({ view, selected, today, title, isAdmin, kind, onNavigate }: AgendaToolbarProps) {
  const prev = shiftPeriod(selected, view, -1);
  const next = shiftPeriod(selected, view, 1);
  const navButton =
    "grid size-10 place-items-center rounded-btn text-petrol transition-colors duration-200 hover:bg-cream";

  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-sand pb-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate(today, view)}
          className={buttonClasses("outline", "sm")}
        >
          Oggi
        </button>
        <div className="flex items-center">
          <AgendaNavLink iso={prev} view={view} kind={kind} label="Periodo precedente" className={navButton} onNavigate={onNavigate}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </AgendaNavLink>
          <AgendaNavLink iso={next} view={view} kind={kind} label="Periodo successivo" className={navButton} onNavigate={onNavigate}>
            <ChevronRight aria-hidden="true" className="size-5" />
          </AgendaNavLink>
        </div>
        <h1 className="text-2xl capitalize lg:text-3xl">{title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Vista calendario" className="inline-flex border border-petrol">
          {VIEWS.map((item) => {
            const active = item.value === view;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => onNavigate(selected, item.value)}
                className={cn(
                  "px-4 py-2 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors duration-200",
                  active ? "bg-petrol text-paper" : "text-petrol hover:bg-cream",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {isAdmin && (
          <ButtonLink href={`/admin/prenotazioni/nuova?tipo=evento&date=${selected}`} variant="primary" size="md">
            <CalendarPlus aria-hidden="true" className="size-4" />
            Crea evento
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
