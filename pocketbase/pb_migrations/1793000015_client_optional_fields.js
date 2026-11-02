/// <reference path="../pb_data/types.d.ts" />
// Clienti: cognome e cellulare facoltativi (alla creazione di una prenotazione basta il nome).
// Idempotente: tocca solo i campi che non sono già nello stato desiderato.
// Up: clients.last_name e clients.phone → required=false, min=0 (il max resta). Il formato del telefono
//     (minimo 6 caratteri se compilato) si controlla nell'app (lib/validation.ts).
// Nota: clients.last_name era già facoltativo dalla migrazione 1793000003_booking_kinds.js; qui si allinea anche il minimo.
// Down: ripristina clients.phone required=true, min=6 e clients.last_name min=1 (required resta false, come dopo 1793000003).
//       Il down FALLISCE se esistono clienti con telefono o cognome vuoti: i valori mancanti non si possono inventare.
//       Per tornare indietro bisogna prima compilare (o eliminare, se senza prenotazioni) quei clienti.

migrate((app) => {
  const clients = app.findCollectionByNameOrId("clients");
  let changed = false;
  for (const name of ["last_name", "phone"]) {
    const field = clients.fields.getByName(name);
    if (!field) continue;
    if (field.required || field.min !== 0) {
      field.required = false;
      field.min = 0;
      changed = true;
    }
  }
  if (changed) app.save(clients);
}, (app) => {
  let clients;
  try {
    clients = app.findCollectionByNameOrId("clients");
  } catch (_) {
    return;
  }
  const emptyPhones = app.findRecordsByFilter("clients", 'phone = ""', "", 1, 0);
  const emptyLastNames = app.findRecordsByFilter("clients", 'last_name = ""', "", 1, 0);
  if (emptyPhones.length > 0 || emptyLastNames.length > 0) {
    throw new Error(
      "Impossibile ripristinare clients.phone obbligatorio e clients.last_name con minimo 1: esistono clienti con telefono o cognome vuoti. Compilarli prima del rollback.",
    );
  }
  const phone = clients.fields.getByName("phone");
  if (phone) {
    phone.required = true;
    phone.min = 6;
  }
  const lastName = clients.fields.getByName("last_name");
  if (lastName) {
    lastName.min = 1;
  }
  app.save(clients);
});
