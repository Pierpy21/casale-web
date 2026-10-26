"use client";

import { useEffect } from "react";

const DEV_FLAG_KEY = "agenda-sw-dev";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Scope della PWA dell'agenda: il service worker controlla solo le pagine sotto /admin/. */
const ADMIN_SCOPE = "/admin/";

/**
 * Registra /sw.js con scope /admin/ (necessario per l'installabilità della PWA).
 * Il sito pubblico non viene mai controllato dal service worker.
 * In production sempre; in localhost/sviluppo solo con localStorage["agenda-sw-dev"] = "1" per testare.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let devFlag = false;
    try {
      devFlag = window.localStorage.getItem(DEV_FLAG_KEY) === "1";
    } catch {
      devFlag = false;
    }

    const isProduction = process.env.NODE_ENV === "production";
    const isLocal = LOCAL_HOSTS.has(window.location.hostname);
    if (!(isProduction || !isLocal || devFlag)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: ADMIN_SCOPE }).catch(() => {
        // La registrazione fallita non blocca l'app: resta una web app normale.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
