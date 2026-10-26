/// <reference path="../pb_data/types.d.ts" />
// Seed del catalogo (SPEC §2, 0001_init.sql sezioni 9-10, ordine sale da 0003_rooms_order.sql).
// Idempotente: non duplica le sale/menu gia' presenti per nome.

const ROOMS = [
  // Ordine richiesto dal cliente (0003_rooms_order.sql).
  ["Sala Grande", 80, 1],
  ["Palmento", 120, 2],
  ["Sala 1", 40, 3],
  ["Sala 2", 20, 4],
  ["Sala 3", 35, 5],
  ["Pozzo", 60, 6],
  ["Terrazza", 300, 7],
];

const BEVANDE = [
  ["Acqua", 1],
  ["Vino Barone Montalto", 2],
  ["Caffè", 3],
  ["Amaro", 4],
];

const ANTIPASTO = "Selezione di antipasti del casale";

// [nome, prezzo, isKids, sort, voci: [corso, nome, sort][]]
const MENUS = [
  ["Menù 1", 46, false, 1, [
    ["antipasto", ANTIPASTO, 1],
    ["primo", "Caserecce di pasta fresca al guanciale di Norcia su base di pomodoro fresco", 1],
    ["secondo", "Fagottino di vitellina con cuore morbido alla zucca, olive nere e infuso alla salvia", 1],
    ["secondo", "Stinco di maiale speziato al forno", 2],
    ["contorno", "Patate al forno al rosmarino", 1],
    ...BEVANDE.map(([n, s]) => ["bevande", n, s]),
  ]],
  ["Menù 2", 40, false, 2, [
    ["antipasto", ANTIPASTO, 1],
    ["primo", "Millefoglie di pasta fresca con funghi cardoncelli con emulsione di prezzemolo", 1],
    ["secondo", "Arrotolato di vitello ai sapori d'autunno", 1],
    ["contorno", "Patate al forno al rosmarino", 1],
    ...BEVANDE.map(([n, s]) => ["bevande", n, s]),
  ]],
  ["Menù 3", 44, false, 3, [
    ["antipasto", ANTIPASTO, 1],
    ["primo", "Millefoglie di pasta fresca alla zucca e provola affumicata del Belice", 1],
    ["secondo", "Stracotto di vitello al frappato di Sicilia e crosta di formaggio sicano", 1],
    ["contorno", "Patate al forno al rosmarino", 1],
    ...BEVANDE.map(([n, s]) => ["bevande", n, s]),
  ]],
  ["Menù 4", 50, false, 4, [
    ["antipasto", ANTIPASTO, 1],
    ["primo", "Caserecce di pasta fresca con salsiccia al ceppo, radicchio e briciole di pane al cacio ragusano", 1],
    ["primo", "Ravioli di pasta fresca con pistacchi e crema di bufala", 2],
    ["secondo", "Vitellina con cipolle rosse caramellate, chips di patate, emulsione di basilico", 1],
    ["contorno", "Insalatina di cavolo rosso", 1],
    ...BEVANDE.map(([n, s]) => ["bevande", n, s]),
  ]],
  ["Menù Bambini", 20, true, 5, [
    ["primo", "Pasta (al pomodoro, al pesto o al pistacchio)", 1],
    ["secondo", "Cotoletta con patatine fritte", 1],
  ]],
];

function findByName(app, collection, name) {
  try {
    return app.findFirstRecordByFilter(collection, "name = {:name}", { name: name });
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const roomsCollection = app.findCollectionByNameOrId("rooms");
  for (const [name, capacity, sort] of ROOMS) {
    if (findByName(app, "rooms", name)) continue;
    const record = new Record(roomsCollection);
    record.set("name", name);
    record.set("capacity", capacity);
    record.set("sort", sort);
    record.set("active", true);
    app.save(record);
  }

  const menusCollection = app.findCollectionByNameOrId("menus");
  const itemsCollection = app.findCollectionByNameOrId("menu_items");
  for (const [name, price, isKids, sort, items] of MENUS) {
    if (findByName(app, "menus", name)) continue;
    const menu = new Record(menusCollection);
    menu.set("name", name);
    menu.set("season", "Autunno");
    menu.set("price_per_person", price);
    menu.set("is_kids", isKids);
    menu.set("active", true);
    menu.set("sort", sort);
    app.save(menu);

    for (const [course, itemName, itemSort] of items) {
      const item = new Record(itemsCollection);
      item.set("menu", menu.id);
      item.set("course", course);
      item.set("name", itemName);
      item.set("sort", itemSort);
      app.save(item);
    }
  }
}, (app) => {
  // Rollback: rimuove solo il catalogo seminato da questa migrazione (nomi noti).
  for (const [name] of MENUS) {
    const menu = findByName(app, "menus", name);
    if (menu) app.delete(menu);
  }
  for (const [name] of ROOMS) {
    const room = findByName(app, "rooms", name);
    if (room) app.delete(room);
  }
});
