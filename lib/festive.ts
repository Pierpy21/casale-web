import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { pocketbasePublicUrl } from "@/lib/pocketbase/config";
import { fileUrl, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll } from "@/lib/pocketbase/queries";
import { FESTIVE_SECTION_KEY, type FestiveMenu, type FestiveSection } from "@/lib/festive-types";

/** Tag di cache della fascia festiva: revalidateTag(FESTIVE_TAG) dopo ogni modifica ai menù festivi o all'interruttore. */
export const FESTIVE_TAG = "festive";

/** Record PocketBase di festive_menus → menù festivo (stesso contratto per il sito e per l'admin). */
export function mapFestive(r: PbRecord, base: string): FestiveMenu {
  return {
    id: r.id,
    title: String(r.title ?? ""),
    date: String(r.date).slice(0, 10),
    price: Number(r.price) > 0 ? Number(r.price) : null,
    courses: String(r.courses ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: String(r.notes ?? ""),
    photos: (Array.isArray(r.photos) ? r.photos : []).map((f: string) => ({ file: f, url: fileUrl(base, r, f) })),
    active: Boolean(r.active),
    updated: String(r.updated ?? ""),
  };
}

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
 * Sezione festiva per la home (cache con tag "festive"). Se l'interruttore è spento non legge i menù.
 * Menù mostrati: attivi con data da oggi in poi, in ordine di data. Gli errori li gestisce la pagina.
 */
export const getFestiveSection = unstable_cache(
  async (): Promise<FestiveSection> => {
    const db = await getAdminPb();
    const settings = await listAll(
      db,
      "site_settings",
      db.filter("key = {:k}", { k: FESTIVE_SECTION_KEY }),
      { fields: "id,enabled" },
    );
    const enabled = Boolean(settings[0]?.enabled);
    if (!enabled) return { enabled: false, menus: [], photos: [] };

    const records = await listAll(
      db,
      "festive_menus",
      db.filter("active = true && date >= {:d}", { d: `${todayInRome()} 00:00:00.000Z` }),
      { sort: "date" },
    );
    const base = pocketbasePublicUrl();
    const menus = records.map((r) => mapFestive(r, base));
    return {
      enabled: true,
      menus,
      photos: menus.flatMap((m) => m.photos.map((p) => p.url)),
    };
  },
  ["festive-section"],
  { tags: [FESTIVE_TAG], revalidate: 3600 },
);
