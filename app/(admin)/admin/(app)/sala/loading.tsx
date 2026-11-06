import { Skeleton } from "@/components/ui";

/**
 * Scheletro della Mappa sala: barra del giorno compatta e scena a tutta altezza (come FloorPlanBoard).
 */
export default function SalaLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Caricamento mappa sala"
      className="flex h-[calc(100dvh-14rem)] min-h-[20rem] min-w-0 flex-col gap-2 sm:gap-3 desk:h-[calc(100dvh-5rem)]"
    >
      <Skeleton className="h-12 w-full shrink-0 rounded-xl" />
      <Skeleton className="min-h-0 w-full flex-1" />
    </div>
  );
}
