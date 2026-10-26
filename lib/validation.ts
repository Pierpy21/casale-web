import { z } from "zod";
import { BOOKING_KINDS, INVENTORY_STATES, PAYMENT_METHODS, SETUP_COLORS, type BookingKind } from "./types";

// ---------------------------------------------------------------------
// Limiti
// ---------------------------------------------------------------------
const MAX_TEXT = 200;      // nomi, descrizioni, voci
const MAX_NOTES = 2000;    // note libere
const MAX_PHONE = 30;
const MAX_ITEMS = 60;      // array (piatti, voci, righe, allergie)

// ---------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------
/** Stringa vuota / solo spazi / assente → null; altrimenti stringa trimmata. */
const emptyToNull = (v: unknown): unknown => {
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  return v ?? null;
};

/** Codici (CF, P.IVA): senza spazi, maiuscoli; vuoto → null. */
const normalizeCode = (v: unknown): unknown => {
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, "").toUpperCase();
    return s === "" ? null : s;
  }
  return v ?? null;
};

/** Arrotonda al centesimo (importi in EUR). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Pre-elaborazione dei campi numerici (niente coercizione a 0 di "" / null / assente):
 * vuoto o assente → undefined ("Campo obbligatorio"); stringa numerica → number; altro invariato (errore "non valido").
 */
const toNumber = (v: unknown): unknown => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isNaN(n) ? v : n;
  }
  return v;
};

/** Messaggi: campo assente → "Campo obbligatorio", valore non numerico → messaggio specifico. */
const numberError = (invalid: string) => ({
  error: (iss: { input?: unknown }) => (iss.input === undefined ? "Campo obbligatorio" : invalid),
});

const optText = z.preprocess(emptyToNull, z.string().max(MAX_TEXT, "Testo troppo lungo (max 200 caratteri)").nullable());
const optLongText = z.preprocess(emptyToNull, z.string().max(MAX_NOTES, "Testo troppo lungo (max 2000 caratteri)").nullable());
const courseSchema = z.enum(["antipasto", "primo", "secondo", "contorno", "dolce", "bevande"], {
  message: "Portata non valida",
});
// Id PocketBase: 15 caratteri [a-z0-9] (non UUID).
const uuidSchema = z.string().regex(/^[a-z0-9]{15}$/, { message: "Identificativo non valido" });
const optUuid = z.preprocess(emptyToNull, z.string().regex(/^[a-z0-9]{15}$/, { message: "Identificativo non valido" }).nullable());
const optDescription = z.preprocess(emptyToNull, z.string().max(500, "Descrizione troppo lunga (max 500 caratteri)").nullable());
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ora non valida (HH:MM)");

/** Data YYYY-MM-DD reale: il round-trip con Date UTC rifiuta es. 2026-02-30. */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (YYYY-MM-DD)")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Data non valida");

const intMin0 = z.preprocess(
  toNumber,
  z.number(numberError("Numero non valido"))
    .int("Deve essere un numero intero")
    .min(0, "Non può essere negativo"),
);

/** Importo in EUR: 2 decimali. */
const priceSchema = z.preprocess(
  toNumber,
  z.number(numberError("Prezzo non valido")).min(0, "Il prezzo non può essere negativo").transform(round2),
);

// ---------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------
export const ClientInput = z.object({
  first_name: z.string().trim().min(1, "Nome obbligatorio").max(MAX_TEXT, "Nome troppo lungo"),
  last_name: z.string().trim().min(1, "Cognome obbligatorio").max(MAX_TEXT, "Cognome troppo lungo"),
  phone: z
    .string()
    .trim()
    .min(6, "Telefono obbligatorio (minimo 6 caratteri)")
    .max(MAX_PHONE, "Telefono troppo lungo")
    .regex(/^[+0-9 ()-]+$/, "Formato telefono non valido"),
  email: z.preprocess(emptyToNull, z.email({ message: "Email non valida" }).nullable()),
  tax_code: z.preprocess(
    normalizeCode,
    z.string().regex(/^[A-Z0-9]{16}$/, "Codice fiscale non valido (16 caratteri)").nullable(),
  ),
  vat_number: z.preprocess(
    normalizeCode,
    z.string().regex(/^(IT)?\d{11}$/, "P.IVA non valida (11 cifre)").nullable(),
  ),
  notes: optLongText,
});
export type ClientInputType = z.infer<typeof ClientInput>;

// ---------------------------------------------------------------------
// Allergie e piatti
// ---------------------------------------------------------------------
export const AllergyInput = z.object({
  subject_name: z.preprocess(emptyToNull, z.string().max(MAX_TEXT, "Nome troppo lungo").nullable()),
  condition: z.string().trim().min(1, "Indicare la condizione").max(MAX_TEXT, "Condizione troppo lunga"),
  notes: optLongText,
});
export type AllergyInputType = z.infer<typeof AllergyInput>;

export const DishInput = z.object({
  course: courseSchema,
  name: z.string().trim().min(1, "Nome piatto obbligatorio").max(MAX_TEXT, "Nome piatto troppo lungo"),
  sort: intMin0,
  description: optDescription.optional(),
});
export type DishInputType = z.infer<typeof DishInput>;

export const DishesInput = z.array(DishInput).max(MAX_ITEMS, "Troppi piatti (massimo 60)");

// ---------------------------------------------------------------------
// Coperti (sala e admin)
// ---------------------------------------------------------------------
/** Coperti: opzionali (0 se assenti), così un appuntamento puo' non avere ospiti. */
const intMin0Default = z.preprocess(
  toNumber,
  z.number(numberError("Numero non valido")).int("Deve essere un numero intero").min(0, "Non può essere negativo").default(0),
);

const coversShape = {
  adults: intMin0Default,
  children: intMin0Default,
  kids_menus: intMin0Default,
};

/** Input del superRefine: i campi sono già numerici (intMin0) ma il tipo di input di preprocess li rende opzionali. */
type Covers = { adults?: number; children?: number; kids_menus?: number };

/** Regole coperti. `requireGuest` = false per gli appuntamenti (0 ospiti consentiti). */
function checkCovers(v: Covers, ctx: z.RefinementCtx, requireGuest = true): void {
  const adults = v.adults ?? 0;
  const children = v.children ?? 0;
  const kidsMenus = v.kids_menus ?? 0;
  if (kidsMenus > children) {
    ctx.addIssue({
      code: "custom",
      message: "I menù bambini non possono superare i bambini",
      path: ["kids_menus"],
    });
  }
  if (requireGuest && adults + children < 1) {
    ctx.addIssue({
      code: "custom",
      message: "Indicare almeno un coperto",
      path: ["adults"],
    });
  }
}

export const CoversInput = z.object(coversShape).superRefine((v, ctx) => checkCovers(v, ctx));
export type CoversInputType = z.infer<typeof CoversInput>;

/** Coperti validi per il tipo di prenotazione (appuntamenti: 0 consentiti). */
export function coversInputFor(kind: BookingKind) {
  return z.object(coversShape).superRefine((v, ctx) => checkCovers(v, ctx, kind !== "appuntamento"));
}

// ---------------------------------------------------------------------
// Prenotazione
// ---------------------------------------------------------------------
/** Cliente nuovo inserito dentro la prenotazione (riusato se il telefono esiste gia'). */
/**
 * Accetta "full_name" (campo unico del form) oppure first_name/last_name. Output: nome = prima parola,
 * cognome = il resto (vuoto se assente: il cognome non e' obbligatorio per i clienti creati al volo).
 */
export const NewClientInput = z
  .object({
    full_name: z.string().trim().max(200, "Nome troppo lungo").optional(),
    first_name: z.string().trim().max(200, "Nome troppo lungo").optional(),
    last_name: z.string().trim().max(200, "Cognome troppo lungo").optional(),
    phone: ClientInput.shape.phone,
    email: ClientInput.shape.email,
  })
  .superRefine((v, ctx) => {
    if (!v.full_name && !v.first_name) {
      ctx.addIssue({ code: "custom", message: "Inserisci il nome del cliente", path: ["full_name"] });
    }
  })
  .transform((v) => {
    const source = v.full_name && v.full_name.length > 0 ? v.full_name : [v.first_name, v.last_name].filter(Boolean).join(" ");
    const [first = "", ...rest] = source.trim().split(/\s+/);
    return { first_name: first, last_name: rest.join(" "), phone: v.phone, email: v.email ?? null };
  });
export type NewClientInputType = z.output<typeof NewClientInput>;

const kindSchema = z.enum(BOOKING_KINDS, { message: "Tipo di prenotazione non valido" }).default("evento");
const eventTypeSchema = z.preprocess(
  emptyToNull,
  z.string().max(60, "Tipo evento troppo lungo (max 60 caratteri)").nullable(),
);

export const BookingInput = z
  .object({
    /** evento | normale | appuntamento. Default: evento (compatibilita'). */
    kind: kindSchema,
    /** Cliente dalla rubrica (solo admin) oppure nuovo cliente: esattamente uno dei due. */
    client_id: optUuid,
    new_client: NewClientInput.nullish(),
    event_type: eventTypeSchema,
    event_name: optText,
    event_date: dateSchema,
    event_time: z.preprocess(emptyToNull, timeSchema.nullable()),
    room_id: optUuid,
    ...coversShape,
    menu_id: optUuid,
    kids_menu_id: optUuid,
    setup_colors: z.array(z.enum(SETUP_COLORS, { message: "Colore non valido" })).max(MAX_ITEMS).default([]),
    setup_notes: optLongText,
    status: z.enum(["opzione", "confermato", "saldato", "annullato"]).default("opzione"),
    notes: optLongText,
    allergies: z.array(AllergyInput).max(MAX_ITEMS, "Troppe allergie (massimo 60)").default([]),
    /** Se assente e menu_id presente, il backend copia i piatti dal menù (solo eventi). */
    dishes: DishesInput.optional(),
    /** Solo eventi: crea anche il preventivo. Con `quote` assente si usano le righe automatiche dal catalogo. */
    create_quote: z.boolean().default(true),
    quote: z.lazy(() => QuoteDraftInput).nullish(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    if (!v.client_id && !v.new_client) issue("client_id", "Indica il cliente");
    if (v.client_id && v.new_client) {
      issue("new_client", "Scegli un cliente esistente oppure inserisci un nuovo cliente, non entrambi");
    }

    if (v.kind === "evento") {
      if (!v.event_name) issue("event_name", "Nome evento obbligatorio");
      if (!v.event_type) issue("event_type", "Tipo evento obbligatorio");
      if (!v.menu_id) issue("menu_id", "Scegli il menù");
      checkCovers(v, ctx);
    } else if (v.kind === "normale") {
      if (!v.event_time) issue("event_time", "Ora obbligatoria");
      if (v.menu_id || v.kids_menu_id) issue("menu_id", "Le prenotazioni normali non hanno menù");
      checkCovers(v, ctx);
    } else {
      // appuntamento: incontro con il cliente, niente coperti obbligatori, niente menù.
      if (!v.event_name) issue("event_name", "Titolo dell'appuntamento obbligatorio");
      if (!v.event_type) issue("event_type", "Tipo obbligatorio");
      if (!v.event_time) issue("event_time", "Ora obbligatoria");
      if (v.menu_id || v.kids_menu_id) issue("menu_id", "Gli appuntamenti non hanno menù");
      checkCovers(v, ctx, false);
    }
  });
export type BookingInputType = z.infer<typeof BookingInput>;

// ---------------------------------------------------------------------
// Giacenza
// ---------------------------------------------------------------------
export const InventoryProductInput = z.object({
  name: z.string().trim().min(1, "Nome prodotto obbligatorio").max(200, "Nome troppo lungo"),
  unit: z.preprocess(emptyToNull, z.string().max(40, "Unità troppo lunga").nullable()).optional(),
  category: z.preprocess(emptyToNull, z.string().max(80, "Categoria troppo lunga").nullable()).optional(),
});
export type InventoryProductInputType = z.infer<typeof InventoryProductInput>;

export const InventoryLineInput = z
  .object({
    product_id: z.preprocess(emptyToNull, z.string().regex(/^[a-z0-9]{15}$/, "Prodotto non valido").nullable()).optional(),
    product_name: z.preprocess(emptyToNull, z.string().trim().max(200, "Nome prodotto troppo lungo").nullable()).optional(),
    unit: z.preprocess(emptyToNull, z.string().trim().max(40, "Unità troppo lunga").nullable()).optional(),
    state: z.enum(INVENTORY_STATES, { message: "Stato non valido (presente o da ordinare)" }),
    quantity: z.preprocess(
      toNumber,
      z
        .number(numberError("Quantità non valida"))
        .gt(0, "La quantità deve essere maggiore di zero")
        .max(100000, "Quantità troppo alta"),
    ),
  })
  .superRefine((v, ctx) => {
    if (!v.product_id && !v.product_name) {
      ctx.addIssue({ code: "custom", message: "Indica il prodotto", path: ["product_name"] });
    }
  });
export type InventoryLineInputType = z.infer<typeof InventoryLineInput>;

export const InventoryReportInput = z.object({
  report_date: dateSchema,
  notes: optLongText,
  lines: z.array(InventoryLineInput).min(1, "Aggiungi almeno un prodotto").max(200, "Troppe righe (massimo 200)"),
});
export type InventoryReportInputType = z.infer<typeof InventoryReportInput>;

// ---------------------------------------------------------------------
// Operatori
// ---------------------------------------------------------------------
const passwordSchema = z.string().min(8, "La password deve avere almeno 8 caratteri");

export const PasswordInput = z.object({ password: passwordSchema });

export const OperatorInput = z
  .object({
    full_name: z.string().trim().min(2, "Nome troppo corto").max(MAX_TEXT, "Nome troppo lungo"),
    email: z
      .string()
      .trim()
      .pipe(z.email({ message: "Email non valida" }))
      .transform((s) => s.toLowerCase()),
    password: passwordSchema,
    role: z.enum(["sala", "cucina"], { message: "Ruolo non valido" }),
    is_chef: z.boolean().default(false),
  })
  .transform((v) => ({ ...v, is_chef: v.role === "cucina" ? v.is_chef : false }));
export type OperatorInputType = z.infer<typeof OperatorInput>;

export const OperatorUpdateInput = z
  .object({
    full_name: z.string().trim().min(2, "Nome troppo corto").max(MAX_TEXT, "Nome troppo lungo"),
    role: z.enum(["sala", "cucina"], { message: "Ruolo non valido" }),
    is_chef: z.boolean().default(false),
    active: z.boolean(),
  })
  .transform((v) => ({ ...v, is_chef: v.role === "cucina" ? v.is_chef : false }));
export type OperatorUpdateInputType = z.infer<typeof OperatorUpdateInput>;

// ---------------------------------------------------------------------
// Catalogo: menù e sale
// ---------------------------------------------------------------------
/**
 * Voce di menu. `dish_id`: piatto del catalogo scelto (il server prende nome, portata e descrizione dal piatto).
 * Assente = testo libero: il server crea (o riusa per portata + nome) il piatto nel catalogo.
 */
export const MenuItemInput = z.object({
  course: courseSchema,
  name: z.string().trim().min(1, "Nome piatto obbligatorio").max(MAX_TEXT, "Nome piatto troppo lungo"),
  sort: intMin0,
  description: optDescription.optional(),
  dish_id: optUuid.optional(),
});

/** Piatto del catalogo (admin): creazione e modifica. */
export const CatalogDishInput = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Nome piatto obbligatorio").max(MAX_TEXT, "Nome piatto troppo lungo"),
  course: courseSchema,
  description: optDescription.optional(),
  active: z.boolean().default(true),
  sort: intMin0.default(0),
});
export type CatalogDishInputType = z.infer<typeof CatalogDishInput>;

/** Foto menu (FormData): max 10 foto in totale, 5 MB l'una, formati immagine. */
export const MENU_PHOTO_MAX_COUNT = 10;
export const MENU_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const MENU_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export const MenuPhotoFile = z
  .instanceof(File, { message: "Foto non valida" })
  .refine((f) => f.size > 0, "La foto è vuota")
  .refine((f) => f.size <= MENU_PHOTO_MAX_BYTES, "La foto supera 5 MB")
  .refine(
    (f) => (MENU_PHOTO_MIME_TYPES as readonly string[]).includes(f.type.toLowerCase()),
    "Formato foto non ammesso (usa JPG, PNG, WebP o AVIF)",
  );

export const MenuInput = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Nome del menù obbligatorio").max(MAX_TEXT, "Nome del menù troppo lungo"),
  season: optText,
  price_per_person: priceSchema,
  is_kids: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: intMin0.default(0),
  items: z.array(MenuItemInput).max(MAX_ITEMS, "Troppe voci (massimo 60)").default([]),
});
export type MenuInputType = z.infer<typeof MenuInput>;

export const RoomInput = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Nome sala obbligatorio").max(MAX_TEXT, "Nome sala troppo lungo"),
  capacity: z.preprocess(
    toNumber,
    z.number(numberError("Capienza non valida"))
      .int("Deve essere un numero intero")
      .min(1, "La capienza deve essere almeno 1"),
  ),
  sort: intMin0.default(0),
  active: z.boolean().default(true),
});
export type RoomInputType = z.infer<typeof RoomInput>;

// ---------------------------------------------------------------------
// Preventivi
// ---------------------------------------------------------------------
export const QuoteLineInput = z.object({
  description: z.string().trim().min(1, "Descrizione obbligatoria").max(MAX_TEXT, "Descrizione troppo lunga"),
  quantity: z.preprocess(
    toNumber,
    z
      .number(numberError("Quantità non valida"))
      .gt(0, "La quantità deve essere maggiore di zero")
      .max(100000, "Quantità troppo alta"),
  ),
  unit_price: z.preprocess(
    toNumber,
    z
      .number(numberError("Prezzo non valido"))
      .min(0, "Il prezzo non può essere negativo")
      .max(1000000, "Prezzo unitario troppo alto")
      .transform(round2),
  ),
});

export const QuoteInput = z.object({
  issued_at: dateSchema,
  valid_until: z.preprocess(emptyToNull, dateSchema.nullable()),
  lines: z.array(QuoteLineInput).min(1, "Almeno una riga").max(MAX_ITEMS, "Troppe righe (massimo 60)"),
  discount: z.preprocess(
    toNumber,
    z.number(numberError("Sconto non valido")).min(0, "Lo sconto non può essere negativo").transform(round2),
  ).default(0),
  vat_rate: z.preprocess(
    toNumber,
    z.number(numberError("IVA non valida"))
      .min(0, "L'IVA non può essere negativa")
      .max(100, "L'IVA non può superare 100")
      .transform(round2),
  ).default(10),
  notes: optLongText,
});
export type QuoteInputType = z.infer<typeof QuoteInput>;

/** Bozza di preventivo proposta insieme alla prenotazione evento (createBooking con create_quote). */
export const QuoteDraftInput = z.object({
  lines: z.array(QuoteLineInput).min(1, "Almeno una riga").max(MAX_ITEMS, "Troppe righe (massimo 60)"),
  discount: z.preprocess(toNumber, z.number(numberError("Sconto non valido")).min(0, "Lo sconto non può essere negativo").transform(round2)).default(0),
  vat_rate: z.preprocess(toNumber, z.number(numberError("IVA non valida")).min(0, "IVA non valida").max(100, "IVA non valida").transform(round2)).default(10),
  valid_until: z.preprocess(emptyToNull, dateSchema.nullable()).optional(),
  notes: optLongText.optional(),
});
export type QuoteDraftInputType = z.output<typeof QuoteDraftInput>;

// ---------------------------------------------------------------------
// Acconti (pagamenti) e ricevute: solo admin
// ---------------------------------------------------------------------
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
/** MIME ammessi per le ricevute (bucket "receipts"). */
export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

const EXTENSION_TO_MIME: Record<string, ReceiptMimeType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

/**
 * Tipo MIME di una ricevuta: quello dichiarato se ammesso; se assente o generico
 * (es. HEIC spesso arriva come application/octet-stream) si usa l'estensione. Altrimenti null.
 */
export function resolveReceiptType(file: { name: string; type: string }): ReceiptMimeType | null {
  const declared = file.type.toLowerCase();
  if (declared && declared !== "application/octet-stream") {
    return (RECEIPT_MIME_TYPES as readonly string[]).includes(declared)
      ? (declared as ReceiptMimeType)
      : null;
  }
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return EXTENSION_TO_MIME[ext] ?? null;
}

/** File ricevuta: non vuoto, max 10 MB, formato ammesso. */
export const ReceiptFile = z
  .instanceof(File, { message: "Ricevuta non valida" })
  .refine((f) => f.size > 0, "Il file della ricevuta è vuoto")
  .refine((f) => f.size <= RECEIPT_MAX_BYTES, "La ricevuta supera 10 MB")
  .refine(
    (f) => resolveReceiptType(f) !== null,
    "Formato non ammesso (usa una foto JPG, PNG, WebP, HEIC o un PDF)",
  );

/** Importo: accetta anche la virgola decimale ("12,50"). */
const amountNumber = z.preprocess(
  (v) => (typeof v === "string" ? toNumber(v.trim().replace(",", ".")) : toNumber(v)),
  z
    .number(numberError("Importo non valido"))
    .gt(0, "L'importo deve essere maggiore di zero")
    .max(1000000, "Importo troppo alto")
    .transform(round2),
);

export const PaymentInput = z.object({
  amount: amountNumber,
  paid_at: z.preprocess(
    emptyToNull,
    z.string({ error: "Data obbligatoria" }).pipe(dateSchema),
  ),
  method: z.preprocess(emptyToNull, z.enum(PAYMENT_METHODS, { message: "Metodo non valido" }).nullable()),
  notes: optLongText,
});
export type PaymentInputType = z.infer<typeof PaymentInput>;
