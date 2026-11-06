/// <reference path="../pb_data/types.d.ts" />
// Rotazione dei tavoli della "Mappa sala" (room_tables.rotation): gradi in senso orario, intero 0–359 (0 = orizzontale).
// Idempotente: aggiunge il campo solo se manca. NON obbligatorio: in PocketBase lo 0 di un campo numero è considerato
// vuoto, quindi 0 (tavolo orizzontale) è il valore di default gestito dall'app (mapper e validazione).
// Down: rimuove il campo (i tavoli restano con la disposizione senza rotazione).

migrate((app) => {
  const tables = app.findCollectionByNameOrId("room_tables");
  if (!tables.fields.getByName("rotation")) {
    tables.fields.add(new NumberField({ name: "rotation", onlyInt: true, min: 0, max: 359 }));
    app.save(tables);
  }
}, (app) => {
  let tables;
  try {
    tables = app.findCollectionByNameOrId("room_tables");
  } catch (_) {
    return;
  }
  if (tables.fields.getByName("rotation")) {
    tables.fields.removeByName("rotation");
    app.save(tables);
  }
});
