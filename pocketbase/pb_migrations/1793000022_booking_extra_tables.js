/// <reference path="../pb_data/types.d.ts" />
// Tavoli extra di un evento (Mappa sala, FASE 4): bookings.extra_tables = array JSON di numeri di tavolo aggiuntivi
// nella stessa sala. Il tavolo principale resta in bookings.table_number (compatibilità con fogli ed export).
// Idempotente: aggiunge il campo solo se manca. Down: rimuove il campo (le prenotazioni restano, con il solo tavolo principale).

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("extra_tables")) {
    bookings.fields.add(new JSONField({ name: "extra_tables", maxSize: 2000 }));
    app.save(bookings);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (bookings.fields.getByName("extra_tables")) {
    bookings.fields.removeByName("extra_tables");
    app.save(bookings);
  }
});
