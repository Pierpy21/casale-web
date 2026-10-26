"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function InventoryError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Giacenza non disponibile"
      message="Non è stato possibile caricare la giacenza. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
