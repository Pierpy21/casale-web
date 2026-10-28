"use client";

import { ErrorState } from "@/components/ui";
import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function SincronizzazioneError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <ErrorState
      title="Sincronizzazione non disponibile"
      message="Non è stato possibile caricare le modifiche in attesa. Le modifiche salvate sul dispositivo non sono perse."
      reset={reset}
      updating={updating}
    />
  );
}
