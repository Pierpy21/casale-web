"use client";

import { useEffect } from "react";
import { initInstallStore } from "./install-store";

/** Monta i listener di installazione il prima possibile (nessun output a schermo). */
export function InstallCapture() {
  useEffect(() => {
    initInstallStore();
  }, []);
  return null;
}
