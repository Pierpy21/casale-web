/// <reference path="../pb_data/types.d.ts" />
// Tavoli delle sale (collezione room_tables) per la "Mappa sala". Idempotente: crea la collezione se manca,
// altrimenti aggiunge solo i campi e l'indice mancanti; le regole vengono sempre impostate. Nessun seed.
//
// Campi:
// - room: relazione a rooms (obbligatoria, cascadeDelete: eliminando la sala si eliminano i suoi tavoli).
// - number: numero del tavolo, intero 1–9999 (obbligatorio). Indice unico (room, number): un solo tavolo per numero in ogni sala,
//   anche tra quelli disattivati (l'app riusa o sposta il record quando un numero torna in uso).
// - seats: posti, intero 1–40 (obbligatorio).
// - shape: tondo | quadrato | rettangolare (obbligatorio).
// - x, y: centro del tavolo in % della stanza, 0–100. NON obbligatori: in PocketBase lo 0 di un campo numero
//   è considerato vuoto, quindi con required un tavolo sul bordo sinistro/superiore non si salverebbe.
// - active: tavolo presente nella disposizione (false = rimosso dalla mappa, record conservato).
// - created, updated: autodate.
//
// Regole: come le altre collezioni dati (rooms, bookings…): solo l'account di servizio app_services,
// il server Next legge e scrive. Nessun accesso diretto dal browser.
//
// Down: elimina la collezione room_tables e i suoi tavoli (la disposizione va ricreata dall'app).
// Le prenotazioni non cambiano: il tavolo è memorizzato come numero in bookings.table_number.

const SVC = '@request.auth.collectionName = "app_services"';
const COLLECTION = "room_tables";
const UNIQUE_ROOM_NUMBER = "CREATE UNIQUE INDEX idx_room_tables_room_number ON room_tables (room, number)";
const SHAPES = ["tondo", "quadrato", "rettangolare"];

/** Campi della collezione (oggetti di campo PocketBase JSVM). La relazione richiede l'id di rooms. */
function tableFields(app) {
  return [
    new RelationField({
      name: "room",
      required: true,
      collectionId: app.findCollectionByNameOrId("rooms").id,
      maxSelect: 1,
      cascadeDelete: true,
    }),
    new NumberField({ name: "number", required: true, onlyInt: true, min: 1, max: 9999 }),
    new NumberField({ name: "seats", required: true, onlyInt: true, min: 1, max: 40 }),
    new SelectField({ name: "shape", required: true, values: SHAPES, maxSelect: 1 }),
    new NumberField({ name: "x", min: 0, max: 100 }),
    new NumberField({ name: "y", min: 0, max: 100 }),
    new BoolField({ name: "active" }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ];
}

migrate((app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(COLLECTION);
  } catch (_) {
    collection = new Collection({ type: "base", name: COLLECTION, fields: [], indexes: [] });
  }

  for (const field of tableFields(app)) {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  }

  const indexes = collection.indexes ? [...collection.indexes] : [];
  if (!indexes.includes(UNIQUE_ROOM_NUMBER)) indexes.push(UNIQUE_ROOM_NUMBER);
  collection.indexes = indexes;

  collection.listRule = SVC;
  collection.viewRule = SVC;
  collection.createRule = SVC;
  collection.updateRule = SVC;
  collection.deleteRule = SVC;
  app.save(collection);
}, (app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(COLLECTION);
  } catch (_) {
    return;
  }
  app.delete(collection);
});
