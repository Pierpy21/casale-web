// Record PocketBase -> tipi di dominio (lib/types.ts). Puri: usabili anche nel browser.
import {
  COURSE_ORDER,
  type BookingKind,
  type InventoryProduct,
  type InventoryReport,
  type InventoryReportLine,
  type InventoryState,
  type AppNotification,
  type BookingAllergy,
  type BookingChange,
  type BookingDish,
  type BookingNote,
  type BookingStatus,
  type Client,
  type Course,
  type Dish,
  type Menu,
  type MenuItem,
  type MenuPhoto,
  type Payment,
  type PaymentMethod,
  type Profile,
  type Quote,
  type QuoteLine,
  type Role,
  type Room,
  type Booking,
} from "@/lib/types";
import { normalizeInventoryCategory, normalizeInventorySupplier } from "@/lib/inventory-utils";
import { fileUrl, nn, num, toDateOnly, toIsoDateTime, type PbRecord } from "./helpers";

export function courseRank(c: Course): number {
  const i = COURSE_ORDER.indexOf(c);
  return i === -1 ? COURSE_ORDER.length : i;
}

export function sortDishes<T extends { course: Course; sort: number; name: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => courseRank(a.course) - courseRank(b.course) || a.sort - b.sort || a.name.localeCompare(b.name),
  );
}

export function mapProfile(r: PbRecord): Profile {
  return {
    id: r.id,
    full_name: String(r.full_name ?? ""),
    email: String(r.email ?? ""),
    role: r.role as Role,
    is_chef: Boolean(r.is_chef),
    active: Boolean(r.active),
    created_at: toIsoDateTime(r.created),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapClient(r: PbRecord): Client {
  return {
    id: r.id,
    first_name: String(r.first_name ?? ""),
    last_name: String(r.last_name ?? ""),
    phone: String(r.phone ?? ""),
    email: nn(r.email),
    tax_code: nn(r.tax_code),
    vat_number: nn(r.vat_number),
    notes: nn(r.notes),
    created_at: toIsoDateTime(r.created),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapRoom(r: PbRecord): Room {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    capacity: num(r.capacity),
    sort: num(r.sort),
    active: Boolean(r.active),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapMenuItem(r: PbRecord): MenuItem {
  return {
    id: r.id,
    menu_id: String(r.menu ?? ""),
    course: r.course as Course,
    name: String(r.name ?? ""),
    sort: num(r.sort),
    description: nn(r.description),
    dish_id: nn(r.dish),
  };
}

/** Piatto del catalogo; `usedIn` = menù che lo contengono (calcolati da lib/data/catalog). */
export function mapCatalogDish(r: PbRecord, usedIn: { id: string; name: string }[]): Dish {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    course: r.course as Course,
    description: nn(r.description),
    active: Boolean(r.active),
    sort: num(r.sort),
    used_in: usedIn,
    updated_at: toIsoDateTime(r.updated),
  };
}

export function sortMenuItems(items: MenuItem[]): MenuItem[] {
  return sortDishes(items);
}

export function mapMenu(r: PbRecord, items: MenuItem[], baseUrl: string): Menu {
  const files: string[] = Array.isArray(r.photos) ? r.photos : r.photos ? [String(r.photos)] : [];
  const photos: MenuPhoto[] = files.map((file) => ({ file, url: fileUrl(baseUrl, r, file) }));
  return {
    id: r.id,
    name: String(r.name ?? ""),
    season: nn(r.season),
    price_per_person: num(r.price_per_person),
    is_kids: Boolean(r.is_kids),
    active: Boolean(r.active),
    sort: num(r.sort),
    items: sortMenuItems(items),
    photos,
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapBooking(r: PbRecord): Booking {
  return {
    id: r.id,
    client_id: String(r.client ?? ""),
    // Le prenotazioni senza tipo (dati precedenti alla migrazione) sono eventi.
    kind: (nn(r.kind) ?? "evento") as BookingKind,
    event_type: nn(r.event_type),
    event_name: nn(r.event_name),
    event_date: toDateOnly(r.event_date),
    event_time: nn(r.event_time),
    room_id: nn(r.room),
    adults: num(r.adults),
    children: num(r.children),
    kids_menus: num(r.kids_menus),
    menu_id: nn(r.menu),
    kids_menu_id: nn(r.kids_menu),
    setup_colors: Array.isArray(r.setup_colors) ? (r.setup_colors as string[]) : [],
    setup_notes: nn(r.setup_notes),
    status: r.status as BookingStatus,
    notes: nn(r.notes),
    created_by: nn(r.created_by),
    updated_by: nn(r.updated_by),
    created_at: toIsoDateTime(r.created),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapDish(r: PbRecord): BookingDish {
  return {
    id: r.id,
    booking_id: String(r.booking ?? ""),
    course: r.course as Course,
    name: String(r.name ?? ""),
    sort: num(r.sort),
    description: nn(r.description),
  };
}

export function mapAllergy(r: PbRecord): BookingAllergy {
  return {
    id: r.id,
    booking_id: String(r.booking ?? ""),
    subject_name: nn(r.subject_name),
    condition: String(r.condition ?? ""),
    notes: nn(r.notes),
  };
}

export function mapBookingNote(r: PbRecord): BookingNote {
  return {
    id: r.id,
    booking_id: String(r.booking ?? ""),
    author_id: nn(r.author),
    author_name: String(r.author_name ?? ""),
    body: String(r.body ?? ""),
    created_at: toIsoDateTime(r.created),
  };
}

export function mapChange(r: PbRecord): BookingChange {
  return {
    id: r.id,
    booking_id: nn(r.booking),
    booking_label: nn(r.booking_label),
    changed_by: nn(r.changed_by),
    changed_by_name: String(r.changed_by_name ?? "sistema"),
    table_name: String(r.table_name ?? ""),
    field: String(r.field ?? ""),
    old_value: nn(r.old_value),
    new_value: nn(r.new_value),
    created_at: toIsoDateTime(r.created),
  };
}

export function normalizeQuoteLines(raw: unknown): QuoteLine[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((l: any) => ({
    description: String(l?.description ?? ""),
    quantity: num(l?.quantity),
    unit_price: num(l?.unit_price),
  }));
}

export function mapQuote(r: PbRecord): Quote {
  return {
    id: r.id,
    booking_id: String(r.booking ?? ""),
    number: String(r.number ?? ""),
    issued_at: toDateOnly(r.issued_at),
    valid_until: nn(toDateOnly(r.valid_until)),
    lines: normalizeQuoteLines(r.lines),
    discount: num(r.discount),
    vat_rate: num(r.vat_rate),
    // PocketBase non distingue null da 0 nei campi numero: 0 = nessun prezzo finale (calcolo automatico).
    final_total: num(r.final_total) > 0 ? num(r.final_total) : null,
    notes: nn(r.notes),
    created_at: toIsoDateTime(r.created),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapPayment(r: PbRecord): Payment {
  return {
    id: r.id,
    booking_id: String(r.booking ?? ""),
    amount: num(r.amount),
    paid_at: toDateOnly(r.paid_at),
    method: nn(r.method) as PaymentMethod | null,
    receipt_path: nn(r.receipt),
    receipt_name: nn(r.receipt_name),
    receipt_type: nn(r.receipt_type),
    notes: nn(r.notes),
    created_at: toIsoDateTime(r.created),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapInventoryProduct(r: PbRecord): InventoryProduct {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    unit: nn(r.unit),
    category: normalizeInventoryCategory(r.category),
    supplier: normalizeInventorySupplier(r.supplier),
    sort: num(r.sort),
    active: Boolean(r.active),
    updated_at: toIsoDateTime(r.updated),
  };
}

export function mapInventoryLine(r: PbRecord): InventoryReportLine {
  return {
    id: r.id,
    report_id: String(r.report ?? ""),
    product_id: nn(r.product),
    product_name: String(r.product_name ?? ""),
    unit: nn(r.unit),
    state: r.state as InventoryState,
    quantity: num(r.quantity),
    sort: num(r.sort),
    supplier: normalizeInventorySupplier(r.supplier),
    category: normalizeInventoryCategory(r.category),
  };
}

/** Report di giacenza. Le righe sono aggiunte a parte (lines: [] se non richieste). */
export function mapInventoryReport(r: PbRecord, lines: InventoryReportLine[] = []): InventoryReport {
  return {
    id: r.id,
    created_by: nn(r.created_by),
    created_by_name: String(r.created_by_name ?? ""),
    report_date: toDateOnly(r.report_date),
    notes: nn(r.notes),
    status: r.status === "visto" ? "visto" : "inviato",
    seen_by: nn(r.seen_by),
    seen_at: r.seen_at ? toIsoDateTime(r.seen_at) : null,
    created_at: toIsoDateTime(r.created),
    lines,
  };
}

export function mapNotification(r: PbRecord): AppNotification {
  return {
    id: r.id,
    type: r.type as AppNotification["type"],
    title: String(r.title ?? ""),
    body: nn(r.body),
    booking_id: nn(r.booking),
    url: nn(r.url),
    actor_name: nn(r.actor_name),
    read_at: r.read_at ? toIsoDateTime(r.read_at) : null,
    created_at: toIsoDateTime(r.created),
  };
}
