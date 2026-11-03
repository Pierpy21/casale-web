import { TopBar } from "@/components/ui";
import { StatsMonthPicker } from "./StatsMonthPicker";
import type { StatsKind, StatsPeriod } from "@/lib/types";
import { KIND_DOT, KINDS, PERIODS, statsHref } from "./shared";

export interface StatsControlsProps {
  periodo: StatsPeriod;
  tipo: StatsKind;
  /** Primo del mese di ancoraggio (YYYY-MM-01) del periodo mostrato: granularità e tipo lo conservano. */
  anchor: string;
  prevAnchor: string;
  nextAnchor: string;
  label: string;
  /** Vero se il periodo mostrato contiene oggi: in quel caso non serve il link "Oggi". */
  current: boolean;
}

/**
 * Barra delle statistiche (dentro PinnedBar): periodo (frecce + nome + "Oggi"), granularità (tab) e tipo (pillole).
 * Struttura condivisa con l'agenda (TopBar). Solo link: lo stato sta nell'URL.
 */
export function StatsControls({ periodo, tipo, anchor, prevAnchor, nextAnchor, label, current }: StatsControlsProps) {
  return (
    <TopBar
      aria-label="Periodo e filtri"
      prev={{ href: statsHref(periodo, tipo, prevAnchor), label: "Periodo precedente" }}
      next={{ href: statsHref(periodo, tipo, nextAnchor), label: "Periodo successivo" }}
      title={<StatsMonthPicker periodo={periodo} tipo={tipo} anchor={anchor} label={label} />}
      today={current ? undefined : { href: statsHref(periodo, tipo) }}
      tabs={{
        label: "Granularità del periodo",
        items: PERIODS.map((option) => ({
          key: option.value,
          label: option.label,
          href: statsHref(option.value, tipo, anchor),
          active: option.value === periodo,
        })),
      }}
      chips={{
        label: "Tipo di prenotazione",
        items: KINDS.map((option) => ({
          key: option.value,
          label: option.label,
          href: statsHref(periodo, option.value, anchor),
          active: option.value === tipo,
          dot: KIND_DOT[option.value],
        })),
      }}
    />
  );
}
