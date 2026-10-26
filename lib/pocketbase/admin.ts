import "server-only";
import PocketBase from "pocketbase";
import { pocketbaseServerUrl } from "./config";

// Client di SERVIZIO: account della collezione auth `app_services` (non superuser).
// Il server Next lo usa per leggere/scrivere i dati dopo aver verificato profilo e permessi
// (lib/action-utils authorize, lib/auth requireAdmin, ecc.). Le regole delle collezioni
// concedono l'accesso a `@request.auth.collectionName = "app_services"`.
// Il token e' in cache a livello di modulo: rinnovato alla scadenza e scartato su 401.

let instance: PocketBase | null = null;
let pending: Promise<PocketBase> | null = null;

function serviceCredentials(): { email: string; password: string } {
  const email = process.env.POCKETBASE_SERVICE_EMAIL?.trim();
  const password = process.env.POCKETBASE_SERVICE_PASSWORD;
  if (!email || !password) {
    throw new Error("POCKETBASE_SERVICE_EMAIL / POCKETBASE_SERVICE_PASSWORD non configurate");
  }
  return { email, password };
}

async function login(): Promise<PocketBase> {
  const { email, password } = serviceCredentials();
  // Il reverse proxy blocca gli endpoint di amministrazione (_superusers, collections, settings):
  // il servizio usa solo records/auth/batch/files, che passano.
  const pb = new PocketBase(pocketbaseServerUrl());
  // Niente auto-cancellazione: due query identiche in parallelo non devono annullarsi a vicenda.
  pb.autoCancellation(false);
  // Un 401 invalida il token in cache: la prossima chiamata a getAdminPb() rifa' l'accesso.
  pb.afterSend = (response, data) => {
    if (response.status === 401 && instance === pb) instance = null;
    return data;
  };
  await pb.collection("app_services").authWithPassword(email, password);
  return pb;
}

/** Client di servizio con token valido (rinnova se scaduto o invalidato). */
export async function getAdminPb(): Promise<PocketBase> {
  if (instance?.authStore.isValid) return instance;
  if (!pending) {
    pending = login()
      .then((pb) => {
        instance = pb;
        return pb;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Invalida il client in cache (es. dopo cambio credenziali del servizio). */
export function resetAdminPb(): void {
  instance = null;
}
