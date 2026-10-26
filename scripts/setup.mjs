#!/usr/bin/env node
// Setup dell'Agenda Digitale su PocketBase: legge .env.local, verifica il server e lo schema,
// crea l'amministratore. Uso: npm run setup
// Tutti i passaggi sono idempotenti: si può rilanciare senza effetti collaterali.
// Il server PocketBase NON si configura da qui: lo schema arriva dalle migrazioni (docs/admin/POCKETBASE.md).
// Dal URL pubblico sono bloccati gli endpoint di amministrazione: lo script usa solo l'account di servizio.

import { access, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectService, ensureAdmin, MIN_PASSWORD_LENGTH } from "./lib/admin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

const REQUIRED = [
  "POCKETBASE_URL",
  "POCKETBASE_SERVICE_EMAIL",
  "POCKETBASE_SERVICE_PASSWORD",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
];

const WHERE_TO_FIND = {
  POCKETBASE_URL: "URL HTTPS pubblico di PocketBase, es. https://pb.65-21-145-229.sslip.io",
  POCKETBASE_SERVICE_EMAIL: "email dell'account di servizio (collezione app_services, creato dal pannello PocketBase)",
  POCKETBASE_SERVICE_PASSWORD: "password dell'account di servizio",
  ADMIN_EMAIL: "email dell'amministratore da creare",
  ADMIN_PASSWORD: `password dell'amministratore, almeno ${MIN_PASSWORD_LENGTH} caratteri`,
};

// Collezioni verificate con una lettura (il servizio ha accesso in lettura a tutte).
const REQUIRED_COLLECTIONS = [
  "users",
  "rooms",
  "menus",
  "menu_items",
  "clients",
  "bookings",
  "booking_dishes",
  "booking_allergies",
  "booking_changes",
  "quotes",
  "quote_counters",
  "payments",
  "notifications",
  "push_subscriptions",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ok = (msg) => console.log(`  ✔ ${msg}`);
const warn = (msg) => console.log(`  ⚠ ${msg}`);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function validate() {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    const lines = missing.map((k) => `  - ${k}: ${WHERE_TO_FIND[k] ?? ""}`).join("\n");
    fail(`Mancano queste variabili in .env.local:\n${lines}\nCompilale e rilancia: npm run setup`);
  }
  const problems = [];
  try {
    const u = new URL(process.env.POCKETBASE_URL);
    if (u.protocol !== "https:" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
      problems.push("POCKETBASE_URL deve essere HTTPS (URL pubblico) salvo sviluppo locale");
    }
  } catch {
    problems.push("POCKETBASE_URL non è un URL valido (es. https://pb.65-21-145-229.sslip.io)");
  }
  if (!EMAIL_RE.test(process.env.ADMIN_EMAIL.trim())) problems.push("ADMIN_EMAIL non sembra un'email valida");
  if (process.env.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    problems.push(`ADMIN_PASSWORD deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`);
  }
  if (problems.length) fail(`Valori non validi in .env.local:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
}

async function checkHealth(url) {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    fail(
      `PocketBase non risponde su ${url} (${err.message}).\n` +
        "  Verifica il container (docker ps) e il reverse proxy Caddy.",
    );
  }
  ok("PocketBase raggiungibile (/api/health)");
}

/** Lo schema e' presente se il servizio riesce a leggere (1 record) da ogni collezione attesa. */
async function checkSchema(pb) {
  const missing = [];
  for (const name of REQUIRED_COLLECTIONS) {
    try {
      await pb.collection(name).getList(1, 1, { skipTotal: true });
    } catch (err) {
      if (err?.status === 404) missing.push(name);
      else missing.push(`${name} (HTTP ${err?.status ?? "?"})`);
    }
  }
  if (missing.length) {
    fail(
      `Schema incompleto o regole non valide per: ${missing.join(", ")}.\n` +
        "  Copia le migrazioni in /opt/pocketbase/pb_migrations, riavvia con: docker restart pocketbase,\n" +
        "  e verifica che l'account di servizio sia nella collezione app_services.",
    );
  }
  ok("Schema presente e leggibile dall'account di servizio");
}

async function main() {
  console.log("Agenda Digitale - setup (PocketBase)\n");

  if (!(await exists(ENV_FILE))) {
    await copyFile(ENV_EXAMPLE, ENV_FILE);
    console.log("Ho creato .env.local partendo da .env.example.");
    fail("Compila .env.local e rilancia: npm run setup");
  }

  process.loadEnvFile(ENV_FILE);
  validate();

  console.log("Server");
  await checkHealth(process.env.POCKETBASE_URL);
  const pb = await connectService({
    url: process.env.POCKETBASE_URL,
    email: process.env.POCKETBASE_SERVICE_EMAIL.trim(),
    password: process.env.POCKETBASE_SERVICE_PASSWORD,
  }).catch((err) => fail(err.message));
  ok("Accesso account di servizio riuscito");
  await checkSchema(pb);
  warn("Batch API e rate limit non si verificano da qui (impostazioni riservate): controllali nel pannello.");

  console.log("\nAmministratore");
  const admin = await ensureAdmin({
    pb,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    fullName: process.env.ADMIN_NAME?.trim() || "Peppe Moschetto",
  }).catch((err) => fail(err.message));
  ok(
    admin.existed
      ? `Utente già esistente promosso ad amministratore: ${admin.email} (password invariata)`
      : `Amministratore creato: ${admin.email}`,
  );

  console.log("\nRegistrazioni pubbliche");
  ok("Disattivate dallo schema (collezione users: createRule riservata al servizio)");

  console.log(
    `\n✔ Setup completato.\n\nOra lancia: npm run dev e accedi su http://localhost:3000/admin/login con ${admin.email}`,
  );
}

main().catch((err) => fail(err.message));
