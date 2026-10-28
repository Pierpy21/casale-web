import { MenuBadge } from "@/components/menu/MenuBadge";
import { EmptyState } from "@/components/ui";
import type { MenuConsumption } from "@/lib/types";
import { ProportionBar } from "./ProportionBar";

export interface MenuConsumptionListProps {
  menus: MenuConsumption[];
}

function servingsLabel(n: number): string {
  return `${n} ${n === 1 ? "porzione" : "porzioni"}`;
}

/** Menù consumati nel periodo (porzioni): menù adulti e menù bambini in gruppi distinti. */
export function MenuConsumptionList({ menus }: MenuConsumptionListProps) {
  if (menus.length === 0) {
    return <EmptyState title="Nessun menù consumato" description="Nel periodo non ci sono eventi con un menù scelto." />;
  }

  const max = Math.max(1, ...menus.map((m) => m.servings));
  const groups = [
    { key: "adulti", title: "Menù adulti", items: menus.filter((m) => !m.is_kids), tone: "petrol" as const },
    { key: "bambini", title: "Menù bambini", items: menus.filter((m) => m.is_kids), tone: "bronze" as const },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`menu-${group.key}`} className="flex min-w-0 flex-col gap-2">
          <h3 id={`menu-${group.key}`} className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">
            {group.title}
          </h3>
          <ul className="flex flex-col divide-y divide-sand">
            {group.items.map((menu) => (
              <li key={menu.menu_id} className="flex min-w-0 flex-col gap-2 py-3">
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <MenuBadge menuId={menu.menu_id} name={menu.name} />
                  <span className="shrink-0 text-[13px] tabular-nums text-slate-dark">{servingsLabel(menu.servings)}</span>
                </div>
                <ProportionBar value={menu.servings} max={max} tone={group.tone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
