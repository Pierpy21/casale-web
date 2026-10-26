/// <reference path="../pb_data/types.d.ts" />
// Tipi di prenotazione: evento | normale | appuntamento, e tipo evento (testo libero con suggerimenti).
// Idempotente: aggiunge i campi solo se mancano; le prenotazioni esistenti diventano "evento".
// Non modifica le migrazioni precedenti.

const KINDS = ["evento", "normale", "appuntamento"];

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("kind")) {
    bookings.fields.add(new SelectField({ name: "kind", values: KINDS, maxSelect: 1 }));
  }
  if (!bookings.fields.getByName("event_type")) {
    bookings.fields.add(new TextField({ name: "event_type", max: 60 }));
  }
  app.save(bookings);

  // Clienti creati da un solo campo "Nome" (nome completo): il cognome puo' essere vuoto.
  const clients = app.findCollectionByNameOrId("clients");
  const lastName = clients.fields.getByName("last_name");
  if (lastName && lastName.required) {
    lastName.required = false;
    app.save(clients);
  }

  // Backfill: tutto quello che c'era prima era un evento. Si rilegge sempre dall'inizio
  // finche' non restano record senza tipo (ogni save toglie il record dal filtro).
  for (let guard = 0; guard < 100000; guard++) {
    const rows = app.findRecordsByFilter("bookings", 'kind = ""', "", 200, 0);
    if (rows.length === 0) break;
    for (const row of rows) {
      row.set("kind", "evento");
      app.save(row);
    }
  }
}, (app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  bookings.fields.removeByName("kind");
  bookings.fields.removeByName("event_type");
  app.save(bookings);
});
