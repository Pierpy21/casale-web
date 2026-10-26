"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function NewBookingError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Impossibile aprire il modulo"
      message="Non è stato possibile caricare clienti, sale o menù. Riprova tra poco."
      reset={reset}
      updating={updating}
    />
  );
}
