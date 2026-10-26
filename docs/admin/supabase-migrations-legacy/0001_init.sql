-- =====================================================================
-- Agenda Digitale - Casale del Notaio
-- Migrazione iniziale: enum, tabelle, indici, RLS, funzioni, trigger, seed
-- =====================================================================
-- Nota: gen_random_uuid() è built-in da PostgreSQL 13 (Supabase), nessuna estensione richiesta.

-- ---------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------
-- Privilegi di default: oggetti creati da questa migrazione non sono accessibili ad anon/authenticated
-- finché non vengono concessi esplicitamente in fondo al file (sezione 8).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create type public.role_type as enum ('admin', 'sala', 'cucina');
create type public.course_type as enum ('antipasto', 'primo', 'secondo', 'contorno', 'dolce', 'bevande');
create type public.booking_status as enum ('opzione', 'confermato', 'annullato');

-- ---------------------------------------------------------------------
-- 2. Tabelle
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) > 0),
  email       text not null,
  role        public.role_type not null,
  is_chef     boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint profiles_chef_only_cucina check (is_chef = false or role = 'cucina')
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null check (length(btrim(first_name)) > 0),
  last_name   text not null check (length(btrim(last_name)) > 0),
  phone       text not null check (length(btrim(phone)) >= 6),
  email       text,
  tax_code    text,
  vat_number  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.rooms (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique check (length(btrim(name)) > 0),
  capacity  int not null check (capacity > 0),
  sort      int not null default 0,
  active    boolean not null default true
);

create table public.menus (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) > 0),
  season           text,
  price_per_person numeric(10,2) not null default 0 check (price_per_person >= 0),
  is_kids          boolean not null default false,
  active           boolean not null default true,
  sort             int not null default 0
);

create table public.menu_items (
  id       uuid primary key default gen_random_uuid(),
  menu_id  uuid not null references public.menus(id) on delete cascade,
  course   public.course_type not null,
  name     text not null check (length(btrim(name)) > 0),
  sort     int not null default 0
);
create index menu_items_menu_id_idx on public.menu_items(menu_id);

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete restrict,
  event_name     text,
  event_date     date not null,
  event_time     time,
  room_id        uuid references public.rooms(id) on delete restrict,
  adults         int not null default 0 check (adults >= 0),
  children       int not null default 0 check (children >= 0),
  kids_menus     int not null default 0 check (kids_menus >= 0),
  menu_id        uuid references public.menus(id) on delete set null,
  kids_menu_id   uuid references public.menus(id) on delete set null,
  setup_colors   text[] not null default '{}',
  setup_notes    text,
  status         public.booking_status not null default 'opzione',
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_kids_menus_le_children check (kids_menus <= children),
  constraint bookings_guests_min check (adults + children >= 1),
  constraint bookings_setup_colors_valid check (setup_colors <@ array[
    'Bianco','Avorio','Champagne','Oro','Argento','Rosa cipria','Pesca','Verde salvia',
    'Verde oliva','Azzurro','Blu notte','Bordeaux','Lilla','Rosso','Nero']::text[])
);
create index bookings_event_date_idx on public.bookings(event_date);
create index bookings_room_id_idx on public.bookings(room_id);
create index bookings_client_id_idx on public.bookings(client_id);

create table public.booking_dishes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  course      public.course_type not null,
  name        text not null check (length(btrim(name)) > 0),
  sort        int not null default 0
);
create index booking_dishes_booking_id_idx on public.booking_dishes(booking_id);

create table public.booking_allergies (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  subject_name  text,
  condition     text not null check (length(btrim(condition)) > 0),
  notes         text
);
create index booking_allergies_booking_id_idx on public.booking_allergies(booking_id);

create table public.booking_changes (
  id               bigserial primary key,
  -- Nullable: alla cancellazione di una prenotazione la riga resta come storico (booking_id -> null).
  booking_id       uuid references public.bookings(id) on delete set null,
  -- Descrizione leggibile della prenotazione (usata soprattutto per le eliminazioni).
  booking_label    text,
  changed_by       uuid references public.profiles(id) on delete set null,
  changed_by_name  text not null default 'sistema',
  table_name       text not null,
  field            text not null,
  old_value        text,
  new_value        text,
  created_at       timestamptz not null default now()
);
create index booking_changes_booking_id_idx on public.booking_changes(booking_id, created_at desc);

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  -- restrict: una prenotazione con preventivi non può essere eliminata (va prima eliminato il preventivo o annullata la prenotazione).
  booking_id   uuid not null references public.bookings(id) on delete restrict,
  number       text not null unique,
  issued_at    date not null default current_date,
  valid_until  date,
  lines        jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  discount     numeric(10,2) not null default 0 check (discount >= 0),
  vat_rate     numeric(5,2) not null default 10 check (vat_rate between 0 and 100),
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index quotes_booking_id_idx on public.quotes(booking_id);

-- Contatore progressivo per anno dei preventivi (accesso solo via next_quote_number()).
create table public.quote_counters (
  year         int primary key,
  last_number  int not null default 0
);

-- Un solo amministratore nel sistema.
create unique index profiles_single_admin on public.profiles (role) where role = 'admin';

-- ---------------------------------------------------------------------
-- 3. Funzioni helper (stable, security definer, search_path fissato)
-- ---------------------------------------------------------------------
-- Nota: "current_role" è parola riservata in PostgreSQL: la funzione va sempre
-- chiamata qualificata come public.current_role().
create or replace function public.current_role()
returns public.role_type
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'admin'
  )
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.course_rank(c public.course_type)
returns int
language sql
immutable
set search_path = public
as $$
  select case c
    when 'antipasto' then 1
    when 'primo' then 2
    when 'secondo' then 3
    when 'contorno' then 4
    when 'dolce' then 5
    else 6
  end
$$;

-- Riepilogo testuale allergie: "Soggetto: condizione; ..." (usato dall'audit)
create or replace function public.allergies_summary(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(string_agg(
           coalesce(a.subject_name || ': ', '') || a.condition, '; '
           order by a.subject_name nulls first, a.condition), '')
  from public.booking_allergies a
  where a.booking_id = p_booking_id
$$;

-- Riepilogo testuale piatti: "Corso: piatto; ..." (usato dall'audit)
create or replace function public.dishes_summary(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(string_agg(
           initcap(d.course::text) || ': ' || d.name, '; '
           order by public.course_rank(d.course), d.sort, d.name), '')
  from public.booking_dishes d
  where d.booking_id = p_booking_id
$$;

-- Piatti del menù come jsonb [{course,name,sort}] (copia per la prenotazione)
create or replace function public.menu_dishes_json(p_menu_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('course', mi.course, 'name', mi.name, 'sort', mi.sort)
           order by public.course_rank(mi.course), mi.sort), '[]'::jsonb)
  from public.menu_items mi
  where mi.menu_id = p_menu_id
$$;

-- Scrive una riga in booking_changes con il nome dell'utente corrente (fallback 'sistema').
create or replace function public.log_booking_change(
  p_booking_id uuid,
  p_table text,
  p_field text,
  p_old text,
  p_new text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  select pr.full_name into v_name from public.profiles pr where pr.id = v_uid;
  insert into public.booking_changes
    (booking_id, changed_by, changed_by_name, table_name, field, old_value, new_value)
  values
    (p_booking_id, v_uid, coalesce(v_name, 'sistema'), p_table, p_field, p_old, p_new);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Trigger function
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Audit: una riga per ogni colonna cambiata su bookings (esclusi updated_at/updated_by).
create or replace function public.audit_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_old    text;
  v_new    text;
begin
  for r in select key, value from jsonb_each_text(to_jsonb(new)) loop
    continue when r.key in ('updated_at', 'updated_by');
    v_old := to_jsonb(old) ->> r.key;
    v_new := r.value;
    if v_old is distinct from v_new then
      perform public.log_booking_change(new.id, 'bookings', r.key, v_old, v_new);
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.audit_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_booking_change(new.id, 'bookings', 'creazione', null,
                                    'Prenotazione del ' || new.event_date::text);
  return null;
end;
$$;

-- Audit eliminazione: la prenotazione non esiste più, quindi booking_id è null e
-- la descrizione viene salvata in booking_label (la riga resta come storico).
create or replace function public.audit_booking_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_label text;
begin
  select pr.full_name into v_name from public.profiles pr where pr.id = v_uid;
  v_label := 'Prenotazione del ' || old.event_date::text || ' — '
    || coalesce((select c.first_name || ' ' || c.last_name from public.clients c where c.id = old.client_id),
                'cliente sconosciuto');
  insert into public.booking_changes
    (booking_id, booking_label, changed_by, changed_by_name, table_name, field, old_value, new_value)
  values
    (null, v_label, v_uid, coalesce(v_name, 'sistema'), 'bookings', 'eliminazione', v_label, null);
  return null;
end;
$$;

-- Audit allergie. Durante upsert_booking il flag di sessione 'app.skip_allergy_audit'
-- è 'on' e la funzione scrive una sola riga riassuntiva.
create or replace function public.audit_booking_allergies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.skip_allergy_audit', true) = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_booking_change(new.booking_id, 'booking_allergies', 'allergie', null, new.condition);
  elsif tg_op = 'UPDATE' then
    perform public.log_booking_change(new.booking_id, 'booking_allergies', 'allergie', old.condition, new.condition);
  else
    -- Delete a cascata (eliminazione prenotazione): il genitore non esiste più, niente audit.
    if not exists (select 1 from public.bookings b where b.id = old.booking_id) then
      return null;
    end if;
    perform public.log_booking_change(old.booking_id, 'booking_allergies', 'allergie', old.condition, null);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Trigger
-- ---------------------------------------------------------------------
create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.touch_updated_at();

create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

create trigger bookings_audit_insert
  after insert on public.bookings
  for each row execute function public.audit_booking_insert();

create trigger bookings_audit_update
  after update on public.bookings
  for each row execute function public.audit_booking_update();

create trigger bookings_audit_delete
  after delete on public.bookings
  for each row execute function public.audit_booking_delete();

create trigger booking_allergies_audit
  after insert or update or delete on public.booking_allergies
  for each row execute function public.audit_booking_allergies();

-- ---------------------------------------------------------------------
-- 6. Funzioni applicative (RPC)
-- ---------------------------------------------------------------------

-- Sala (e admin): modifica dei soli coperti.
create or replace function public.update_booking_covers(
  p_booking_id uuid,
  p_adults int,
  p_children int,
  p_kids_menus int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.role_type := public.current_role();
begin
  if v_role is null or v_role not in ('admin', 'sala') then
    raise exception 'Non autorizzato a modificare i coperti' using errcode = '42501';
  end if;
  if p_adults < 0 or p_children < 0 or p_kids_menus < 0
     or p_kids_menus > p_children or p_adults + p_children < 1 then
    raise exception 'Coperti non validi' using errcode = '22023';
  end if;

  update public.bookings
     set adults = p_adults,
         children = p_children,
         kids_menus = p_kids_menus,
         updated_by = auth.uid()
   where id = p_booking_id;

  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin oppure cucina con is_chef: sostituisce i piatti della prenotazione.
-- Scrive una sola riga di audit (field 'piatti').
create or replace function public.save_booking_dishes(p_booking_id uuid, p_dishes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.role_type;
  v_chef boolean;
  v_old  text;
  v_new  text;
begin
  select pr.role, pr.is_chef into v_role, v_chef
    from public.profiles pr
   where pr.id = auth.uid() and pr.active;

  if v_role is null or not (v_role = 'admin' or (v_role = 'cucina' and v_chef)) then
    raise exception 'Non autorizzato a modificare i piatti' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bookings b where b.id = p_booking_id) then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;
  if p_dishes is null or jsonb_typeof(p_dishes) <> 'array' then
    raise exception 'Elenco piatti non valido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_dishes) > 60 then
    raise exception 'Troppi piatti (massimo 60)' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_dishes) e
    where coalesce(btrim(e->>'name'), '') = ''
  ) then
    raise exception 'Nome piatto mancante' using errcode = '22023';
  end if;

  v_old := public.dishes_summary(p_booking_id);

  delete from public.booking_dishes where booking_id = p_booking_id;

  insert into public.booking_dishes (booking_id, course, name, sort)
  select p_booking_id,
         (e->>'course')::public.course_type,
         btrim(e->>'name'),
         coalesce((e->>'sort')::int, 0)
    from jsonb_array_elements(p_dishes) e;

  v_new := public.dishes_summary(p_booking_id);

  if v_old is distinct from v_new then
    perform public.log_booking_change(p_booking_id, 'booking_dishes', 'piatti',
                                      nullif(v_old, ''), nullif(v_new, ''));
  end if;

  update public.bookings set updated_by = auth.uid() where id = p_booking_id;
end;
$$;

-- Ripristina i piatti copiandoli dal menù principale della prenotazione.
create or replace function public.reset_booking_dishes(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu uuid;
begin
  select b.menu_id into v_menu from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;
  if v_menu is null then
    raise exception 'Nessun menù associato alla prenotazione' using errcode = '22023';
  end if;
  perform public.save_booking_dishes(p_booking_id, public.menu_dishes_json(v_menu));
end;
$$;

-- Creazione/modifica prenotazione in un'unica transazione (solo admin).
-- p_data: chiavi come colonne di bookings + allergies [] + dishes [] (opzionale).
create or replace function public.upsert_booking(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_id            uuid := p_id;
  v_adults        int  := coalesce((p_data->>'adults')::int, 0);
  v_children      int  := coalesce((p_data->>'children')::int, 0);
  v_kids          int  := coalesce((p_data->>'kids_menus')::int, 0);
  v_menu          uuid := nullif(p_data->>'menu_id', '')::uuid;
  v_kids_menu     uuid := nullif(p_data->>'kids_menu_id', '')::uuid;
  v_old_menu      uuid;
  v_old_allergies text := '';
  v_new_allergies text;
begin
  if not public.is_admin() then
    raise exception 'Solo l''amministratore può salvare le prenotazioni' using errcode = '42501';
  end if;
  if v_adults < 0 or v_children < 0 or v_kids < 0 or v_kids > v_children or v_adults + v_children < 1 then
    raise exception 'Coperti non validi' using errcode = '22023';
  end if;
  if v_menu is not null and not exists (select 1 from public.menus m where m.id = v_menu and m.is_kids = false) then
    raise exception 'Il menù selezionato non è un menù adulti' using errcode = '22023';
  end if;
  if v_kids_menu is not null and not exists (select 1 from public.menus m where m.id = v_kids_menu and m.is_kids = true) then
    raise exception 'Il menù bambini selezionato non è un menù bambini' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.bookings (
      client_id, event_name, event_date, event_time, room_id,
      adults, children, kids_menus, menu_id, kids_menu_id,
      setup_colors, setup_notes, status, notes, created_by, updated_by
    ) values (
      (p_data->>'client_id')::uuid,
      nullif(p_data->>'event_name', ''),
      (p_data->>'event_date')::date,
      nullif(p_data->>'event_time', '')::time,
      nullif(p_data->>'room_id', '')::uuid,
      v_adults, v_children, v_kids, v_menu,
      v_kids_menu,
      coalesce(array(select jsonb_array_elements_text(p_data->'setup_colors')), '{}'::text[]),
      nullif(p_data->>'setup_notes', ''),
      coalesce(nullif(p_data->>'status', ''), 'opzione')::public.booking_status,
      nullif(p_data->>'notes', ''),
      v_uid, v_uid
    )
    returning id into v_id;
  else
    select b.menu_id into v_old_menu from public.bookings b where b.id = p_id for update;
    if not found then
      raise exception 'Prenotazione non trovata' using errcode = 'P0002';
    end if;
    v_old_allergies := public.allergies_summary(p_id);

    update public.bookings set
      client_id     = (p_data->>'client_id')::uuid,
      event_name    = nullif(p_data->>'event_name', ''),
      event_date    = (p_data->>'event_date')::date,
      event_time    = nullif(p_data->>'event_time', '')::time,
      room_id       = nullif(p_data->>'room_id', '')::uuid,
      adults        = v_adults,
      children      = v_children,
      kids_menus    = v_kids,
      menu_id       = v_menu,
      kids_menu_id  = v_kids_menu,
      setup_colors  = coalesce(array(select jsonb_array_elements_text(p_data->'setup_colors')), '{}'::text[]),
      setup_notes   = nullif(p_data->>'setup_notes', ''),
      status        = coalesce(nullif(p_data->>'status', ''), 'opzione')::public.booking_status,
      notes         = nullif(p_data->>'notes', ''),
      updated_by    = v_uid
    where id = p_id;
  end if;

  -- Allergie: sostituzione completa, audit riassuntivo unico.
  perform set_config('app.skip_allergy_audit', 'on', true);
  delete from public.booking_allergies where booking_id = v_id;
  insert into public.booking_allergies (booking_id, subject_name, condition, notes)
  select v_id,
         nullif(btrim(a->>'subject_name'), ''),
         btrim(a->>'condition'),
         nullif(a->>'notes', '')
    from jsonb_array_elements(coalesce(p_data->'allergies', '[]'::jsonb)) a;
  perform set_config('app.skip_allergy_audit', 'off', true);

  v_new_allergies := public.allergies_summary(v_id);
  if v_old_allergies is distinct from v_new_allergies then
    perform public.log_booking_change(v_id, 'booking_allergies', 'allergie',
                                      nullif(v_old_allergies, ''), nullif(v_new_allergies, ''));
  end if;

  -- Piatti: se forniti li sostituisce; altrimenti copia dal menù alla creazione
  -- o quando il menù cambia.
  if p_data->'dishes' is not null and jsonb_typeof(p_data->'dishes') = 'array' then
    perform public.save_booking_dishes(v_id, p_data->'dishes');
  elsif v_menu is not null and (p_id is null or v_menu is distinct from v_old_menu) then
    perform public.save_booking_dishes(v_id, public.menu_dishes_json(v_menu));
  end if;

  return v_id;
end;
$$;

-- Menù: upsert atomico di testata + voci (solo admin).
create or replace function public.upsert_menu(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not public.is_admin() then
    raise exception 'Solo l''amministratore può modificare il catalogo' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.menus (name, season, price_per_person, is_kids, active, sort)
    values (
      btrim(p_data->>'name'),
      nullif(p_data->>'season', ''),
      (p_data->>'price_per_person')::numeric,
      coalesce((p_data->>'is_kids')::boolean, false),
      coalesce((p_data->>'active')::boolean, true),
      coalesce((p_data->>'sort')::int, 0)
    )
    returning id into v_id;
  else
    update public.menus set
      name             = btrim(p_data->>'name'),
      season           = nullif(p_data->>'season', ''),
      price_per_person = (p_data->>'price_per_person')::numeric,
      is_kids          = coalesce((p_data->>'is_kids')::boolean, false),
      active           = coalesce((p_data->>'active')::boolean, true),
      sort             = coalesce((p_data->>'sort')::int, 0)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Menù non trovato' using errcode = 'P0002';
    end if;
  end if;

  delete from public.menu_items where menu_id = v_id;
  insert into public.menu_items (menu_id, course, name, sort)
  select v_id,
         (e->>'course')::public.course_type,
         btrim(e->>'name'),
         coalesce((e->>'sort')::int, 0)
    from jsonb_array_elements(coalesce(p_data->'items', '[]'::jsonb)) e;

  return v_id;
end;
$$;

-- Numero preventivo progressivo per anno: YYYY-NNNN (solo admin).
create or replace function public.next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := to_char(now() at time zone 'Europe/Rome', 'YYYY')::int;
  v_last int;
begin
  if not public.is_admin() then
    raise exception 'Solo l''amministratore può emettere preventivi' using errcode = '42501';
  end if;

  insert into public.quote_counters (year, last_number)
  values (v_year, 1)
  on conflict (year) do update set last_number = public.quote_counters.last_number + 1
  returning last_number into v_last;

  return v_year::text || '-' || lpad(v_last::text, 4, '0');
end;
$$;

-- Preventivo da prenotazione in un'unica transazione (solo admin attivo).
-- Righe automatiche: menù adulti (adulti x prezzo) e menù bambini (bambini-menù x prezzo).
-- Numero progressivo via next_quote_number(); validità 30 giorni; IVA 10%.
create or replace function public.create_quote(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking     public.bookings%rowtype;
  v_menu_name   text;
  v_menu_price  numeric;
  v_kids_name   text;
  v_kids_price  numeric;
  v_lines       jsonb := '[]'::jsonb;
  v_issued      date := (now() at time zone 'Europe/Rome')::date;
  v_number      text;
  v_id          uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo l''amministratore può emettere preventivi' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'Prenotazione non trovata' using errcode = 'P0002';
  end if;

  if v_booking.menu_id is not null and v_booking.adults > 0 then
    select m.name, m.price_per_person into v_menu_name, v_menu_price
      from public.menus m where m.id = v_booking.menu_id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'description', v_menu_name || ' — adulti',
      'quantity', v_booking.adults,
      'unit_price', v_menu_price));
  end if;

  if v_booking.kids_menu_id is not null and v_booking.kids_menus > 0 then
    select m.name, m.price_per_person into v_kids_name, v_kids_price
      from public.menus m where m.id = v_booking.kids_menu_id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'description', 'Menù bambini — ' || v_kids_name,
      'quantity', v_booking.kids_menus,
      'unit_price', v_kids_price));
  end if;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Nessuna riga da preventivare: associa un menù alla prenotazione e indica i coperti.'
      using errcode = '22023';
  end if;

  v_number := public.next_quote_number();

  insert into public.quotes
    (booking_id, number, issued_at, valid_until, lines, discount, vat_rate, notes, created_by)
  values
    (p_booking_id, v_number, v_issued, v_issued + 30, v_lines, 0, 10, null, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.rooms             enable row level security;
alter table public.menus             enable row level security;
alter table public.menu_items        enable row level security;
alter table public.bookings          enable row level security;
alter table public.booking_dishes    enable row level security;
alter table public.booking_allergies enable row level security;
alter table public.booking_changes   enable row level security;
alter table public.quotes            enable row level security;
alter table public.quote_counters    enable row level security;  -- nessuna policy: solo funzioni security definer

-- Lettura: tutti gli utenti autenticati con profilo attivo.
create policy profiles_select on public.profiles for select to authenticated using (public.is_active());
create policy clients_select on public.clients for select to authenticated using (public.is_active());
create policy rooms_select on public.rooms for select to authenticated using (public.is_active());
create policy menus_select on public.menus for select to authenticated using (public.is_active());
create policy menu_items_select on public.menu_items for select to authenticated using (public.is_active());
create policy bookings_select on public.bookings for select to authenticated using (public.is_active());
create policy booking_dishes_select on public.booking_dishes for select to authenticated using (public.is_active());
create policy booking_allergies_select on public.booking_allergies for select to authenticated using (public.is_active());
create policy booking_changes_select on public.booking_changes for select to authenticated using (public.is_active());

-- Scrittura diretta: solo admin. Sala/cucina modificano tramite RPC security definer.
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy clients_admin_all on public.clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy rooms_admin_all on public.rooms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy menus_admin_all on public.menus for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy menu_items_admin_all on public.menu_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy bookings_admin_all on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy booking_allergies_admin_all on public.booking_allergies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy quotes_admin_all on public.quotes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- booking_changes: nessuna policy di scrittura (solo trigger/funzioni).

-- ---------------------------------------------------------------------
-- 8. Privilegi: nessun accesso per anon, esecuzione RPC solo ad authenticated
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Lettura per authenticated (le righe sono filtrate dalle policy RLS).
-- quote_counters escluso: accesso solo via funzioni security definer.
-- quotes: la SELECT è coperta da quotes_admin_all (i preventivi sono solo admin).
grant select on public.profiles, public.clients, public.rooms, public.menus,
                public.menu_items, public.bookings, public.booking_dishes,
                public.booking_allergies, public.booking_changes, public.quotes
  to authenticated;

-- Scritture dirette: solo le operazioni che le Server Actions eseguono direttamente
-- e che le policy admin_all consentono. Il resto passa dalle RPC security definer.
grant update on public.profiles to authenticated;                 -- updateOperator
grant insert, update, delete on public.clients to authenticated;  -- createClient/updateClient/deleteClient
grant insert, update on public.rooms to authenticated;            -- upsertRoom
grant update on public.menus to authenticated;                    -- deleteMenu = soft delete (active=false)
grant delete on public.bookings to authenticated;                 -- deleteBooking
grant update, delete on public.quotes to authenticated;           -- updateQuote, deleteQuote
-- Nessuna scrittura diretta su booking_dishes, booking_allergies, menu_items,
-- booking_changes, quote_counters, quotes (insert): solo RPC.

-- Funzioni eseguibili da authenticated: solo quelle chiamate dal client.
-- Helper interni (allergies_summary, dishes_summary, menu_dishes_json, log_booking_change,
-- next_quote_number, course_rank, trigger function) restano eseguibili solo dall'owner.
-- current_role() non è più esposta ai client: nessuna policy la usa (solo funzioni security definer).
revoke execute on function public.current_role() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.update_booking_covers(uuid, int, int, int) to authenticated;
grant execute on function public.save_booking_dishes(uuid, jsonb) to authenticated;
grant execute on function public.reset_booking_dishes(uuid) to authenticated;
grant execute on function public.upsert_booking(uuid, jsonb) to authenticated;
grant execute on function public.upsert_menu(uuid, jsonb) to authenticated;
grant execute on function public.create_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Seed: sale (SPEC §2)
-- ---------------------------------------------------------------------
insert into public.rooms (name, capacity, sort, active) values
  ('Terrazza', 300, 1, true),
  ('Palmento', 120, 2, true),
  ('Sala Grande', 80, 3, true),
  ('Pozzo', 60, 4, true),
  ('Sala 1', 40, 5, true),
  ('Sala 3', 35, 6, true),
  ('Sala 2', 20, 7, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 10. Seed: menù autunno (SPEC §2). Bevande comuni ai menù adulti.
-- ---------------------------------------------------------------------
insert into public.menus (id, name, season, price_per_person, is_kids, active, sort) values
  ('a0000000-0000-4000-8000-000000000001', 'Menù 1', 'Autunno', 46.00, false, true, 1),
  ('a0000000-0000-4000-8000-000000000002', 'Menù 2', 'Autunno', 40.00, false, true, 2),
  ('a0000000-0000-4000-8000-000000000003', 'Menù 3', 'Autunno', 44.00, false, true, 3),
  ('a0000000-0000-4000-8000-000000000004', 'Menù 4', 'Autunno', 50.00, false, true, 4),
  ('a0000000-0000-4000-8000-000000000005', 'Menù Bambini', 'Autunno', 20.00, true, true, 5)
on conflict (id) do nothing;

insert into public.menu_items (menu_id, course, name, sort) values
  -- Menù 1
  ('a0000000-0000-4000-8000-000000000001', 'antipasto', 'Selezione di antipasti del casale', 1),
  ('a0000000-0000-4000-8000-000000000001', 'primo', 'Caserecce di pasta fresca al guanciale di Norcia su base di pomodoro fresco', 1),
  ('a0000000-0000-4000-8000-000000000001', 'secondo', 'Fagottino di vitellina con cuore morbido alla zucca, olive nere e infuso alla salvia', 1),
  ('a0000000-0000-4000-8000-000000000001', 'secondo', 'Stinco di maiale speziato al forno', 2),
  ('a0000000-0000-4000-8000-000000000001', 'contorno', 'Patate al forno al rosmarino', 1),
  ('a0000000-0000-4000-8000-000000000001', 'bevande', 'Acqua', 1),
  ('a0000000-0000-4000-8000-000000000001', 'bevande', 'Vino Barone Montalto', 2),
  ('a0000000-0000-4000-8000-000000000001', 'bevande', 'Caffè', 3),
  ('a0000000-0000-4000-8000-000000000001', 'bevande', 'Amaro', 4),
  -- Menù 2
  ('a0000000-0000-4000-8000-000000000002', 'antipasto', 'Selezione di antipasti del casale', 1),
  ('a0000000-0000-4000-8000-000000000002', 'primo', 'Millefoglie di pasta fresca con funghi cardoncelli con emulsione di prezzemolo', 1),
  ('a0000000-0000-4000-8000-000000000002', 'secondo', 'Arrotolato di vitello ai sapori d''autunno', 1),
  ('a0000000-0000-4000-8000-000000000002', 'contorno', 'Patate al forno al rosmarino', 1),
  ('a0000000-0000-4000-8000-000000000002', 'bevande', 'Acqua', 1),
  ('a0000000-0000-4000-8000-000000000002', 'bevande', 'Vino Barone Montalto', 2),
  ('a0000000-0000-4000-8000-000000000002', 'bevande', 'Caffè', 3),
  ('a0000000-0000-4000-8000-000000000002', 'bevande', 'Amaro', 4),
  -- Menù 3
  ('a0000000-0000-4000-8000-000000000003', 'antipasto', 'Selezione di antipasti del casale', 1),
  ('a0000000-0000-4000-8000-000000000003', 'primo', 'Millefoglie di pasta fresca alla zucca e provola affumicata del Belice', 1),
  ('a0000000-0000-4000-8000-000000000003', 'secondo', 'Stracotto di vitello al frappato di Sicilia e crosta di formaggio sicano', 1),
  ('a0000000-0000-4000-8000-000000000003', 'contorno', 'Patate al forno al rosmarino', 1),
  ('a0000000-0000-4000-8000-000000000003', 'bevande', 'Acqua', 1),
  ('a0000000-0000-4000-8000-000000000003', 'bevande', 'Vino Barone Montalto', 2),
  ('a0000000-0000-4000-8000-000000000003', 'bevande', 'Caffè', 3),
  ('a0000000-0000-4000-8000-000000000003', 'bevande', 'Amaro', 4),
  -- Menù 4
  ('a0000000-0000-4000-8000-000000000004', 'antipasto', 'Selezione di antipasti del casale', 1),
  ('a0000000-0000-4000-8000-000000000004', 'primo', 'Caserecce di pasta fresca con salsiccia al ceppo, radicchio e briciole di pane al cacio ragusano', 1),
  ('a0000000-0000-4000-8000-000000000004', 'primo', 'Ravioli di pasta fresca con pistacchi e crema di bufala', 2),
  ('a0000000-0000-4000-8000-000000000004', 'secondo', 'Vitellina con cipolle rosse caramellate, chips di patate, emulsione di basilico', 1),
  ('a0000000-0000-4000-8000-000000000004', 'contorno', 'Insalatina di cavolo rosso', 1),
  ('a0000000-0000-4000-8000-000000000004', 'bevande', 'Acqua', 1),
  ('a0000000-0000-4000-8000-000000000004', 'bevande', 'Vino Barone Montalto', 2),
  ('a0000000-0000-4000-8000-000000000004', 'bevande', 'Caffè', 3),
  ('a0000000-0000-4000-8000-000000000004', 'bevande', 'Amaro', 4),
  -- Menù Bambini
  ('a0000000-0000-4000-8000-000000000005', 'primo', 'Pasta (al pomodoro, al pesto o al pistacchio)', 1),
  ('a0000000-0000-4000-8000-000000000005', 'secondo', 'Cotoletta con patatine fritte', 1);
