import { Skeleton } from "@/components/ui";

export default function ClientDetailLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Caricamento scheda cliente in corso</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Skeleton className="h-[28rem]" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    </div>
  );
}
