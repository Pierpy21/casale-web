"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { authorize, dbFail, invalidInput } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { FESTIVE_TAG } from "@/lib/festive";
import { FESTIVE_SECTION_KEY } from "@/lib/festive-types";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import { listAll } from "@/lib/pocketbase/queries";
import type { ActionResult } from "@/lib/types";

// Fascia "Buone Feste" della home: solo l'interruttore "Mostra la fascia sul sito" (site_settings).
// I menù festivi sono menù del catalogo con festive_date: si modificano con le azioni di app/actions/catalog.ts.
// Riservato all'admin. Dopo la scrittura si invalida la cache con tag "festive" e le pagine che la mostrano.

/** Interruttore "Mostra sezione sul sito" (site_settings, chiave FESTIVE_SECTION_KEY): crea il record se manca. */
export async function setFestiveSectionEnabled(enabled: boolean): Promise<ActionResult> {
  const flag = z.boolean({ message: "Stato non valido" }).safeParse(enabled);
  if (!flag.success) return invalidInput(flag.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const db = auth.db;
  try {
    const rows: PbRecord[] = await listAll(db, "site_settings", db.filter("key = {:k}", { k: FESTIVE_SECTION_KEY }), {
      fields: "id",
    });
    if (rows[0]) {
      await db.collection("site_settings").update(rows[0].id, { enabled: flag.data });
    } else {
      await db.collection("site_settings").create({ key: FESTIVE_SECTION_KEY, enabled: flag.data });
    }
  } catch (err) {
    return dbFail(err);
  }
  revalidateTag(FESTIVE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/catalogo");
  return { ok: true, data: undefined };
}
