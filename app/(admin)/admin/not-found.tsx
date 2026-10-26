import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <EmptyState
        title="Pagina non trovata"
        description="L’indirizzo che hai aperto non esiste o è stato spostato."
        action={
          <ButtonLink href="/admin/agenda" variant="outline" size="md">
            Vai all’agenda
          </ButtonLink>
        }
      />
    </div>
  );
}
