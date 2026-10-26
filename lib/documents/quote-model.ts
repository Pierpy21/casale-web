import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { computeQuoteTotals, formatEUR, round2 } from "@/lib/quote-utils";
import {
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
    phone: string;
    email: string | null;
    taxCode: string | null;
    vatNumber: string | null;
  };
  event: {
    name: string | null;
    dateLong: string;
    time: string | null;
    room: string;
    adults: number;
    children: number;
    kidsMenus: number;
  };
  menu: QuoteDocumentMenu | null;
  kidsMenu: QuoteDocumentMenu | null;
  setup: {
    colors: string[];
    notes: string | null;
  };
  lines: QuoteDocumentLine[];
  totals: {
    subtotal: string;
    discount: string;
    hasDiscount: boolean;
    taxable: string;
    vat: string;
    vatRate: string;
    total: string;
  };
  notes: string | null;
  conditions: string[];
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

const CONDITIONS = [
  "Prezzi espressi in euro, IVA inclusa.",
  "Il preventivo ha validità fino alla data indicata.",
  "Ogni sala è riservata a un singolo evento: esclusività della sala, tavolo torta e decorazioni sono incluse nella banchettistica.",
] as const;

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

export function buildQuoteDocumentModel(q: QuoteWithBooking): QuoteDocumentModel {
  const b = q.booking;
  const totals = computeQuoteTotals(q);

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
    title: "Preventivo",
    meta: {
      number: q.number,
      issuedAt: formatDateShort(q.issued_at),
      validUntil: q.valid_until ? formatDateShort(q.valid_until) : null,
    },
    client: {
      fullName: `${b.client.first_name} ${b.client.last_name}`.trim(),
      phone: b.client.phone,
      email: orNull(b.client.email),
      taxCode: orNull(b.client.tax_code),
      vatNumber: orNull(b.client.vat_number),
    },
    event: {
      name: orNull(b.event_name),
      dateLong: formatDateLong(b.event_date),
      time: b.event_time ? b.event_time.slice(0, 5) : null,
      room: b.room?.name ?? "Da definire",
      adults: b.adults,
      children: b.children,
      kidsMenus: b.kids_menus,
    },
    menu: dishesMenu,
    kidsMenu,
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
      subtotal: formatEUR(totals.subtotal),
      discount: formatEUR(totals.discount),
      hasDiscount: totals.discount > 0,
      taxable: formatEUR(totals.taxable),
      vat: formatEUR(totals.vat),
      vatRate: `${formatQuantity(q.vat_rate)}%`,
      total: formatEUR(totals.total),
    },
    notes: orNull(q.notes),
    conditions: [...CONDITIONS],
    signature: {
      issuerLabel: "Per il Casale del Notaio",
      clientLabel: "Per accettazione (firma del cliente)",
    },
  };
}
