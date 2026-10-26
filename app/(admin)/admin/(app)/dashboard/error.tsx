"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function DashboardError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile caricare la dashboard"
      message="Non è stato possibile recuperare gli indicatori. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
