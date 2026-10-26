# Database Supabase — Agenda Digitale

Questa cartella contiene lo schema del database (`migrations/0001_init.sql`): enum, tabelle, RLS,
funzioni applicative (RPC), trigger di audit e dati iniziali (sale e menù autunno).

## Avvio rapido

1. **Crea il progetto Supabase** su https://supabase.com.
2. **Compila `.env.local`** nella root del progetto (lo script lo crea da `.env.example` se manca).
   Ogni valore è indicato nei commenti del file: URL e chiavi da *Project Settings → API*,
   `SUPABASE_DB_URL` da *Connect → Connection string → Session pooler*, poi email e password
   dell'amministratore.
3. **Lancia il setup**:
   ```bash
   npm run setup
   ```
   Lo script applica le migrazioni, crea l'amministratore e, se hai impostato
   `SUPABASE_ACCESS_TOKEN`, disattiva le registrazioni pubbliche. Si può rilanciare senza problemi.
4. **Avvia l'app**: `npm run dev`, poi accedi su http://localhost:3000 con l'email amministratore.

## Procedura manuale (alternativa)

Usa questa procedura solo se `npm run setup` non può essere usato.

### M1. Creare il progetto e le chiavi

1. Da **Project Settings → API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo server, mai nel browser)
2. Crea il file `.env.local` nella root del progetto partendo da `.env.example` e incolla i valori.
3. In **Authentication → Providers → Email** disattiva "Allow new users to sign up": gli account
   vengono creati solo dall'amministratore dell'app.

### M2. Applicare la migrazione

**Opzione A — SQL Editor (più semplice)**
1. Apri **SQL Editor → New query**.
2. Incolla tutto il contenuto di `supabase/migrations/0001_init.sql`.
3. Esegui (Run). La migrazione va applicata una sola volta su un database vuoto.

**Opzione B — Supabase CLI**
```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### M3. Creare l'amministratore

Dalla root del progetto, con `.env.local` configurato:

```bash
node scripts/create-admin.mjs peppe@example.it "una-password-sicura" "Peppe Moschetto"
```

- La password deve avere almeno 8 caratteri.
- Lo script crea l'utente Auth (email già confermata) e il profilo con ruolo `admin`.
- Se l'utente esiste già, viene solo promosso ad amministratore e la password resta invariata.

## Ruoli

| Ruolo | Permessi |
|---|---|
| `admin` | Tutto: clienti, prenotazioni, operatori, catalogo, preventivi. |
| `sala` | Lettura di tutto; può modificare solo coperti (adulti, bambini, menù bambini). |
| `cucina` | Lettura di tutto; se `is_chef = true` può modificare i piatti della prenotazione. |

Gli operatori disattivati (`active = false`) non accedono né via app né via RLS.

## Struttura del database

- **Tabelle**: `profiles`, `clients`, `rooms`, `menus`, `menu_items`, `bookings`, `booking_dishes`,
  `booking_allergies`, `booking_changes`, `quotes`, `quote_counters`.
- **RLS attivo su tutte le tabelle.** Lettura per utenti attivi; scrittura diretta solo per admin.
  Sala e cucina non hanno policy di scrittura: modificano tramite funzioni `SECURITY DEFINER`.
- **Funzioni RPC** (eseguibili da `authenticated`, verificano `auth.uid()` e ruolo):
  - `update_booking_covers(p_booking_id, p_adults, p_children, p_kids_menus)` — admin e sala.
  - `save_booking_dishes(p_booking_id, p_dishes)` — admin e cucina con `is_chef`.
  - `reset_booking_dishes(p_booking_id)` — admin e cucina con `is_chef`.
  - `upsert_booking(p_id, p_data)` — solo admin, transazionale (prenotazione, allergie, piatti).
  - `upsert_menu(p_id, p_data)` — solo admin, transazionale (menù e voci).
  - `next_quote_number()` — numero preventivo progressivo `YYYY-NNNN` per anno, senza duplicati.
- **Audit**: ogni modifica di `bookings` produce una riga in `booking_changes` per campo cambiato
  (con utente e timestamp); allergie e piatti producono una riga riassuntiva.
- **Helper**: `public.is_admin()`, `public.is_active()` (usati dalle policy RLS) e `public.current_role()`
  (solo interno alle funzioni, non eseguibile dai client; parola riservata: chiamala sempre `public.current_role()`).
- **Tracking migrazioni**: `public._app_migrations` registra i file già applicati da `npm run setup`
  (tabella interna, senza accesso via API).

## Note

- Eliminando una prenotazione vengono eliminati piatti e allergie; il registro modifiche resta
  (con una riga "eliminazione"). Se esistono preventivi collegati la prenotazione non si può
  eliminare: elimina prima i preventivi o imposta lo stato "Annullato".
- Un cliente con prenotazioni non può essere eliminato (vincolo `restrict`).
- Le sale con prenotazioni non possono essere eliminate: usa il flag `active` per disattivarle.
- Il menù Bambini è un menù con `is_kids = true` e prezzo 20 €; i piatti del menù bambini non
  vengono copiati in `booking_dishes`, che rappresenta solo il menù principale dell'evento.

## Pagamenti, notifiche e push (migrazione 0002)

- **Acconti**: tabella `payments` con ricevute nel bucket privato `receipts` (foto o PDF, max 10 MB).
  Visibili e gestibili solo dall'admin. Lo stato `saldato` si imposta a mano dalla prenotazione.
- **Notifiche**: tabella `notifications` (campanella) e `push_subscriptions` (push web). Le righe le crea
  il server con la service role; il client legge solo le proprie. Realtime su `notifications`.
- **Promemoria**: `GET /api/cron/reminders` (cron giornaliero in `vercel.json`, 16:00 UTC) notifica le
  prenotazioni di domani. Protetta da `Authorization: Bearer ${CRON_SECRET}`.
- **Variabili d'ambiente** da impostare in `.env.local` e su Vercel (Settings → Environment Variables):
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `CRON_SECRET`.
  Le chiavi VAPID si generano con `npx web-push generate-vapid-keys`. Senza VAPID le notifiche restano in-app.
