/// <reference path="../pb_data/types.d.ts" />
// Menù festivi e impostazioni del sito. Idempotente: aggiunge solo ciò che manca; le regole di site_settings vengono sempre impostate.
//
// menus.festive_date (data, facoltativa): giorno della festa (es. Natale → 25 dicembre). Un menù con la data è un "menù festivo":
// si gestisce dalla scheda "Menù festivi" del catalogo, non compare tra "I nostri menù" del sito ma nella fascia "Buone Feste"
// della home (solo se attivo e con data da oggi in poi, ordinati per data). Resta sceglibile nelle prenotazioni come gli altri menù.
// Indice su festive_date per il filtro della home.
//
// site_settings: coppie chiave → interruttore. Chiave usata: "festive_section" (enabled = mostra la fascia festiva sul sito).
// Regole: solo l'account di servizio app_services.
//
// Down: rimuove menus.festive_date (i menù festivi tornano menù normali) ed elimina site_settings.

const SVC = '@request.auth.collectionName = "app_services"';
const FESTIVE_INDEX = "CREATE INDEX idx_menus_festive_date ON menus (festive_date)";

migrate((app) => {
  const menus = app.findCollectionByNameOrId("menus");
  let changed = false;
  if (!menus.fields.getByName("festive_date")) {
    menus.fields.add(new DateField({ name: "festive_date" }));
    changed = true;
  }
  const indexes = menus.indexes ? [...menus.indexes] : [];
  if (!indexes.includes(FESTIVE_INDEX)) {
    indexes.push(FESTIVE_INDEX);
    menus.indexes = indexes;
    changed = true;
  }
  if (changed) app.save(menus);

  let settings;
  try {
    settings = app.findCollectionByNameOrId("site_settings");
  } catch (_) {
    settings = new Collection({ type: "base", name: "site_settings", fields: [], indexes: [] });
  }
  const fields = [
    new TextField({ name: "key", required: true, max: 100 }),
    new BoolField({ name: "enabled" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ];
  for (const field of fields) {
    if (!settings.fields.getByName(field.name)) settings.fields.add(field);
  }
  const keyIndex = "CREATE UNIQUE INDEX idx_site_settings_key ON site_settings (`key`)";
  const settingsIndexes = settings.indexes ? [...settings.indexes] : [];
  if (!settingsIndexes.includes(keyIndex)) settingsIndexes.push(keyIndex);
  settings.indexes = settingsIndexes;
  settings.listRule = SVC;
  settings.viewRule = SVC;
  settings.createRule = SVC;
  settings.updateRule = SVC;
  settings.deleteRule = SVC;
  app.save(settings);
}, (app) => {
  try {
    const menus = app.findCollectionByNameOrId("menus");
    menus.indexes = (menus.indexes ?? []).filter((index) => index !== FESTIVE_INDEX);
    if (menus.fields.getByName("festive_date")) menus.fields.removeByName("festive_date");
    app.save(menus);
  } catch (_) {
    // collezione assente
  }
  try {
    app.delete(app.findCollectionByNameOrId("site_settings"));
  } catch (_) {
    // già assente
  }
});
