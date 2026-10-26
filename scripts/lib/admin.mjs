// Logica condivisa per creare (o promuovere) l'amministratore dell'Agenda Digitale su PocketBase.
// Usata da scripts/create-admin.mjs, scripts/setup.mjs, scripts/transfer-admin.mjs e import-notion.mjs.
// Idempotente. Si collega con l'account di servizio (collezione app_services) tramite l'URL pubblico:
// gli endpoint _superusers / collections / settings sono bloccati dal reverse proxy e non si usano.

import PocketBase from "pocketbase";

export const MIN_PASSWORD_LENGTH = 8;

/** Client PocketBase autenticato come account di servizio. Errore leggibile se le credenziali non funzionano. */
export async function connectService({ url, email, password }) {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  try {
    await pb.collection("app_services").authWithPassword(email, password);
  } catch (err) {
    throw new Error(
      `Accesso account di servizio non riuscito (${err?.status ?? "errore di rete"}). ` +
        "Controlla POCKETBASE_SERVICE_EMAIL/PASSWORD e POCKETBASE_URL. " +
        "L'account si crea dal pannello PocketBase (via Tailscale), collezione app_services.",
    );
  }
  return pb;
}

/** Utente per email (in minuscolo) oppure null. */
export async function findUserByEmail(pb, email) {
  try {
    return await pb.collection("users").getFirstListItem(pb.filter("email = {:e}", { e: email }));
  } catch {
    return null;
  }
}

/**
 * Crea l'utente (email verificata) oppure, se esiste già, lo promuove ad amministratore senza cambiarne la password.
 * L'app supporta un solo amministratore: se ne esiste un altro, non si procede.
 * @returns {Promise<{ userId: string, email: string, existed: boolean }>}
 */
export async function ensureAdmin({ pb, email: rawEmail, password, fullName }) {
  const email = rawEmail.trim().toLowerCase();

  const others = await pb.collection("users").getFullList({
    filter: pb.filter("role = {:r} && email != {:e}", { r: "admin", e: email }),
  });
  if (others.length > 0) {
    throw new Error(
      `Esiste già un amministratore (${others[0].email ?? "email sconosciuta"}): l'app supporta un solo admin. ` +
        "Usa transfer-admin per passare il ruolo.",
    );
  }

  const existing = await findUserByEmail(pb, email);
  if (existing) {
    await pb.collection("users").update(existing.id, {
      full_name: fullName,
      role: "admin",
      is_chef: false,
      active: true,
    });
    return { userId: existing.id, email, existed: true };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri per un nuovo amministratore.`);
  }
  const created = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    full_name: fullName,
    role: "admin",
    is_chef: false,
    active: true,
    verified: true,
    emailVisibility: true,
  });
  return { userId: created.id, email, existed: false };
}
