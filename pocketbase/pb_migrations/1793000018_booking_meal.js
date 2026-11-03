/// <reference path="../pb_data/types.d.ts" />
// Pasto delle prenotazioni: pranzo o cena, al posto dell'orario per evento e prenotazione normale.
// L'appuntamento mantiene bookings.event_time (orario vero).
// Idempotente: aggiunge il campo solo se manca; il backfill lavora solo sui record ancora con un orario.
//
// Up:
// 1. bookings.meal (select: pranzo | cena, facoltativo, 1 valore).
// 2. Dati: per ogni prenotazione con kind != "appuntamento" e event_time valorizzato:
//    meal ← "pranzo" se l'ora è prima delle 16:00, altrimenti "cena"; poi event_time viene svuotato.
//    Un orario non leggibile (non HH:MM) resta com'è: non si indovina il pasto.
//    Gli id si leggono tutti prima di modificare (ogni save toglie il record dal filtro).
// 3. bookings.event_time resta nello schema (lo usa l'appuntamento).
//
// Down: rimuove solo il campo meal. Gli orari cancellati dal backfill NON si ricostruiscono (il pasto
//    non dice l'ora esatta): per tornare indietro serve il backup del database prima della migrazione.

const TIMED_FILTER = 'kind != "appuntamento" && event_time != ""';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d/;

/** Id delle prenotazioni da convertire (letti tutti prima di modificare). */
function timedBookingIds(app) {
  const ids = [];
  for (let offset = 0; ; offset += 200) {
    const page = app.findRecordsByFilter("bookings", TIMED_FILTER, "id", 200, offset);
    if (page.length === 0) break;
    for (const row of page) ids.push(row.id);
  }
  return ids;
}

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("meal")) {
    bookings.fields.add(new SelectField({ name: "meal", values: ["pranzo", "cena"], maxSelect: 1 }));
    app.save(bookings);
  }

  for (const id of timedBookingIds(app)) {
    const row = app.findRecordById("bookings", id);
    const time = String(row.get("event_time") || "");
    if (!TIME_PATTERN.test(time)) continue;
    const hour = Number(time.slice(0, 2));
    row.set("meal", hour < 16 ? "pranzo" : "cena");
    row.set("event_time", "");
    app.save(row);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (bookings.fields.getByName("meal")) {
    bookings.fields.removeByName("meal");
    app.save(bookings);
  }
});
