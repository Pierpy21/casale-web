import { ButtonLink, EmptyState } from "@/components/ui";

export default function BookingNotFound() {
  return (
    <EmptyState
      title="Prenotazione non trovata"
      description="La prenotazione non esiste o è stata eliminata."
      action={
        <ButtonLink href="/admin/agenda" variant="outline" size="md">
          Torna all’agenda
        </ButtonLink>
      }
    />
  );
}
