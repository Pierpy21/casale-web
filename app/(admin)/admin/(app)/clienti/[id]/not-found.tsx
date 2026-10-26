import { ButtonLink, EmptyState } from "@/components/ui";

export default function ClientNotFound() {
  return (
    <EmptyState
      title="Cliente non trovato"
      description="Il cliente non esiste o è stato eliminato."
      action={
        <ButtonLink href="/admin/clienti" variant="outline" size="md">
          Torna ai clienti
        </ButtonLink>
      }
    />
  );
}
