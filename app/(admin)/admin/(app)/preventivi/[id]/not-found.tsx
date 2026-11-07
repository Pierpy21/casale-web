import { ButtonLink, EmptyState } from "@/components/ui";

export default function QuoteNotFound() {
  return (
    <EmptyState
      title="Ordine di servizio non trovato"
      description="L’ordine di servizio non esiste o è stato eliminato."
      action={
        <ButtonLink href="/admin/agenda" variant="outline" size="md">
          Torna all’agenda
        </ButtonLink>
      }
    />
  );
}
