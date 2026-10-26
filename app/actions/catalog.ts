"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { CatalogDishInput, MenuInput, MenuPhotoFile, MENU_PHOTO_MAX_COUNT, RoomInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { MENUS_TAG } from "@/lib/menus";
import {
  DishNameTakenError,
  deactivateMenu,
  removeDish,
  saveDish,
  saveMenu,
  saveRoom,
  updateMenuActive,
  updateRoomActive,
} from "@/lib/rpc/catalog";
import type { ActionResult } from "@/lib/types";

// Menu, piatti e sale. Il menu di questo file e' la fonte del menu pubblico del sito (tag "menus").
//
// upsertMenu accetta due forme:
// 1) oggetto JSON (come prima): { id?, name, season, price_per_person, is_kids, active, sort, items: [{course, name, sort, description?, dish_id?}] }
// 2) FormData:
//    - payload          stringa JSON con l'oggetto della forma 1 (obbligatorio)
//    - photos           file immagine, ripetibile (max 10 foto in totale per menu, 5 MB ciascuna, JPG/PNG/WebP/AVIF)
//    - remove_photos    nome file da rimuovere, ripetibile (il nome e' quello restituito in menu.photos[].file)
// Le voci sono sempre collegate a un piatto del catalogo (dish_id): se assente, il piatto viene creato o riusato.

const RemovePhotosInput = z
  .array(z.string().min(1).max(300).regex(/^[A-Za-z0-9_.-]+$/, "Nome foto non valido"))
  .max(MENU_PHOTO_MAX_COUNT);

const DeleteDishOptionsInput = z.object({ force: z.boolean().optional() }).optional();

const DISH_NAME_TAKEN = "Esiste già un piatto con questo nome in questa portata";

function revalidateCatalog(): void {
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/prenotazioni/nuova");
  // Sito pubblico: menu letti in cache con tag "menus".
  revalidateTag(MENUS_TAG);
  revalidatePath("/");
}

/** Crea o aggiorna un menù con le sue voci e le foto (vedi contratto in testa al file). */
export async function upsertMenu(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  let raw: unknown = input;
  let newFiles: File[] = [];
  let removeRaw: unknown = [];

  if (input instanceof FormData) {
    const payload = input.get("payload");
    if (typeof payload !== "string") return fail("Dati del menù mancanti.");
    try {
      raw = JSON.parse(payload);
    } catch {
      return fail("Dati del menù non validi.");
    }
    newFiles = input.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    removeRaw = input.getAll("remove_photos").filter((v): v is string => typeof v === "string" && v.length > 0);
  }

  const parsed = MenuInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error);

  const photos = z.array(MenuPhotoFile).max(MENU_PHOTO_MAX_COUNT, `Massimo ${MENU_PHOTO_MAX_COUNT} foto per volta`).safeParse(newFiles);
  if (!photos.success) {
    const message = photos.error.issues[0]?.message ?? "Foto non valida.";
    return { ok: false, error: message, fieldErrors: { photos: [message] } };
  }
  const removed = RemovePhotosInput.safeParse(removeRaw);
  if (!removed.success) return invalidInput(removed.error);

  const { id, ...menu } = parsed.data;
  try {
    const menuId = await saveMenu(auth.db, id ?? null, {
      menu,
      newPhotos: photos.data,
      removePhotos: removed.data,
    });
    revalidateCatalog();
    return { ok: true, data: { id: menuId } };
  } catch (err) {
    return dbFail(err);
  }
}

/** Disattiva il menù (active = false). Nessuna eliminazione fisica: lo storico delle prenotazioni resta integro. */
export async function deleteMenu(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Menù non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    await deactivateMenu(auth.db, id);
  } catch (err) {
    return dbFail(err);
  }

  revalidateCatalog();
  return { ok: true, data: undefined };
}

/** Attiva o disattiva un menù (solo il campo active). */
export async function setMenuActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Menù non valido.");
  const flag = z.boolean({ message: "Stato non valido" }).safeParse(active);
  if (!flag.success) return invalidInput(flag.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    await updateMenuActive(auth.db, id, flag.data);
  } catch (err) {
    return dbFail(err);
  }

  revalidateCatalog();
  return { ok: true, data: undefined };
}

export async function upsertRoom(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = RoomInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const id = await saveRoom(auth.db, parsed.data);
    revalidateCatalog();
    return { ok: true, data: { id } };
  } catch (err) {
    const data = (err as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
    if (data?.name?.code === "validation_not_unique") {
      return fail("Esiste già una sala con questo nome.");
    }
    return dbFail(err);
  }
}

/** Attiva o disattiva una sala (solo il campo active). Stessa rivalidazione di upsertRoom. */
export async function setRoomActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Sala non valida.");
  const flag = z.boolean({ message: "Stato non valido" }).safeParse(active);
  if (!flag.success) return invalidInput(flag.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    await updateRoomActive(auth.db, id, flag.data);
  } catch (err) {
    return dbFail(err);
  }

  revalidateCatalog();
  return { ok: true, data: undefined };
}

/** Crea o modifica un piatto del catalogo. In modifica propaga nome, portata e descrizione alle voci di menu collegate. */
export async function upsertDish(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = CatalogDishInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  const { id, ...dish } = parsed.data;
  try {
    const dishId = await saveDish(auth.db, {
      id: id ?? null,
      name: dish.name,
      course: dish.course,
      description: dish.description ?? null,
      active: dish.active,
      sort: dish.sort,
    });
    revalidateCatalog();
    return { ok: true, data: { id: dishId } };
  } catch (err) {
    // Duplicato: controllo applicativo (DishNameTakenError) oppure indice unico (course, name_key) in PocketBase.
    const data = (err as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
    const codes = Object.values(data ?? {}).map((c) => c?.code);
    if (err instanceof DishNameTakenError || codes.includes("validation_not_unique")) {
      return { ok: false, error: DISH_NAME_TAKEN, fieldErrors: { name: [DISH_NAME_TAKEN] } };
    }
    return dbFail(err);
  }
}

/**
 * Elimina un piatto del catalogo.
 * - Se il piatto e' nei menù e `force` non e' impostato: nessuna modifica, risposta con
 *   `code: "dish_in_use"` e `usedIn` (menù coinvolti); la UI chiede conferma e richiama con { force: true }.
 * - Con `force`: elimina anche le voci di menu collegate (batch). Le prenotazioni non cambiano.
 */
export async function deleteDish(id: string, opts?: { force?: boolean }): Promise<ActionResult<{ removed_menu_items: number }>> {
  if (!isRecordId(id)) return fail("Piatto non valido.");
  const options = DeleteDishOptionsInput.safeParse(opts);
  if (!options.success) return invalidInput(options.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    const result = await removeDish(auth.db, id, options.data?.force === true);
    if (result.kind === "in_use") {
      const names = result.menus.map((m) => m.name).join(", ");
      return {
        ok: false,
        error: `Il piatto è usato in: ${names || "menù non trovati"}`,
        code: "dish_in_use",
        usedIn: result.menus,
      };
    }
    revalidateCatalog();
    return { ok: true, data: { removed_menu_items: result.removed_menu_items } };
  } catch (err) {
    return dbFail(err);
  }
}
