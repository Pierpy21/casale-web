"use client";

import { useEffect, useState } from "react";
import { isStaleDeployError, reloadOnceForStaleDeploy } from "@/lib/stale-deploy";

/**
 * Per gli error.tsx: se l'errore è dovuto a un deploy più recente ricarica la pagina
 * una sola volta. `updating` è true mentre il ricaricamento è in corso; se il
 * ricaricamento non può avvenire (già tentato da poco) torna false e si mostra l'errore.
 */
export function useStaleDeployReload(error: unknown): { updating: boolean } {
  const stale = isStaleDeployError(error);
  const [updating, setUpdating] = useState(stale);

  useEffect(() => {
    if (!stale) {
      setUpdating(false);
      return;
    }
    setUpdating(reloadOnceForStaleDeploy());
  }, [stale, error]);

  return { updating: stale && updating };
}
