"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function DaConfermareError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare le conferme"
      message="Controlla la connessione e riprova. Se il problema persiste, contatta l'amministratore."
      reset={reset}
      updating={updating}
    />
  );
}
