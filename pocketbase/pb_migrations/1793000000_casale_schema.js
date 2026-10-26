/// <reference path="../pb_data/types.d.ts" />
// Schema Casale del Notaio per PocketBase 0.40 (specchio delle migrazioni SQL legacy).
// Idempotente: crea le collezioni mancanti, aggiunge solo i campi mancanti (non tocca quelli
// esistenti, es. `name` o `avatar` di users) e imposta le regole.
//
// Accesso: tutte le collezioni dati sono leggibili/scrivibili SOLO dall'account di servizio
// (collezione auth `app_services`, usato dal server Next). Eccezioni:
// - notifications list/view: anche il destinatario (`user = @request.auth.id`), per il realtime;
// - menus list/view: anche pubblico per i menu attivi (`active = true`);
// - menu_items list/view: anche pubblico se il menu e' attivo.
// users: nessuna registrazione pubblica; l'utente non puo' modificare il proprio record
// (ruolo e stato restano in mano al servizio/admin).
//
// Account di servizio: NON creato da questa migrazione (nessuna password nel repository).
// Va creato dal pannello admin (via Tailscale) nella collezione `app_services`. Vedi docs/admin/POCKETBASE.md.

const SVC = '@request.auth.collectionName = "app_services"';

const FIELD_CLASS = {
  text: TextField,
  number: NumberField,
  bool: BoolField,
  date: DateField,
  select: SelectField,
  relation: RelationField,
  file: FileField,
  json: JSONField,
  autodate: AutodateField,
};

const COURSES = ["antipasto", "primo", "secondo", "contorno", "dolce", "bevande"];

// Definizioni delle collezioni. Relazioni: `collection` = nome della collezione target.
const SPECS = [
  {
    name: "rooms",
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 200 },
      { type: "number", name: "capacity", required: true, min: 1, onlyInt: true },
      { type: "number", name: "sort", onlyInt: true },
      { type: "bool", name: "active" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_rooms_name ON rooms (name)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "menus",
    fields: [
      { type: "text", name: "name", required: true, min: 1, max: 200 },
      { type: "text", name: "season", max: 200 },
      { type: "number", name: "price_per_person", required: true, min: 0 },
      { type: "bool", name: "is_kids" },
      { type: "bool", name: "active" },
      { type: "number", name: "sort", onlyInt: true },
      // Foto pubbliche per il sito: il file non e' protetto (URL diretto).
      {
        type: "file",
        name: "photos",
        maxSelect: 10,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
        protected: false,
      },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    rules: { list: `active = true || ${SVC}`, view: `active = true || ${SVC}`, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "menu_items",
    fields: [
      { type: "relation", name: "menu", required: true, collection: "menus", maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "course", required: true, values: COURSES, maxSelect: 1 },
      { type: "text", name: "name", required: true, min: 1, max: 200 },
      { type: "text", name: "description", max: 500 },
      { type: "number", name: "sort", onlyInt: true },
    ],
    indexes: ["CREATE INDEX idx_menu_items_menu ON menu_items (menu)"],
    rules: {
      list: `menu.active = true || ${SVC}`,
      view: `menu.active = true || ${SVC}`,
      create: SVC,
      update: SVC,
      delete: SVC,
    },
  },
  {
    name: "clients",
    fields: [
      { type: "text", name: "first_name", required: true, min: 1, max: 200 },
      { type: "text", name: "last_name", required: true, min: 1, max: 200 },
      { type: "text", name: "phone", required: true, min: 6, max: 30 },
      { type: "text", name: "email", max: 200 },
      { type: "text", name: "tax_code", max: 32 },
      { type: "text", name: "vat_number", max: 32 },
      { type: "text", name: "notes", max: 2000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "bookings",
    fields: [
      // Restrict: la cancellazione di un cliente con prenotazioni e' bloccata in lib/rpc (e required lo impedisce a DB).
      { type: "relation", name: "client", required: true, collection: "clients", maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "event_name", max: 200 },
      { type: "date", name: "event_date", required: true },
      { type: "text", name: "event_time", max: 5 },
      { type: "relation", name: "room", collection: "rooms", maxSelect: 1, cascadeDelete: false },
      { type: "number", name: "adults", min: 0, onlyInt: true },
      { type: "number", name: "children", min: 0, onlyInt: true },
      { type: "number", name: "kids_menus", min: 0, onlyInt: true },
      // Senza cascade: PocketBase svuota il riferimento quando il menu viene eliminato (set null).
      { type: "relation", name: "menu", collection: "menus", maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "kids_menu", collection: "menus", maxSelect: 1, cascadeDelete: false },
      {
        type: "select",
        name: "setup_colors",
        values: [
          "Bianco", "Avorio", "Champagne", "Oro", "Argento", "Rosa cipria", "Pesca", "Verde salvia",
          "Verde oliva", "Azzurro", "Blu notte", "Bordeaux", "Lilla", "Rosso", "Nero",
        ],
        maxSelect: 15,
      },
      { type: "text", name: "setup_notes", max: 2000 },
      { type: "select", name: "status", required: true, values: ["opzione", "confermato", "saldato", "annullato"], maxSelect: 1 },
      { type: "text", name: "notes", max: 2000 },
      { type: "relation", name: "created_by", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "updated_by", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_bookings_event_date ON bookings (event_date)",
      "CREATE INDEX idx_bookings_room ON bookings (room)",
      "CREATE INDEX idx_bookings_client ON bookings (client)",
    ],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "booking_dishes",
    fields: [
      { type: "relation", name: "booking", required: true, collection: "bookings", maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "course", required: true, values: COURSES, maxSelect: 1 },
      { type: "text", name: "name", required: true, min: 1, max: 200 },
      { type: "text", name: "description", max: 500 },
      { type: "number", name: "sort", onlyInt: true },
    ],
    indexes: ["CREATE INDEX idx_booking_dishes_booking ON booking_dishes (booking)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "booking_allergies",
    fields: [
      { type: "relation", name: "booking", required: true, collection: "bookings", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "subject_name", max: 200 },
      { type: "text", name: "condition", required: true, min: 1, max: 200 },
      { type: "text", name: "notes", max: 2000 },
    ],
    indexes: ["CREATE INDEX idx_booking_allergies_booking ON booking_allergies (booking)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "booking_changes",
    fields: [
      { type: "relation", name: "booking", collection: "bookings", maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "booking_label", max: 500 },
      { type: "relation", name: "changed_by", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "changed_by_name", max: 200 },
      { type: "text", name: "table_name", required: true, max: 100 },
      { type: "text", name: "field", required: true, max: 100 },
      { type: "text", name: "old_value", max: 5000 },
      { type: "text", name: "new_value", max: 5000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_booking_changes_booking ON booking_changes (booking, created)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "quotes",
    fields: [
      // Restrict: required impedisce l'eliminazione della prenotazione con preventivi (backstop, vedi lib/rpc).
      { type: "relation", name: "booking", required: true, collection: "bookings", maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "number", required: true, min: 1, max: 20 },
      { type: "date", name: "issued_at", required: true },
      { type: "date", name: "valid_until" },
      { type: "json", name: "lines", maxSize: 200000 },
      { type: "number", name: "discount", min: 0 },
      { type: "number", name: "vat_rate", min: 0, max: 100 },
      { type: "text", name: "notes", max: 2000 },
      { type: "relation", name: "created_by", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_quotes_number ON quotes (number)", "CREATE INDEX idx_quotes_booking ON quotes (booking)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "quote_counters",
    fields: [
      { type: "number", name: "year", required: true, onlyInt: true, min: 2000 },
      { type: "number", name: "last_number", onlyInt: true, min: 0 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_quote_counters_year ON quote_counters (year)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "payments",
    fields: [
      // Restrict: required impedisce l'eliminazione della prenotazione con acconti (backstop, vedi lib/rpc).
      { type: "relation", name: "booking", required: true, collection: "bookings", maxSelect: 1, cascadeDelete: false },
      { type: "number", name: "amount", required: true, min: 0 },
      { type: "date", name: "paid_at", required: true },
      { type: "select", name: "method", values: ["contanti", "bonifico", "carta", "assegno", "altro"], maxSelect: 1 },
      {
        type: "file",
        name: "receipt",
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
        // Protetta: si scarica solo con file token dell'account di servizio (route /api/receipts/[id]).
        protected: true,
      },
      { type: "text", name: "receipt_name", max: 200 },
      { type: "text", name: "receipt_type", max: 100 },
      { type: "text", name: "notes", max: 2000 },
      { type: "relation", name: "created_by", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_payments_booking ON payments (booking)"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
  {
    name: "notifications",
    fields: [
      { type: "relation", name: "user", required: true, collection: "users", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "type", required: true, max: 50 },
      { type: "text", name: "title", required: true, max: 200 },
      { type: "text", name: "body", max: 500 },
      { type: "relation", name: "booking", collection: "bookings", maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "actor", collection: "users", maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "actor_name", max: 200 },
      { type: "date", name: "read_at" },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_notifications_user ON notifications (user, created)"],
    rules: {
      list: `user = @request.auth.id || ${SVC}`,
      view: `user = @request.auth.id || ${SVC}`,
      create: SVC,
      update: SVC,
      delete: SVC,
    },
  },
  {
    name: "push_subscriptions",
    fields: [
      { type: "relation", name: "user", required: true, collection: "users", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "endpoint", required: true, min: 1, max: 2048 },
      { type: "text", name: "p256dh", required: true, max: 256 },
      { type: "text", name: "auth", required: true, max: 256 },
      { type: "text", name: "user_agent", max: 300 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)",
      "CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user)",
    ],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  },
];

/** Risolve le relazioni per nome e istanzia il campo con la classe PocketBase. */
function buildField(app, spec) {
  const config = Object.assign({}, spec);
  delete config.type;
  if (spec.type === "relation") {
    config.collectionId = app.findCollectionByNameOrId(spec.collection).id;
    delete config.collection;
  }
  return new FIELD_CLASS[spec.type](config);
}

/** Crea la collezione se manca; altrimenti aggiunge solo i campi e gli indici mancanti. Imposta le regole. */
function ensureCollection(app, spec) {
  let collection;
  try {
    collection = app.findCollectionByNameOrId(spec.name);
  } catch (_) {
    collection = new Collection({ type: "base", name: spec.name, fields: [], indexes: [] });
  }

  for (const field of spec.fields) {
    if (!collection.fields.getByName(field.name)) {
      collection.fields.add(buildField(app, field));
    }
  }

  const indexes = collection.indexes ? [...collection.indexes] : [];
  for (const idx of spec.indexes || []) {
    if (!indexes.includes(idx)) indexes.push(idx);
  }
  collection.indexes = indexes;

  collection.listRule = spec.rules.list;
  collection.viewRule = spec.rules.view;
  collection.createRule = spec.rules.create;
  collection.updateRule = spec.rules.update;
  collection.deleteRule = spec.rules.delete;
  app.save(collection);
  return collection;
}

migrate((app) => {
  // 1. Account di servizio: collezione auth dedicata, senza OAuth/OTP/MFA, nessuna registrazione.
  let services;
  try {
    services = app.findCollectionByNameOrId("app_services");
  } catch (_) {
    services = new Collection({
      type: "auth",
      name: "app_services",
      fields: [{ type: "text", name: "name", max: 200 }],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      authRule: "",
      passwordAuth: { enabled: true, identityFields: ["email"] },
      oauth2: { enabled: false },
      otp: { enabled: false },
      mfa: { enabled: false },
      authToken: { duration: 86400 },
    });
    app.save(services);
  }

  // 2. users: campi applicativi aggiunti solo se mancanti; regole chiuse; token di 3 giorni.
  ensureCollection(app, {
    name: "users",
    fields: [
      { type: "text", name: "full_name", required: true, min: 1, max: 200 },
      { type: "select", name: "role", required: true, values: ["admin", "sala", "cucina"], maxSelect: 1 },
      { type: "bool", name: "is_chef" },
      { type: "bool", name: "active" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_users_single_admin ON users (role) WHERE role = 'admin'"],
    rules: { list: SVC, view: SVC, create: SVC, update: SVC, delete: SVC },
  });
  const usersFresh = app.findCollectionByNameOrId("users");
  usersFresh.authRule = "active = true";
  usersFresh.authToken.duration = 259200; // 3 giorni
  app.save(usersFresh);

  // 3. Collezioni applicative.
  for (const spec of SPECS) ensureCollection(app, spec);

  // 4. Batch API e rate limit del login (10 tentativi / 60 s per IP e per identita').
  const settings = app.settings();
  settings.batch.enabled = true;
  settings.batch.maxRequests = 500;
  settings.rateLimits.enabled = true;
  const rules = (settings.rateLimits.rules || []).filter((r) => r.label !== "*:authWithPassword");
  rules.push({ label: "*:authWithPassword", audience: "", duration: 60, maxRequests: 10 });
  settings.rateLimits.rules = rules;
  app.save(settings);
}, (app) => {
  // Nessun rollback automatico dello schema: le migrazioni applicate non si cancellano.
  // Per tornare indietro usare un backup (docs/admin/POCKETBASE.md).
});
