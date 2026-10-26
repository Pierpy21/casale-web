import { Skeleton } from "@/components/ui";

export default function EditBookingLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Caricamento prenotazione">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-[2px] border border-sand bg-paper p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}
