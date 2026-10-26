#!/usr/bin/env node
// Import una tantum dei menu da Notion (database menu + database piatti) in PocketBase.
// Uso: node scripts/import-notion.mjs
// Env (da .env.local): NOTION_TOKEN, NOTION_DATABASE_ID, NOTION_PIATTI_DATABASE_ID,
//                      POCKETBASE_URL, POCKETBASE_SERVICE_EMAIL, POCKETBASE_SERVICE_PASSWORD
// Idempotente per nome del menu: i menu gia' presenti in PocketBase vengono saltati (non sovrascritti).
// Le foto Notion scadono: vengono scaricate e caricate in menus.photos.
// Proprieta' attese (stessi nomi di lib/notion.ts): menu Nome (title), Prezzo (number), Piatti (relation),
// Foto (files), Stagione (select o rich_text), Disponibile (checkbox), Id (unique_id);
// piatti Nome (title), Categoria (select: Antipasto, Primo, Secondo, Contorno, Dolce, Bevande), Descrizione (rich_text).

import path from "node:path";
import { Client } from "@notionhq/client";
import { connectService } from "./lib/admin.mjs";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Nessun .env.local: si usano le variabili d'ambiente di sistema.
}

const NOTION_TOKEN = process.env.NOTION_TOKEN?.trim();
const MENU_DB = process.env.NOTION_DATABASE_ID?.trim();
const PIATTI_DB = process.env.NOTION_PIATTI_DATABASE_ID?.trim();
const POCKETBASE_URL = process.env.POCKETBASE_URL?.trim();
const SERVICE_EMAIL = process.env.POCKETBASE_SERVICE_EMAIL?.trim();
const SERVICE_PASSWORD = process.env.POCKETBASE_SERVICE_PASSWORD;

const missing = Object.entries({
  NOTION_TOKEN,
  NOTION_DATABASE_ID: MENU_DB,
  NOTION_PIATTI_DATABASE_ID: PIATTI_DB,
  POCKETBASE_URL,
  POCKETBASE_SERVICE_EMAIL: SERVICE_EMAIL,
  POCKETBASE_SERVICE_PASSWORD: SERVICE_PASSWORD,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Mancano queste variabili: ${missing.join(", ")}`);
  process.exit(1);
}

const COURSE_BY_NOTION = {
  Antipasto: "antipasto",
  Primo: "primo",
  Secondo: "secondo",
  Contorno: "contorno",
  Dolce: "dolce",
  Bevande: "bevande",
};
const COURSE_RANK = Object.fromEntries(Object.values(COURSE_BY_NOTION).map((c, i) => [c, i]));
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const notion = new Client({ auth: NOTION_TOKEN });

/** Tutte le pagine di un database Notion (data source), seguendo la paginazione. */
async function queryAll(dataSourceId, filter) {
  const results = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    results.push(...(res.results ?? []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

const titleOf = (prop) => (prop?.type === "title" ? prop.title.map((t) => t.plain_text).join("") : "");
const richOf = (prop) => (prop?.type === "rich_text" ? prop.rich_text.map((t) => t.plain_text).join("") : "");

/** Piatti: mappa page.id → { course, name, description }, solo portate riconosciute. */
async function loadDishes() {
  const pages = await queryAll(PIATTI_DB);
  const map = new Map();
  for (const page of pages) {
    const name = titleOf(page.properties.Nome).trim();
    const categoria = page.properties.Categoria?.type === "select" ? page.properties.Categoria.select?.name : null;
    const course = categoria ? COURSE_BY_NOTION[categoria] : undefined;
    if (!name) continue;
    if (!course) {
      console.warn(`  ⚠ piatto "${name}": categoria "${categoria ?? "—"}" non riconosciuta, saltato`);
      continue;
    }
    map.set(page.id, { course, name, description: richOf(page.properties.Descrizione).trim() });
  }
  return map;
}

function seasonOf(prop) {
  if (prop?.type === "select") return prop.select?.name || "";
  if (prop?.type === "rich_text") return richOf(prop);
  return "";
}

function photoUrlsOf(prop) {
  if (prop?.type !== "files" || !Array.isArray(prop.files)) return [];
  return prop.files
    .map((f) => (f.type === "file" ? f.file?.url : f.type === "external" ? f.external?.url : ""))
    .filter(Boolean);
}

/** Scarica una foto (gli URL Notion scadono) e la restituisce come File. */
async function downloadPhoto(url, index) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download foto fallito (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new Error("foto oltre 5 MB");
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const ext = { "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[type] ?? "jpg";
  let stem = "foto";
  try {
    stem = path.basename(new URL(url).pathname, path.extname(new URL(url).pathname)) || stem;
  } catch {
    // URL non parsabile: nome generico
  }
  const safe = `${stem.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "foto"}-${index}.${ext}`;
  return new File([buffer], safe, { type });
}

async function main() {
  const pb = await connectService({ url: POCKETBASE_URL, email: SERVICE_EMAIL, password: SERVICE_PASSWORD });
  const dishes = await loadDishes();
  console.log(`Piatti letti da Notion: ${dishes.size}`);

  const pages = await queryAll(MENU_DB);
  console.log(`Menu letti da Notion: ${pages.length}`);

  let created = 0;
  let skipped = 0;
  for (const page of pages) {
    const props = page.properties;
    const name = titleOf(props.Nome).trim() || "Senza nome";

    const existing = await pb
      .collection("menus")
      .getFirstListItem(pb.filter("name = {:n}", { n: name }))
      .catch(() => null);
    if (existing) {
      console.log(`  = "${name}" già presente in PocketBase: saltato`);
      skipped++;
      continue;
    }

    const relation = props.Piatti?.type === "relation" ? props.Piatti.relation : [];
    const items = relation
      .map((rel) => dishes.get(rel.id))
      .filter(Boolean)
      .sort((a, b) => COURSE_RANK[a.course] - COURSE_RANK[b.course]);

    const isKids = /bambin/i.test(name);
    const sort = props.Id?.type === "unique_id" ? Number(props.Id.unique_id?.number ?? 0) : 0;

    const body = new FormData();
    body.set("name", name);
    body.set("season", seasonOf(props.Stagione) || "Menu Degustazione");
    body.set("price_per_person", String(props.Prezzo?.type === "number" ? props.Prezzo.number ?? 0 : 0));
    body.set("is_kids", String(isKids));
    body.set("active", String(props.Disponibile?.type === "checkbox" ? props.Disponibile.checkbox : true));
    body.set("sort", String(sort));

    let photoCount = 0;
    for (const [i, url] of photoUrlsOf(props.Foto).slice(0, 10).entries()) {
      try {
        body.append("photos+", await downloadPhoto(url, i + 1));
        photoCount++;
      } catch (err) {
        console.warn(`  ⚠ "${name}" foto ${i + 1}: ${err.message}`);
      }
    }

    const menu = await pb.collection("menus").create(body);

    const batch = pb.createBatch();
    items.forEach((item, index) => {
      batch.collection("menu_items").create({
        menu: menu.id,
        course: item.course,
        name: item.name,
        description: item.description,
        sort: index + 1,
      });
    });
    if (items.length > 0) await batch.send();

    console.log(`  + "${name}": ${items.length} piatti, ${photoCount} foto`);
    created++;
  }

  console.log(`\nFatto. Creati: ${created}, saltati: ${skipped}.`);
  console.log("Ricorda: il sito pubblico legge il menù in cache; dopo l'import rilancia il deploy o attendi la revalidazione.");
}

main().catch((err) => {
  console.error(`Import fallito: ${err.message}`);
  process.exit(1);
});
