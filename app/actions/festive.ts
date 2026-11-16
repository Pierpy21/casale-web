"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { FestiveMenuInput, MenuPhotoFile, MENU_PHOTO_MAX_COUNT } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { FESTIVE_TAG } from "@/lib/festive";
import { FESTIVE_SECTION_KEY } from "@/lib/festive-types";
import { checkConflictById, withMutation } from "@/lib/mutations";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll } from "@/lib/pocketbase/queries";
import type { MutationOptions } from "@/lib/offline/contract";
import type { ActionResult } from "@/lib/types";

// Menù festivi (fascia "Buone Feste" della home e sezione admin in Menù & Sale).
// Tutte le azioni sono riservate all'admin. Dopo ogni scrittura si invalida la cache con tag "festive".
//
// upsertFestiveMenu accetta solo FormData:
//    - payload          stringa JSON con l'oggetto FestiveMenuInput (obbligatorio)
//    - photos           file immagine, ripetibile (max 10 foto in totale per menù, 5 MB ciascuna)
//    - remove_photos    nome file da rimuovere, ripetibile (il nome e' quello restituito in photos[].file)

const RemovePhotosInput = z
  .array(z.string().min(1).max(300).regex(/^[A-Za-z0-9_.-]+$/, "Nome foto non valido"))
  .max(MENU_PHOTO_MAX_COUNT);

/** Limite del campo testo `courses` in PocketBase (4000 caratteri). */
const COURSES_MAX_CHARS = 4000;

function revalidateFestive(): void {
  revalidateTag(FESTIVE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/catalogo");
}

/** Errore di validazione su un singolo campo (stesso formato di invalidInput). */
function fieldFail<T = never>(field: string, message: string): ActionResult<T> {
  return { ok: false, error: message, fieldErrors: { [field]: [message] } };
}

/** Data reale YYYY-MM-DD: rifiuta es. 2026-02-30. */
function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Crea o aggiorna un menù festivo, con le foto aggiunte e rimosse (vedi contratto in testa al file). */
export async function upsertFestiveMenu(input: FormData, opts?: MutationOptions): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "festive.upsertFestiveMenu", auth.profile.id, async (): Promise<ActionResult<{ id: string }>> => {
    if (!(input instanceof FormData)) return fail("Dati del menù mancanti.");
    const payload = input.get("payload");
    if (typeof payload !== "string") return fail("Dati del menù mancanti.");

    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      return fail("Dati del menù non validi.");
    }
    const parsed = FestiveMenuInput.safeParse(raw);
    if (!parsed.success) return invalidInput(parsed.error);

    const { id, ...menu } = parsed.data;
    if (!isRealDate(menu.date)) return fieldFail("date", "Data non valida");
    // Una portata per riga: un a capo dentro una voce la spezzerebbe alla lettura.
    if (menu.courses.some((c) => /[\r\n]/.test(c))) return fieldFail("courses", "Ogni portata deve stare su una riga.");
    const courses = menu.courses.join("\n");
    if (courses.length > COURSES_MAX_CHARS) {
      return fieldFail("courses", `Portate troppo lunghe (massimo ${COURSES_MAX_CHARS} caratteri in totale).`);
    }

    const newFiles = input.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    const photos = z
      .array(MenuPhotoFile)
      .max(MENU_PHOTO_MAX_COUNT, `Massimo ${MENU_PHOTO_MAX_COUNT} foto per volta`)
      .safeParse(newFiles);
    if (!photos.success) {
      const message = photos.error.issues[0]?.message ?? "Foto non valida.";
      return { ok: false, error: message, fieldErrors: { photos: [message] } };
    }
    const removed = RemovePhotosInput.safeParse(
      input.getAll("remove_photos").filter((v): v is string => typeof v === "string" && v.length > 0),
    );
    if (!removed.success) return invalidInput(removed.error);

    const db = auth.db;
    let current: PbRecord | null = null;
    if (id) {
      current = await fetchOne(db, "festive_menus", id);
      if (!current) return fail("Menù festivo non trovato.");
      // Modifica di un menù esistente: se è cambiato dopo la lettura, nessuna scrittura (né foto).
      const conflict = await checkConflictById(db, "festive_menus", id, opts);
      if (conflict) return conflict;
    }

    // Solo le foto che il menù ha davvero possono essere rimosse. Il totale finale non può superare il massimo.
    const currentPhotos: string[] = current && Array.isArray(current.photos) ? current.photos : [];
    const removeNames = removed.data.filter((f) => currentPhotos.includes(f));
    const remaining = currentPhotos.length - removeNames.length;
    if (remaining + photos.data.length > MENU_PHOTO_MAX_COUNT) {
      return fail(`Massimo ${MENU_PHOTO_MAX_COUNT} foto per menù festivo.`);
    }

    const fields = {
      title: menu.title,
      date: `${menu.date} 12:00:00.000Z`,
      price: menu.price ?? 0,
      courses,
      notes: menu.notes,
      active: menu.active,
    };

    try {
      let menuId: string;
      if (id) {
        await db.collection("festive_menus").update(id, fields);
        menuId = id;
      } else {
        const created = await db.collection("festive_menus").create(fields);
        menuId = created.id;
      }
      // Foto: chiamate separate dai dati (come per i menù del catalogo).
      if (removeNames.length > 0) {
        await db.collection("festive_menus").update(menuId, { "photos-": removeNames });
      }
      if (photos.data.length > 0) {
        const body = new FormData();
        for (const file of photos.data) body.append("photos+", file);
        await db.collection("festive_menus").update(menuId, body);
      }
      revalidateFestive();
      return { ok: true, data: { id: menuId } };
    } catch (err) {
      return dbFail(err);
    }
  });
}

/** Elimina fisicamente un menù festivo (le sue foto vanno con il record). */
export async function deleteFestiveMenu(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Menù festivo non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "festive.deleteFestiveMenu", auth.profile.id, async (): Promise<ActionResult> => {
    try {
      const current = await fetchOne(auth.db, "festive_menus", id);
      if (!current) {
        // Coda offline: menù già eliminato (solo nel reinvio) = successo.
        return opts?.replay === true ? { ok: true, data: undefined } : fail("Menù festivo non trovato.");
      }
      const conflict = await checkConflictById(auth.db, "festive_menus", id, opts);
      if (conflict) return conflict;
      await auth.db.collection("festive_menus").delete(id);
    } catch (err) {
      return dbFail(err);
    }
    revalidateFestive();
    return { ok: true, data: undefined };
  });
}

/** Attiva o disattiva un menù festivo (solo il campo active). */
export async function setFestiveMenuActive(id: string, active: boolean, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Menù festivo non valido.");
  const flag = z.boolean({ message: "Stato non valido" }).safeParse(active);
  if (!flag.success) return invalidInput(flag.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "festive.setFestiveMenuActive", auth.profile.id, async (): Promise<ActionResult> => {
    try {
      const current = await fetchOne(auth.db, "festive_menus", id);
      if (!current) return fail("Menù festivo non trovato.");
      const conflict = await checkConflictById(auth.db, "festive_menus", id, opts);
      if (conflict) return conflict;
      await auth.db.collection("festive_menus").update(id, { active: flag.data });
    } catch (err) {
      return dbFail(err);
    }
    revalidateFestive();
    return { ok: true, data: undefined };
  });
}

/** Interruttore "Mostra sezione sul sito" (site_settings, chiave FESTIVE_SECTION_KEY): crea il record se manca. */
export async function setFestiveSectionEnabled(enabled: boolean): Promise<ActionResult> {
  const flag = z.boolean({ message: "Stato non valido" }).safeParse(enabled);
  if (!flag.success) return invalidInput(flag.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const db = auth.db;
  try {
    const rows = await listAll(db, "site_settings", db.filter("key = {:k}", { k: FESTIVE_SECTION_KEY }), { fields: "id" });
    if (rows[0]) {
      await db.collection("site_settings").update(rows[0].id, { enabled: flag.data });
    } else {
      await db.collection("site_settings").create({ key: FESTIVE_SECTION_KEY, enabled: flag.data });
    }
  } catch (err) {
    return dbFail(err);
  }
  revalidateFestive();
  return { ok: true, data: undefined };
}
