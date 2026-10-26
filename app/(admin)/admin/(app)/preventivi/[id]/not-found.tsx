import { ButtonLink, EmptyState } from "@/components/ui";

export default function QuoteNotFound() {
  return (
    <EmptyState
      title="Preventivo non trovato"
      description="Il preventivo non esiste o è stato eliminato."
      action={
        <ButtonLink href="/admin/agenda" variant="outline" size="md">
          Torna all’agenda
        </ButtonLink>
      }
    />
  );
}
