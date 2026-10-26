// Helper di lettura su PocketBase usati da lib/data e lib/rpc (client di servizio passato come parametro).
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { chunk, type PbRecord } from "./helpers";

/** Record per id, oppure null se non esiste (404). Altri errori vengono rilanciati. */
export async function fetchOne(
  db: PocketBase,
  collection: string,
  id: string,
  expand?: string,
): Promise<PbRecord | null> {
  try {
    return (await db.collection(collection).getOne(id, expand ? { expand } : undefined)) as PbRecord;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

/** Tutti i record che soddisfano il filtro (filtro gia' costruito con db.filter). */
export async function listAll(
  db: PocketBase,
  collection: string,
  filter: string,
  opts: { sort?: string; expand?: string; fields?: string } = {},
): Promise<PbRecord[]> {
  const res = await db.collection(collection).getFullList({
    filter: filter || undefined,
    sort: opts.sort,
    expand: opts.expand,
    fields: opts.fields,
  });
  return res as unknown as PbRecord[];
}

/**
 * Record figli di un insieme di genitori (relazione `field` in `ids`), a blocchi per non superare
 * la lunghezza del filtro. Ritorna tutti i record, senza ordinamento garantito.
 */
export async function listByParents(
  db: PocketBase,
  collection: string,
  field: string,
  ids: string[],
  opts: { fields?: string } = {},
): Promise<PbRecord[]> {
  const out: PbRecord[] = [];
  for (const group of chunk([...new Set(ids)].filter(Boolean), 40)) {
    const filter = group.map((id) => db.filter(`${field} = {:id}`, { id })).join(" || ");
    out.push(...(await listAll(db, collection, filter, { fields: opts.fields })));
  }
  return out;
}

/** Numero di record che soddisfano il filtro (senza scaricarli). */
export async function countWhere(db: PocketBase, collection: string, filter: string): Promise<number> {
  const res = await db.collection(collection).getList(1, 1, { filter: filter || undefined, skipTotal: false });
  return res.totalItems;
}
