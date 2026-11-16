/// <reference path="../pb_data/types.d.ts" />
// Menù festivi per la fascia "Buone Feste" della home (es. Natale, 25 dicembre) e impostazioni del sito.
// Idempotente: crea le collezioni se mancano, altrimenti aggiunge solo i campi mancanti; le regole vengono sempre impostate.
//
// festive_menus:
// - title: nome della festa ("Natale"), obbligatorio, max 120.
// - date: giorno della festa (data, obbligatoria). Il sito mostra i menù dal giorno di oggi in poi, ordinati per data.
// - price: prezzo a persona in euro (>= 0, facoltativo: 0/vuoto = prezzo non mostrato).
// - courses: portate, una per riga (testo libero, max 4000).
// - notes: nota breve facoltativa (max 500), es. "bevande incluse".
// - photos: foto delle feste (max 10, 5 MB, JPG/PNG/WebP/AVIF, file pubblici) per la lavagna a scorrimento.
// - active: visibile sul sito.
// - created, updated: autodate.
//
// site_settings: coppie chiave → interruttore. Chiave usata: "festive_section" (enabled = mostra la fascia festiva).
//
// Regole: solo l'account di servizio app_services (il server Next legge e scrive). I file delle foto non sono protetti.
// Down: elimina entrambe le collezioni.

const SVC = '@request.auth.collectionName = "app_services"';

function festiveFields() {
  return [
    new TextField({ name: "title", required: true, max: 120 }),
    new DateField({ name: "date", required: true }),
    new NumberField({ name: "price", min: 0 }),
    new TextField({ name: "courses", max: 4000 }),
    new TextField({ name: "notes", max: 500 }),
    new FileField({
      name: "photos",
      maxSelect: 10,
      maxSize: 5242880,
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
      protected: false,
    }),
    new BoolField({ name: "active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ];
}

function settingsFields() {
  return [
    new TextField({ name: "key", required: true, max: 100 }),
    new BoolField({ name: "enabled" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ];
}

function ensure(app, name, fields, indexes) {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(name);
  } catch (_) {
    collection = new Collection({ type: "base", name, fields: [], indexes: [] });
  }
  for (const field of fields) {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  }
  const current = collection.indexes ? [...collection.indexes] : [];
  for (const index of indexes) {
    if (!current.includes(index)) current.push(index);
  }
  collection.indexes = current;
  collection.listRule = SVC;
  collection.viewRule = SVC;
  collection.createRule = SVC;
  collection.updateRule = SVC;
  collection.deleteRule = SVC;
  app.save(collection);
}

migrate((app) => {
  ensure(app, "festive_menus", festiveFields(), ["CREATE INDEX idx_festive_menus_date ON festive_menus (date)"]);
  ensure(app, "site_settings", settingsFields(), ["CREATE UNIQUE INDEX idx_site_settings_key ON site_settings (`key`)"]);
}, (app) => {
  for (const name of ["festive_menus", "site_settings"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {
      // già assente
    }
  }
});
