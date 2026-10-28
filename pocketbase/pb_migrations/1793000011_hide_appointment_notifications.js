/// <reference path="../pb_data/types.d.ts" />
// Le notifiche sugli appuntamenti (kind = "appuntamento") restano solo agli admin: quelle destinate
// ad altri utenti vengono eliminate. Idempotente (alla seconda esecuzione non trova piu' nulla); down no-op.
// Gli id vengono letti tutti prima di cancellare, per non saltare righe durante la paginazione.

/** Id delle notifiche che soddisfano il filtro. */
function idsWhere(app, filter) {
  const ids = [];
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter("notifications", filter, "id", 200, offset);
    if (rows.length === 0) break;
    for (const row of rows) ids.push(row.id);
  }
  return ids;
}

migrate((app) => {
  const filter = 'booking.kind = "appuntamento" && user.role != "admin"';
  for (const id of idsWhere(app, filter)) {
    app.delete(app.findRecordById("notifications", id));
  }
}, (app) => {
  // Nessun ripristino: le notifiche eliminate non si possono ricostruire.
});
