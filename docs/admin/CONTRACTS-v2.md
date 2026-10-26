# Contratti v2 — Saldato, pagamenti, notifiche

Estende `docs/CONTRACTS.md`. Decisioni del cliente (2026-10-25):
- Stato prenotazione: nuovo valore **saldato** (Opzione / Confermato / Saldato / Annullato).
- **Più pagamenti** per prenotazione (acconti), ognuno con cifra, data, ricevuta (foto JPG/PNG/HEIC/WebP o PDF). Visibili e gestibili **solo dall'admin**.
- Nei box evento niente testo di stato: solo **pallino colorato** (con legenda); testo completo solo nel dettaglio.
- Notifiche **in-app (campanella) + push** sul telefono (anche ad app chiusa, con PWA installata).
- Eventi che generano notifiche: **Prenotazioni** (nuova, modifica, annullamento, cambio stato, eliminazione), **Coperti e piatti** (modifica da sala/chef/admin), **Promemoria evento** (giorno prima: menù, coperti, allergie). Pagamenti NON generano notifiche.
- Destinatari: tutti i profili attivi **tranne l'autore** dell'azione (promemoria: tutti).

## 1. Migrazione `supabase/migrations/0002_payments_notifications.sql`
(0001 è già applicata in produzione: NON modificarla. `npm run setup` applica i nuovi file in transazione.)
- `alter type public.booking_status add value if not exists 'saldato' after 'confermato';` (non usare il nuovo valore nella stessa migrazione).
- `payments(id uuid pk default gen_random_uuid(), booking_id uuid not null references bookings(id) on delete restrict, amount numeric(10,2) not null check (amount > 0), paid_at date not null, method text null check (method in ('contanti','bonifico','carta','assegno','altro')), receipt_path text null, receipt_name text null, receipt_type text null, notes text null, created_by uuid references profiles(id), created_at timestamptz default now())` + indice booking_id. RLS: solo `is_admin()` (all). Grant select/insert/update/delete ad authenticated (RLS filtra).
- Storage: bucket privato `receipts` (`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('receipts','receipts',false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']) on conflict do nothing`). Policy su `storage.objects` per `bucket_id = 'receipts'`: select/insert/update/delete solo se `public.is_admin()`. Path oggetto: `<booking_id>/<payment_id>-<nome-sanificato>`.
- `notifications(id uuid pk, recipient_id uuid not null references profiles(id) on delete cascade, type text not null, title text not null, body text null, booking_id uuid null references bookings(id) on delete set null, actor_id uuid null, actor_name text null, read_at timestamptz null, created_at timestamptz default now())` + indice (recipient_id, created_at desc) e parziale (recipient_id) where read_at is null. RLS: select e update solo `recipient_id = auth.uid()` e `is_active()`; grant select, update(read_at) ad authenticated; nessun insert dal client (le inserisce il server con service role).
- `push_subscriptions(id uuid pk, profile_id uuid not null references profiles(id) on delete cascade, endpoint text not null unique, p256dh text not null, auth text not null, user_agent text null, created_at timestamptz default now())`. RLS: select/insert/delete solo own (`profile_id = auth.uid()`). Grant select/insert/delete ad authenticated.
- Realtime: `alter publication supabase_realtime add table public.notifications;` (dentro un blocco DO che ignora l'errore se già presente o se la publication non esiste).
- `upsert_booking`: deve accettare lo status 'saldato' (già text→enum cast: verifica).

## 2. Env nuove (già in `.env.local`, da aggiungere anche su Vercel e in `.env.example`)
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `CRON_SECRET`.

## 3. Tipi (`src/lib/types.ts`)
```ts
export type BookingStatus = "opzione" | "confermato" | "saldato" | "annullato";
// STATUS_LABELS aggiunge saldato: "Saldato"
export const STATUS_COLORS: Record<BookingStatus, string> = { opzione: "#A9792B", confermato: "#355A63", saldato: "#4F6B45", annullato: "#9B3B32" };
export type PaymentMethod = "contanti" | "bonifico" | "carta" | "assegno" | "altro";
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>;
export interface Payment { id: string; booking_id: string; amount: number; paid_at: string; method: PaymentMethod | null; receipt_path: string | null; receipt_name: string | null; receipt_type: string | null; notes: string | null; created_at: string; }
export interface PaymentSummary { expected_total: number; paid_total: number; balance: number; } // expected = adults*menu.price + kids_menus*kids_menu.price
export type NotificationType = "booking_created" | "booking_updated" | "booking_status" | "booking_cancelled" | "booking_deleted" | "covers_updated" | "dishes_updated" | "event_reminder";
export interface AppNotification { id: string; type: NotificationType; title: string; body: string | null; booking_id: string | null; actor_name: string | null; read_at: string | null; created_at: string; }
```

## 4. Validazione (`src/lib/validation.ts`)
- `BookingInput.status` include "saldato".
- `PaymentInput`: amount (>0, max 1_000_000, round2, stringa vuota → "Campo obbligatorio"), paid_at (data reale), method (enum opz.), notes (max 2000 opz.).
- Ricevuta: File opzionale; max 10 MB; MIME tra image/jpeg, image/png, image/webp, image/heic, image/heif, application/pdf (fallback su estensione se type vuoto, comune per HEIC).

## 5. Data (`src/lib/data/`)
- `payments.ts` (server-only): `getPayments(bookingId): Promise<Payment[]>` (admin; [] per gli altri), `getPaymentSummary(booking: BookingDetail, payments: Payment[]): PaymentSummary` (pura, può stare in `src/lib/payment-utils.ts` per uso client).
- `notifications.ts` (server-only): `getNotifications(limit = 30): Promise<AppNotification[]>`, `getUnreadCount(): Promise<number>`.

## 6. Actions (`src/app/actions/`)
- `payments.ts` (admin): `addPayment(bookingId: string, formData: FormData): Promise<ActionResult<{ id: string }>>` — campi `amount`, `paid_at`, `method`, `notes`, `receipt` (File). Inserisce la riga, carica il file su `receipts/<booking_id>/<payment_id>-<nome>` e aggiorna receipt_path/name/type; se l'upload fallisce elimina la riga e ritorna errore. · `deletePayment(id: string): Promise<ActionResult>` (rimuove anche il file) · `getReceiptUrl(paymentId: string): Promise<ActionResult<{ url: string }>>` (signed URL 120 s). In `next.config.ts`: `experimental.serverActions.bodySizeLimit = "12mb"`.
- `notifications.ts`: `markNotificationsRead(ids?: string[]): Promise<ActionResult>` (senza ids = tutte) · `savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<ActionResult>` · `deletePushSubscription(endpoint: string): Promise<ActionResult>`.
- Helper server `src/lib/notify.ts` (server-only): `notify(event: { type: NotificationType; bookingId: string | null; title: string; body?: string; actor: Profile | null; recipients?: "all-except-actor" | "all" })` — usa `createAdminClient()`, inserisce una riga per ogni profilo attivo destinatario, poi invia push (`web-push`, payload JSON `{ title, body, url: "/prenotazioni/<id>" | "/agenda", tag }`), rimuove le subscription con risposta 404/410. Va chiamato con `after(() => notify(...))` (da `next/server`) nelle actions esistenti dopo il successo, così la risposta all'utente resta istantanea: createBooking, updateBooking (tipo `booking_status`/`booking_cancelled` se cambia lo stato, altrimenti `booking_updated`), deleteBooking, updateBookingCovers, updateBookingDishes, resetDishesFromMenu. Testi in italiano, brevi, con il **menù** in evidenza, es. title "Nuovo banchetto · Menù 2", body "Sab 14 nov · Sala Grande · 44 coperti · Luigi Nicosia — da Peppe Moschetto".
- Route `GET /api/cron/reminders` (runtime nodejs): autorizzata solo con header `Authorization: Bearer ${CRON_SECRET}`; trova le prenotazioni non annullate di **domani** (Europe/Rome) e invia `event_reminder` a tutti: title "Domani · Menù 2", body "Sala Grande · 44 coperti (A 40 + B 4) · 2 allergie". `vercel.json` con cron giornaliero `"0 16 * * *"`.
- Service worker `public/sw.js`: aggiungere handler `push` (showNotification con icon `/icons/icon-192.png`, badge, tag, data.url) e `notificationclick` (focus della finestra esistente o openWindow(url)). Incrementare la versione cache.

## 7. Frontend
- **Pallino stato** ovunque nei box/card (BookingCard tutte le varianti, MonthView, PeriodViews, matrice e RoomDayView della dashboard): niente testo, solo pallino `STATUS_COLORS` con `title`/`aria-label` = etichetta stato; legenda compatta (4 pallini con etichette) in testa all'agenda e alla matrice. Il testo dello stato resta solo nel dettaglio. Il **menù** resta il dato principale del box.
- **Form prenotazione**: select stato con "Saldato". Sotto "Data e stato" sezione **Acconti** (solo admin): righe aggiungibili (cifra €, data, metodo, nota, ricevuta foto/PDF con anteprima nome e dimensione, `accept="image/*,application/pdf"` e su mobile possibilità di scattare foto), totale versato. In creazione le righe vengono inviate dopo che la prenotazione è stata creata (addPayment per riga); in modifica si gestiscono dal pannello nel dettaglio.
- **Dettaglio prenotazione** (admin): pannello "Pagamenti" con totale previsto, versato, residuo (barra di avanzamento), elenco pagamenti (data, cifra, metodo, apri ricevuta via getReceiptUrl in nuova scheda, elimina con conferma), form rapido "Aggiungi acconto". Se il residuo è 0 suggerisci "Segna come Saldato".
- **Campanella notifiche** nell'header mobile e nella sidebar desktop, per tutti i ruoli: badge non lette; pannello (sheet su mobile, popover su desktop) con elenco (icona per tipo, titolo, corpo, autore, tempo relativo), click → apre la prenotazione e segna letta, "Segna tutte come lette". Aggiornamento in tempo reale con Supabase Realtime (`postgres_changes` INSERT su notifications filtrato `recipient_id=eq.<id>`) via client browser. Bottone "Attiva notifiche sul telefono" (richiede gesto utente: Notification.requestPermission → pushManager.subscribe con NEXT_PUBLIC_VAPID_PUBLIC_KEY → savePushSubscription); se l'app non è installata su iOS spiega che serve installarla. Optimistic UI: segna letta subito, rollback se errore.
