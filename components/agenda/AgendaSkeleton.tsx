import { Skeleton } from "@/components/ui";

/** Stato di caricamento dell'agenda: stessa struttura del calendario mensile (desktop e mobile). */
export function AgendaSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Caricamento agenda in corso</span>

      <div className="hidden flex-col gap-6 desk:flex">
        <div className="flex flex-col gap-3 border-b border-sand pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-11 rounded-btn" />
            <Skeleton className="size-11 rounded-btn" />
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-10 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-[10rem] rounded-none" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 desk:hidden">
        <div className="flex flex-col gap-3 border-b border-sand pb-2">
          <div className="flex items-center justify-center gap-2">
            <Skeleton className="size-11 rounded-btn" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="size-11 rounded-btn" />
          </div>
          <Skeleton className="h-11 w-full rounded-full" />
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
