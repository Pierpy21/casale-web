/// <reference path="../pb_data/types.d.ts" />
// Disposizione del giorno della "Mappa sala" (room_tables): tavoli validi solo per un giorno e un pasto (es. tavolata di un evento).
// Idempotente: aggiunge campi e indice solo se mancano; i valori dei campi esistenti vengono riallineati.
//
// Modifiche (up):
// - layout_date: testo YYYY-MM-DD, facoltativo. Vuoto = disposizione standard della sala.
// - layout_meal: pranzo | cena, facoltativo. Vuoto = standard.
// - shape: aggiunte le forme "L" e "U" (tavolate da banchetto).
// - seats: massimo 300 (tavolate grandi).
// - indice unico: (room, layout_date, layout_meal, number) al posto di (room, number). Così standard e disposizioni
//   di giorno possono avere lo stesso numero di tavolo nella stessa sala.
//
// Down: elimina i tavoli della disposizione del giorno (altrimenti l'indice originale fallirebbe), riporta
// seats > 40 a 40 e le forme L/U a rettangolare, poi rimuove i campi e ripristina indice e valori originali.

const COLLECTION = "room_tables";
const SHAPES_OLD = ["tondo", "quadrato", "rettangolare"];
const SHAPES_NEW = ["tondo", "quadrato", "rettangolare", "L", "U"];
const INDEX_OLD = "CREATE UNIQUE INDEX idx_room_tables_room_number ON room_tables (room, number)";
const INDEX_NEW = "CREATE UNIQUE INDEX idx_room_tables_scope_number ON room_tables (room, layout_date, layout_meal, number)";
const INDEX_OLD_KEY = "idx_room_tables_room_number";
const INDEX_NEW_KEY = "idx_room_tables_scope_number";
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

/**
 * Ridefinisce shape e seats mantenendo lo stesso id (fields.add con un id esistente sostituisce il campo
 * senza perdere i dati): più sicuro che assegnare .values/.max ai campi esistenti dalla JSVM.
 */
function setShapeAndSeats(collection, shapes, maxSeats) {
  const shape = collection.fields.getByName("shape");
  if (shape) {
    collection.fields.add(new SelectField({ id: shape.id, name: "shape", required: true, values: shapes, maxSelect: 1 }));
  }
  const seats = collection.fields.getByName("seats");
  if (seats) {
    collection.fields.add(new NumberField({ id: seats.id, name: "seats", required: true, onlyInt: true, min: 1, max: maxSeats }));
  }
}

migrate((app) => {
  const tables = app.findCollectionByNameOrId(COLLECTION);

  if (!tables.fields.getByName("layout_date")) {
    tables.fields.add(new TextField({ name: "layout_date", max: 10, pattern: DATE_PATTERN }));
  }
  if (!tables.fields.getByName("layout_meal")) {
    tables.fields.add(new SelectField({ name: "layout_meal", values: ["pranzo", "cena"], maxSelect: 1 }));
  }

  setShapeAndSeats(tables, SHAPES_NEW, 300);

  // Indice: via quello originale (contiene idx_room_tables_room_number), poi quello con lo scope.
  const indexes = (tables.indexes ? [...tables.indexes] : []).filter((idx) => !idx.includes(INDEX_OLD_KEY));
  if (!indexes.some((idx) => idx.includes(INDEX_NEW_KEY))) indexes.push(INDEX_NEW);
  tables.indexes = indexes;

  app.save(tables);
}, (app) => {
  let tables;
  try {
    tables = app.findCollectionByNameOrId(COLLECTION);
  } catch (_) {
    return;
  }

  const hasLayoutFields = Boolean(tables.fields.getByName("layout_date") || tables.fields.getByName("layout_meal"));

  // 1. Dati: i tavoli della disposizione del giorno vanno eliminati (non disattivati), altrimenti l'indice originale fallisce.
  if (hasLayoutFields) {
    const scopeFilter = "layout_date != '' || layout_meal != ''";
    for (;;) {
      const rows = app.findRecordsByFilter(COLLECTION, scopeFilter, "id", 200, 0);
      if (rows.length === 0) break;
      for (const row of rows) app.delete(row);
    }
  }

  // 2. Dati compatibili con i valori originali: posti oltre 40 e forme L/U.
  for (;;) {
    const rows = app.findRecordsByFilter(COLLECTION, "seats > 40", "id", 200, 0);
    if (rows.length === 0) break;
    for (const row of rows) {
      row.set("seats", 40);
      app.save(row);
    }
  }
  for (const shapeName of ["L", "U"]) {
    for (;;) {
      const rows = app.findRecordsByFilter(COLLECTION, "shape = {:s}", "id", 200, 0, { s: shapeName });
      if (rows.length === 0) break;
      for (const row of rows) {
        row.set("shape", "rettangolare");
        app.save(row);
      }
    }
  }

  // 3. Schema: indice originale, campi rimossi, valori originali.
  const indexes = (tables.indexes ? [...tables.indexes] : []).filter((idx) => !idx.includes(INDEX_NEW_KEY));
  if (!indexes.some((idx) => idx.includes(INDEX_OLD_KEY))) indexes.push(INDEX_OLD);
  tables.indexes = indexes;

  if (tables.fields.getByName("layout_date")) tables.fields.removeByName("layout_date");
  if (tables.fields.getByName("layout_meal")) tables.fields.removeByName("layout_meal");

  setShapeAndSeats(tables, SHAPES_OLD, 40);

  app.save(tables);
});
