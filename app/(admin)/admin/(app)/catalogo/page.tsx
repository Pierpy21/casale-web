import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getDishes, getMenus, getRooms } from "@/lib/data/catalog";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { DishesPanel } from "@/components/catalog/DishesPanel";
import { MenusPanel } from "@/components/catalog/MenusPanel";
import { RoomsPanel } from "@/components/catalog/RoomsPanel";

export const metadata: Metadata = {
  title: "Menù & Sale · Casale del Notaio",
};

type SearchParams = Promise<{ tab?: string }>;

type CatalogTab = "menu" | "piatti" | "sale";

const TABS: readonly { key: CatalogTab; label: string }[] = [
  { key: "menu", label: "Menù" },
  { key: "piatti", label: "Piatti" },
  { key: "sale", label: "Sale" },
];

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { tab } = await searchParams;
  const current: CatalogTab = tab === "sale" ? "sale" : tab === "piatti" ? "piatti" : "menu";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catalogo"
        title="Menù & Sale"
        description="Piatti del catalogo, menù per banchetto con piatti per portata, e sale con capienza. I menù non vengono mai eliminati: quelli non più in uso si disattivano."
      />

      <nav aria-label="Sezioni del catalogo" className="border-b border-sand">
        <ul className="flex gap-6 overflow-x-auto">
          {TABS.map((item) => {
            const active = item.key === current;
            return (
              <li key={item.key}>
                <Link
                  href={`/admin/catalogo?tab=${item.key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex border-b-2 pb-3 text-[13px] font-medium uppercase tracking-[0.14em] whitespace-nowrap transition-colors duration-300",
                    active
                      ? "border-petrol text-petrol"
                      : "border-transparent text-slate-dark hover:border-sand hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {current === "menu" && <MenusTab />}
      {current === "piatti" && <DishesTab />}
      {current === "sale" && <RoomsTab />}
    </div>
  );
}

async function MenusTab() {
  const [menus, dishes] = await Promise.all([
    getMenus({ includeInactive: true }),
    getDishes({ includeInactive: true }),
  ]);
  return <MenusPanel menus={menus} dishes={dishes} />;
}

async function DishesTab() {
  const dishes = await getDishes({ includeInactive: true });
  return <DishesPanel dishes={dishes} />;
}

async function RoomsTab() {
  const rooms = await getRooms({ includeInactive: true });
  return <RoomsPanel rooms={rooms} />;
}
