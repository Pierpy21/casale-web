import type { StatsKind, StatsPeriod } from "@/lib/types";

/** Granularità del periodo (valori URL invariati: mese, 3mesi, anno). */
export const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "mese", label: "Mese" },
  { value: "3mesi", label: "Trimestre" },
  { value: "anno", label: "Anno" },
];

/** Tipo di coperti (valori URL invariati: tutti, evento, normale). */
export const KINDS: { value: StatsKind; label: string }[] = [
  { value: "tutti", label: "Tutti" },
  { value: "evento", label: "Eventi" },
  { value: "normale", label: "Prenotazioni" },
];

/** Pallino di colore del tipo: senape per gli eventi, petrolio per le prenotazioni (come barre e riepilogo). */
export const KIND_DOT: Record<StatsKind, string | null> = {
  tutti: null,
  evento: "bg-mustard",
  normale: "bg-petrol",
};

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Link alla pagina con lo stato nell'URL. Senza `da` la pagina mostra il periodo che contiene oggi. */
export function statsHref(periodo: StatsPeriod, tipo: StatsKind, da?: string): string {
  const params = new URLSearchParams({ periodo, tipo });
  if (da) params.set("da", da);
  return `/admin/statistiche?${params.toString()}`;
}
