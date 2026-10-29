/// <reference path="../pb_data/types.d.ts" />
// Tavolo delle prenotazioni normali (facoltativo): numero del tavolo assegnato in sala.
// Idempotente: aggiunge il campo solo se manca. Down: rimuove il campo (le prenotazioni restano).
// PocketBase non distingue null da 0 nei campi numero: 0 = nessun tavolo (lo gestisce l'app).

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("table_number")) {
    bookings.fields.add(new NumberField({ name: "table_number", onlyInt: true, min: 0, max: 9999 }));
    app.save(bookings);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (bookings.fields.getByName("table_number")) {
    bookings.fields.removeByName("table_number");
    app.save(bookings);
  }
});
