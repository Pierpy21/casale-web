/// <reference path="../pb_data/types.d.ts" />
// Prenotazioni normali con ospite proprio: nessuna relazione con la rubrica clienti.
// Idempotente: aggiunge i campi solo se mancano, toglie il "required" solo se presente, e la parte dati
// lavora solo sulle prenotazioni normali ancora collegate a un cliente (alla seconda esecuzione non trova nulla).
//
// Up:
// 1. bookings.guest_name (testo, max 200) e bookings.guest_phone (testo, max 30): nome e cellulare dell'ospite.
// 2. bookings.client → facoltativo (required=false). Le prenotazioni evento/appuntamento continuano a usarlo.
// 3. Dati: per ogni prenotazione kind="normale" con cliente:
//    guest_name ← nome e cognome del cliente (solo se guest_name è vuoto); guest_phone ← telefono del cliente (idem);
//    poi il collegamento al cliente viene tolto (client = "").
// 4. Clienti orfani: si eliminano SOLO i clienti che erano collegati ad almeno una prenotazione normale prima di
//    questa migrazione e che, dopo lo scollegamento, non sono più referenziati da nessuna relazione verso "clients"
//    (bookings.client di evento/appuntamento o qualunque altra collezione). I clienti senza prenotazioni che non
//    erano mai stati collegati a una normale restano dove sono.
//    Vanno persi i dati che esistevano solo nel cliente eliminato: email, codice fiscale, P.IVA e note della rubrica.
//    Nome e cellulare restano sulla prenotazione normale. Prima di applicare, fare un backup del database.
// 5. Controllo di sicurezza: la lista delle relazioni verso "clients" si legge PRIMA di toccare qualunque dato. Se la
//    lettura non trova bookings.client, la migrazione si ferma senza modificare nulla.
//
// Down: NON reversibile in modo sicuro. Il cliente eliminato non si ricrea e i dati dell'ospite non si devono perdere
//    in silenzio. Il down quindi FALLISCE (senza modificare nulla) se:
//    - esistono prenotazioni normali senza cliente (il cliente obbligatorio non si può ricostruire), oppure
//    - esistono prenotazioni normali con guest_name o guest_phone compilati (si perderebbero i dati dell'ospite).
//    Per tornare indietro serve il backup del database prima della migrazione (docs/admin/POCKETBASE.md).

const NORMAL_LINKED_FILTER = 'kind = "normale" && client != ""';

/** Relazioni verso la collezione "clients": { collection, field }. Lette prima di qualsiasi modifica. */
function clientRelations(app, clientsId) {
  const refs = [];
  for (const col of app.findAllCollections()) {
    const fields = col.fields;
    const n = fields.length;
    for (let i = 0; i < n; i++) {
      const field = fields[i];
      // Nel JSVM i metodi Go sono funzioni (field.type()), i campi struct sono proprietà (field.collectionId).
      const type = typeof field.type === "function" ? field.type() : field.type;
      if (type === "relation" && field.collectionId === clientsId) {
        refs.push({ collection: col.name, field: field.name });
      }
    }
  }
  const knowsBookings = refs.some((r) => r.collection === "bookings" && r.field === "client");
  if (!knowsBookings) {
    throw new Error("Migrazione 1793000016 annullata: impossibile leggere le relazioni verso clients (bookings.client non trovato). Nessun dato è stato modificato.");
  }
  return refs;
}

/** Id delle prenotazioni normali collegate a un cliente (letti tutti prima di modificare). */
function normalLinkedRows(app) {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const page = app.findRecordsByFilter("bookings", NORMAL_LINKED_FILTER, "id", 200, offset);
    if (page.length === 0) break;
    for (const row of page) rows.push(row);
  }
  return rows;
}

function findClient(app, id) {
  try {
    return app.findRecordById("clients", id);
  } catch (_) {
    return null;
  }
}

/** True se almeno una relazione verso clients punta ancora a questo cliente. */
function clientStillReferenced(app, refs, clientId) {
  for (const ref of refs) {
    const rows = app.findRecordsByFilter(ref.collection, ref.field + " = {:id}", "", 1, 0, { id: clientId });
    if (rows.length > 0) return true;
  }
  return false;
}

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  let changed = false;
  if (!bookings.fields.getByName("guest_name")) {
    bookings.fields.add(new TextField({ name: "guest_name", max: 200 }));
    changed = true;
  }
  if (!bookings.fields.getByName("guest_phone")) {
    bookings.fields.add(new TextField({ name: "guest_phone", max: 30 }));
    changed = true;
  }
  const clientField = bookings.fields.getByName("client");
  if (clientField && clientField.required) {
    clientField.required = false;
    changed = true;
  }
  if (changed) app.save(bookings);

  // Controllo prima di toccare i dati: se le relazioni non si leggono, la migrazione si ferma qui.
  const clients = app.findCollectionByNameOrId("clients");
  const refs = clientRelations(app, clients.id);

  // Dati: copia di nome e telefono sulla prenotazione, poi scollegamento. Le righe si leggono tutte prima.
  // Clienti candidati: array (non Set) per restare nel perimetro sicuro di goja (runtime JSVM di PocketBase).
  const candidates = [];
  const rows = normalLinkedRows(app);
  for (const row of rows) {
    const clientId = String(row.get("client") || "");
    const client = findClient(app, clientId);
    let name = String(row.get("guest_name") || "").trim();
    let phone = String(row.get("guest_phone") || "").trim();
    if (client) {
      if (candidates.indexOf(clientId) === -1) candidates.push(clientId);
      if (!name) {
        name = `${String(client.get("first_name") || "")} ${String(client.get("last_name") || "")}`.trim();
      }
      if (!phone) phone = String(client.get("phone") || "").trim();
    }
    row.set("guest_name", name.slice(0, 200));
    row.set("guest_phone", phone.slice(0, 30));
    row.set("client", "");
    app.save(row);
  }

  // Clienti orfani: solo quelli collegati a una normale prima di questa migrazione e ora senza riferimenti.
  for (let i = 0; i < candidates.length; i++) {
    const clientId = candidates[i];
    const client = findClient(app, clientId);
    if (!client) continue;
    if (clientStillReferenced(app, refs, clientId)) continue;
    app.delete(client);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  const hasGuestName = !!bookings.fields.getByName("guest_name");
  const hasGuestPhone = !!bookings.fields.getByName("guest_phone");

  const unlinked = app.findRecordsByFilter("bookings", 'kind = "normale" && client = ""', "", 1, 0);
  if (unlinked.length > 0) {
    throw new Error(
      "Rollback 1793000016 annullato: esistono prenotazioni normali senza cliente, non si può ripristinare bookings.client obbligatorio. Nessun dato è stato modificato.",
    );
  }
  if (hasGuestName || hasGuestPhone) {
    const parts = [];
    if (hasGuestName) parts.push('guest_name != ""');
    if (hasGuestPhone) parts.push('guest_phone != ""');
    const withGuest = app.findRecordsByFilter("bookings", `kind = "normale" && (${parts.join(" || ")})`, "", 1, 0);
    if (withGuest.length > 0) {
      throw new Error(
        "Rollback 1793000016 annullato: esistono prenotazioni normali con nome o cellulare dell'ospite, che andrebbero persi. Ripristinare dal backup. Nessun dato è stato modificato.",
      );
    }
  }

  const clientField = bookings.fields.getByName("client");
  if (clientField) clientField.required = true;
  if (hasGuestName) bookings.fields.removeByName("guest_name");
  if (hasGuestPhone) bookings.fields.removeByName("guest_phone");
  app.save(bookings);
});
