import "server-only";
import type PocketBase from "pocketbase";
import { UserFacingError } from "@/lib/action-utils";
import { generateRecordId, num, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll, listByParents } from "@/lib/pocketbase/queries";
import { MENU_PHOTO_MAX_COUNT } from "@/lib/validation";
import type { MenuInputType, RoomInputType } from "@/lib/validation";
import type { Course } from "@/lib/types";

// Sostituisce la RPC upsert_menu e le scritture dirette su rooms e dishes.

export interface MenuSaveRequest {
  /** Dati del menu (id escluso: passato a parte). */
  menu: Omit<MenuInputType, "id">;
  /** Nuove foto da aggiungere (gia' validate). */
  newPhotos: File[];
  /** Nomi file delle foto da rimuovere. */
  removePhotos: string[];
}

/** Piatto del catalogo con esistenza già verificata (dati usati per copiarli nelle voci del menu). */
interface DishSnapshot {
  id: string;
  name: string;
  course: Course;
  description: string | null;
}

/** Errore: esiste già un piatto con la stessa portata e nome. */
export class DishNameTakenError extends Error {}

/** Chiave di unicita' del piatto: nome in minuscolo e senza spazi ai bordi (come inventory_products.name_key). */
export function dishNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function snapshotOf(r: PbRecord): DishSnapshot {
  return {
    id: r.id,
    name: String(r.name ?? ""),
    course: r.course as Course,
    description: r.description ? String(r.description) : null,
  };
}

/**
 * Crea o aggiorna un menu con le sue voci e le foto. Le voci sono collegate al catalogo piatti:
 * - con dish_id: nome, portata e descrizione vengono dal piatto (il client non e' la fonte);
 * - senza dish_id (testo libero): si riusa il piatto con la stessa portata e nome, altrimenti se ne crea uno.
 * Batch transazionale per menu e voci; le foto usano chiamate separate (la batch PocketBase non gestisce bene
 * i file con i campi "+"/"-"): se l'upload delle foto fallisce dopo il salvataggio dei dati, il menu resta salvato senza le nuove foto.
 */
export async function saveMenu(db: PocketBase, id: string | null, req: MenuSaveRequest): Promise<string> {
  let current: PbRecord | null = null;
  if (id) {
    current = await fetchOne(db, "menus", id);
    if (!current) throw new UserFacingError("Menù non trovato");
  }

  const currentPhotos: string[] = Array.isArray(current?.photos) ? (current!.photos as string[]) : [];
  const removed = req.removePhotos.filter((f) => currentPhotos.includes(f));
  const remaining = currentPhotos.length - removed.length;
  if (remaining + req.newPhotos.length > MENU_PHOTO_MAX_COUNT) {
    throw new UserFacingError(`Massimo ${MENU_PHOTO_MAX_COUNT} foto per menù.`);
  }

  // Risoluzione dei piatti prima della batch (letture): piatti collegati per id, catalogo per portata + nome.
  const linkedIds = [...new Set(req.menu.items.map((i) => i.dish_id).filter((x): x is string => Boolean(x)))];
  const dishById = new Map<string, DishSnapshot>();
  for (const r of await listByParents(db, "dishes", "id", linkedIds)) dishById.set(r.id, snapshotOf(r));

  const byKey = new Map<string, DishSnapshot>();
  if (req.menu.items.some((i) => !i.dish_id)) {
    for (const r of await listAll(db, "dishes", "")) {
      const snap = snapshotOf(r);
      byKey.set(`${snap.course}|${dishNameKey(snap.name)}`, snap);
    }
  }

  const newDishes: { id: string; name: string; course: Course; name_key: string; description: string; sort: number }[] = [];
  const itemRows: { course: Course; name: string; description: string; dish: string; sort: number }[] = [];
  for (const item of req.menu.items) {
    let dish: DishSnapshot | undefined;
    if (item.dish_id) {
      dish = dishById.get(item.dish_id);
      if (!dish) throw new UserFacingError("Piatto non trovato nel catalogo.");
    } else {
      const key = `${item.course}|${dishNameKey(item.name)}`;
      dish = byKey.get(key);
      if (!dish) {
        const description = item.description ?? "";
        const created: DishSnapshot = {
          id: generateRecordId(),
          name: item.name,
          course: item.course,
          description: description || null,
        };
        newDishes.push({
          id: created.id,
          name: created.name,
          course: created.course,
          name_key: dishNameKey(created.name),
          description,
          sort: item.sort,
        });
        byKey.set(key, created);
        dish = created;
      }
    }
    itemRows.push({
      course: dish.course,
      name: dish.name,
      description: dish.description ?? "",
      dish: dish.id,
      sort: item.sort,
    });
  }

  const menuId = id ?? generateRecordId();
  const fields = {
    name: req.menu.name,
    season: req.menu.season ?? "",
    price_per_person: req.menu.price_per_person,
    is_kids: req.menu.is_kids,
    active: req.menu.active,
    sort: req.menu.sort,
  };

  const batch = db.createBatch();
  // I piatti nuovi vanno creati prima delle voci che li referenziano (la batch esegue in ordine).
  for (const dish of newDishes) {
    batch.collection("dishes").create({ ...dish, active: true });
  }
  if (id) {
    batch.collection("menus").update(menuId, fields);
    const oldItems = await listAll(db, "menu_items", db.filter("menu = {:id}", { id: menuId }), { fields: "id" });
    for (const item of oldItems) batch.collection("menu_items").delete(item.id);
  } else {
    batch.collection("menus").create({ id: menuId, ...fields });
  }
  for (const row of itemRows) {
    batch.collection("menu_items").create({
      id: generateRecordId(),
      menu: menuId,
      course: row.course,
      name: row.name,
      sort: row.sort,
      description: row.description,
      dish: row.dish,
    });
  }
  await batch.send();

  if (removed.length > 0) {
    await db.collection("menus").update(menuId, { "photos-": removed });
  }
  if (req.newPhotos.length > 0) {
    const body = new FormData();
    for (const file of req.newPhotos) body.append("photos+", file);
    await db.collection("menus").update(menuId, body);
  }
  return menuId;
}

export async function saveRoom(db: PocketBase, input: RoomInputType): Promise<string> {
  const fields = {
    name: input.name,
    capacity: num(input.capacity),
    sort: num(input.sort),
    active: input.active,
  };
  if (input.id) {
    const current = await fetchOne(db, "rooms", input.id);
    if (!current) throw new UserFacingError("Sala non trovata.");
    await db.collection("rooms").update(input.id, fields);
    return input.id;
  }
  const record = await db.collection("rooms").create(fields);
  return record.id;
}

/** Disattiva il menu (nessuna eliminazione fisica: lo storico resta integro). */
export async function deactivateMenu(db: PocketBase, id: string): Promise<void> {
  const current = await fetchOne(db, "menus", id);
  if (!current) throw new UserFacingError("Menù non trovato");
  await db.collection("menus").update(id, { active: false });
}

/** Attiva o disattiva un menu (solo il campo active). */
export async function updateMenuActive(db: PocketBase, id: string, active: boolean): Promise<void> {
  const current = await fetchOne(db, "menus", id);
  if (!current) throw new UserFacingError("Menù non trovato");
  await db.collection("menus").update(id, { active });
}

/** Attiva o disattiva una sala (solo il campo active). */
export async function updateRoomActive(db: PocketBase, id: string, active: boolean): Promise<void> {
  const current = await fetchOne(db, "rooms", id);
  if (!current) throw new UserFacingError("Sala non trovata.");
  await db.collection("rooms").update(id, { active });
}

export interface DishSaveRequest {
  /** Assente = creazione. */
  id?: string | null;
  name: string;
  course: Course;
  description: string | null;
  active: boolean;
  sort: number;
}

async function ensureUniqueDish(db: PocketBase, course: Course, nameKey: string, exceptId?: string): Promise<void> {
  const rows = await listAll(db, "dishes", db.filter("course = {:c} && name_key = {:k}", { c: course, k: nameKey }), {
    fields: "id",
  });
  if (rows.some((r) => r.id !== exceptId)) throw new DishNameTakenError("Esiste già un piatto con questo nome in questa portata");
}

/**
 * Crea o modifica un piatto del catalogo. In modifica nome, portata e descrizione vengono propagati
 * a tutte le voci di menu collegate (stesso batch), così menu e sito pubblico restano coerenti.
 */
export async function saveDish(db: PocketBase, req: DishSaveRequest): Promise<string> {
  const nameKey = dishNameKey(req.name);
  const fields = {
    name: req.name,
    course: req.course,
    name_key: nameKey,
    description: req.description ?? "",
    active: req.active,
    sort: req.sort,
  };

  if (!req.id) {
    await ensureUniqueDish(db, req.course, nameKey);
    const record = await db.collection("dishes").create({ id: generateRecordId(), ...fields });
    return record.id;
  }

  const current = await fetchOne(db, "dishes", req.id);
  if (!current) throw new UserFacingError("Piatto non trovato.");
  await ensureUniqueDish(db, req.course, nameKey, req.id);

  const linked = await listAll(db, "menu_items", db.filter("dish = {:id}", { id: req.id }), { fields: "id" });
  const batch = db.createBatch();
  batch.collection("dishes").update(req.id, fields);
  for (const item of linked) {
    batch.collection("menu_items").update(item.id, {
      name: req.name,
      course: req.course,
      description: req.description ?? "",
    });
  }
  await batch.send();
  return req.id;
}

export type RemoveDishResult =
  | { kind: "deleted"; removed_menu_items: number }
  | { kind: "in_use"; menus: { id: string; name: string }[] };

/**
 * Elimina un piatto. Se e' usato in almeno un menu e `force` non e' impostato, non elimina nulla e
 * restituisce i menu coinvolti. Con `force`, elimina anche le voci di menu collegate (stesso batch).
 * Le prenotazioni (booking_dishes) sono copie e non vengono toccate.
 */
export async function removeDish(db: PocketBase, id: string, force: boolean): Promise<RemoveDishResult> {
  const current = await fetchOne(db, "dishes", id);
  if (!current) throw new UserFacingError("Piatto non trovato.");

  const linked = await listAll(db, "menu_items", db.filter("dish = {:id}", { id }), { fields: "id,menu" });
  if (linked.length > 0 && !force) {
    const menuIds = [...new Set(linked.map((i) => String(i.menu ?? "")).filter(Boolean))];
    const menus = await listByParents(db, "menus", "id", menuIds, { fields: "id,name" });
    return {
      kind: "in_use",
      menus: menus
        .map((m) => ({ id: m.id, name: String(m.name ?? "") }))
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    };
  }

  const batch = db.createBatch();
  for (const item of linked) batch.collection("menu_items").delete(item.id);
  batch.collection("dishes").delete(id);
  await batch.send();
  return { kind: "deleted", removed_menu_items: linked.length };
}
