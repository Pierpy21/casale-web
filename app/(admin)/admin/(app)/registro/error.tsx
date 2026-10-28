"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function RegistroError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Registro non disponibile"
      message="Non è stato possibile caricare il registro attività. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
