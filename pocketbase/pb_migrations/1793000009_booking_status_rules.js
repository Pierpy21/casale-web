/// <reference path="../pb_data/types.d.ts" />
// Regole di stato delle prenotazioni. Idempotente; down no-op (i dati riallineati restano).
// - normali con stato "opzione" → "confermato" (le normali sono sempre confermate);
// - eventi con stato "opzione" che hanno almeno un acconto → "confermato".
// Gli eventi confermati senza acconti NON vengono declassati. Gli acconti non vengono toccati.

/** Id delle prenotazioni che soddisfano il filtro (letti tutti prima di modificare, per non saltare righe). */
function idsWhere(app, filter) {
  const ids = [];
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter("bookings", filter, "id", 200, offset);
    if (rows.length === 0) break;
    for (const row of rows) ids.push(row.id);
  }
  return ids;
}

function setStatusConfirmed(app, id) {
  const booking = app.findRecordById("bookings", id);
  booking.set("status", "confermato");
  app.save(booking);
}

function hasPayment(app, bookingId) {
  return app.findRecordsByFilter("payments", "booking = {:b}", "", 1, 0, { b: bookingId }).length > 0;
}

migrate((app) => {
  for (const id of idsWhere(app, 'kind = "normale" && status = "opzione"')) {
    setStatusConfirmed(app, id);
  }
  for (const id of idsWhere(app, 'kind = "evento" && status = "opzione"')) {
    if (hasPayment(app, id)) setStatusConfirmed(app, id);
  }
}, (app) => {
  // Nessun ripristino: non si sa quali prenotazioni erano in "opzione" prima della migrazione.
});
