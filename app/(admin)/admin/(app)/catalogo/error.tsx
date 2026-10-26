"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function CatalogError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare il catalogo"
      message="Non è stato possibile recuperare menù e sale. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
