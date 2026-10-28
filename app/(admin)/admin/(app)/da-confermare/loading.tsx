import { Skeleton } from "@/components/ui";

export default function DaConfermareLoading() {
  return (
    <div aria-busy="true" aria-label="Caricamento da confermare" className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-48" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
