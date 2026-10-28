/// <reference path="../pb_data/types.d.ts" />
// Modalità offline (contratto in lib/offline/contract.ts): idempotenza dei reinvii e controllo dei conflitti.
// Idempotente, con down.
// - applied_mutations: una riga per ogni modifica (mutation_id = UUID v4). Prima di eseguire l'azione il server
//   inserisce la riga con status "pending" (prenotazione dell'id, claimed_at). A successo diventa "done" con il
//   risultato; a fallimento la riga si elimina, così la coda può correggere e reinviare. Un reinvio trova
//   "done" → restituisce il risultato salvato; "pending" recente → in_progress; "pending" più vecchio di 2 minuti
//   → esecuzione interrotta, si riprende. Le righe più vecchie di 30 giorni si eliminano (lib/mutations.ts).
// - rooms.updated: le sale non avevano il campo `updated`, necessario al controllo di conflitto (expectedUpdated).
// Come in 1793000010_booking_notes.js la collezione si crea vuota e campi, indici e regole si impostano dopo.
// Accesso: solo l'account di servizio (app_services).

const SVC = '@request.auth.collectionName = "app_services"';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // 1. Sale: data di ultima modifica
  const rooms = app.findCollectionByNameOrId("rooms");
  if (!rooms.fields.getByName("updated")) {
    rooms.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(rooms);
  }

  // 2. Modifiche già applicate
  let applied;
  try {
    applied = app.findCollectionByNameOrId("applied_mutations");
  } catch (_) {
    applied = new Collection({ type: "base", name: "applied_mutations", fields: [], indexes: [] });
  }

  const fields = [
    new TextField({ name: "mutation_id", required: true, min: 36, max: 36 }),
    new TextField({ name: "action", max: 200 }),
    // "pending" = id prenotato, azione in corso; "done" = applicata con successo.
    new SelectField({ name: "status", required: true, values: ["pending", "done"], maxSelect: 1 }),
    // Inizio della prenotazione "pending" (ISO): oltre 2 minuti l'esecuzione si considera interrotta.
    new TextField({ name: "claimed_at", max: 40 }),
    // Risultato ok della prima applicazione (es. { ok: true, data: { id } }): piccolo per design.
    new JSONField({ name: "result", maxSize: 20000 }),
    new RelationField({ name: "actor", collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
    new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
  ];
  for (const field of fields) {
    if (!applied.fields.getByName(field.name)) applied.fields.add(field);
  }

  const indexes = applied.indexes ? [...applied.indexes] : [];
  for (const index of [
    "CREATE UNIQUE INDEX idx_applied_mutations_mutation_id ON applied_mutations (mutation_id)",
    // Pulizia delle righe vecchie (created < soglia).
    "CREATE INDEX idx_applied_mutations_created ON applied_mutations (created)",
  ]) {
    if (!indexes.includes(index)) indexes.push(index);
  }
  applied.indexes = indexes;

  applied.listRule = SVC;
  applied.viewRule = SVC;
  applied.createRule = SVC;
  applied.updateRule = SVC;
  applied.deleteRule = SVC;
  app.save(applied);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("applied_mutations"));
  } catch (_) {
    // gia' rimossa
  }
  try {
    const rooms = app.findCollectionByNameOrId("rooms");
    if (rooms.fields.getByName("updated")) {
      rooms.fields.removeByName("updated");
      app.save(rooms);
    }
  } catch (_) {
    // collezione assente
  }
});
