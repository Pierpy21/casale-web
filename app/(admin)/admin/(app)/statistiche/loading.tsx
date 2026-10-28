import { Skeleton } from "@/components/ui";

export default function StatisticheLoading() {
  return (
    <div aria-busy="true" aria-label="Caricamento statistiche" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <Skeleton className="col-span-2 h-24 lg:col-span-1" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
