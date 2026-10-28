import { Skeleton } from "@/components/ui";

export default function RegistroLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Caricamento registro attività">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-20" />
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-32" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
