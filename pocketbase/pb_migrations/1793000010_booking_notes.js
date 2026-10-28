/// <reference path="../pb_data/types.d.ts" />
// Note interne sulle prenotazioni (cucina e admin): collezione booking_notes. Idempotente: crea la collezione
// solo se manca e aggiunge campi e indice solo se mancano. Down: elimina la collezione (le note si perdono).
// Come in 1793000004_inventory.js la collezione si crea vuota e campi, indici e regole si impostano dopo.
// Accesso: solo l'account di servizio (app_services), come le altre collezioni private.
// Le note si cancellano a cascata con la prenotazione.

const SVC = '@request.auth.collectionName = "app_services"';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const bookings = app.findCollectionByNameOrId("bookings");

  let notes;
  try {
    notes = app.findCollectionByNameOrId("booking_notes");
  } catch (_) {
    notes = new Collection({ type: "base", name: "booking_notes", fields: [], indexes: [] });
  }

  const fields = [
    new RelationField({ name: "booking", required: true, collectionId: bookings.id, maxSelect: 1, cascadeDelete: true }),
    new RelationField({ name: "author", collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new TextField({ name: "author_name", required: true, min: 1, max: 200 }),
    new TextField({ name: "body", required: true, min: 1, max: 2000 }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
  ];
  for (const field of fields) {
    if (!notes.fields.getByName(field.name)) notes.fields.add(field);
  }

  const index = "CREATE INDEX idx_booking_notes_booking ON booking_notes (booking)";
  const indexes = notes.indexes ? [...notes.indexes] : [];
  if (!indexes.includes(index)) indexes.push(index);
  notes.indexes = indexes;

  notes.listRule = SVC;
  notes.viewRule = SVC;
  notes.createRule = SVC;
  notes.updateRule = SVC;
  notes.deleteRule = SVC;
  app.save(notes);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("booking_notes"));
  } catch (_) {
    // gia' rimossa
  }
});
