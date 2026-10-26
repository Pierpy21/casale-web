/// <reference path="../pb_data/types.d.ts" />
// Giacenza (cucina + admin) e collegamento delle notifiche a una URL. Idempotente.
// Tutte le collezioni sono riservate all'account di servizio (app_services): nessun accesso diretto dal browser.
//
// Nota: in PocketBase 0.40 `new Collection({ fields: [new TextField(...)], listRule, ... })` ignora in
// silenzio campi, indici e regole (la collezione nasce con il solo `id`). Come in 1793000000_casale_schema.js
// la collezione si crea vuota e campi, indici e regole si impostano dopo, come proprieta'.

const SVC = '@request.auth.collectionName = "app_services"';

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

migrate((app) => {
  // 1. notifications: URL opzionale (es. /admin/giacenza/<id>)
  const notifications = app.findCollectionByNameOrId("notifications");
  if (!notifications.fields.getByName("url")) {
    notifications.fields.add(new TextField({ name: "url", max: 300 }));
  }
  app.save(notifications);

  const users = app.findCollectionByNameOrId("users");

  // 2. Catalogo prodotti della giacenza. name_key = nome normalizzato in minuscolo (unicita' senza distinzione di maiuscole)
  const products = ensureCollection(app, "inventory_products", [
    new TextField({ name: "name", required: true, min: 1, max: 200 }),
    new TextField({ name: "name_key", required: true, min: 1, max: 200 }),
    new TextField({ name: "unit", max: 40 }),
    new TextField({ name: "category", max: 80 }),
    new BoolField({ name: "active" }),
    new RelationField({ name: "created_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ], ["CREATE UNIQUE INDEX idx_inventory_products_name_key ON inventory_products (name_key)"]);

  // 3. Report di giacenza (uno per invio della cucina)
  const reports = ensureCollection(app, "inventory_reports", [
    new RelationField({ name: "created_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new TextField({ name: "created_by_name", max: 200 }),
    new DateField({ name: "report_date", required: true }),
    new TextField({ name: "notes", max: 2000 }),
    new SelectField({ name: "status", required: true, values: ["inviato", "visto"], maxSelect: 1 }),
    new RelationField({ name: "seen_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new DateField({ name: "seen_at" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ], ["CREATE INDEX idx_inventory_reports_date ON inventory_reports (report_date)"]);

  // 4. Righe del report. product: relazione opzionale (il nome e l'unita' sono sempre salvati come snapshot)
  ensureCollection(app, "inventory_report_lines", [
    new RelationField({ name: "report", required: true, collectionId: reports.id, maxSelect: 1, cascadeDelete: true }),
    new RelationField({ name: "product", collectionId: products.id, maxSelect: 1, cascadeDelete: false }),
    new TextField({ name: "product_name", required: true, min: 1, max: 200 }),
    new TextField({ name: "unit", max: 40 }),
    new SelectField({ name: "state", required: true, values: ["presente", "da_ordinare"], maxSelect: 1 }),
    new NumberField({ name: "quantity", required: true, min: 0 }),
    new NumberField({ name: "sort", onlyInt: true, min: 0 }),
  ], ["CREATE INDEX idx_inventory_report_lines_report ON inventory_report_lines (report)"]);
}, (app) => {
  for (const name of ["inventory_report_lines", "inventory_reports", "inventory_products"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {
      // gia' rimossa
    }
  }
  const notifications = app.findCollectionByNameOrId("notifications");
  notifications.fields.removeByName("url");
  app.save(notifications);
});
