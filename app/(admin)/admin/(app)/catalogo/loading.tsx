import { Skeleton } from "@/components/ui";

export default function CatalogLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Caricamento catalogo in corso</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}
