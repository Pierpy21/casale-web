import { cn } from "@/components/ui/cn";
import type { StatsKind, StatsPeriod } from "@/lib/types";

export const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "mese", label: "1 mese" },
  { value: "3mesi", label: "3 mesi" },
  { value: "anno", label: "1 anno" },
];

export const KINDS: { value: StatsKind; label: string }[] = [
  { value: "tutti", label: "Tutti" },
  { value: "evento", label: "Eventi" },
  { value: "normale", label: "Prenotazioni" },
];

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Link alla pagina con lo stato nell'URL. Senza `da` la pagina mostra il periodo che contiene oggi. */
export function statsHref(periodo: StatsPeriod, tipo: StatsKind, da?: string): string {
  const params = new URLSearchParams({ periodo, tipo });
  if (da) params.set("da", da);
  return `/admin/statistiche?${params.toString()}`;
}

export const SEGMENT_LIST = "grid grid-cols-3 gap-1 rounded-lg border border-field-edge bg-cream/70 p-1 lg:inline-flex";

export function segmentLinkClass(active: boolean): string {
  return cn(
    "flex min-h-11 w-full items-center justify-center rounded-md px-3 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors duration-200 lg:px-5",
    FOCUS,
    active ? "bg-petrol text-paper shadow-sm shadow-ink/10" : "text-petrol hover:bg-paper",
  );
}
