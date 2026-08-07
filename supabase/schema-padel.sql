-- =============================================================================
--  Padel Match Roulette — Schema für Supabase
--  Im SQL-Editor ausführen, NACHDEM schema.sql gelaufen ist (pgcrypto wird
--  dort schon aktiviert; die Zeile hier schadet aber nicht).
--
--  Unterschied zur Mitspielerbörse: Hier legt die Verwaltung die Spiele an,
--  nicht die Spieler. Dafür braucht es eine echte Anmeldung — anon darf
--  ausschließlich lesen und über eine Funktion zusagen.
--
--  Feste Regeln, im Schema verankert:
--    * genau 4 Zusagen, dann ist das Spiel voll
--    * nur Padel, nur Geretsried (deshalb gibt es kein Ort-Feld)
--    * kein zweites Mal unter demselben Vornamen
-- =============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------- Verwaltung
-- Wer hier eingetragen ist, darf Spiele anlegen und absagen. Ein bloßes Konto
-- reicht nicht — falls jemand die Registrierung offen findet, bringt sie nichts.
create table if not exists public.padel_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notiz   text
);

-- ---------------------------------------------------------------- Spiele
create table if not exists public.padel_matches (
  id           uuid primary key default gen_random_uuid(),
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid references auth.users(id),
  beginn       timestamptz not null,
  dauer_min    smallint not null default 90 check (dauer_min between 30 and 240),
  court        text check (char_length(court) <= 40),
  info         text check (char_length(info) <= 160),
  abgesagt     boolean not null default false
);

create table if not exists public.padel_zusagen (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.padel_matches(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  vorname     text not null check (char_length(btrim(vorname)) between 2 and 40)
);

-- Kein zweites Mal unter demselben Vornamen beim selben Spiel.
create unique index if not exists padel_zusagen_eindeutig
  on public.padel_zusagen (match_id, lower(btrim(vorname)));

-- Kontakt und Rückzieh-Token getrennt: anon hat auf diese Tabelle keinerlei
-- Recht, und sie steht nicht in der Realtime-Publikation. So kann beides
-- weder über die REST-Schnittstelle noch über einen Live-Datensatz abfließen.
create table if not exists public.padel_zusage_privat (
  zusage_id uuid primary key references public.padel_zusagen(id) on delete cascade,
  kontakt   text not null,
  token     uuid not null
);

create index if not exists padel_matches_beginn_idx on public.padel_matches (beginn);
create index if not exists padel_zusagen_match_idx  on public.padel_zusagen (match_id);
create index if not exists padel_privat_token_idx   on public.padel_zusage_privat (token);

-- ---------------------------------------------------------------- Rechte
revoke all on public.padel_matches       from anon, authenticated;
revoke all on public.padel_zusagen       from anon, authenticated;
revoke all on public.padel_zusage_privat from anon, authenticated;
revoke all on public.padel_admins        from anon, authenticated;

grant select on public.padel_matches to anon, authenticated;
grant select on public.padel_zusagen to anon, authenticated;
grant insert, update on public.padel_matches to authenticated;   -- gefiltert per Policy
grant select on public.padel_zusage_privat to authenticated;     -- gefiltert per Policy

alter table public.padel_matches       enable row level security;
alter table public.padel_zusagen       enable row level security;
alter table public.padel_zusage_privat enable row level security;
alter table public.padel_admins        enable row level security;

create or replace function public.ist_padel_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from padel_admins where user_id = auth.uid());
$$;
grant execute on function public.ist_padel_admin() to authenticated;

-- Sichtbar: alles, was nicht abgesagt ist und höchstens zwei Tage zurückliegt.
-- Die zwei Tage, damit die Liste „abgelaufen" noch anzeigen kann.
drop policy if exists "padel matches lesen" on public.padel_matches;
create policy "padel matches lesen" on public.padel_matches
  for select to anon, authenticated
  using (abgesagt = false and beginn > now() - interval '2 days');

drop policy if exists "padel matches anlegen" on public.padel_matches;
create policy "padel matches anlegen" on public.padel_matches
  for insert to authenticated with check (public.ist_padel_admin());

drop policy if exists "padel matches pflegen" on public.padel_matches;
create policy "padel matches pflegen" on public.padel_matches
  for update to authenticated using (public.ist_padel_admin()) with check (public.ist_padel_admin());

drop policy if exists "padel zusagen lesen" on public.padel_zusagen;
create policy "padel zusagen lesen" on public.padel_zusagen
  for select to anon, authenticated
  using (exists (select 1 from public.padel_matches m
                 where m.id = match_id and m.abgesagt = false
                   and m.beginn > now() - interval '2 days'));

-- Kontaktdaten sieht ausschließlich die Verwaltung.
drop policy if exists "padel kontakte lesen" on public.padel_zusage_privat;
create policy "padel kontakte lesen" on public.padel_zusage_privat
  for select to authenticated using (public.ist_padel_admin());

-- padel_admins bekommt bewusst gar keine Policy: bei aktivem RLS ist die
-- Tabelle damit für niemanden lesbar außer über die Funktion oben.

-- ------------------------------------------------------- Zusagen per RPC
create or replace function public.padel_zusagen_zahl(p_match uuid)
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::int from padel_zusagen where match_id = p_match;
$$;

create or replace function public.padel_beitreten(
  p_match uuid, p_vorname text, p_kontakt text, p_token uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare m record; neue uuid;
begin
  select * into m from padel_matches where id = p_match;
  if m is null or m.abgesagt then
    raise exception 'WEG';
  end if;
  if m.beginn < now() then
    raise exception 'VORBEI';
  end if;
  if padel_zusagen_zahl(p_match) >= 4 then
    raise exception 'VOLL';
  end if;

  begin
    insert into padel_zusagen (match_id, vorname)
    values (p_match, btrim(p_vorname))
    returning id into neue;
  exception when unique_violation then
    raise exception 'DOPPELT';
  end;

  insert into padel_zusage_privat (zusage_id, kontakt, token)
  values (neue, btrim(p_kontakt), p_token);
  return neue;
end $$;

create or replace function public.padel_zurueckziehen(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from padel_zusagen
   where id = (select zusage_id from padel_zusage_privat where token = p_token);
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.padel_beitreten(uuid,text,text,uuid) from public;
revoke all on function public.padel_zurueckziehen(uuid) from public;
revoke all on function public.padel_zusagen_zahl(uuid) from public;
grant execute on function public.padel_beitreten(uuid,text,text,uuid) to anon, authenticated;
grant execute on function public.padel_zurueckziehen(uuid) to anon, authenticated;

-- ------------------------------------------------------------- Realtime
-- Nur die beiden öffentlichen Tabellen. padel_zusage_privat bleibt draußen,
-- sonst gingen Kontaktdaten und Token als Live-Datensatz an alle Zuhörer.
alter publication supabase_realtime add table public.padel_matches;
alter publication supabase_realtime add table public.padel_zusagen;

-- ============================================================================
--  NACH DEM AUSFÜHREN:
--  1. Authentication → Users → „Add user" → E-Mail und Passwort vergeben.
--     Kein Registrierungsformular auf der Website — Konten legt ihr hier an.
--  2. Die user_id dieses Kontos kopieren und freischalten:
--        insert into public.padel_admins (user_id, notiz)
--        values ('HIER-DIE-UUID', 'Chris');
--  3. Empfohlen: Authentication → Providers → Email → „Allow new users to sign
--     up" abschalten. Dann kann sich niemand selbst ein Konto anlegen.
-- ============================================================================
