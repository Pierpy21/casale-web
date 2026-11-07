import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { computeQuoteTotals, formatEUR, quoteDocumentTitle, round2 } from "@/lib/quote-utils";
import { bookingPersonName, bookingPhone } from "@/components/bookings/format";
import {
  BOOKING_MEAL_LABELS,
  COURSE_LABELS,
  COURSE_ORDER,
  type Course,
  type QuoteWithBooking,
} from "@/lib/types";

/**
 * Modello neutro del preventivo: unico input per i renderer PDF e DOCX.
 * Funzione pura: nessun accesso a file system, DB o rete. Tutti i valori
 * monetari e le date sono già formattati in it-IT.
 */

export interface QuoteDocumentCourse {
  course: Course;
  label: string;
  dishes: string[];
}

export interface QuoteDocumentMenu {
  name: string | null;
  courses: QuoteDocumentCourse[];
}

export interface QuoteDocumentLine {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export interface QuoteDocumentModel {
  issuer: {
    name: string;
    tagline: string;
    addressLines: string[];
    phone: string;
    email: string;
  };
  title: string;
  meta: {
    number: string;
    issuedAt: string;
    validUntil: string | null;
  };
  client: {
    fullName: string;
    /** Cellulare facoltativo: null se non indicato (la riga non si stampa). */
    phone: string | null;
    email: string | null;
    taxCode: string | null;
    vatNumber: string | null;
  };
  event: {
    dateLong: string;
    /** Pasto: "Pranzo" o "Cena", null se non indicato. */
    meal: string | null;
    room: string;
    adults: number;
    children: number;
    kidsMenus: number;
  };
  menu: QuoteDocumentMenu | null;
  kidsMenu: QuoteDocumentMenu | null;
  /** Allergie e intolleranze, una riga ciascuna: "Celiachia (Mario) — note". Vuoto se nessuna. */
  allergies: string[];
  setup: {
    colors: string[];
    notes: string | null;
  };
  lines: QuoteDocumentLine[];
  totals: {
    /** Con prezzo finale: "Valore delle voci (IVA inclusa)"; altrimenti "Subtotale (IVA inclusa)". */
    subtotalLabel: string;
    subtotal: string;
    discount: string;
    hasDiscount: boolean;
    taxable: string;
    vat: string;
    vatRate: string;
    /** Con prezzo finale: "Totale concordato (IVA inclusa)"; altrimenti "Totale". */
    totalLabel: string;
    total: string;
    overridden: boolean;
  };
  notes: string | null;
  signature: {
    issuerLabel: string;
    clientLabel: string;
  };
}

const CASALE_ISSUER = {
  name: "Casale del Notaio",
  tagline: "Il Casale del Notaio, del gusto il Teatro.",
  addressLines: ["Via Nicolosi 67", "95032 Belpasso (CT), Sicilia"],
  phone: "+39 340 109 0100",
  email: "info@casaledelnotaio.it",
} as const;

const numberFormatter = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

function orNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDateShort(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy", { locale: it });
}

function formatDateLong(iso: string): string {
  return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: it });
}

function formatQuantity(value: number): string {
  return numberFormatter.format(value);
}

function groupByCourse(
  items: ReadonlyArray<{ course: Course; name: string; sort: number }>,
): QuoteDocumentCourse[] {
  return COURSE_ORDER.flatMap((course) => {
    const dishes = items
      .filter((item) => item.course === course)
      .sort((a, b) => a.sort - b.sort)
      .map((item) => item.name);
    return dishes.length > 0 ? [{ course, label: COURSE_LABELS[course], dishes }] : [];
  });
}

/**
 * Divide le portate in due colonne (in ordine: la prima colonna si legge prima della seconda),
 * bilanciando il numero di righe, così il menù sta in un unico foglio A4.
 */
export function splitCoursesInColumns(
  courses: QuoteDocumentCourse[],
): [QuoteDocumentCourse[], QuoteDocumentCourse[]] {
  // Peso di una portata: i piatti più lo spazio dell'etichetta.
  const weight = (c: QuoteDocumentCourse) => c.dishes.length + 0.4;
  const total = courses.reduce((sum, c) => sum + weight(c), 0);
  let best = courses.length;
  let bestHeight = total;
  let left = 0;
  for (let i = 0; i <= courses.length; i++) {
    const height = Math.max(left, total - left);
    if (height < bestHeight) {
      bestHeight = height;
      best = i;
    }
    if (i < courses.length) left += weight(courses[i]);
  }
  return [courses.slice(0, best), courses.slice(best)];
}

/** Ospiti su una riga: "80 adulti · 10 bambini (8 menù bambini)". */
export function guestsLabel(event: QuoteDocumentModel["event"]): string {
  const parts = [`${event.adults} adulti`, `${event.children} bambini`];
  const kids = event.kidsMenus > 0 ? ` (${event.kidsMenus} menù bambini)` : "";
  return parts.join(" · ") + kids;
}

/** Campi del cliente valorizzati, in ordine, come coppie [etichetta, valore]. */
export function clientFields(client: QuoteDocumentModel["client"]): Array<[string, string]> {
  const fields: Array<[string, string | null]> = [
    ["Nome", client.fullName],
    ["Telefono", client.phone],
    ["Email", client.email],
    ["Codice fiscale", client.taxCode],
    ["Partita IVA", client.vatNumber],
  ];
  return fields.filter((f): f is [string, string] => !!f[1]);
}

function allergyLine(a: { subject_name: string | null; condition: string; notes: string | null }): string {
  const who = orNull(a.subject_name);
  const note = orNull(a.notes);
  return `${a.condition.trim()}${who ? ` (${who})` : ""}${note ? ` — ${note}` : ""}`;
}

export function buildQuoteDocumentModel(q: QuoteWithBooking): QuoteDocumentModel {
  const b = q.booking;
  const totals = computeQuoteTotals(q);
  // Il documento si chiama sempre "Ordine di servizio".
  const title = quoteDocumentTitle(b.status);

  const dishesMenu: QuoteDocumentMenu | null =
    b.menu || b.dishes.length > 0
      ? { name: b.menu?.name ?? null, courses: groupByCourse(b.dishes) }
      : null;

  const kidsMenu: QuoteDocumentMenu | null = b.kids_menu
    ? { name: b.kids_menu.name, courses: groupByCourse(b.kids_menu.items) }
    : null;

  return {
    issuer: {
      name: CASALE_ISSUER.name,
      tagline: CASALE_ISSUER.tagline,
      addressLines: [...CASALE_ISSUER.addressLines],
      phone: CASALE_ISSUER.phone,
      email: CASALE_ISSUER.email,
    },
    title,
    meta: {
      number: q.number,
      issuedAt: formatDateShort(q.issued_at),
      // Ordine di servizio: nessuna scadenza stampata.
      validUntil: null,
    },
    // Il preventivo nasce da un evento, quindi ha sempre il cliente di rubrica; i campi restano null-safe.
    client: {
      fullName: bookingPersonName(b),
      phone: orNull(bookingPhone(b)),
      email: orNull(b.client?.email ?? null),
      taxCode: orNull(b.client?.tax_code ?? null),
      vatNumber: orNull(b.client?.vat_number ?? null),
    },
    event: {
      dateLong: formatDateLong(b.event_date),
      meal: b.meal ? BOOKING_MEAL_LABELS[b.meal] : null,
      room: b.room?.name ?? "Da definire",
      adults: b.adults,
      children: b.children,
      kidsMenus: b.kids_menus,
    },
    menu: dishesMenu,
    kidsMenu,
    allergies: b.allergies.map(allergyLine),
    setup: {
      colors: [...b.setup_colors],
      notes: orNull(b.setup_notes),
    },
    lines: q.lines.map((line) => ({
      description: line.description,
      quantity: formatQuantity(line.quantity),
      unitPrice: formatEUR(line.unit_price),
      amount: formatEUR(round2(line.quantity * line.unit_price)),
    })),
    totals: {
      subtotalLabel: totals.overridden ? "Valore delle voci (IVA inclusa)" : "Subtotale (IVA inclusa)",
      subtotal: formatEUR(totals.subtotal),
      discount: formatEUR(totals.discount),
      hasDiscount: !totals.overridden && totals.discount > 0,
      taxable: formatEUR(totals.taxable),
      vat: formatEUR(totals.vat),
      vatRate: `${formatQuantity(q.vat_rate)}%`,
      totalLabel: totals.overridden ? "Totale concordato (IVA inclusa)" : "Totale",
      total: formatEUR(totals.total),
      overridden: totals.overridden,
    },
    notes: orNull(q.notes),
    signature: {
      issuerLabel: "Per il Casale del Notaio",
      clientLabel: "Per accettazione (firma del cliente)",
    },
  };
}
