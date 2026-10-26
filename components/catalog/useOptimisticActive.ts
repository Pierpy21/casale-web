"use client";

import { useState } from "react";

/**
 * Stato "attivo" ottimistico per gli interruttori del catalogo.
 * - setActive(v): mostra subito v mentre la richiesta è in corso.
 * - resetActive(): rollback al valore del server (in caso di errore).
 * Quando il valore del server cambia (dopo router.refresh) l'override viene scartato,
 * così non resta un valore vecchio se il dato cambia da altrove.
 */
export function useOptimisticActive(serverActive: boolean) {
  const [seen, setSeen] = useState(serverActive);
  const [override, setOverride] = useState<boolean | null>(null);

  if (seen !== serverActive) {
    setSeen(serverActive);
    setOverride(null);
  }

  return {
    active: override ?? serverActive,
    setActive: (next: boolean) => setOverride(next),
    resetActive: () => setOverride(null),
  };
}
