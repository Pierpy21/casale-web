import { Skeleton } from "@/components/ui";

export default function ClientsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Caricamento clienti in corso</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-16 w-full max-w-md" />
      <Skeleton className="hidden h-96 lg:block" />
      <div className="grid gap-3 lg:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
