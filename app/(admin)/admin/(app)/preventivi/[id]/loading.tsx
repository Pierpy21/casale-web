import { Skeleton } from "@/components/ui";

export default function QuoteLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Caricamento preventivo">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-[640px] w-full" />
      </div>
    </div>
  );
}
