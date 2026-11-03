/// <reference path="../pb_data/types.d.ts" />
// Fornitori della giacenza gestiti dall'admin (collezione inventory_suppliers). Idempotente, con down.
// Le regole sono quelle delle altre collezioni della giacenza: solo l'account di servizio app_services.
//
// Up:
// 1. inventory_suppliers: name (testo), name_key (nome in minuscolo, unico), sort (numero), active (bool).
//    Seed: Viagrande, Amadori, Vegagel, Altro (stesso ordine di prima). Il seed non tocca i fornitori gia' presenti.
// 2. inventory_products.supplier: da select (viagrande | amadori | vegagel | altro) a relazione verso inventory_suppliers.
//    I valori vecchi si mappano sui fornitori seed (fuori elenco → altro).
// 3. inventory_report_lines: il vecchio snapshot testuale `supplier` diventa due campi:
//    supplier (relazione verso inventory_suppliers) e supplier_name (testo, nome del fornitore al momento dell'invio).
//    Le righe vecchie ricevono id e nome del fornitore seed: lo storico resta leggibile anche se il fornitore
//    viene rinominato o disattivato in seguito.
//
// Dati: i valori vecchi si leggono PRIMA di togliere il campo (togliere un campo cancella la sua colonna).
// Il campo si toglie e si riaggiunge con un salvataggio a parte, poi si riempie.
// Eliminare un fornitore sara' possibile solo se nessun prodotto e nessuna riga di report lo usa (lo gestisce l'app).
//
// Down: riporta supplier a select/testo con le chiavi storiche (un fornitore diverso dai quattro seed → altro),
// toglie supplier_name ed elimina inventory_suppliers. Il nome personalizzato dei fornitori nuovi va perso.

const SVC = '@request.auth.collectionName = "app_services"';

/** Fornitori iniziali: chiave storica (valore del vecchio select) e nome visualizzato. L'ordine e' il sort. */
const SEED_SUPPLIERS = [
  { key: "viagrande", name: "Viagrande" },
  { key: "amadori", name: "Amadori" },
  { key: "vegagel", name: "Vegagel" },
  { key: "altro", name: "Altro" },
];
const SEED_KEYS = SEED_SUPPLIERS.map((s) => s.key);
const NAME_BY_KEY = {};
for (const s of SEED_SUPPLIERS) NAME_BY_KEY[s.key] = s.name;

/** Chiave di unicita' (come nameKeyOf in 1793000007 e productNameKey in lib/rpc/inventory.ts). */
function nameKeyOf(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Tipo di un campo. Nel JSVM `type` puo' essere un metodo (field.type()) o una proprieta': si accettano entrambi. */
function fieldTypeOf(field) {
  return typeof field.type === "function" ? field.type() : field.type;
}

/** Crea la collezione se manca; aggiunge solo i campi e gli indici mancanti; imposta le regole. Come 1793000004. */
function ensureCollection(app, name, fields, indexes) {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(name);
  } catch (_) {
    collection = new Collection({ type: "base", name: name, fields: [], indexes: [] });
  }

  for (const field of fields) {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  }

  const current = collection.indexes ? [...collection.indexes] : [];
  for (const idx of indexes) {
    if (!current.includes(idx)) current.push(idx);
  }
  collection.indexes = current;

  collection.listRule = SVC;
  collection.viewRule = SVC;
  collection.createRule = SVC;
  collection.updateRule = SVC;
  collection.deleteRule = SVC;
  app.save(collection);
  return app.findCollectionByNameOrId(name);
}

/** Inserisce i fornitori seed che non esistono ancora (per name_key). */
function seedSuppliers(app) {
  const suppliers = app.findCollectionByNameOrId("inventory_suppliers");
  for (let i = 0; i < SEED_SUPPLIERS.length; i++) {
    const seed = SEED_SUPPLIERS[i];
    let row = null;
    try {
      row = app.findFirstRecordByFilter("inventory_suppliers", "name_key = {:k}", { k: nameKeyOf(seed.name) });
    } catch (_) {
      // non presente: lo creo sotto
    }
    if (row) continue;

    const record = new Record(suppliers);
    record.set("name", seed.name);
    record.set("name_key", nameKeyOf(seed.name));
    record.set("sort", i + 1);
    record.set("active", true);
    app.save(record);
  }
}

/** Id dei fornitori seed per chiave storica (letti dal database dopo il seed). */
function seedIdsByKey(app) {
  const ids = {};
  for (const seed of SEED_SUPPLIERS) {
    const row = app.findFirstRecordByFilter("inventory_suppliers", "name_key = {:k}", { k: nameKeyOf(seed.name) });
    ids[seed.key] = row.id;
  }
  return ids;
}

/** Tutti gli id e il valore di un campo testo/select, letti a pagine per id prima di cambiare lo schema. */
function readAll(app, collection, field) {
  const out = [];
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter(collection, 'id != ""', "id", 200, offset);
    if (rows.length === 0) break;
    for (const row of rows) out.push({ id: row.id, value: String(row.get(field) || "") });
  }
  return out;
}

/** Prodotti: select viagrande|amadori|vegagel|altro → relazione obbligatoria verso inventory_suppliers. */
function convertProducts(app, ids) {
  const products = app.findCollectionByNameOrId("inventory_products");
  const current = products.fields.getByName("supplier");
  if (!current || fieldTypeOf(current) !== "select") return; // gia' convertito

  const old = readAll(app, "inventory_products", "supplier").map((item) => ({
    id: item.id,
    key: SEED_KEYS.includes(item.value) ? item.value : "altro",
  }));

  // Due salvataggi: prima si toglie il select (cancella la colonna), poi si aggiunge la relazione con lo stesso nome.
  products.fields.removeByName("supplier");
  app.save(products);
  const suppliers = app.findCollectionByNameOrId("inventory_suppliers");
  const fresh = app.findCollectionByNameOrId("inventory_products");
  fresh.fields.add(new RelationField({ name: "supplier", required: true, collectionId: suppliers.id, maxSelect: 1, cascadeDelete: false }));
  app.save(fresh);

  for (const item of old) {
    const row = app.findRecordById("inventory_products", item.id);
    row.set("supplier", ids[item.key]);
    app.save(row);
  }
}

/** Righe del report: snapshot testuale → relazione supplier + supplier_name (nome al momento della migrazione). */
function convertLines(app, ids) {
  const lines = app.findCollectionByNameOrId("inventory_report_lines");
  const current = lines.fields.getByName("supplier");
  if (!current || fieldTypeOf(current) !== "text") return; // gia' convertito

  const old = readAll(app, "inventory_report_lines", "supplier").map((item) => ({
    id: item.id,
    key: SEED_KEYS.includes(item.value) ? item.value : "altro",
  }));

  lines.fields.removeByName("supplier");
  app.save(lines);
  const suppliers = app.findCollectionByNameOrId("inventory_suppliers");
  const fresh = app.findCollectionByNameOrId("inventory_report_lines");
  fresh.fields.add(new RelationField({ name: "supplier", required: true, collectionId: suppliers.id, maxSelect: 1, cascadeDelete: false }));
  fresh.fields.add(new TextField({ name: "supplier_name", max: 200 }));
  app.save(fresh);

  for (const item of old) {
    const row = app.findRecordById("inventory_report_lines", item.id);
    row.set("supplier", ids[item.key]);
    row.set("supplier_name", NAME_BY_KEY[item.key]);
    app.save(row);
  }
}

migrate((app) => {
  // 1. Fornitori: collezione, seed e indice unico sul nome.
  ensureCollection(app, "inventory_suppliers", [
    new TextField({ name: "name", required: true, min: 1, max: 80 }),
    new TextField({ name: "name_key", required: true, min: 1, max: 80 }),
    new NumberField({ name: "sort", onlyInt: true, min: 0 }),
    new BoolField({ name: "active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ], ["CREATE UNIQUE INDEX idx_inventory_suppliers_name_key ON inventory_suppliers (name_key)"]);
  seedSuppliers(app);
  const ids = seedIdsByKey(app);

  // 2. Prodotti e 3. righe del report: i valori storici diventano relazioni (e lo snapshot del nome).
  convertProducts(app, ids);
  convertLines(app, ids);
}, (app) => {
  // Mappa id → chiave storica (un fornitore nuovo, non seed, torna "altro"). Letta prima di cambiare lo schema.
  const keyById = {};
  let suppliers = null;
  try {
    suppliers = app.findCollectionByNameOrId("inventory_suppliers");
  } catch (_) {
    suppliers = null;
  }
  if (suppliers) {
    for (let offset = 0; ; offset += 200) {
      const rows = app.findRecordsByFilter("inventory_suppliers", 'id != ""', "id", 200, offset);
      if (rows.length === 0) break;
      for (const row of rows) {
        const seed = SEED_SUPPLIERS.find((s) => nameKeyOf(s.name) === String(row.get("name_key") || ""));
        keyById[row.id] = seed ? seed.key : "altro";
      }
    }
  }

  // Righe del report: relazione → testo storico, poi via supplier_name.
  const lines = app.findCollectionByNameOrId("inventory_report_lines");
  if (lines.fields.getByName("supplier") && fieldTypeOf(lines.fields.getByName("supplier")) === "relation") {
    const old = readAll(app, "inventory_report_lines", "supplier").map((item) => ({
      id: item.id,
      key: keyById[item.value] || "altro",
    }));
    lines.fields.removeByName("supplier");
    lines.fields.removeByName("supplier_name");
    app.save(lines);
    const fresh = app.findCollectionByNameOrId("inventory_report_lines");
    fresh.fields.add(new TextField({ name: "supplier", max: 40 }));
    app.save(fresh);
    for (const item of old) {
      const row = app.findRecordById("inventory_report_lines", item.id);
      row.set("supplier", item.key);
      app.save(row);
    }
  }

  // Prodotti: relazione → select con le chiavi storiche.
  const products = app.findCollectionByNameOrId("inventory_products");
  if (products.fields.getByName("supplier") && fieldTypeOf(products.fields.getByName("supplier")) === "relation") {
    const old = readAll(app, "inventory_products", "supplier").map((item) => ({
      id: item.id,
      key: keyById[item.value] || "altro",
    }));
    products.fields.removeByName("supplier");
    app.save(products);
    const fresh = app.findCollectionByNameOrId("inventory_products");
    fresh.fields.add(new SelectField({ name: "supplier", values: SEED_KEYS, maxSelect: 1 }));
    app.save(fresh);
    for (const item of old) {
      const row = app.findRecordById("inventory_products", item.id);
      row.set("supplier", item.key);
      app.save(row);
    }
  }

  // Collezione dei fornitori: via solo quando nessuna relazione la usa piu'.
  if (suppliers) app.delete(suppliers);
});
