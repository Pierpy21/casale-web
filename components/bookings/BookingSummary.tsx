import { MenuChips, type MenuQuantity } from "@/components/agenda/DaySummary";
import { Stat } from "@/components/ui";
import type { BookingDetail, PaymentSummary } from "@/lib/types";
import { formatEUR } from "@/lib/quote-utils";

export interface BookingSummaryProps {
  booking: Pick<BookingDetail, "kind" | "adults" | "children" | "kids_menus" | "event_type" | "menu" | "kids_menu">;
  /** Orario già formattato HH:mm, oppure null. */
  time: string | null;
  /** Riepilogo economico: solo per l'amministrazione (null = non visibile). */
  finance: PaymentSummary | null;
}

const GRID_COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
} as const;

/**
 * Numeri della prenotazione sotto il titolo, stessa forma del riepilogo giornata (Stat + chip menù).
 * Eventi: coperti, menù bambini, totale previsto e residuo (admin). Normali: coperti, adulti/bambini, ora.
 * Appuntamenti: ora e tipo evento.
 */
export function BookingSummary({ booking, time, finance }: BookingSummaryProps) {
  const covers = booking.adults + booking.children;
  const tiles: { key: string; label: string; value: string | number; hint?: string; highlight?: boolean }[] = [];

  if (booking.kind === "evento") {
    tiles.push({
      key: "covers",
      label: "Coperti totali",
      value: covers,
      hint: `Adulti ${booking.adults} · Bambini ${booking.children}`,
    });
    tiles.push({
      key: "kids",
      label: "Menù bambini",
      value: booking.kids_menus,
      hint: booking.kids_menu?.name,
    });
    if (finance) {
      const price = booking.menu?.price_per_person;
      tiles.push({
        key: "expected",
        label: "Totale previsto",
        value: formatEUR(finance.expected_total),
        hint: price !== undefined ? `${formatEUR(price)} a persona` : "Menù non scelto",
      });
      tiles.push({
        key: "balance",
        label: "Residuo",
        value: formatEUR(Math.max(0, finance.balance)),
        hint: `Versato ${formatEUR(finance.paid_total)}`,
        highlight: finance.balance > 0,
      });
    }
  } else if (booking.kind === "normale") {
    tiles.push({ key: "covers", label: "Coperti", value: covers });
    tiles.push({ key: "guests", label: "Adulti / bambini", value: `${booking.adults} / ${booking.children}` });
    tiles.push({ key: "time", label: "Ora", value: time ?? "—" });
  } else {
    tiles.push({ key: "time", label: "Ora", value: time ?? "—" });
    tiles.push({ key: "type", label: "Tipo evento", value: booking.event_type?.trim() || "—" });
  }

  // Menù scelti per l'evento: chip "Menù X ×adulti" e "Menù bambini — Y ×n".
  const menus: MenuQuantity[] = [];
  if (booking.kind === "evento") {
    if (booking.menu && booking.adults > 0) {
      menus.push({ key: `menu:${booking.menu.id}`, label: booking.menu.name, quantity: booking.adults, kind: "menu" });
    }
    if (booking.kids_menu && booking.kids_menus > 0) {
      menus.push({
        key: `kids:${booking.kids_menu.id}`,
        label: `Menù bambini — ${booking.kids_menu.name}`,
        quantity: booking.kids_menus,
        kind: "kids",
      });
    }
  }

  const columns = tiles.length >= 4 ? GRID_COLUMNS[4] : tiles.length === 3 ? GRID_COLUMNS[3] : GRID_COLUMNS[2];

  return (
    <section aria-label="Riepilogo prenotazione" className="flex min-w-0 flex-col gap-3 rounded-btn border border-sand bg-cream/40 p-3">
      <div className={`grid grid-cols-2 gap-2 ${columns}`}>
        {tiles.map((tile) => (
          <Stat key={tile.key} label={tile.label} value={tile.value} hint={tile.hint} highlight={tile.highlight} />
        ))}
      </div>
      <MenuChips menus={menus} title="Menù dell’evento" />
    </section>
  );
}
