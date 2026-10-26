import { Skeleton } from "@/components/ui";

export default function BookingDetailLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Caricamento prenotazione">
      <div className="flex flex-col gap-4 border-b border-sand pb-8">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-12 w-96 max-w-full" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
