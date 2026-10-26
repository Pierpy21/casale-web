# Agenda Digitale — Casale del Notaio

Specifica di riferimento per tutti gli specialisti (brand, dominio, architettura, contratti).
Fonte brand e dati: https://casale-web.vercel.app/ (estratti il 2026-10-24).

## 1. Design system (dal sito)

### Palette
| Token | Hex | Uso sul sito |
|---|---|---|
| `ink` | `#1C2B2D` | testo titoli su chiaro, superfici scure |
| `ink-deep` | `#152022` | fondo più scuro (hero/footer) |
| `petrol` | `#355A63` | colore primario: bottoni pieni, bordi bottoni outline |
| `petrol-hover` | `#2A4A52` | hover primario |
| `petrol-muted` | `#3F5D63` | testi secondari su chiaro |
| `slate` | `#5A6668` | testo corpo / muted |
| `slate-dark` | `#4A5558` | testo secondario scuro |
| `bronze` | `#8B6B4A` | accento: eyebrow/label uppercase, dettagli |
| `olive` | `#6B6955` | accento secondario |
| `sand` | `#D5D5B7` | accento chiaro: bordi/bottoni su scuro, CTA chiara |
| `cream` | `#EDEEDD` | superfici chiare alternative |
| `paper` | `#F7F7F4` | fondo chiaro / testo su scuro |
| `logo-cream` | `#FAF1D7` | colore del logo (su fondo scuro) |
| `disabled` | `#B0B0B0` | testo disabilitato |

### Tipografia
- Titoli (h1–h3): serif (`ui-serif, Georgia, Cambria, "Times New Roman", serif`), peso 400–500, leading 1.15–1.2.
- Corpo / UI: sans **Geist** (fallback Inter, system-ui).
- Eyebrow / label: sans, `uppercase`, `tracking-widest` (0.12–0.14em), 12–13px, colore `bronze`.

### Bottoni
- Raggio: **2px** (quasi squadrati). CTA WhatsApp: 0px.
- Primario: `bg petrol` / `text paper` / hover `petrol-hover`, `px-8 py-3.5`, 13px uppercase tracking-widest font-medium.
- Outline chiaro (su scuro): `border sand/50` `text sand`, hover `border sand/80 bg sand/10`.
- Outline primario (su chiaro): `border petrol` `text petrol`, hover `bg petrol text paper`, 12px tracking 0.14em.
- Transizioni ~250–300ms.

### Logo
- `public/logo.svg` — originale (crema `#FAF1D7`, per fondi scuri), viewBox 675×225.
- `public/logo-dark.svg` — variante `#1C2B2D` per fondi chiari e per i preventivi.

## 2. Dati del Casale

- **Casale del Notaio** — "Il Casale del Notaio, del gusto il Teatro." — attivo dal 2008.
- Via Nicolosi 67, 95032 Belpasso (CT), Sicilia — +39 340 109 0100 — info@casaledelnotaio.it
- Orari: Mer–Gio 16:30–23:30 · Ven 16:00–23:30 · Sab 12:00–23:30 · Dom 10:00–23:30 · Lun–Mar chiuso.
- Politica sale: ogni sala riservata a un singolo evento; esclusività sala, tavolo torta e decorazioni inclusi nella banchettistica.

### Sale (seed)
| Sala | Capienza max |
|---|---|
| Terrazza | 300 |
| Palmento | 120 |
| Sala Grande | 80 |
| Pozzo | 60 |
| Sala 1 | 40 |
| Sala 3 | 35 |
| Sala 2 | 20 |

### Menù autunno (seed) — bevande sempre: Acqua, Vino Barone Montalto, Caffè, Amaro
- **Menù 1 — 46 €**: Antipasto: Selezione di antipasti del casale · Primo: Caserecce di pasta fresca al guanciale di Norcia su base di pomodoro fresco · Secondo: Fagottino di vitellina con cuore morbido alla zucca, olive nere e infuso alla salvia; Stinco di maiale speziato al forno · Contorno: Patate al forno al rosmarino
- **Menù 2 — 40 €**: Antipasto: Selezione di antipasti del casale · Primo: Millefoglie di pasta fresca con funghi cardoncelli con emulsione di prezzemolo · Secondo: Arrotolato di vitello ai sapori d'autunno · Contorno: Patate al forno al rosmarino
- **Menù 3 — 44 €**: Antipasto: Selezione di antipasti del casale · Primo: Millefoglie di pasta fresca alla zucca e provola affumicata del Belice · Secondo: Stracotto di vitello al frappato di Sicilia e crosta di formaggio sicano · Contorno: Patate al forno al rosmarino
- **Menù 4 — 50 €**: Antipasto: Selezione di antipasti del casale · Primi: Caserecce di pasta fresca con salsiccia al ceppo, radicchio e briciole di pane al cacio ragusano; Ravioli di pasta fresca con pistacchi e crema di bufala · Secondo: Vitellina con cipolle rosse caramellate, chips di patate, emulsione di basilico · Contorno: Insalatina di cavolo rosso
- **Menù Bambini — 20 €**: Primo: Pasta (al pomodoro, al pesto o al pistacchio) · Secondo: Cotoletta con patatine fritte

## 3. Requisiti funzionali

- Agenda: a colpo d'occhio banchetti per giorno con coperti, sala e **menù**.
- Prenotazione: cliente; adulti + bambini + n. menù bambini; data (e ora) evento; sala + allestimento (colori a scelta multipla + testo descrizione); allergie/patologie con nome del soggetto opzionale; menù scelto (copia piatti modificabile per evento).
- Cliente: nome, cognome, telefono **obbligatori**; email, codice fiscale, P.IVA opzionali.
- Ruoli:
  - `admin` — unico (Peppe Moschetto): tutto. Dashboard desktop completa + agenda mobile rapida.
  - `sala` — lettura di tutto, può modificare **solo i coperti** (adulti, bambini, menù bambini).
  - `cucina` — lettura di tutto; se `is_chef = true` può modificare i **piatti** dell'evento.
- Ogni modifica è registrata nel log con nome utente, campo, valore vecchio/nuovo, timestamp.
- Admin crea/disattiva operatori (sala/cucina, flag chef).
- Preventivi automatici stampabili da prenotazione: template pulito, logo in alto a destra, export **PDF** e **DOCX**.

## 4. Architettura proposta

- Next.js 15 App Router + TypeScript + Tailwind v4 (token in `@theme` di `globals.css`).
- Supabase: Auth (email+password, creazione utenti solo da admin via service role), Postgres con **RLS**.
- Scritture: Server Actions con validazione Zod e `supabase.auth.getUser()`.
- Permessi granulari non-admin: funzioni Postgres `SECURITY DEFINER` (`update_booking_covers`, `update_booking_dishes`) che verificano il ruolo; nessuna policy UPDATE diretta per sala/cucina.
- Audit: trigger Postgres su `bookings` e `booking_dishes` → `booking_changes` (risolve `auth.uid()` → `profiles.full_name`).
- Preventivi: Route Handlers `runtime = "nodejs"` — `GET /api/quotes/[id]/pdf` (@react-pdf/renderer, logo in PNG) e `GET /api/quotes/[id]/docx` (docx).
- UI responsive: desktop = calendario mensile/settimanale + pannello dettaglio; mobile = lista agenda per giorno con swipe tra date e azioni rapide.

## 5. Schema dati (contratto)

```
profiles(id uuid pk = auth.users.id, full_name text, role 'admin'|'sala'|'cucina', is_chef bool, active bool, created_at)
clients(id uuid, first_name text!, last_name text!, phone text!, email text?, tax_code text?, vat_number text?, notes text?, created_at, updated_at)
rooms(id uuid, name text unique, capacity int, sort int, active bool)
menus(id uuid, name text, season text, price_per_person numeric(10,2), is_kids bool, active bool, sort int)
menu_items(id uuid, menu_id fk, course course_type, name text, sort int)
  course_type = 'antipasto'|'primo'|'secondo'|'contorno'|'dolce'|'bevande'
bookings(id uuid, client_id fk, event_name text?, event_date date!, event_time time?, room_id fk,
         adults int>=0, children int>=0, kids_menus int>=0 (<= children), menu_id fk?, kids_menu_id fk?,
         setup_colors text[], setup_notes text?, status 'opzione'|'confermato'|'annullato', notes text?,
         created_by, updated_by, created_at, updated_at)
booking_dishes(id uuid, booking_id fk cascade, course course_type, name text, sort int)   -- copia del menù
booking_allergies(id uuid, booking_id fk cascade, subject_name text?, condition text!, notes text?)
booking_changes(id bigserial, booking_id fk, changed_by uuid, changed_by_name text, table_name text, field text, old_value text, new_value text, created_at)
quotes(id uuid, booking_id fk, number text unique (es. 2026-0001), issued_at date, valid_until date,
       lines jsonb [{description, quantity, unit_price}], discount numeric, vat_rate numeric, notes text, created_by, created_at)
```

Colori allestimento (scelta multipla): Bianco, Avorio, Champagne, Oro, Argento, Rosa cipria, Pesca, Verde salvia, Verde oliva, Azzurro, Blu notte, Bordeaux, Lilla, Rosso, Nero.
