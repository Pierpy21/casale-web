import { Skeleton } from "@/components/ui";

export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Caricamento giacenza">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex flex-col gap-4 rounded-[2px] border border-sand bg-paper p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
