import { CalendarPlus } from "lucide-react";
import { CREATE_EVENT_HREF } from "@/components/shell/nav";
import { ButtonLink, TopBar } from "@/components/ui";
import {
  AGENDA_KIND_OPTIONS,
  agendaHref,
  periodTitle,
  shiftPeriod,
  type AgendaKindFilter,
  type AgendaView,
} from "./agenda-utils";

const VIEWS: Array<{ value: AgendaView; label: string }> = [
  { value: "month", label: "Mese" },
  { value: "week", label: "Settimana" },
  { value: "day", label: "Giorno" },
];

/** Pallino del filtro tipo: senape per gli eventi, petrolio per le prenotazioni (come nelle statistiche). */
const KIND_DOT: Record<AgendaKindFilter, string | null> = {
  tutti: null,
  eventi: "bg-mustard",
  prenotazioni: "bg-petrol",
};

export interface AgendaToolbarProps {
  view: AgendaView;
  selected: string;
  today: string;
  isAdmin: boolean;
  /** Filtro corrente, mantenuto nei link di navigazione. */
  kind: AgendaKindFilter;
  /** Telefono e tablet: il periodo è sempre il mese (come la griglia sotto) e non ci sono tab di vista. */
  compact?: boolean;
  onNavigate: (iso: string, view: AgendaView) => void;
  onKindChange: (kind: AgendaKindFilter) => void;
}

/**
 * Barra in cima all'agenda, stessa struttura delle statistiche (TopBar): ‹ periodo › + Oggi, tab di vista (solo desktop),
 * filtro per tipo e "Crea evento" (admin). Il click cambia periodo nel client; il link resta valido senza JS.
 */
export function AgendaToolbar({
  view,
  selected,
  today,
  isAdmin,
  kind,
  compact = false,
  onNavigate,
  onKindChange,
}: AgendaToolbarProps) {
  const period: AgendaView = compact ? "month" : view;
  const step = (iso: string) => ({
    href: agendaHref({ date: iso, view, kind }),
    prefetch: true,
    onSelect: () => onNavigate(iso, view),
  });

  return (
    <TopBar
      aria-label="Agenda: periodo e filtri"
      titleAs="h1"
      prev={{ ...step(shiftPeriod(selected, period, -1)), label: "Periodo precedente" }}
      next={{ ...step(shiftPeriod(selected, period, 1)), label: "Periodo successivo" }}
      title={periodTitle(period, selected)}
      today={{ href: agendaHref({ date: today, view, kind }), onSelect: () => onNavigate(today, view) }}
      tabs={
        compact
          ? undefined
          : {
              label: "Vista calendario",
              items: VIEWS.map((item) => ({
                key: item.value,
                label: item.label,
                href: agendaHref({ date: selected, view: item.value, kind }),
                active: item.value === view,
                onSelect: () => onNavigate(selected, item.value),
              })),
            }
      }
      chips={{
        label: "Filtra per tipo",
        items: AGENDA_KIND_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          href: agendaHref({ date: selected, view, kind: option.value }),
          active: option.value === kind,
          dot: KIND_DOT[option.value],
          onSelect: () => onKindChange(option.value),
        })),
      }}
      action={
        isAdmin ? (
          <ButtonLink href={`${CREATE_EVENT_HREF}&date=${selected}`} variant="primary" size="md">
            <CalendarPlus aria-hidden="true" className="size-4" />
            Crea evento
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
