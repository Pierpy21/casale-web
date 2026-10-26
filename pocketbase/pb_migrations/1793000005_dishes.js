/// <reference path="../pb_data/types.d.ts" />
// Catalogo piatti (Menù & Sale → Piatti): collezione `dishes` condivisa dai menù.
// - dishes: nome, portata, descrizione, attivo, ordine; unicita' per (course, name_key) senza distinzione di maiuscole.
// - menu_items.dish: relazione opzionale verso il piatto del catalogo (cascadeDelete false: il piatto non elimina le voci da solo).
// - Backfill: ogni voce di menu esistente viene collegata a un piatto (riusato per portata + nome, altrimenti creato).
// Idempotente. Le prenotazioni (booking_dishes) sono copie e non vengono toccate.
// Tutte le collezioni sono riservate all'account di servizio (app_services).
//
// Nota: come in 1793000004_inventory.js, la collezione si crea vuota e campi, indici e regole si impostano dopo.

const SVC = '@request.auth.collectionName = "app_services"';
const COURSES = ["antipasto", "primo", "secondo", "contorno", "dolce", "bevande"];

/** Crea la collezione se manca; aggiunge solo i campi e gli indici mancanti; imposta le regole. */
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

/** Chiave di unicita' del nome piatto: minuscolo e senza spazi ai bordi. */
function nameKeyOf(name) {
  return String(name || "").trim().toLowerCase();
}

/** Trova o crea il piatto (portata + nome) e restituisce il record. */
function findOrCreateDish(app, dishes, course, name, description, sort) {
  const key = nameKeyOf(name);
  try {
    return app.findFirstRecordByFilter("dishes", "course = {:c} && name_key = {:k}", { c: course, k: key });
  } catch (_) {
    // non ancora presente: lo creo sotto
  }
  const dish = new Record(dishes);
  dish.set("name", String(name || "").trim() || "Piatto senza nome");
  dish.set("course", course);
  dish.set("name_key", key || "piatto");
  dish.set("description", description || "");
  dish.set("active", true);
  dish.set("sort", sort);
  app.save(dish);
  return dish;
}

migrate((app) => {
  // 1. Catalogo piatti
  const dishes = ensureCollection(app, "dishes", [
    new TextField({ name: "name", required: true, min: 1, max: 200 }),
    new SelectField({ name: "course", required: true, values: COURSES, maxSelect: 1 }),
    new TextField({ name: "description", max: 500 }),
    new BoolField({ name: "active" }),
    new NumberField({ name: "sort", onlyInt: true }),
    new TextField({ name: "name_key", required: true, min: 1, max: 200 }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ], ["CREATE UNIQUE INDEX idx_dishes_course_name_key ON dishes (course, name_key)"]);

  // 2. Collegamento voce di menu -> piatto (opzionale: le voci vecchie vengono collegate sotto)
  const menuItems = app.findCollectionByNameOrId("menu_items");
  if (!menuItems.fields.getByName("dish")) {
    menuItems.fields.add(new RelationField({ name: "dish", collectionId: dishes.id, maxSelect: 1, cascadeDelete: false }));
  }
  app.save(menuItems);

  // 3. Backfill: si rilegge sempre dall'inizio finche' non restano voci senza piatto
  // (ogni save toglie la voce dal filtro). Stesso schema di 1793000003_booking_kinds.js.
  for (let guard = 0; guard < 100000; guard++) {
    const rows = app.findRecordsByFilter("menu_items", 'dish = ""', "", 200, 0);
    if (rows.length === 0) break;
    for (const row of rows) {
      const dish = findOrCreateDish(
        app,
        dishes,
        row.get("course"),
        row.get("name"),
        row.get("description"),
        Number(row.get("sort")) || 0,
      );
      row.set("dish", dish.id);
      app.save(row);
    }
  }
}, (app) => {
  const menuItems = app.findCollectionByNameOrId("menu_items");
  menuItems.fields.removeByName("dish");
  app.save(menuItems);

  try {
    app.delete(app.findCollectionByNameOrId("dishes"));
  } catch (_) {
    // gia' rimossa
  }
});
