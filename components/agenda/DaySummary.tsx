import { MenuBadge } from "@/components/menu/MenuBadge";
import { Stat, cn } from "@/components/ui";
import { kidsMenuRowLabel } from "@/lib/quote-utils";
import type { BookingListItem } from "@/lib/types";

/** Quantità di un menù (adulti) o di un menù bambini nella giornata. */
export interface MenuQuantity {
  key: string;
  label: string;
  quantity: number;
  kind: "menu" | "kids";
  /** Id del menù (per il colore). Se manca, si ricava dalla chiave "menu:<id>" / "kids:<id>". */
  menuId?: string | null;
}

/** Id del menù di una voce: dichiarato, oppure dalla chiave "menu:<id>" / "kids:<id>". */
function menuIdOf(menu: MenuQuantity): string | null {
  if (menu.menuId) return menu.menuId;
  const separator = menu.key.indexOf(":");
  return separator >= 0 ? menu.key.slice(separator + 1) : null;
}

export interface DaySummaryData {
  /** Prenotazioni contate (esclusi annullati e appuntamenti). */
  bookingsCount: number;
  adults: number;
  children: number;
  /** Coperti totali: eventi + prenotazioni normali. */
  covers: number;
  /** Coperti delle sole prenotazioni normali (alla carta). */
  alCartaCovers: number;
  /** Coperti degli eventi. */
  eventCovers: number;
  /** Menù del giorno, ordinati per quantità decrescente. */
  menus: MenuQuantity[];
}

/**
 * Riepilogo della giornata. Funzione pura: conta solo le prenotazioni attive
 * (non annullate e non appuntamenti). I menù si contano solo per gli eventi.
 */
export function summarizeDay(bookings: BookingListItem[]): DaySummaryData {
  const data: DaySummaryData = {
    bookingsCount: 0,
    adults: 0,
    children: 0,
    covers: 0,
    alCartaCovers: 0,
    eventCovers: 0,
    menus: [],
  };
  const menus = new Map<string, MenuQuantity>();
  const addMenu = (key: string, label: string, kind: MenuQuantity["kind"], quantity: number, menuId: string) => {
    if (quantity <= 0) return;
    const current = menus.get(key);
    if (current) current.quantity += quantity;
    else menus.set(key, { key, label, quantity, kind, menuId });
  };

  for (const b of bookings) {
    if (b.status === "annullato" || b.kind === "appuntamento") continue;
    const covers = b.adults + b.children;
    data.bookingsCount += 1;
    data.adults += b.adults;
    data.children += b.children;
    data.covers += covers;

    if (b.kind === "normale") {
      data.alCartaCovers += covers;
      continue;
    }

    // Evento: coperti e menù.
    data.eventCovers += covers;
    if (b.menu) addMenu(`menu:${b.menu.id}`, b.menu.name, "menu", b.adults, b.menu.id);
    if (b.kids_menu) {
      addMenu(`kids:${b.kids_menu.id}`, kidsMenuRowLabel(b.kids_menu.name), "kids", b.kids_menus, b.kids_menu.id);
    }
  }

  data.menus = [...menus.values()].sort(
    (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "it"),
  );
  return data;
}

export interface MenuChipsProps {
  menus: MenuQuantity[];
  /** `lg` per la cucina: testo più grande e leggibile a distanza. */
  size?: "md" | "lg";
  /** Etichetta del gruppo (default "Menù del giorno"). */
  title?: string;
  className?: string;
}

/** Menù del giorno come chip nel colore del menù: "Menù Autunno ×42". */
export function MenuChips({ menus, size = "md", title = "Menù del giorno", className }: MenuChipsProps) {
  if (menus.length === 0) return null;
  const lg = size === "lg";
  return (
    <div role="group" aria-label={title} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <span className={cn("font-medium uppercase tracking-[0.12em] text-bronze", lg ? "text-[13px]" : "text-[10px]")}>
        {title}
      </span>
      {menus.map((menu) => (
        <span key={menu.key} className="inline-flex max-w-full items-baseline gap-1.5">
          <MenuBadge menuId={menuIdOf(menu)} name={menu.label} size={lg ? "lg" : "sm"} />
          <span
            className={cn(
              "shrink-0 font-serif tabular-nums",
              menu.kind === "kids" ? "text-bronze" : "text-petrol",
              lg ? "text-[20px]" : "text-[14px]",
            )}
          >
            ×{menu.quantity}
          </span>
        </span>
      ))}
    </div>
  );
}

export interface DaySummaryProps {
  /** Prenotazioni del giorno (anche annullate o appuntamenti: vengono esclusi qui). */
  bookings: BookingListItem[];
  className?: string;
}

/** Riepilogo compatto della giornata: tre indicatori e i menù del giorno. Non renderizza nulla senza prenotazioni attive. */
export function DaySummary({ bookings, className }: DaySummaryProps) {
  const summary = summarizeDay(bookings);
  if (summary.bookingsCount === 0) return null;

  return (
    <section
      aria-label="Riepilogo della giornata"
      className={cn("flex min-w-0 flex-col gap-3 rounded-btn border border-sand bg-cream/40 p-3", className)}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Coperti totali"
          value={summary.covers}
          hint={`${summary.bookingsCount} ${summary.bookingsCount === 1 ? "servizio" : "servizi"}`}
        />
        <Stat label="Di cui alla carta" value={summary.alCartaCovers} hint={`Eventi ${summary.eventCovers}`} />
        <Stat label="Adulti / bambini" value={`${summary.adults} / ${summary.children}`} />
      </div>
      <MenuChips menus={summary.menus} />
    </section>
  );
}
