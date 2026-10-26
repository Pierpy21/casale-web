# Contratti tecnici — Agenda Digitale

Vincolanti per tutti gli specialisti. Leggere anche `docs/SPEC.md` (brand, dominio, requisiti).
Stack: Next.js 15.5 App Router (params/searchParams/cookies() sono **Promise**), React 19, TypeScript strict,
Tailwind v4 (token in `@theme` dentro `src/app/globals.css`, nessun tailwind.config), Supabase (`@supabase/ssr`), Zod v4, date-fns (locale `it`), lucide-react.
Lingua UI: **italiano**. Valuta EUR, formato `it-IT`. Fuso: Europe/Rome; le date evento sono `date` (stringa `YYYY-MM-DD`).

## 1. Variabili d'ambiente (`.env.example`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # solo server, usata per creare operatori
```

## 2. File backend (ownership: backend)
- `supabase/migrations/0001_init.sql` — enum, tabelle, indici, RLS, funzioni, trigger, seed sale e menù (da SPEC §2).
- `supabase/README.md` — come applicare la migrazione e creare l'admin Peppe Moschetto.
- `scripts/create-admin.mjs` — crea l'utente admin via service role (`node scripts/create-admin.mjs email password "Peppe Moschetto"`).
- `src/lib/supabase/server.ts` → `export async function createClient(): Promise<SupabaseClient>`
- `src/lib/supabase/client.ts` → `export function createClient(): SupabaseClient` (browser)
- `src/lib/supabase/admin.ts` → `import "server-only"; export function createAdminClient(): SupabaseClient` (service role)
- `src/lib/supabase/middleware.ts` → `export async function updateSession(req: NextRequest): Promise<NextResponse>` + `src/middleware.ts` (redirect a `/login` se non autenticato, esclusi `/login`, `_next`, asset statici).
- `src/lib/types.ts` — **esattamente** i tipi del §4.
- `src/lib/validation.ts` — schemi Zod del §5.
- `src/lib/auth.ts` (`server-only`) — §6.
- `src/lib/data/*.ts` (`server-only`) — query del §7.
- `src/app/actions/*.ts` (`"use server"`) — §8.

## 3. Ruoli e permessi (enforcement in DB con RLS + funzioni, ripetuto nelle actions)
- `admin` (unico, Peppe Moschetto): CRUD completo su tutto.
- `sala`: SELECT su tutto; può cambiare solo `adults`, `children`, `kids_menus` di una prenotazione tramite RPC `update_booking_covers`.
- `cucina`: SELECT su tutto; se `is_chef = true` può sostituire i piatti di una prenotazione tramite RPC `save_booking_dishes`.
- Utente con `active = false` → nessun accesso (RLS e `requireProfile` lo bloccano).
- Nessuna policy INSERT/UPDATE/DELETE diretta per sala/cucina. Funzioni RPC `SECURITY DEFINER`, `set search_path = public`, verificano `auth.uid()` e ruolo.
- Helper SQL: `public.current_role() returns role_type` e `public.is_admin() returns boolean` (stable, security definer).
- **Audit**: trigger `AFTER UPDATE` su `bookings` che scrive in `booking_changes` una riga per ogni campo cambiato (escluse `updated_at`, `updated_by`), con `changed_by = auth.uid()` e `changed_by_name` da `profiles.full_name` (fallback 'sistema'). Trigger su `booking_allergies` (insert/update/delete) → una riga con field `allergie`. `save_booking_dishes` scrive **una** riga field `piatti` con old/new come elenco testuale "Corso: piatto; ...". Creazione prenotazione → riga field `creazione`. `booking_changes` leggibile da tutti gli utenti attivi, scrivibile solo da trigger/funzioni.

## 4. `src/lib/types.ts`
```ts
export type Role = "admin" | "sala" | "cucina";
export type Course = "antipasto" | "primo" | "secondo" | "contorno" | "dolce" | "bevande";
export type BookingStatus = "opzione" | "confermato" | "annullato";

export interface Profile { id: string; full_name: string; email: string; role: Role; is_chef: boolean; active: boolean; created_at: string; }
export interface Client { id: string; first_name: string; last_name: string; phone: string; email: string | null; tax_code: string | null; vat_number: string | null; notes: string | null; created_at: string; updated_at: string; }
export interface ClientWithStats extends Client { bookings_count: number; next_event_date: string | null; }
export interface Room { id: string; name: string; capacity: number; sort: number; active: boolean; }
export interface MenuItem { id: string; menu_id: string; course: Course; name: string; sort: number; }
export interface Menu { id: string; name: string; season: string | null; price_per_person: number; is_kids: boolean; active: boolean; sort: number; items: MenuItem[]; }
export interface BookingDish { id: string; booking_id: string; course: Course; name: string; sort: number; }
export interface BookingAllergy { id: string; booking_id: string; subject_name: string | null; condition: string; notes: string | null; }
export interface Booking {
  id: string; client_id: string; event_name: string | null; event_date: string; event_time: string | null;
  room_id: string | null; adults: number; children: number; kids_menus: number;
  menu_id: string | null; kids_menu_id: string | null; setup_colors: string[]; setup_notes: string | null;
  status: BookingStatus; notes: string | null; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
}
export interface BookingListItem extends Booking {
  client: Pick<Client, "id" | "first_name" | "last_name" | "phone">;
  room: Pick<Room, "id" | "name" | "capacity"> | null;
  menu: Pick<Menu, "id" | "name" | "price_per_person"> | null;
  dishes: BookingDish[];            // per mostrare il menù a colpo d'occhio
  allergies: BookingAllergy[];
}
export interface BookingDetail extends Booking {
  client: Client; room: Room | null; menu: Menu | null; kids_menu: Menu | null;
  dishes: BookingDish[]; allergies: BookingAllergy[];
}
export interface BookingChange { id: number; booking_id: string; changed_by: string | null; changed_by_name: string; table_name: string; field: string; old_value: string | null; new_value: string | null; created_at: string; }
export interface QuoteLine { description: string; quantity: number; unit_price: number; }
export interface Quote { id: string; booking_id: string; number: string; issued_at: string; valid_until: string | null; lines: QuoteLine[]; discount: number; vat_rate: number; notes: string | null; created_at: string; }
export interface QuoteWithBooking extends Quote { booking: BookingDetail; }
export interface QuoteTotals { subtotal: number; discount: number; total: number; taxable: number; vat: number; } // prezzi IVA inclusa: taxable = total/(1+vat/100)
export interface DashboardStats { eventsThisMonth: number; coversNext7Days: number; pendingOptions: number; eventsToday: number; }

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const SETUP_COLORS = ["Bianco","Avorio","Champagne","Oro","Argento","Rosa cipria","Pesca","Verde salvia","Verde oliva","Azzurro","Blu notte","Bordeaux","Lilla","Rosso","Nero"] as const;
export const SETUP_COLOR_HEX: Record<(typeof SETUP_COLORS)[number], string> = { /* hex rappresentativo per ogni colore */ };
export const COURSE_ORDER: Course[] = ["antipasto","primo","secondo","contorno","dolce","bevande"];
export const COURSE_LABELS: Record<Course, string> = { antipasto: "Antipasto", primo: "Primo", secondo: "Secondo", contorno: "Contorno", dolce: "Dolce", bevande: "Bevande" };
export const ROLE_LABELS: Record<Role, string> = { admin: "Amministratore", sala: "Sala", cucina: "Cucina" };
export const STATUS_LABELS: Record<BookingStatus, string> = { opzione: "Opzione", confermato: "Confermato", annullato: "Annullato" };
```
Inoltre in `src/lib/quote-utils.ts` (puro, usabile client e server): `export function computeQuoteTotals(q: Pick<Quote,"lines"|"discount"|"vat_rate">): QuoteTotals` e `export function formatEUR(n: number): string`.

## 5. `src/lib/validation.ts` (Zod) — esportare schema + `z.infer` type
- `ClientInput`: first_name, last_name (trim, min 1), phone (trim, min 6, regex `^[+0-9 ()-]+$`), email (email o "" → null), tax_code (opz., 16 alfanumerici uppercase o "" → null), vat_number (opz., 11 cifre, ammesso prefisso IT, o "" → null), notes (opz.).
- `AllergyInput`: { subject_name?: string|null, condition: string min 1, notes?: string|null }
- `DishInput`: { course: Course, name: string min 1, sort: int >= 0 }
- `BookingInput`: client_id uuid, event_name?, event_date `YYYY-MM-DD`, event_time? `HH:MM` o null, room_id uuid|null, adults int>=0, children int>=0, kids_menus int>=0 (refine: kids_menus <= children; adults+children >= 1), menu_id uuid|null, kids_menu_id uuid|null, setup_colors: array di SETUP_COLORS, setup_notes?, status BookingStatus (default "opzione"), notes?, allergies: AllergyInput[], dishes?: DishInput[] (se assente e menu_id presente, il backend copia i piatti dal menù).
- `CoversInput`: { adults, children, kids_menus } con le stesse regole.
- `OperatorInput`: full_name min 2, email, password min 8, role "sala"|"cucina", is_chef boolean (forzato false se role ≠ "cucina").
- `OperatorUpdateInput`: full_name, role "sala"|"cucina", is_chef, active.
- `MenuInput`: id? uuid, name, season?, price_per_person number >= 0, is_kids, active, sort, items: { course, name, sort }[].
- `RoomInput`: id? uuid, name, capacity int > 0, sort, active.
- `QuoteInput`: issued_at date, valid_until date|null, lines: QuoteLine[] (min 1; quantity > 0; unit_price >= 0), discount >= 0, vat_rate 0..100, notes?.

## 6. `src/lib/auth.ts`
```ts
export async function getCurrentProfile(): Promise<Profile | null>; // getUser() + profiles; null se non loggato o inattivo
export async function requireProfile(): Promise<Profile>;            // redirect("/login") se null
export async function requireAdmin(): Promise<Profile>;              // redirect("/agenda") se non admin
export function isAdmin(p: Profile): boolean;
export function canEditCovers(p: Profile): boolean;  // admin || sala
export function canEditDishes(p: Profile): boolean;  // admin || (cucina && is_chef)
```
`canEditCovers`/`canEditDishes`/`isAdmin` vanno anche in `src/lib/permissions.ts` (puro, senza server-only) e riesportate da auth.ts, così i Client Component possono usarle.

## 7. Query `src/lib/data/` (tutte usano il client server con la sessione utente → RLS)
- `bookings.ts`: `getBookingsInRange(from: string, to: string, opts?: { includeCancelled?: boolean }): Promise<BookingListItem[]>` (ordinate per data, ora) · `getBooking(id): Promise<BookingDetail | null>` · `getBookingChanges(bookingId): Promise<BookingChange[]>` (desc) · `getRoomOccupancy(date: string): Promise<{ room_id: string; booking_id: string }[]>` · `getDashboardStats(): Promise<DashboardStats>` · `getUpcomingBookings(limit: number): Promise<BookingListItem[]>`
- `clients.ts`: `getClients(search?: string): Promise<ClientWithStats[]>` (ricerca su nome, cognome, telefono) · `getClient(id): Promise<Client | null>` · `getClientBookings(clientId): Promise<BookingListItem[]>`
- `catalog.ts`: `getRooms(opts?: { includeInactive?: boolean }): Promise<Room[]>` · `getMenus(opts?: { includeInactive?: boolean }): Promise<Menu[]>` (items ordinati per COURSE_ORDER, sort)
- `operators.ts`: `getOperators(): Promise<Profile[]>` (admin; email da profiles.email)
- `quotes.ts`: `getQuote(id): Promise<QuoteWithBooking | null>` · `getQuotesForBooking(bookingId): Promise<Quote[]>`

## 8. Server Actions (`src/app/actions/`) — tutte: `getUser()`, profilo attivo, check ruolo, Zod `safeParse`, ritornano `ActionResult`, `revalidatePath` sulle pagine toccate. Mai lanciare eccezioni verso il client per errori attesi.
- `auth.ts`: `signIn(prev: ActionResult | null, formData: FormData): Promise<ActionResult>` (email, password; su successo `redirect("/agenda")`) · `signOut(): Promise<void>` (redirect `/login`)
- `clients.ts` (admin): `createClient(input: unknown): Promise<ActionResult<{ id: string }>>` · `updateClient(id: string, input: unknown): Promise<ActionResult>` · `deleteClient(id: string): Promise<ActionResult>` (errore leggibile se ha prenotazioni)
- `bookings.ts`: `createBooking(input: unknown): Promise<ActionResult<{ id: string }>>` (admin; avviso — non blocco — se sala già occupata quel giorno o coperti > capienza: restituire `data.warnings?: string[]` non necessario, il frontend controlla con getRoomOccupancy) · `updateBooking(id, input: unknown): Promise<ActionResult>` (admin; sostituisce allergie; se `dishes` presente usa `save_booking_dishes`) · `deleteBooking(id): Promise<ActionResult>` (admin) · `updateBookingCovers(id, input: unknown): Promise<ActionResult>` (admin|sala, via RPC) · `updateBookingDishes(id, dishes: unknown): Promise<ActionResult>` (admin|chef, via RPC) · `resetDishesFromMenu(id): Promise<ActionResult>` (admin|chef)
- `operators.ts` (admin, usa `createAdminClient`): `createOperator(input: unknown): Promise<ActionResult<{ id: string }>>` (crea auth user con email_confirm true + profilo) · `updateOperator(id, input: unknown): Promise<ActionResult>` (non può modificare l'admin) · `resetOperatorPassword(id, password: string): Promise<ActionResult>`
- `catalog.ts` (admin): `upsertMenu(input: unknown): Promise<ActionResult<{ id: string }>>` · `deleteMenu(id): Promise<ActionResult>` (soft: active=false se usato) · `upsertRoom(input: unknown): Promise<ActionResult<{ id: string }>>`
- `quotes.ts` (admin): `createQuoteFromBooking(bookingId: string): Promise<ActionResult<{ id: string }>>` (righe automatiche: "Menù X — adulti" qty adults × prezzo menù; "Menù bambini" qty kids_menus × prezzo kids menu; numero `YYYY-NNNN` progressivo per anno; valid_until = +30 giorni; vat_rate 10) · `updateQuote(id, input: unknown): Promise<ActionResult>` · `deleteQuote(id): Promise<ActionResult>`

## 9. Route documenti (ownership: documents)
- `GET /api/quotes/[id]/pdf` e `GET /api/quotes/[id]/docx` — `export const runtime = "nodejs"`, auth admin, `Content-Disposition: attachment; filename="Preventivo-<numero>.pdf|docx"`.
- Template condiviso in `src/lib/documents/`: intestazione con **logo in alto a destra** (`public/logo-dark.png`), dati Casale a sinistra, cliente (nome, telefono, CF/P.IVA se presenti), evento (data, sala, coperti adulti/bambini), menù con piatti per portata, allestimento, tabella righe, totali (IVA inclusa), note, validità, firma.

## 10. Frontend — route (ownership: frontend)
- `/login`
- `(app)` layout: sidebar desktop (≥ lg), bottom nav mobile; voci per ruolo (Operatori, Menù & Sale, Clienti solo admin; Agenda per tutti).
- `/` → redirect `/agenda`
- `/dashboard` (admin) — KPI `DashboardStats`, prossimi eventi, occupazione sale settimana.
- `/agenda?date=YYYY-MM-DD&view=month|week|day` — desktop: calendario mese/settimana con card evento (ora, nome cliente/evento, sala, coperti A+B, menù) + pannello dettaglio; mobile: striscia settimana + lista giorno, card grandi tappabili, FAB "+" (admin).
- `/prenotazioni/nuova?date=` (admin) · `/prenotazioni/[id]` (tutti; azioni secondo permessi: modifica coperti inline per sala, modifica piatti per chef, tutto per admin; registro modifiche; preventivi) · `/prenotazioni/[id]/modifica` (admin)
- `/clienti`, `/clienti/nuovo`, `/clienti/[id]` (admin)
- `/operatori` (admin) · `/catalogo` (admin: menù e sale)
- `/preventivi/[id]` (admin: modifica righe, anteprima, download PDF/DOCX)
- Ogni route con dati: `loading.tsx`, gestione Empty ed Error (`error.tsx` client).

### Token Tailwind (in `@theme`)
Colori `--color-<nome>` con i nomi di SPEC §1 (`ink`, `ink-deep`, `petrol`, `petrol-hover`, `petrol-muted`, `slate`, `slate-dark`, `bronze`, `olive`, `sand`, `cream`, `paper`, `logo-cream`, `disabled`) + `--color-danger: #9B3B32`, `--color-success: #4F6B45`, `--color-warning: #A9792B`. Font: `--font-sans` (Geist via `next/font`), `--font-serif` (Georgia stack). `--radius-btn: 2px`.

### UI kit `src/components/ui/` (frontend A produce, frontend B usa)
`Button` (variant: primary | outline | light | ghost | danger; size: sm | md | lg; + `ButtonLink` con href) · `SubmitButton` (useFormStatus, pending) · `Input`, `Textarea`, `Select` (nativo), `Checkbox`, `Field` ({ label, htmlFor, error?, hint?, required?, children }) · `Card` · `Badge` (tone: neutral | petrol | bronze | success | warning | danger) · `StatusBadge` ({ status }) · `ColorDots` ({ colors: string[] }) · `EmptyState` ({ title, description?, action? }) · `ErrorState` ({ title?, message?, reset? }) · `PageHeader` ({ eyebrow?, title, description?, actions? }) · `Skeleton` · `Alert` ({ tone, children }) · `Modal` (dialog nativo accessibile, { open, onClose, title, children }).
