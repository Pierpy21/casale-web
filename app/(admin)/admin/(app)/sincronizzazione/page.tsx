import type { Metadata } from "next";
import { SyncQueueList } from "@/components/offline/SyncQueueList";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sincronizzazione · Casale del Notaio",
};

export default function SincronizzazionePage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        compact
        eyebrow="Offline"
        title="Sincronizzazione"
        description="Modifiche salvate su questo dispositivo, in attesa di invio. Vengono inviate da sole appena torna la rete."
      />
      <SyncQueueList />
    </div>
  );
}
