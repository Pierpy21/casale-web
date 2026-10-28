import type { ReactNode } from "react";
import { MenuBadge } from "@/components/menu/MenuBadge";
import type { WeekStats } from "@/lib/types";
import { busiestDayLabel, countLabel } from "./week-format";

export interface WeekDetailsProps {
  week: WeekStats;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] leading-snug text-slate-dark">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] leading-snug tabular-nums text-ink">{children}</dd>
    </div>
  );
}

/** Dettagli di una settimana: n. eventi e prenotazioni, giorno più pieno e menù serviti (con il colore del menù). */
export function WeekDetails({ week }: WeekDetailsProps) {
  const menus = week.menus;
  // Menù più servito: quello con più porzioni (adulti o bambini); a parità vince il primo nell'elenco.
  const topMenu = menus.reduce<(typeof menus)[number] | null>(
    (best, menu) => (best === null || menu.servings > best.servings ? menu : best),
    null,
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Item label="Eventi">{countLabel(week.events, "evento", "eventi")}</Item>
        <Item label="Prenotazioni">{countLabel(week.normal_bookings, "prenotazione", "prenotazioni")}</Item>
        <Item label="Giorno più pieno">
          {week.busiest_day ? busiestDayLabel(week.busiest_day) : <span className="text-slate-dark">Nessuno</span>}
        </Item>
        <Item label="Menù più servito">
          {topMenu ? (
            <MenuBadge menuId={topMenu.menu_id} name={topMenu.name} />
          ) : (
            <span className="text-slate-dark">Nessun menù</span>
          )}
        </Item>
      </dl>

      {menus.length > 1 && (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[12px] leading-snug text-slate-dark">Tutti i menù della settimana</p>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {menus.map((menu) => (
              <li key={menu.menu_id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <MenuBadge menuId={menu.menu_id} name={menu.name} />
                <span className="shrink-0 text-[12px] tabular-nums text-slate-dark">
                  {countLabel(menu.servings, "porzione", "porzioni")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
