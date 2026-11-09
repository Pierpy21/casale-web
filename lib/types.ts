export type Role = "admin" | "sala" | "cucina" | "amministratore_cucina";
export type Course = "antipasto" | "primo" | "secondo" | "contorno" | "dolce" | "bevande";
export type BookingStatus = "opzione" | "confermato" | "saldato" | "annullato";

export interface Profile { id: string; full_name: string; email: string; role: Role; is_chef: boolean; active: boolean; created_at: string; updated_at: string; }
export interface Client { id: string; first_name: string; last_name: string; phone: string; email: string | null; tax_code: string | null; vat_number: string | null; notes: string | null; created_at: string; updated_at: string; }
export interface ClientWithStats extends Client { bookings_count: number; next_event_date: string | null; }
export interface Room { id: string; name: string; capacity: number; sort: number; active: boolean; updated_at: string; }
/** Voce di un menù. `dish_id` = piatto del catalogo a cui è collegata (sempre valorizzato dopo il salvataggio). */
export interface MenuItem { id: string; menu_id: string; course: Course; name: string; sort: number; description?: string | null; dish_id: string | null; }
/** Piatto del catalogo condiviso (Menù & Sale → Piatti). `used_in`: menù che contengono il piatto. */
export interface Dish { id: string; name: string; course: Course; description: string | null; active: boolean; sort: number; used_in: { id: string; name: string }[]; updated_at: string; }
/** Foto del menu: nome file su PocketBase e URL pubblico assoluto. */
export interface MenuPhoto { file: string; url: string; }
export interface Menu { id: string; name: string; season: string | null; price_per_person: number; is_kids: boolean; active: boolean; sort: number; items: MenuItem[]; photos: MenuPhoto[]; updated_at: string; }
export interface BookingDish { id: string; booking_id: string; course: Course; name: string; sort: number; description?: string | null; }
export interface BookingAllergy { id: string; booking_id: string; subject_name: string | null; condition: string; notes: string | null; }
/** Allergia in ingresso per il salvataggio dell'elenco (saveBookingAllergies). `id` presente = riga esistente da aggiornare. */
export interface BookingAllergyDraft { id?: string; subject_name: string | null; condition: string; notes: string | null; }
/** Tipo di prenotazione: evento (banchetto con menù e preventivo), normale (tavolo), appuntamento (incontro). */
export const BOOKING_KINDS = ["evento", "normale", "appuntamento"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];
export const BOOKING_KIND_LABELS: Record<BookingKind, string> = { evento: "Evento", normale: "Prenotazione", appuntamento: "Appuntamento" };
/** Suggerimenti per il tipo evento (testo libero, max 60 caratteri). */
export const EVENT_TYPES = ["Matrimonio", "Battesimo", "Comunione", "Cresima", "Compleanno", "Anniversario", "Laurea", "Aziendale", "Altro"] as const;
/** Pasto di un evento o di una prenotazione normale (facoltativo). Non c'è un orario: l'appuntamento ha event_time. */
export const BOOKING_MEALS = ["pranzo", "cena"] as const;
export type BookingMeal = (typeof BOOKING_MEALS)[number];
export const BOOKING_MEAL_LABELS: Record<BookingMeal, string> = { pranzo: "Pranzo", cena: "Cena" };

/**
 * Prenotazione. Evento e appuntamento hanno il cliente di rubrica (`client_id`); la prenotazione normale no:
 * nome e cellulare dell'ospite stanno sulla prenotazione (`guest_name`, `guest_phone`). Per gli altri tipi i campi ospite sono null.
 * Per nome e telefono da mostrare usare bookingPersonName / bookingPhone (components/bookings/format.ts).
 */
export interface Booking {
  id: string; client_id: string | null; guest_name: string | null; guest_phone: string | null; kind: BookingKind; event_type: string | null; event_date: string;
  /** Pasto (evento e prenotazione normale). Null per l'appuntamento e se non indicato. */
  meal: BookingMeal | null;
  /** Orario HH:MM: solo per l'appuntamento. Null per evento e prenotazione normale. */
  event_time: string | null;
  room_id: string | null; /** Tavolo (solo prenotazioni normali): null se non assegnato. */ table_number: number | null; adults: number; children: number; kids_menus: number;
  menu_id: string | null;
  /** Prezzo a persona del menù solo per questo evento (null = prezzo del menù in catalogo). Solo l'admin lo imposta. */
  menu_price: number | null;
  kids_menu_id: string | null; setup_colors: string[]; setup_notes: string | null;
  status: BookingStatus; notes: string | null; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
}
/** Riga del foglio prenotazioni (export PDF/DOCX): prenotazioni normali del giorno. */
export interface ReservationSheetRow { name: string; room: string | null; table: number | null; /** Adulti + menù bambini. */ covers: number; adults: number; kids_menus: number; meal: BookingMeal | null; phone: string | null; }
/** Foglio prenotazioni di un giorno (`date` YYYY-MM-DD), già ordinato. */
export interface ReservationSheet { date: string; rows: ReservationSheetRow[]; }
/** Menù del giorno nel foglio eventi: adulti (menu) o bambini (kids), porzioni sommate sui banchetti. */
export interface EventSheetMenuTotal { name: string; kind: "menu" | "kids"; quantity: number; }
/** Totali del foglio eventi: solo banchetti (kind evento) non annullati del giorno. */
export interface EventSheetTotals { events: number; adults: number; children: number; /** Menù bambini (B nella notazione). */ kids_menus: number; covers: number; menus: EventSheetMenuTotal[]; }
export interface EventSheetAllergy { subject: string | null; condition: string; notes: string | null; }
export interface EventSheetDishGroup { course: Course; label: string; items: string[]; }
/** Nota cucina (booking_notes) del banchetto. `created_at` è il timestamp PocketBase. */
export interface EventSheetNote { author: string; body: string; created_at: string; }
/**
 * Scheda di un banchetto nel foglio eventi (export PDF/DOCX per la cucina). Stessi dati della scheda cucina,
 * senza telefono del cliente né prezzi. `meal` pranzo o cena, null se non indicato.
 */
export interface EventSheetRow {
  meal: BookingMeal | null;
  client_name: string;
  room: string | null;
  adults: number;
  children: number;
  menu: string | null;
  kids_menu: string | null;
  kids_menus: number;
  dishes: EventSheetDishGroup[];
  allergies: EventSheetAllergy[];
  setup_colors: string[];
  setup_notes: string | null;
  /** Note prenotazione (campo notes), se presenti. */
  booking_notes: string | null;
  kitchen_notes: EventSheetNote[];
}
/** Foglio eventi di un giorno (`date` YYYY-MM-DD), già ordinato per pasto (pranzo, poi cena). */
export interface EventSheet { date: string; rows: EventSheetRow[]; totals: EventSheetTotals; }
export interface BookingListItem extends Booking {
  /** Cliente di rubrica (evento e appuntamento). Null per le prenotazioni normali e nei dati senza cliente. */
  client: Pick<Client, "id" | "first_name" | "last_name" | "phone"> | null;
  room: Pick<Room, "id" | "name" | "capacity"> | null;
  menu: Pick<Menu, "id" | "name" | "price_per_person"> | null;
  kids_menu: Pick<Menu, "id" | "name"> | null;
  dishes: BookingDish[];            // per mostrare il menù a colpo d'occhio
  allergies: BookingAllergy[];
}
/** Pallino del calendario di creazione: giorno e tipo di una prenotazione non annullata (mai appuntamenti). */
export interface BookingDayMark { event_date: string; kind: "evento" | "normale"; }
export type ClientOption =Pick<Client, "id" | "first_name" | "last_name" | "phone">;
/** Suggerimento di ricerca cliente (campo Nome nelle prenotazioni). `email` è null per il ruolo sala. */
export interface ClientSuggestion { id: string; first_name: string; last_name: string; phone: string; email: string | null; }
/** Prossimo evento dopo un giorno (giorno vuoto dell'agenda, tutti i ruoli). `event_date` YYYY-MM-DD, `meal` pranzo o cena o null. */
export interface NextEventBrief { id: string; event_date: string; meal: BookingMeal | null; title: string; }
/** Slot di occupazione sala per la vista agenda (select minima, senza annullati). */
export interface RoomBookingSlot { id: string; event_date: string; room_id: string; client_name: string; adults: number; children: number; }
/**
 * Menù adulti nel dettaglio prenotazione: `price_per_person` è il prezzo effettivo dell'evento (menu_price se impostato,
 * altrimenti il catalogo). `catalog_price_per_person` è sempre il prezzo di catalogo (per "prezzo di catalogo" e ripristino).
 */
export type BookingDetailMenu = Menu & { catalog_price_per_person?: number };
export interface BookingDetail extends Booking {
  /** Cliente di rubrica (evento e appuntamento); null per le prenotazioni normali. */
  client: Client | null; room: Room | null; menu: BookingDetailMenu | null; kids_menu: Menu | null;
  dishes: BookingDish[]; allergies: BookingAllergy[];
}
export interface BookingChange { id: string; booking_id: string | null; booking_label: string | null; changed_by: string | null; changed_by_name: string; table_name: string; field: string; old_value: string | null; new_value: string | null; created_at: string; }
export interface QuoteLine { description: string; quantity: number; unit_price: number; }
export interface Quote { id: string; booking_id: string; number: string; issued_at: string; valid_until: string | null; lines: QuoteLine[]; discount: number; vat_rate: number; /** Prezzo finale concordato (IVA inclusa): sostituisce il totale calcolato. Null = calcolo automatico. */ final_total: number | null; notes: string | null; created_at: string; updated_at: string; }
export interface QuoteWithBooking extends Quote { booking: BookingDetail; }
/** Prezzi IVA inclusa: taxable = total/(1+vat/100). Con prezzo finale (`overridden`) il totale è il prezzo finale e lo sconto è 0; subtotal resta la somma delle righe. */
export interface QuoteTotals { subtotal: number; discount: number; total: number; taxable: number; vat: number; overridden: boolean; }
export interface DashboardStats { eventsThisMonth: number; coversNext7Days: number; pendingOptions: number; eventsToday: number; }

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      /** Codice del fallimento quando la UI deve reagire (es. chiedere conferma). "conflict"/"unauthenticated": coda offline (lib/offline/contract.ts). */
      code?: "dish_in_use" | "conflict" | "unauthenticated" | "in_progress";
      /** Con code "dish_in_use": menù che contengono ancora il piatto. */
      usedIn?: { id: string; name: string }[];
      /** Con code "conflict": stato attuale del record sul server. */
      conflict?: { currentUpdated: string; updatedByName?: string | null };
    };

export const SETUP_COLORS = ["Bianco","Avorio","Champagne","Oro","Argento","Rosa cipria","Pesca","Verde salvia","Verde oliva","Azzurro","Blu notte","Bordeaux","Lilla","Rosso","Nero"] as const;
export const SETUP_COLOR_HEX: Record<(typeof SETUP_COLORS)[number], string> = {
  "Bianco": "#FFFFFF",
  "Avorio": "#FFFFF0",
  "Champagne": "#F7E7CE",
  "Oro": "#C9A227",
  "Argento": "#C0C0C0",
  "Rosa cipria": "#E8C4C4",
  "Pesca": "#FFCBA4",
  "Verde salvia": "#9CAF88",
  "Verde oliva": "#6B6E3A",
  "Azzurro": "#9EC9E2",
  "Blu notte": "#191E3C",
  "Bordeaux": "#6D1F2A",
  "Lilla": "#C8A2C8",
  "Rosso": "#B22222",
  "Nero": "#111111",
};
export const COURSE_ORDER: Course[] = ["antipasto","primo","secondo","contorno","dolce","bevande"];
export const COURSE_LABELS: Record<Course, string> = { antipasto: "Antipasto", primo: "Primo", secondo: "Secondo", contorno: "Contorno", dolce: "Dolce", bevande: "Bevande" };
export const ROLE_LABELS: Record<Role, string> = { admin: "Amministratore", sala: "Sala", cucina: "Cucina", amministratore_cucina: "Amministratore cucina" };
export const STATUS_LABELS: Record<BookingStatus, string> = { opzione: "Attesa", confermato: "Confermato", saldato: "Saldato", annullato: "Annullato" };
export const STATUS_COLORS: Record<BookingStatus, string> = { opzione: "#A9792B", confermato: "#355A63", saldato: "#4F6B45", annullato: "#9B3B32" };

export const PAYMENT_METHODS = ["contanti", "bonifico", "carta", "assegno", "altro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { contanti: "Contanti", bonifico: "Bonifico", carta: "POS", assegno: "Assegno", altro: "Altro" };
export interface Payment { id: string; booking_id: string; amount: number; paid_at: string; method: PaymentMethod | null; receipt_path: string | null; receipt_name: string | null; receipt_type: string | null; notes: string | null; created_at: string; updated_at: string; }
export interface PaymentSummary { expected_total: number; paid_total: number; balance: number; } // expected = adults*menu.price + kids_menus*kids_menu.price

export type NotificationType = "booking_created" | "booking_updated" | "booking_status" | "booking_cancelled" | "booking_deleted" | "covers_updated" | "dishes_updated" | "event_reminder" | "inventory_report";
export interface AppNotification { id: string; type: NotificationType; title: string; body: string | null; booking_id: string | null; url: string | null; actor_name: string | null; read_at: string | null; created_at: string; }

// ---------------------------------------------------------------------
// Giacenza (cucina + admin)
// ---------------------------------------------------------------------
export const INVENTORY_STATES = ["presente", "da_ordinare"] as const;
export type InventoryState = (typeof INVENTORY_STATES)[number];
export const INVENTORY_STATE_LABELS: Record<InventoryState, string> = { presente: "Presente", da_ordinare: "Da ordinare" };

/** Fornitore della giacenza (collezione inventory_suppliers): lo gestisce l'admin. `sort` = ordine di visualizzazione. */
export interface InventorySupplier { id: string; name: string; sort: number; active: boolean; }

/** Categorie dei prodotti (ordine di visualizzazione = ordine dell'array). Per la cucina i prodotti si raggruppano così. */
export const INVENTORY_CATEGORIES = ["ortofrutta", "latticini", "salumi", "carne_uova", "dispensa", "surgelati", "non_food", "altro"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  ortofrutta: "Ortofrutta",
  latticini: "Latticini e formaggi",
  salumi: "Salumi",
  carne_uova: "Carne e uova",
  dispensa: "Dispensa",
  surgelati: "Surgelati",
  non_food: "Non food",
  altro: "Altro",
};

export interface InventoryProduct { id: string; name: string; unit: string | null; category: InventoryCategory; supplier_id: string; sort: number; active: boolean; updated_at: string; }
/** Riga del report. `supplier_name` è lo snapshot del nome al momento dell'invio (resta anche se il fornitore cambia nome). */
export interface InventoryReportLine { id: string; report_id: string; product_id: string | null; product_name: string; unit: string | null; state: InventoryState; quantity: number; sort: number; supplier_id: string; supplier_name: string; category: InventoryCategory; }
export interface InventoryReport { id: string; created_by: string | null; created_by_name: string; report_date: string; notes: string | null; status: "inviato" | "visto"; seen_by: string | null; seen_at: string | null; created_at: string; lines: InventoryReportLine[]; }

// ---------------------------------------------------------------------
// Note cucina, registro attività, statistiche
// ---------------------------------------------------------------------
/** Nota interna su una prenotazione (collezione booking_notes). Visibile a tutti i ruoli attivi. */
export interface BookingNote { id: string; booking_id: string; author_id: string | null; author_name: string; body: string; created_at: string; }
/** Voce del registro attività: modifica di una prenotazione (anche eliminazioni, con booking null). */
export interface ActivityEntry extends BookingChange { booking_label: string | null; booking_date: string | null; booking_kind: BookingKind | null; client_name: string | null; }
/** Periodo delle statistiche: 1, 3 o 12 mesi a partire dal mese scelto. */
export type StatsPeriod = "mese" | "3mesi" | "anno";
/** Tipo di prenotazioni incluse nelle statistiche. */
export type StatsKind = "tutti" | "evento" | "normale";
/** Settimana (lun–dom) delle statistiche. `busiest_day`: giorno con più coperti (eventi + prenotazioni, esclusi appuntamenti), null se nessun coperto. `menus`: porzioni per menù della settimana, per porzioni decrescenti. */
export interface WeekStats { week_start: string; week_end: string; event_covers: number; normal_covers: number; events: number; normal_bookings: number; busiest_day: { date: string; covers: number } | null; menus: MenuConsumption[]; }
/** Porzioni consumate per menù (adulti: adults; bambini: kids_menus), solo eventi non annullati. */
export interface MenuConsumption { menu_id: string; name: string; is_kids: boolean; servings: number; }
export interface CoversStats { from: string; to: string; weeks: WeekStats[]; totals: { event_covers: number; normal_covers: number; events: number; normal_bookings: number }; /** Coperti totali del periodo (eventi + prenotazioni): base per le percentuali. */ period_total_covers: number; menus: MenuConsumption[]; }

// ---------------------------------------------------------------------
// Mappa sala (admin + sala): tavoli delle sale e occupazione per giorno/pasto
// ---------------------------------------------------------------------
/** Forme dei tavoli. "L" e "U": tavolate da banchetto composte (posti fuori e dentro sui lati lunghi, capotavola sui lati corti). */
export const TABLE_SHAPES = ["tondo", "quadrato", "rettangolare", "L", "U"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];
export const TABLE_SHAPE_LABELS: Record<TableShape, string> = { tondo: "Tondo", quadrato: "Quadrato", rettangolare: "Rettangolare", L: "A L", U: "A U" };
/**
 * Tavolo di una sala (collezione room_tables). `x`/`y`: centro del tavolo in % della stanza (0–100). `rotation`: gradi in senso orario, 0–359 (0 = orizzontale).
 * `layout_date`/`layout_meal`: null = disposizione standard della sala; valorizzati = tavolo della disposizione speciale di quel giorno e pasto.
 */
export interface RoomTable { id: string; room_id: string; number: number; seats: number; shape: TableShape; x: number; y: number; rotation: number; active: boolean; layout_date: string | null; layout_meal: BookingMeal | null; }
/** Bozza per il salvataggio della disposizione di una sala. `id` presente = tavolo esistente. */
export interface RoomTableDraft { id?: string; number: number; seats: number; shape: TableShape; x: number; y: number; rotation: number; }
/** Prenotazione normale nella mappa (dati minimi). */
export interface FloorBooking { id: string; name: string; phone: string | null; covers: number; adults: number; children: number; kids_menus: number; status: BookingStatus; room_id: string | null; table_number: number | null; notes: string | null; }
/** Evento che riserva una sala nel giorno/pasto. */
/**
 * Evento nella mappa. Un evento può occupare più tavoli della stessa sala: `table_numbers` = tutti i suoi tavoli
 * (il primo coincide con `table_number`, il tavolo principale; vuoto = nessun tavolo).
 */
export interface FloorEvent { id: string; room_id: string | null; table_number: number | null; table_numbers: number[]; title: string; covers: number; status: BookingStatus; }
/**
 * Disposizione da salvare: `null` = standard della sala (vale tutti i giorni); valorizzato = disposizione speciale
 * solo per quel giorno e pasto (sostituisce la standard in quel giorno/pasto).
 */
export type LayoutScope = { date: string; meal: BookingMeal } | null;
/** Dati della mappa sala per un giorno (`date` YYYY-MM-DD) e un pasto. */
/**
 * Dati della mappa per giorno+pasto. `tables`: per ogni sala, i tavoli della disposizione speciale del giorno/pasto se esiste,
 * altrimenti quelli standard. `dayLayoutRoomIds`: sale che in questo giorno/pasto usano una disposizione speciale.
 * `events`: eventi non annullati del giorno/pasto, anche senza sala (room_id null = da assegnare).
 */
export interface FloorPlanData { date: string; meal: BookingMeal; rooms: Room[]; tables: RoomTable[]; dayLayoutRoomIds: string[]; bookings: FloorBooking[]; events: FloorEvent[]; }
