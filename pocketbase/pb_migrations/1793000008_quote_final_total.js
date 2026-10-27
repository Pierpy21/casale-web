/// <reference path="../pb_data/types.d.ts" />
// Prezzo finale del preventivo (IVA inclusa), facoltativo: sostituisce il totale calcolato dalle righe.
// Idempotente: aggiunge il campo solo se manca. Down: rimuove il campo (i preventivi restano).
// PocketBase non distingue null da 0 nei campi numero: 0 = nessun prezzo finale (lo gestisce l'app).

migrate((app) => {
  const quotes = app.findCollectionByNameOrId("quotes");
  if (!quotes.fields.getByName("final_total")) {
    quotes.fields.add(new NumberField({ name: "final_total", min: 0, max: 1000000 }));
    app.save(quotes);
  }
}, (app) => {
  let quotes;
  try {
    quotes = app.findCollectionByNameOrId("quotes");
  } catch (_) {
    return;
  }
  if (quotes.fields.getByName("final_total")) {
    quotes.fields.removeByName("final_total");
    app.save(quotes);
  }
});
