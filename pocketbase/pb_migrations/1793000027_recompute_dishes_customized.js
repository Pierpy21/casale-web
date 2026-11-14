/// <reference path="../pb_data/types.d.ts" />
// Ricalcolo di bookings.dishes_customized per tutti gli eventi.
// - Motivo: la migrazione 1793000026 (prima 1793000023) confrontava i piatti con l'ordine globale di sort, che non coincide tra menù
//   (sort = posizione nell'editor del menù, senza raggruppamento per portata) e prenotazione (sort = indice per portata).
//   Così dishes_customized restava true anche quando i piatti erano uguali. Il confronto ora è per portata
//   (vedi dishSignature in lib/rpc/bookings.ts). 23 è già applicata sui server: serve questa migrazione.
// - Per ogni evento (kind "evento" o vuoto): false se non c'è menù o se il menù è composto (menus.custom); altrimenti
//   true solo se i piatti della prenotazione differiscono dalle voci del menù.
// - Gli id si leggono tutti prima di modificare; si salva solo dove il valore cambia.
// Idempotente: il valore è ricalcolato da zero ogni volta; le righe già corrette non vengono toccate.
//
// Down: no-op. Il valore calcolato è un dato derivato: il vecchio valore era sbagliato, non va ripristinato.
// Il campo dishes_customized resta, e la migrazione 23 ne gestisce la rimozione nel suo Down.

/** Id dei record che soddisfano il filtro (letti tutti prima di modificare). */
function idsWhere(app, collection, filter) {
  const ids = [];
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter(collection, filter, "id", 200, offset, {});
    if (rows.length === 0) break;
    for (const row of rows) ids.push(row.id);
  }
  return ids;
}

/** Tutti i record che soddisfano il filtro (a pagine di 200). */
function recordsWhere(app, collection, filter, params) {
  const out = [];
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter(collection, filter, "id", 200, offset, params);
    if (rows.length === 0) break;
    out.push(...rows);
  }
  return out;
}

/**
 * Firma di un elenco di piatti, per portata (come dishSignature in lib/rpc/bookings.ts): per ogni portata i nomi
 * (trim, spazi compressi, vuoti esclusi) in ordine di sort (a parità, alfabetico), chiave "portata|nome1\u0000nome2…".
 */
function dishSignature(rows) {
  const byCourse = new Map();
  for (const r of rows) {
    const name = String(r.get("name") || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const course = String(r.get("course"));
    const list = byCourse.get(course) || [];
    list.push({ sort: Number(r.get("sort")) || 0, name });
    byCourse.set(course, list);
  }
  return [...byCourse.entries()]
    .map(([course, list]) => {
      const names = list
        .sort((a, b) => a.sort - b.sort || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((x) => x.name);
      return `${course}|${names.join("\u0000")}`;
    })
    .sort();
}

function sameSignature(a, b) {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

migrate((app) => {
  // Se il campo non esiste (installazione senza la 23), non c'è nulla da ricalcolare.
  const bookingsCollection = app.findCollectionByNameOrId("bookings");
  if (!bookingsCollection.fields.getByName("dishes_customized")) return;

  // 1. Id di tutti gli eventi (anche quelli senza tipo, come i dati precedenti).
  const eventIds = idsWhere(app, "bookings", '(kind = "evento" || kind = "")');

  // 2. Firma del menù, calcolata una volta per menù.
  const signatureByMenu = new Map();
  const menuSignature = (menuId) => {
    if (!signatureByMenu.has(menuId)) {
      const items = recordsWhere(app, "menu_items", "menu = {:m}", { m: menuId });
      signatureByMenu.set(menuId, dishSignature(items));
    }
    return signatureByMenu.get(menuId);
  };

  // 3. Ricalcolo e salvataggio solo dove il valore cambia.
  for (const id of eventIds) {
    const booking = app.findRecordById("bookings", id);
    const menuId = String(booking.get("menu") || "");

    let customized = false;
    if (menuId) {
      let menu = null;
      try {
        menu = app.findRecordById("menus", menuId);
      } catch (_) {
        // Menù eliminato: nessun confronto possibile, la prenotazione non è modificata.
      }
      if (menu && !Boolean(menu.get("custom"))) {
        const dishes = recordsWhere(app, "booking_dishes", "booking = {:b}", { b: id });
        customized = !sameSignature(dishSignature(dishes), menuSignature(menuId));
      }
    }

    if (Boolean(booking.get("dishes_customized")) !== customized) {
      booking.set("dishes_customized", customized);
      app.save(booking);
    }
  }
}, (app) => {
  // Down: no-op. Vedi intestazione.
});
