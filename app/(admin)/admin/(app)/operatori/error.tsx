"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function OperatorsError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare gli operatori"
      message="Non è stato possibile recuperare l'elenco degli account. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
