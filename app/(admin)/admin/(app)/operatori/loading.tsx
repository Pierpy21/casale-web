import { Skeleton } from "@/components/ui";

export default function OperatorsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-10">
      <span className="sr-only">Caricamento operatori in corso</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-32" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
