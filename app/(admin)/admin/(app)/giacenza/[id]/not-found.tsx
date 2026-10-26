import { ButtonLink, EmptyState } from "@/components/ui";

export default function InventoryReportNotFound() {
  return (
    <EmptyState
      title="Giacenza non trovata"
      description="Il report non esiste o non è più disponibile."
      action={
        <ButtonLink href="/admin/giacenza" variant="outline" size="md">
          Torna alla giacenza
        </ButtonLink>
      }
    />
  );
}
