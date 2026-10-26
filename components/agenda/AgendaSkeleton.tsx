import { Skeleton } from "@/components/ui";

/** Stato di caricamento dell'agenda: stessa struttura del calendario mensile (desktop e mobile). */
export function AgendaSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Caricamento agenda in corso</span>

      <div className="hidden flex-col gap-6 lg:flex">
        <div className="flex items-center justify-between gap-4 border-b border-sand pb-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-8 w-56" />
          </div>
          <Skeleton className="h-10 w-72" />
        </div>
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-[10rem] rounded-none" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="mx-auto h-11 w-9 rounded-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  );
}
