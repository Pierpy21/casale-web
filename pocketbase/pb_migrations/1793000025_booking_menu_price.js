/// <reference path="../pb_data/types.d.ts" />
// Prezzo a persona del menù per singolo evento: bookings.menu_price (numero >= 0, facoltativo).
// 0 o vuoto = si usa il prezzo del menù in catalogo (menus.price_per_person). Il catalogo non cambia.
// Idempotente: aggiunge il campo solo se manca. Down: rimuove il campo (gli eventi tornano al prezzo di catalogo).

migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  if (!bookings.fields.getByName("menu_price")) {
    bookings.fields.add(new NumberField({ name: "menu_price", min: 0 }));
    app.save(bookings);
  }
}, (app) => {
  let bookings;
  try {
    bookings = app.findCollectionByNameOrId("bookings");
  } catch (_) {
    return;
  }
  if (bookings.fields.getByName("menu_price")) {
    bookings.fields.removeByName("menu_price");
    app.save(bookings);
  }
});
