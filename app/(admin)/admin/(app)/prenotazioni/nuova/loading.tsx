import { Skeleton } from "@/components/ui";

export default function NewBookingLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Caricamento modulo prenotazione">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-[2px] border border-sand bg-paper p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}
