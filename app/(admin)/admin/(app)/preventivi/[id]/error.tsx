"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function QuoteError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare il preventivo"
      message="Controlla la connessione e riprova. Se il problema persiste, contatta l’amministratore."
      reset={reset}
      updating={updating}
    />
  );
}
