import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { num, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll, listByParents } from "@/lib/pocketbase/queries";
import { mapCatalogDish, mapRoom, sortDishes } from "@/lib/pocketbase/mappers";
import { buildMenuColors, type MenuColor } from "@/lib/menu-colors";
import type { Dish, Menu, Room } from "@/lib/types";
import { menusWithItems } from "./shared";

// Il catalogo e' leggibile da tutti gli utenti attivi (come le vecchie policy SELECT).

export async function getRooms(opts?: { includeInactive?: boolean }): Promise<Room[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const filter = opts?.includeInactive ? "" : db.filter("active = {:a}", { a: true });
  const records = await listAll(db, "rooms", filter, { sort: "sort,name" });
  return records.map(mapRoom).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "it"));
}

export async function getMenus(opts?: { includeInactive?: boolean }): Promise<Menu[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const filter = opts?.includeInactive ? "" : db.filter("active = {:a}", { a: true });
  const records = await listAll(db, "menus", filter, { sort: "sort,name" });
  const byId = await menusWithItems(db, records);
  return records.map((r) => byId.get(r.id)).filter((m): m is Menu => Boolean(m));
}

/**
 * Catalogo piatti (admin). Ordine: portata, poi sort, poi nome.
 * `used_in`: menù che contengono il piatto (anche quelli inattivi), senza duplicati.
 */
export async function getDishes(opts?: { includeInactive?: boolean }): Promise<Dish[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const filter = opts?.includeInactive ? "" : db.filter("active = {:a}", { a: true });
  const records = await listAll(db, "dishes", filter);

  const links = await listByParents(db, "menu_items", "dish", records.map((r) => r.id), { fields: "id,dish,menu" });
  const menuIds = [...new Set(links.map((l) => String(l.menu ?? "")).filter(Boolean))];
  const menuNames = new Map<string, string>();
  for (const m of await listByParents(db, "menus", "id", menuIds, { fields: "id,name" })) {
    menuNames.set(m.id, String(m.name ?? ""));
  }

  const usedBy = new Map<string, Map<string, { id: string; name: string }>>();
  for (const link of links) {
    const dishId = String(link.dish ?? "");
    const menuId = String(link.menu ?? "");
    if (!dishId || !menuId) continue;
    const bucket = usedBy.get(dishId) ?? new Map<string, { id: string; name: string }>();
    if (!bucket.has(menuId)) bucket.set(menuId, { id: menuId, name: menuNames.get(menuId) ?? "" });
    usedBy.set(dishId, bucket);
  }

  const dishes = records.map((r) =>
    mapCatalogDish(
      r,
      [...(usedBy.get(r.id)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name, "it")),
    ),
  );
  return sortDishes(dishes);
}

/**
 * Colore di ogni menù (adulti per prezzo crescente, bambini fissi). Letto con l'account di servizio per
 * qualunque ruolo attivo: i prezzi servono solo a ordinare, non escono dal server. Include anche i menù
 * inattivi, così le prenotazioni passate mantengono il loro colore.
 */
export async function getMenuColors(): Promise<Record<string, MenuColor>> {
  if (!(await getCurrentProfile())) return {};
  const db = await getAdminPb();
  const records = await listAll(db, "menus", "", { fields: "id,name,price_per_person,is_kids" });
  return buildMenuColors(
    records.map((r: PbRecord) => ({
      id: r.id,
      name: String(r.name ?? ""),
      price_per_person: num(r.price_per_person),
      is_kids: Boolean(r.is_kids),
    })),
  );
}
