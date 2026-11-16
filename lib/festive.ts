import "server-only";
import { unstable_cache } from "next/cache";
import { ClientResponseError } from "pocketbase";
import type PocketBase from "pocketbase";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { pocketbasePublicUrl } from "@/lib/pocketbase/config";
import { fileUrl, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll, listByParents } from "@/lib/pocketbase/queries";
import { courseRank } from "@/lib/pocketbase/mappers";
import { MENUS_TAG } from "@/lib/menus";
import { COURSE_LABELS, type Course } from "@/lib/types";
import {
  FESTIVE_SECTION_KEY,
  type FestiveCourse,
  type FestiveMenu,
  type FestiveSection,
} from "@/lib/festive-types";

/**
 * Tag di cache della fascia festiva: revalidateTag(FESTIVE_TAG) dopo ogni modifica all'interruttore.
 * La fascia usa anche MENUS_TAG, così le modifiche ai menù (anche ai festivi) la invalidano.
 */
export const FESTIVE_TAG = "festive";

/** Oggi nel fuso di Roma, formato "YYYY-MM-DD" (il giorno della festa vale fino a fine giornata locale). */
function todayInRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Interruttore "Mostra la fascia Buone Feste" (site_settings, chiave FESTIVE_SECTION_KEY).
 * Record mancante o collezione assente (404) → false; altri errori vengono rilanciati.
 */
export async function readFestiveEnabled(db: PocketBase): Promise<boolean> {
  try {
    const rows = await listAll(db, "site_settings", db.filter("key = {:k}", { k: FESTIVE_SECTION_KEY }), {
      fields: "id,enabled",
    });
    return Boolean(rows[0]?.enabled);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return false;
    throw err;
  }
}

/**
 * Sezione festiva per la home (cache con tag "festive" e "menus"). Se l'interruttore è spento non legge i menù.
 * Menù mostrati: menù attivi, non compositi, con data festiva da oggi in poi, in ordine di data.
 * Gli errori li gestisce la pagina.
 */
export const getFestiveSection = unstable_cache(
  async (): Promise<FestiveSection> => {
    const db = await getAdminPb();
    if (!(await readFestiveEnabled(db))) return { enabled: false, menus: [], photos: [] };

    const records = await listAll(
      db,
      "menus",
      db.filter("active = true && is_kids != true && custom != true && festive_date != '' && festive_date >= {:d}", {
        d: `${todayInRome()} 00:00:00.000Z`,
      }),
      { sort: "festive_date,name" },
    );

    const items = await listByParents(db, "menu_items", "menu", records.map((r) => r.id));
    const byMenu = new Map<string, PbRecord[]>();
    for (const item of items) {
      const key = String(item.menu ?? "");
      const list = byMenu.get(key) ?? [];
      list.push(item);
      byMenu.set(key, list);
    }

    const base = pocketbasePublicUrl();
    const menus: FestiveMenu[] = records.map((r) => {
      const dishes = [...(byMenu.get(r.id) ?? [])].sort(
        (a, b) =>
          courseRank(a.course as Course) - courseRank(b.course as Course) || Number(a.sort ?? 0) - Number(b.sort ?? 0),
      );
      // Portate nell'ordine del menù: le voci arrivano già ordinate per portata, quindi basta raggrupparle in ordine.
      const groups = new Map<string, FestiveCourse>();
      for (const dish of dishes) {
        const label = COURSE_LABELS[dish.course as Course] ?? "Varie";
        const group: FestiveCourse = groups.get(label) ?? { label, items: [] };
        group.items.push({ name: String(dish.name ?? ""), description: String(dish.description ?? "") });
        groups.set(label, group);
      }

      const price = Number(r.price_per_person ?? 0);
      const files: string[] = Array.isArray(r.photos) ? r.photos : r.photos ? [String(r.photos)] : [];
      return {
        id: r.id,
        name: String(r.name ?? ""),
        label: String(r.season || ""),
        date: String(r.festive_date).slice(0, 10),
        price: price > 0 ? price : null,
        courses: [...groups.values()],
        photos: files.map((f) => fileUrl(base, r, f)),
      };
    });

    return {
      enabled: true,
      menus,
      photos: menus.flatMap((m) => m.photos),
    };
  },
  ["festive-section-v2"],
  { tags: [FESTIVE_TAG, MENUS_TAG], revalidate: 3600 },
);
