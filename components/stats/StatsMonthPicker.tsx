"use client";

import { useRouter } from "next/navigation";
import { MonthYearPicker } from "@/components/agenda/MonthYearPicker";
import { toDate } from "@/components/agenda/agenda-utils";
import type { StatsKind, StatsPeriod } from "@/lib/types";
import { statsHref } from "./shared";

export interface StatsMonthPickerProps {
  periodo: StatsPeriod;
  tipo: StatsKind;
  /** Primo del mese del periodo mostrato (YYYY-MM-01). */
  anchor: string;
  /** Nome del periodo mostrato sul pulsante. */
  label: string;
}

/** Periodo cliccabile delle statistiche: scelti mese e anno, il periodo parte da quel mese (granularità e tipo restano). */
export function StatsMonthPicker({ periodo, tipo, anchor, label }: StatsMonthPickerProps) {
  const router = useRouter();
  return (
    <MonthYearPicker
      value={toDate(anchor)}
      label={label}
      onPick={(year, month) => {
        const da = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        router.push(statsHref(periodo, tipo, da), { scroll: false });
      }}
    />
  );
}
