/// <reference path="../pb_data/types.d.ts" />
// Menù composto per un evento e piatti modificati (eventi).
// - menus.custom (bool, default false): menù creato per un solo evento. Non compare tra i menù scelti, nel catalogo,
//   nei colori dei menù né sul sito pubblico. Resta leggibile dalla prenotazione che lo usa (nome, prezzo, voci).
// - bookings.dishes_customized (bool, default false): i piatti dell'evento sono diversi dal suo menù (scelta dell'admin).
//   Un menù composto non si segna mai come modificato: il menù è già dell'evento.
// - Regole: menus e menu_items sono leggibili pubblicamente solo per i menù attivi e NON composti.
// - Backfill: per ogni evento con menù, dishes_customized = true se i piatti della prenotazione differiscono dalle voci
//   del menù (confronto per portata: nomi in ordine di sort dentro ogni portata); false se coincidono o se il menù è
//   composto. Gli id si leggono tutti prima di modificare; si salva solo dove il valore cambia.
//   Sui server dove questa migrazione è già stata applicata non viene rieseguita: il ricalcolo è in 1793000027 (prima 1793000024).
// Idempotente: i campi si aggiungono solo se mancano; le regole si reimpostano sempre.
//
// Down: ripristina le regole precedenti, disattiva i menù composti (così non tornano tra i menù scelti; le prenotazioni
//    restano con il loro menù), poi rimuove menus.custom e bookings.dishes_customized.

const SVC = '@request.auth.collectionName = "app_services"';
const MENUS_RULE_OLD = `active = true || ${SVC}`;
const MENUS_RULE_NEW = `(active = true && custom != true) || ${SVC}`;
const MENU_ITEMS_RULE_OLD = `menu.active = true || ${SVC}`;
const MENU_ITEMS_RULE_NEW = `(menu.active = true && menu.custom != true) || ${SVC}`;

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
  // 1. Campi.
  const menus = app.findCollectionByNameOrId("menus");
  if (!menus.fields.getByName("custom")) {
    menus.fields.add(new BoolField({ name: "custom" }));
    app.save(menus);
  }
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("dishes_customized")) {
    bookings.fields.add(new BoolField({ name: "dishes_customized" }));
    app.save(bookings);
  }

  // 2. Regole: il menù composto non è leggibile pubblicamente (il campo `custom` esiste già, vedi sopra).
  const menuItems = app.findCollectionByNameOrId("menu_items");
  menus.listRule = MENUS_RULE_NEW;
  menus.viewRule = MENUS_RULE_NEW;
  app.save(menus);
  menuItems.listRule = MENU_ITEMS_RULE_NEW;
  menuItems.viewRule = MENU_ITEMS_RULE_NEW;
  app.save(menuItems);

  // 3. Backfill: solo eventi (anche quelli senza tipo, come i dati precedenti) con un menù.
  const eventIds = idsWhere(app, "bookings", '(kind = "evento" || kind = "") && menu != ""');
  const signatureByMenu = new Map();
  const menuSignature = (menuId) => {
    if (!signatureByMenu.has(menuId)) {
      const items = recordsWhere(app, "menu_items", "menu = {:m}", { m: menuId });
      signatureByMenu.set(menuId, dishSignature(items));
    }
    return signatureByMenu.get(menuId);
  };

  for (const id of eventIds) {
    const booking = app.findRecordById("bookings", id);
    const menuId = String(booking.get("menu") || "");
    let menu = null;
    try {
      menu = app.findRecordById("menus", menuId);
    } catch (_) {
      // Menù eliminato: nessun confronto possibile, la prenotazione non è modificata.
    }

    let customized = false;
    if (menu && !Boolean(menu.get("custom"))) {
      const dishes = recordsWhere(app, "booking_dishes", "booking = {:b}", { b: id });
      customized = !sameSignature(dishSignature(dishes), menuSignature(menuId));
    }
    if (Boolean(booking.get("dishes_customized")) !== customized) {
      booking.set("dishes_customized", customized);
      app.save(booking);
    }
  }
}, (app) => {
  let menus;
  let menuItems;
  try {
    menus = app.findCollectionByNameOrId("menus");
    menuItems = app.findCollectionByNameOrId("menu_items");
  } catch (_) {
    return;
  }

  // 1. Menù composti: disattivati, così non tornano tra i menù scelti. Le prenotazioni restano con il loro menù.
  if (menus.fields.getByName("custom")) {
    for (const id of idsWhere(app, "menus", "custom = true")) {
      const menu = app.findRecordById("menus", id);
      menu.set("active", false);
      app.save(menu);
    }
  }

  // 2. Regole precedenti: prima di togliere il campo `custom`, che vi compare.
  menus.listRule = MENUS_RULE_OLD;
  menus.viewRule = MENUS_RULE_OLD;
  app.save(menus);
  menuItems.listRule = MENU_ITEMS_RULE_OLD;
  menuItems.viewRule = MENU_ITEMS_RULE_OLD;
  app.save(menuItems);

  // 3. Campi.
  if (menus.fields.getByName("custom")) {
    menus.fields.removeByName("custom");
    app.save(menus);
  }
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (bookings.fields.getByName("dishes_customized")) {
    bookings.fields.removeByName("dishes_customized");
    app.save(bookings);
  }
});
