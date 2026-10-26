#!/usr/bin/env node
// Crea (o promuove) l'utente amministratore dell'Agenda Digitale su PocketBase.
// Uso: node scripts/create-admin.mjs <email> <password> "<Nome Cognome>"
// Legge POCKETBASE_URL, POCKETBASE_SERVICE_EMAIL e POCKETBASE_SERVICE_PASSWORD da .env.local (se presente).
// Per la configurazione completa del progetto usare: npm run setup

import { connectService, ensureAdmin, MIN_PASSWORD_LENGTH } from "./lib/admin.mjs";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Nessun .env.local: si usano le variabili d'ambiente di sistema.
}

const [rawEmail, password, fullName] = process.argv.slice(2);

if (!rawEmail || !password || !fullName) {
  console.error('Uso: node scripts/create-admin.mjs <email> <password> "<Nome Cognome>"');
  process.exit(1);
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
  process.exit(1);
}

const url = process.env.POCKETBASE_URL?.trim();
const serviceEmail = process.env.POCKETBASE_SERVICE_EMAIL?.trim();
const servicePassword = process.env.POCKETBASE_SERVICE_PASSWORD;
if (!url || !serviceEmail || !servicePassword) {
  console.error("Mancano POCKETBASE_URL, POCKETBASE_SERVICE_EMAIL o POCKETBASE_SERVICE_PASSWORD (controlla .env.local).");
  process.exit(1);
}

try {
  const pb = await connectService({ url, email: serviceEmail, password: servicePassword });
  const result = await ensureAdmin({ pb, email: rawEmail, password, fullName });
  if (result.existed) {
    console.log("Utente già esistente: promosso ad amministratore, password invariata.");
  }
  console.log(`Amministratore pronto: ${fullName} <${result.email}>`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
