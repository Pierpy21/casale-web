import "server-only";
import webpush from "web-push";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { chunk, dayEndPb, dayStartPb, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll, listByParents } from "@/lib/pocketbase/queries";
import { buildBookingNotice, buildReminderNotice, type BookingBrief } from "@/lib/notify-text";
import type { BookingStatus, NotificationType, Role } from "@/lib/types";

// Notifiche in-app (collezione notifications) + push (web-push).
// Non deve mai far fallire l'azione chiamante: tutti gli errori vengono catturati e loggati.

export interface NotifyEvent {
  type: NotificationType;
  /** null per gli eventi su prenotazioni eliminate (il record non esisterebbe più). */
  bookingId: string | null;
  title: string;
  body?: string;
  actor: { id: string; full_name: string } | null;
  /** Default "all-except-actor". "all" per i promemoria. */
  recipients?: "all-except-actor" | "all";
  /** Restringe i destinatari a questi ruoli (es. solo admin per la giacenza). */
  roles?: Role[];
  /** Pagina da aprire al tocco (default: prenotazione o agenda). */
  url?: string;
}

const PUSH_PAYLOAD_MAX_BYTES = 3500; // il limite del servizio push è 4 KB
const PUSH_TTL_SECONDS = 24 * 60 * 60;

let vapidReady: boolean | null = null;

/** Configura web-push una sola volta. Ritorna false se le env VAPID mancano (si salta il push). */
function configureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[notify] VAPID non configurate: push disattivato, solo notifiche in-app.");
    vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
  } catch (err) {
    console.error("[notify] chiavi VAPID non valide:", err);
    vapidReady = false;
  }
  return vapidReady;
}

/** Payload JSON entro il limite: se troppo lungo si accorcia il corpo. */
function buildPushPayload(payload: { title: string; body: string; url: string; tag: string }): string {
  let body = payload.body;
  let json = JSON.stringify({ ...payload, body });
  while (new TextEncoder().encode(json).length > PUSH_PAYLOAD_MAX_BYTES && body.length > 0) {
    body = body.slice(0, Math.floor(body.length * 0.8));
    json = JSON.stringify({ ...payload, body });
  }
  return json;
}

/** Crea le notifiche in-app per i destinatari e invia il push alle loro sottoscrizioni. Ritorna i destinatari. */
export async function notify(event: NotifyEvent): Promise<number> {
  try {
    const db = await getAdminPb();

    const activeUsers = await listAll(db, "users", db.filter("active = {:a}", { a: true }), { fields: "id,role" });

    const actorId = event.actor?.id ?? null;
    const exceptActor = (event.recipients ?? "all-except-actor") === "all-except-actor";
    const roles = event.roles;
    const recipientIds: string[] = activeUsers
      .filter((p) => !roles || roles.includes(String(p.role) as Role))
      .map((p) => p.id)
      .filter((id) => !(exceptActor && id === actorId));
    if (recipientIds.length === 0) return 0;

    for (const group of chunk(recipientIds, 100)) {
      const batch = db.createBatch();
      for (const userId of group) {
        batch.collection("notifications").create({
          user: userId,
          type: event.type,
          title: event.title,
          body: event.body ?? "",
          booking: event.bookingId ?? "",
          actor: actorId ?? "",
          actor_name: event.actor?.full_name ?? "",
          url: event.url ?? "",
        });
      }
      await batch.send();
    }

    if (!configureVapid()) return recipientIds.length;

    const subs = await listByParents(db, "push_subscriptions", "user", recipientIds, { fields: "id,endpoint,p256dh,auth" });
    if (subs.length === 0) return recipientIds.length;

    const payload = buildPushPayload({
      title: event.title,
      body: event.body ?? "",
      url: event.url ?? (event.bookingId ? `/admin/prenotazioni/${event.bookingId}` : "/admin/agenda"),
      tag: `${event.type}:${event.bookingId ?? "generic"}`,
    });
    const options = {
      TTL: PUSH_TTL_SECONDS,
      urgency: event.type === "event_reminder" ? ("high" as const) : ("normal" as const),
    };

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush
          .sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, payload, options)
          .catch(async (err: { statusCode?: number }) => {
            // 404/410: sottoscrizione scaduta o revocata dal browser → si elimina.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await db.collection("push_subscriptions").delete(s.id).catch(() => undefined);
              return;
            }
            throw err;
          }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) console.error(`[notify] push non inviati: ${failed}`);

    return recipientIds.length;
  } catch (err) {
    console.error("[notify] invio notifica fallito:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------
// Dati della prenotazione per i testi
// ---------------------------------------------------------------------

function toBrief(r: PbRecord, allergyCount: number): BookingBrief {
  const client = r.expand?.client as PbRecord | undefined;
  const room = r.expand?.room as PbRecord | undefined;
  const menu = r.expand?.menu as PbRecord | undefined;
  return {
    id: r.id,
    kind: (String(r.kind || "evento")) as BookingBrief["kind"],
    event_type: r.event_type ? String(r.event_type) : null,
    event_name: r.event_name ? String(r.event_name) : null,
    event_time: r.event_time ? String(r.event_time) : null,
    event_date: toDateOnly(r.event_date),
    status: r.status as BookingStatus,
    client_name: client ? `${client.first_name} ${client.last_name}` : "",
    room_name: room ? String(room.name) : null,
    menu_name: menu ? String(menu.name) : null,
    adults: Number(r.adults ?? 0),
    children: Number(r.children ?? 0),
    kids_menus: Number(r.kids_menus ?? 0),
    allergy_count: allergyCount,
  };
}

/** Numero allergie per prenotazione (una query per gruppo di id). */
async function allergyCounts(db: Awaited<ReturnType<typeof getAdminPb>>, ids: string[]): Promise<Map<string, number>> {
  const rows = await listByParents(db, "booking_allergies", "booking", ids, { fields: "id,booking" });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.booking ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Carica i dati minimi di una prenotazione. Null se non esiste o in caso di errore. */
export async function loadBookingBrief(bookingId: string): Promise<BookingBrief | null> {
  try {
    const db = await getAdminPb();
    const record = await fetchOne(db, "bookings", bookingId, "client,room,menu");
    if (!record) return null;
    const counts = await allergyCounts(db, [bookingId]);
    return toBrief(record, counts.get(bookingId) ?? 0);
  } catch (err) {
    console.error("[notify] lettura prenotazione fallita:", err);
    return null;
  }
}

/** Notifica un evento su una prenotazione esistente (carica i dati e costruisce i testi). Non lancia. */
export async function notifyBookingEvent(input: {
  type: Exclude<NotificationType, "event_reminder" | "booking_deleted" | "inventory_report">;
  bookingId: string;
  actor: { id: string; full_name: string } | null;
}): Promise<void> {
  try {
    const brief = await loadBookingBrief(input.bookingId);
    if (!brief) return;
    const { title, body } = buildBookingNotice(input.type, brief, input.actor?.full_name ?? null);
    await notify({ type: input.type, bookingId: brief.id, title, body, actor: input.actor });
  } catch (err) {
    console.error("[notify] evento prenotazione fallito:", err);
  }
}

/** Notifica l'eliminazione con un brief caricato PRIMA della cancellazione; senza booking. Non lancia. */
export async function notifyBookingDeleted(
  brief: BookingBrief,
  actor: { id: string; full_name: string } | null,
): Promise<void> {
  try {
    const { title, body } = buildBookingNotice("booking_deleted", brief, actor?.full_name ?? null);
    await notify({ type: "booking_deleted", bookingId: null, title, body, actor, recipients: "all-except-actor" });
  } catch (err) {
    console.error("[notify] notifica eliminazione fallita:", err);
  }
}

/** Promemoria per le prenotazioni non annullate di una data. Ritorna il numero di prenotazioni notificate. */
export async function sendEventReminders(date: string): Promise<number> {
  const db = await getAdminPb();
  const records = await listAll(
    db,
    "bookings",
    db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s}", {
      from: dayStartPb(date),
      to: dayEndPb(date),
      s: "annullato",
    }),
    { expand: "client,room,menu" },
  );
  if (records.length === 0) return 0;

  const counts = await allergyCounts(db, records.map((r) => r.id));
  let sent = 0;
  for (const row of records) {
    const brief = toBrief(row, counts.get(row.id) ?? 0);
    const { title, body } = buildReminderNotice(brief);
    await notify({ type: "event_reminder", bookingId: brief.id, title, body, actor: null, recipients: "all" });
    sent++;
  }
  return sent;
}
