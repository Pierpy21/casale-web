/// <reference path="../pb_data/types.d.ts" />
// Giacenza per fornitore e categoria. Idempotente, con down.
// - inventory_products: supplier (select viagrande | amadori | vegagel | altro, default altro), category (testo:
//   resta testo per compatibilita' con i dati esistenti, i valori fissi sono validati dall'app), sort (numero), unit.
// - inventory_report_lines: snapshot supplier e category (testo), copiati dal prodotto quando collegato.
// - Seed del catalogo (liste del ristorante), idempotente per name_key. Su un prodotto gia' esistente il seed
//   scrive fornitore, categoria, ordine e unita' SOLO se il fornitore e' vuoto: non sovrascrive mai modifiche dell'admin.
// - Backfill: prodotti con fornitore vuoto o categoria fuori elenco → altro; righe senza fornitore → dal prodotto, altrimenti altro.
// Le regole delle collezioni restano invariate (solo account di servizio app_services).
//
// Nota: come in 1793000004_inventory.js, campi e indici si aggiungono come proprieta' alla collezione esistente.

const SUPPLIERS = ["viagrande", "amadori", "vegagel", "altro"];
const CATEGORIES = ["ortofrutta", "latticini", "salumi", "carne_uova", "dispensa", "surgelati", "non_food", "altro"];

/**
 * Liste del ristorante. `sort` = posizione nella lista, contata per categoria su tutti i gruppi (in ordine).
 */
const SEED_GROUPS = [
  {
    supplier: "altro", unit: "cassa", category: "ortofrutta",
    items: [
      "Patate", "Cipolla", "Cipolletta", "Insalata", "Melanzana", "Peperoni", "Zucchina", "Misticanza", "Pomodoro",
      "Ciliegino rosso", "Ciliegino giallo", "Bietole", "Spinaci", "Prezzemolo", "Basilico", "Rosmarino",
      "Salvia, alloro e aromi", "Asparagi", "Carciofi", "Zucca", "Mele verdi",
    ],
  },
  {
    supplier: "viagrande", unit: "cartone", category: "dispensa",
    items: [
      "Aceto rosso Ponti", "Olio Friol", "Olio di semi", "Pelati", "Salsa (polpa)", "Farina di semola Riggi",
      "Farina 0 Merano (blu)", "Zucchero", "Sale", "Spezie (origano, rosmarino, pepe, aglio)",
    ],
  },
  {
    supplier: "viagrande", unit: "cartone", category: "latticini",
    items: [
      "Burro", "Margarina", "Provola affumicata", "Grana", "Philadelphia", "Gorgonzola", "Burrata", "Bufala",
      "Mozzarella", "Formaggio buccia gialla", "Edamer",
    ],
  },
  {
    supplier: "viagrande", unit: "cartone", category: "salumi",
    items: ["Mortadella", "Salame", "Coppa", "Guanciale", "Salumi artigianali Morselli", "Prosciutto crudo"],
  },
  {
    supplier: "viagrande", unit: "cartone", category: "surgelati",
    items: ["Patatine"],
  },
  {
    supplier: "altro", unit: "cartone", category: "dispensa",
    items: [
      "Farina 00", "Maizena", "Olio d'oliva", "Concentrato di pomodoro", "Aceto balsamico", "Pasta secca", "Lasagne",
      "Olive", "Pomodoro secco", "Pistacchio, mandorle e frutta secca",
    ],
  },
  {
    supplier: "altro", unit: "cartone", category: "latticini",
    items: ["Latte", "Mascarpone", "Provola dolce"],
  },
  {
    supplier: "altro", unit: "cartone", category: "salumi",
    items: ["Prosciutto cotto"],
  },
  {
    supplier: "vegagel", unit: "cartone", category: "surgelati",
    items: ["Gnocchi", "Ghiaccio"],
  },
  {
    supplier: "amadori", unit: "pz", category: "carne_uova",
    items: ["Pollo", "Controfiletto", "Lonza", "Noce", "Stinco", "Uova"],
  },
  {
    supplier: "amadori", unit: "pz", category: "non_food",
    items: [
      "Alluminio", "Carta forno", "Finger food e bastoncini di legno", "Pellicola", "Panni", "Aceto bianco (banconi)",
      "Sacchi", "Buste", "Buste sottovuoto", "Detergente lavapiatti",
    ],
  },
];

/** Chiave di unicita' (come productNameKey in lib/rpc/inventory.ts). */
function nameKeyOf(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Aggiunge solo i campi mancanti alla collezione esistente. Ritorna la collezione aggiornata. */
function addMissingFields(app, name, fields) {
  const collection = app.findCollectionByNameOrId(name);
  let changed = false;
  for (const field of fields) {
    if (!collection.fields.getByName(field.name)) {
      collection.fields.add(field);
      changed = true;
    }
  }
  if (changed) app.save(collection);
  return app.findCollectionByNameOrId(name);
}

/** Rimuove i campi indicati se presenti (per il down). */
function removeFields(app, name, names) {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(name);
  } catch (_) {
    return;
  }
  let changed = false;
  for (const field of names) {
    if (collection.fields.getByName(field)) {
      collection.fields.removeByName(field);
      changed = true;
    }
  }
  if (changed) app.save(collection);
}

/**
 * Seed: crea i prodotti mancanti. Se il prodotto esiste gia' e il fornitore e' vuoto, completa fornitore, categoria,
 * ordine e (se vuota) unita'. Se il fornitore e' gia' valorizzato non tocca nulla.
 */
function seedProducts(app) {
  const products = app.findCollectionByNameOrId("inventory_products");
  const sortByCategory = {};

  for (const group of SEED_GROUPS) {
    for (const name of group.items) {
      sortByCategory[group.category] = (sortByCategory[group.category] || 0) + 1;
      const sort = sortByCategory[group.category];
      const key = nameKeyOf(name);

      let row = null;
      try {
        row = app.findFirstRecordByFilter("inventory_products", "name_key = {:k}", { k: key });
      } catch (_) {
        // non presente: lo creo sotto
      }

      if (!row) {
        const record = new Record(products);
        record.set("name", name);
        record.set("name_key", key);
        record.set("unit", group.unit);
        record.set("category", group.category);
        record.set("supplier", group.supplier);
        record.set("sort", sort);
        record.set("active", true);
        app.save(record);
        continue;
      }

      if (!String(row.get("supplier") || "")) {
        row.set("supplier", group.supplier);
        row.set("category", group.category);
        row.set("sort", sort);
        if (!String(row.get("unit") || "")) row.set("unit", group.unit);
        app.save(row);
      }
    }
  }
}

/** Backfill prodotti: fornitore vuoto o categoria fuori elenco → altro. Scorre a pagine per id (il save non cambia l'ordine). */
function backfillProducts(app) {
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter("inventory_products", 'id != ""', "id", 200, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      let changed = false;
      if (!SUPPLIERS.includes(String(row.get("supplier") || ""))) {
        row.set("supplier", "altro");
        changed = true;
      }
      if (!CATEGORIES.includes(String(row.get("category") || ""))) {
        row.set("category", "altro");
        changed = true;
      }
      if (changed) app.save(row);
    }
  }
}

/** Backfill righe: snapshot fornitore e categoria dal prodotto collegato, altrimenti altro. */
function backfillLines(app) {
  const cache = {};
  const productOf = (id) => {
    if (!id) return null;
    if (!(id in cache)) {
      try {
        cache[id] = app.findRecordById("inventory_products", id);
      } catch (_) {
        cache[id] = null;
      }
    }
    return cache[id];
  };

  for (let guard = 0; guard < 100000; guard++) {
    const rows = app.findRecordsByFilter("inventory_report_lines", 'supplier = ""', "", 200, 0);
    if (rows.length === 0) break;
    for (const row of rows) {
      const product = productOf(String(row.get("product") || ""));
      const supplier = product ? String(product.get("supplier") || "") : "";
      const category = product ? String(product.get("category") || "") : "";
      row.set("supplier", SUPPLIERS.includes(supplier) ? supplier : "altro");
      row.set("category", CATEGORIES.includes(category) ? category : "altro");
      app.save(row);
    }
  }
}

migrate((app) => {
  // 1. Prodotti: fornitore, categoria (testo), ordine, unita'
  addMissingFields(app, "inventory_products", [
    new SelectField({ name: "supplier", values: SUPPLIERS, maxSelect: 1 }),
    new TextField({ name: "category", max: 80 }),
    new TextField({ name: "unit", max: 40 }),
    new NumberField({ name: "sort", onlyInt: true, min: 0 }),
  ]);

  // 2. Righe del report: snapshot di fornitore e categoria
  addMissingFields(app, "inventory_report_lines", [
    new TextField({ name: "supplier", max: 40 }),
    new TextField({ name: "category", max: 80 }),
  ]);

  // 3. Seed del catalogo, poi backfill (il seed va prima: completa i prodotti con fornitore vuoto)
  seedProducts(app);
  backfillProducts(app);
  backfillLines(app);
}, (app) => {
  removeFields(app, "inventory_report_lines", ["supplier", "category"]);
  removeFields(app, "inventory_products", ["supplier", "sort"]);
});
