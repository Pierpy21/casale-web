"use client";

import { useEffect } from "react";
import { isStaleDeployError, reloadOnceForStaleDeploy } from "@/lib/stale-deploy";

/**
 * Intercetta errori globali e promise rifiutate causati da un deploy più recente
 * e ricarica la pagina una sola volta (vedi reloadOnceForStaleDeploy).
 */
export function StaleDeployGuard() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const reason = event.error ?? event.message;
      if (isStaleDeployError(reason)) {
        reloadOnceForStaleDeploy();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isStaleDeployError(event.reason)) {
        reloadOnceForStaleDeploy();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
