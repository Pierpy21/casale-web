import { Skeleton } from "@/components/ui";

export default function SincronizzazioneLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Caricamento sincronizzazione">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
