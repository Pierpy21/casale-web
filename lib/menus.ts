import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { pocketbasePublicUrl } from "@/lib/pocketbase/config";
import { fileUrl, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll, listByParents } from "@/lib/pocketbase/queries";
import { courseRank } from "@/lib/pocketbase/mappers";
import type { Course } from "@/lib/types";
import type { MenuCategoria, PiattoDettaglio } from "@/lib/menus-types";

export type { MenuCategoria, PiattoDettaglio } from "@/lib/menus-types";

/** Tag di cache per il menu pubblico: revalidateTag(MENUS_TAG) dopo ogni modifica al catalogo. */
export const MENUS_TAG = "menus";

const COURSE_LABEL: Record<Course, string> = {
  antipasto: "Antipasto",
  primo: "Primo",
  secondo: "Secondo",
  contorno: "Contorno",
  dolce: "Dolce",
  bevande: "Bevande",
};

const CATEGORY_KEYS = Object.values(COURSE_LABEL);

/** Menu attivi e non per bambini, con voci (ordine portata poi sort) e foto pubbliche. */
async function loadMenus(): Promise<MenuCategoria[]> {
  const db = await getAdminPb();
  const menus = await listAll(
    db,
    "menus",
    db.filter("active = {:a} && is_kids = {:k}", { a: true, k: false }),
  );
  if (menus.length === 0) return [];

  const items = await listByParents(db, "menu_items", "menu", menus.map((m) => m.id));
  const base = pocketbasePublicUrl();

  const byMenu = new Map<string, PbRecord[]>();
  for (const item of items) {
    const key = String(item.menu ?? "");
    byMenu.set(key, [...(byMenu.get(key) ?? []), item]);
  }

  const sorted = [...menus].sort(
    (a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0) || String(a.name).localeCompare(String(b.name), "it"),
  );

  return sorted.map((m, index) => {
    const dishes = (byMenu.get(m.id) ?? [])
      .sort(
        (a, b) =>
          courseRank(a.course as Course) - courseRank(b.course as Course) || Number(a.sort ?? 0) - Number(b.sort ?? 0),
      )
      .map(
        (item, i): PiattoDettaglio => ({
          Id: i + 1,
          Nome: String(item.name ?? ""),
          Categoria: COURSE_LABEL[item.course as Course] ?? "Varie",
          Descrizione: String(item.description ?? ""),
        }),
      );
    const files: string[] = Array.isArray(m.photos) ? m.photos : [];
    return {
      Id: index + 1,
      id: m.id,
      Nome: String(m.name ?? ""),
      Prezzo: Number(m.price_per_person ?? 0),
      Piatti: dishes,
      Foto: files.map((f) => fileUrl(base, m, f)),
      Stagione: String(m.season || "Menu Degustazione"),
    };
  });
}

/** Piatti di tutti i menu pubblici, raggruppati per portata (pagina "crea il tuo menu"). */
async function loadAllDishes(): Promise<Record<string, PiattoDettaglio[]>> {
  const grouped: Record<string, PiattoDettaglio[]> = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
  const seen = new Set<string>();
  for (const menu of await loadMenus()) {
    for (const piatto of menu.Piatti) {
      const key = `${piatto.Categoria}|${piatto.Nome}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (grouped[piatto.Categoria] ??= []).push({ ...piatto, Id: seen.size });
    }
  }
  return grouped;
}

/** Menu completo per il sito (cache con tag "menus"). */
export const getMenuCompleto = unstable_cache(loadMenus, ["menus-completo"], {
  tags: [MENUS_TAG],
  revalidate: 3600,
});

/** Piatti per categoria per il sito (cache con tag "menus"). */
export const getTuttiPiatti = unstable_cache(loadAllDishes, ["menus-piatti"], {
  tags: [MENUS_TAG],
  revalidate: 3600,
});
