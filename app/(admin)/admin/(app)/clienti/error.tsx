"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function ClientsError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare i clienti"
      message="Non è stato possibile recuperare l'anagrafica. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
