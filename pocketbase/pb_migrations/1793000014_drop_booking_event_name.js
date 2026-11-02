/// <reference path="../pb_data/types.d.ts" />
// Rimozione del campo "Nome evento" (event_name) dalle prenotazioni: il titolo è sempre il nome del cliente.
// Idempotente: rimuove il campo solo se presente. Up: il valore dei nomi evento esistenti va perso (non recuperabile).
// Down: ri-aggiunge il campo di testo vuoto (i nomi precedenti NON vengono ripristinati).
// Nessun indice o regola API di "bookings" fa riferimento al campo (verificato nelle migrazioni precedenti).

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (bookings.fields.getByName("event_name")) {
    bookings.fields.removeByName("event_name");
    app.save(bookings);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (!bookings.fields.getByName("event_name")) {
    bookings.fields.add(new TextField({ name: "event_name", max: 200 }));
    app.save(bookings);
  }
});
