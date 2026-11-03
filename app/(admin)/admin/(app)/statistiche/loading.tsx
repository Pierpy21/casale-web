import { Skeleton } from "@/components/ui";

/** Titolo di sezione, come SectionHeading (una riga). */
function SectionHeadingSkeleton() {
  return <Skeleton className="h-6 w-40" />;
}

/**
 * Scheletro della pagina Statistiche: stessa struttura e altezze approssimate della pagina.
 * Telefono: barra in tre righe, riepilogo impilato, settimane in lista.
 * Tablet: barra in due righe. Da lg: riepilogo con card larga e conteggi accanto; da 2xl barra su una riga.
 */
export default function StatisticheLoading() {
  return (
    <div aria-busy="true" aria-label="Caricamento statistiche" className="-mt-2 flex min-w-0 flex-col gap-6 lg:-mt-4">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-44 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </header>

      {/* Barra unica: periodo, granularità, tipo. */}
      <div className="flex flex-col gap-1.5 rounded-btn border border-sand bg-paper p-1.5 sm:gap-2 sm:p-2 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-4 2xl:p-2.5">
        <div className="flex min-w-0 items-center gap-2 2xl:shrink-0">
          <Skeleton className="size-11 shrink-0" />
          <Skeleton className="h-6 min-w-0 flex-1 2xl:w-56 2xl:flex-none" />
          <Skeleton className="size-11 shrink-0" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="grid grid-cols-3 gap-1 sm:flex sm:w-80 sm:gap-2">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <Skeleton className="h-11 w-16 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <SectionHeadingSkeleton />
        <div className="grid min-w-0 gap-3 lg:grid-cols-3">
          <Skeleton className="h-36 sm:h-40 lg:col-span-2" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Skeleton className="h-24 col-span-2 lg:col-span-1" />
            <Skeleton className="h-24 col-span-2 lg:col-span-1" />
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <SectionHeadingSkeleton />
        <Skeleton className="h-5 w-4/5 max-w-md" />
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:gap-3 xl:grid-cols-4">
          <Skeleton className="h-16 lg:h-32" />
          <Skeleton className="h-16 lg:h-32" />
          <Skeleton className="h-16 lg:h-32" />
          <Skeleton className="h-16 lg:h-32" />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <SectionHeadingSkeleton />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </section>
    </div>
  );
}
