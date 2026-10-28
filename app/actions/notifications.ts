"use server";

import { z } from "zod";
import { authorize, dbFail, fail, invalidInput } from "@/lib/action-utils";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { chunk, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll, countWhere } from "@/lib/pocketbase/queries";
import { mapNotification } from "@/lib/pocketbase/mappers";
import { withMutation } from "@/lib/mutations";
import type { MutationOptions } from "@/lib/offline/contract";
import type { ActionResult, AppNotification } from "@/lib/types";

// Notifiche e sottoscrizioni push: tutti gli utenti attivi, solo sulle proprie righe.

const POLL_LIMIT = 50;

/** Data ISO → formato data di PocketBase ("2026-10-26 10:00:00.000Z"). */
function toPbDate(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ");
}

/**
 * Polling delle notifiche (sostituisce il realtime nel browser). Usa il cookie httpOnly dell'utente.
 * - `since` (ISO): ritorna le notifiche create dopo quell'istante, più recenti per prime.
 * - Senza `since` non ritorna elementi, solo il conteggio delle non lette.
 * - `expired: true` se la sessione non è più valida: il client deve smettere di chiedere.
 */
export async function pollNotifications(
  since?: string,
): Promise<ActionResult<{ items: AppNotification[]; unread: number; expired: boolean }>> {
  const parsed = z.string().max(40).optional().safeParse(since);
  if (!parsed.success) return invalidInput(parsed.error);

  const profile = await getCurrentProfile();
  if (!profile) return { ok: true, data: { items: [], unread: 0, expired: true } };

  const sinceDate = parsed.data;
  if (sinceDate && Number.isNaN(new Date(sinceDate).getTime())) return fail("Data non valida.");

  try {
    const db = await getAdminPb();
    const unread = await countWhere(db, "notifications", db.filter("user = {:u} && read_at = ''", { u: profile.id }));
    let items: AppNotification[] = [];
    if (sinceDate) {
      const page = await db.collection("notifications").getList(1, POLL_LIMIT, {
        filter: db.filter("user = {:u} && created > {:since}", { u: profile.id, since: toPbDate(sinceDate) }),
        sort: "-created,-id",
        skipTotal: true,
      });
      items = (page.items as unknown as PbRecord[]).map(mapNotification);
    }
    return { ok: true, data: { items, unread, expired: false } };
  } catch (err) {
    return dbFail(err);
  }
}

const IdsInput = z.array(z.string().regex(/^[a-z0-9]{15}$/, { message: "Identificativo non valido" })).max(500).optional();

// Solo i servizi push dei browser: il server non deve mai inviare richieste a host scelti dall'utente.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /\.push\.apple\.com$/,
];

function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const PushSubscriptionInput = z.object({
  endpoint: z
    .string()
    .max(2048, "Endpoint troppo lungo")
    .refine(isPushServiceUrl, "Endpoint non valido"),
  keys: z.object({
    p256dh: z.string().min(1, "Chiave p256dh mancante").max(256),
    auth: z.string().min(1, "Chiave auth mancante").max(256),
  }),
});

/** Segna come lette le notifiche indicate (senza ids: tutte quelle non lette dell'utente). */
export async function markNotificationsRead(ids?: string[], opts?: MutationOptions): Promise<ActionResult> {
  const parsed = IdsInput.safeParse(ids);
  if (!parsed.success) return invalidInput(parsed.error);

  const auth = await authorize(() => true);
  if (!auth.ok) return auth;
  const { db, profile } = auth;

  return withMutation(db, opts, "notifications.markNotificationsRead", profile.id, async (): Promise<ActionResult> => {
    if (parsed.data && parsed.data.length === 0) return { ok: true, data: undefined };

    try {
      let rows = await listAll(db, "notifications", db.filter("user = {:u} && read_at = ''", { u: profile.id }), {
        fields: "id,user,read_at",
      });
      if (parsed.data) {
        const wanted = new Set(parsed.data);
        rows = rows.filter((r) => wanted.has(r.id));
      }
      const readAt = new Date().toISOString();
      for (const group of chunk(rows, 100)) {
        const batch = db.createBatch();
        for (const row of group) batch.collection("notifications").update(row.id, { read_at: readAt });
        if (group.length > 0) await batch.send();
      }
      return { ok: true, data: undefined };
    } catch (err) {
      return dbFail(err);
    }
  });
}

/**
 * Registra la sottoscrizione push del dispositivo corrente per l'utente attivo.
 * Upsert su endpoint: lo stesso browser, se usato da un altro account, passa al nuovo utente.
 */
export async function savePushSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
): Promise<ActionResult> {
  const parsed = PushSubscriptionInput.safeParse(sub);
  if (!parsed.success) return invalidInput(parsed.error);

  const auth = await authorize(() => true);
  if (!auth.ok) return auth;
  const { db, profile } = auth;

  const fields = {
    user: profile.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: userAgent?.trim().slice(0, 300) ?? "",
  };

  try {
    const existing = await db
      .collection("push_subscriptions")
      .getFirstListItem(db.filter("endpoint = {:e}", { e: parsed.data.endpoint }))
      .catch(() => null);
    if (existing) {
      await db.collection("push_subscriptions").update(existing.id, fields);
    } else {
      await db.collection("push_subscriptions").create(fields);
    }
    return { ok: true, data: undefined };
  } catch (err) {
    return dbFail(err);
  }
}

/** Rimuove la sottoscrizione push di questo dispositivo (solo le proprie). */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const parsed = z.string().max(2048).safeParse(endpoint);
  if (!parsed.success) return invalidInput(parsed.error);

  const auth = await authorize(() => true);
  if (!auth.ok) return auth;
  const { db, profile } = auth;

  try {
    const rows = await listAll(
      db,
      "push_subscriptions",
      db.filter("endpoint = {:e} && user = {:u}", { e: parsed.data, u: profile.id }),
      { fields: "id" },
    );
    for (const row of rows) await db.collection("push_subscriptions").delete(row.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return dbFail(err);
  }
}
