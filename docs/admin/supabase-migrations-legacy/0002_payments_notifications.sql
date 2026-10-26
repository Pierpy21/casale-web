-- =====================================================================
-- Agenda Digitale - Casale del Notaio
-- Migrazione 0002: stato "saldato", acconti (payments) con ricevute,
-- notifiche in-app (notifications) e sottoscrizioni push.
-- Idempotente: può essere rieseguita senza errori.
-- Nota: il nuovo valore dell'enum non viene usato in questa transazione.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuovo stato prenotazione
-- ---------------------------------------------------------------------
alter type public.booking_status add value if not exists 'saldato' after 'confermato';

-- ---------------------------------------------------------------------
-- 2. Acconti / pagamenti (visibili e gestibili solo dall'admin)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete restrict,
  amount        numeric(10,2) not null check (amount > 0),
  paid_at       date not null,
  method        text null check (method in ('contanti','bonifico','carta','assegno','altro')),
  receipt_path  text null,
  receipt_name  text null,
  receipt_type  text null,
  notes         text null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);
create index if not exists payments_booking_id_idx on public.payments(booking_id);

alter table public.payments enable row level security;

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.payments to authenticated;

-- ---------------------------------------------------------------------
-- 3. Storage: bucket privato per le ricevute
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict do nothing;

-- Policy su storage.objects: create solo se non esistono (idempotenza).
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'receipts_admin_select') then
    create policy receipts_admin_select on storage.objects
      for select to authenticated
      using (bucket_id = 'receipts' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'receipts_admin_insert') then
    create policy receipts_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'receipts' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'receipts_admin_update') then
    create policy receipts_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'receipts' and public.is_admin())
      with check (bucket_id = 'receipts' and public.is_admin());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'receipts_admin_delete') then
    create policy receipts_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'receipts' and public.is_admin());
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 4. Notifiche in-app (scritte dal server con service role)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text null,
  booking_id    uuid null references public.bookings(id) on delete set null,
  actor_id      uuid null,
  actor_name    text null,
  read_at       timestamptz null,
  created_at    timestamptz default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(recipient_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() and public.is_active());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid() and public.is_active())
  with check (recipient_id = auth.uid() and public.is_active());

-- Nessuna policy di insert per il client: le righe le crea il server.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Realtime: ignora l'errore se la tabella è già nella publication o la publication non esiste.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Sottoscrizioni push (una per dispositivo/browser)
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text null,
  created_at  timestamptz default now()
);
create index if not exists push_subscriptions_profile_id_idx on public.push_subscriptions(profile_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (profile_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- Le tabelle create qui non ereditano privilegi: i grant sopra sono espliciti.
