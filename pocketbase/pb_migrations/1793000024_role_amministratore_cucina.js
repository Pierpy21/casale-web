/// <reference path="../pb_data/types.d.ts" />
// Nuovo ruolo operatore "amministratore_cucina" (Amministratore cucina): aggiunto ai valori del select users.role.
// Idempotente: aggiunge il valore solo se manca. L'indice idx_users_single_admin vale solo per role = 'admin', quindi
// gli amministratori cucina possono essere più di uno.
// Down: gli utenti con il nuovo ruolo tornano "cucina" (prima di togliere il valore), poi il valore viene rimosso.

const ROLE = "amministratore_cucina";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const field = users.fields.getByName("role");
  const values = [...(field.values || [])];
  if (!values.includes(ROLE)) {
    values.push(ROLE);
    field.values = values;
    app.save(users);
  }
}, (app) => {
  let users;
  try {
    users = app.findCollectionByNameOrId("users");
  } catch (_) {
    return;
  }
  const records = app.findRecordsByFilter("users", "role = {:r}", "", 0, 0, { r: ROLE });
  for (const record of records) {
    record.set("role", "cucina");
    app.save(record);
  }
  const field = users.fields.getByName("role");
  const values = (field.values || []).filter((v) => v !== ROLE);
  if (values.length !== (field.values || []).length) {
    field.values = values;
    app.save(users);
  }
});
