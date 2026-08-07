-- =============================================================================
--  Mitspielerbörse — Schema für Supabase
--  Einmal komplett im SQL-Editor des Projekts ausführen.
--
--  Leitgedanke: Der öffentliche anon-Schlüssel steht im Quelltext der Website
--  und ist damit jedem zugänglich. Alles, was anon lesen darf, ist öffentlich.
--  Deshalb:
--    * anon darf NICHTS direkt schreiben. Schreiben läuft ausschließlich über
--      drei Funktionen, die vorher prüfen.
--    * Der Verwaltungs-Token liegt in einer eigenen Tabelle, auf die anon
--      keinerlei Rechte hat. So kann er auch über Realtime nicht abfließen.
--    * Wer beitritt, gibt nur einen Vornamen an — keine Kontaktdaten.
--      Erreichbar ist der Ersteller, und der hat das bewusst so gewählt.
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------- Tabellen
create table if not exists public.spiele (
  id               uuid primary key default gen_random_uuid(),
  erstellt_am      timestamptz not null default now(),
  sport            text     not null check (sport in ('tennis','padel','pickleball','soccer','golf')),
  ort              text     not null check (ort   in ('geretsried','wolfratshausen','egal')),
  beginn           timestamptz not null,
  ende             timestamptz not null,
  niveau           text     not null default 'offen'
                     check (niveau in ('offen','anfaenger','mittel','fortgeschritten')),
  plaetze_gesucht  smallint not null check (plaetze_gesucht between 1 and 3),
  vorname          text     not null check (char_length(btrim(vorname)) between 2 and 40),
  -- Bewusst öffentlich: ohne Kontakt kann niemand zusagen. Das Formular weist
  -- unmissverständlich darauf hin, und es ist eine freie Entscheidung.
  kontakt          text     not null check (char_length(btrim(kontakt)) between 5 and 80),
  notiz            text              check (char_length(notiz) <= 200),
  storniert        boolean  not null default false,
  constraint zeitfenster check (ende > beginn and ende <= beginn + interval '12 hours')
);

create table if not exists public.teilnahmen (
  id          uuid primary key default gen_random_uuid(),
  spiel_id    uuid not null references public.spiele(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  vorname     text not null check (char_length(btrim(vorname)) between 2 and 40)
);

-- Eigene Tabelle, damit der Token weder über die REST-Schnittstelle noch
-- über Realtime jemals im Klartext beim Browser landet.
create table if not exists public.spiel_tokens (
  spiel_id uuid primary key references public.spiele(id) on delete cascade,
  token    uuid not null
);

create index if not exists spiele_ende_idx        on public.spiele (ende);
create index if not exists teilnahmen_spiel_idx   on public.teilnahmen (spiel_id);
create index if not exists spiel_tokens_token_idx on public.spiel_tokens (token);

-- ----------------------------------------------------------- Rechte: lesen
-- Supabase vergibt auf neue Tabellen großzügige Standardrechte. Erst alles
-- zurücknehmen, dann gezielt nur das Nötige geben.
revoke all on public.spiele        from anon, authenticated;
revoke all on public.teilnahmen    from anon, authenticated;
revoke all on public.spiel_tokens  from anon, authenticated;

grant select on public.spiele     to anon;
grant select on public.teilnahmen to anon;
-- spiel_tokens: absichtlich kein einziges Recht für anon.

alter table public.spiele       enable row level security;
alter table public.teilnahmen   enable row level security;
alter table public.spiel_tokens enable row level security;

-- Sichtbar ist nur, was offen und noch nicht vorbei ist.
drop policy if exists "offene spiele lesen" on public.spiele;
create policy "offene spiele lesen" on public.spiele
  for select to anon
  using (storniert = false and ende > now());

drop policy if exists "zusagen lesen" on public.teilnahmen;
create policy "zusagen lesen" on public.teilnahmen
  for select to anon
  using (exists (select 1 from public.spiele s
                 where s.id = spiel_id and s.storniert = false and s.ende > now()));

-- Für spiel_tokens gibt es bewusst keine Policy: ohne Policy ist bei
-- aktivem RLS nichts lesbar. Die Funktionen unten laufen als security definer
-- und umgehen das kontrolliert.

-- --------------------------------------------------------- Hilfsfunktionen
create or replace function public.plaetze_frei(p_spiel uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from spiele s
    where s.id = p_spiel
      and s.storniert = false
      and s.ende > now()
      and (select count(*) from teilnahmen t where t.spiel_id = s.id) < s.plaetze_gesucht
  );
$$;

-- ------------------------------------------------------- Schreiben per RPC
-- Spiel anlegen. Den Token erzeugt der Browser (crypto.randomUUID) und behält
-- ihn — er wird hier nur abgelegt, nie zurückgegeben.
create or replace function public.spiel_anlegen(
  p_sport   text, p_ort text, p_beginn timestamptz, p_ende timestamptz,
  p_niveau  text, p_plaetze smallint, p_vorname text, p_kontakt text,
  p_notiz   text, p_token uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare neue_id uuid;
begin
  if p_beginn < now() - interval '1 hour' then
    raise exception 'ZEIT_VERGANGEN';
  end if;
  if p_beginn > now() + interval '21 days' then
    raise exception 'ZEIT_ZU_WEIT';
  end if;
  -- Grobe Bremse gegen Spam. Ohne Anmeldung ist mehr nicht möglich —
  -- wer will, umgeht sie durch einen anderen Vornamen. Siehe README.
  if (select count(*) from spiele
      where lower(btrim(vorname)) = lower(btrim(p_vorname))
        and erstellt_am > now() - interval '1 hour') >= 3 then
    raise exception 'ZU_VIELE';
  end if;

  insert into spiele (sport, ort, beginn, ende, niveau, plaetze_gesucht,
                      vorname, kontakt, notiz)
  values (p_sport, p_ort, p_beginn, p_ende, p_niveau, p_plaetze,
          btrim(p_vorname), btrim(p_kontakt), nullif(btrim(coalesce(p_notiz,'')), ''))
  returning id into neue_id;

  insert into spiel_tokens (spiel_id, token) values (neue_id, p_token);
  return neue_id;
end $$;

create or replace function public.spiel_beitreten(p_spiel uuid, p_vorname text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not plaetze_frei(p_spiel) then
    raise exception 'BELEGT';
  end if;
  if (select count(*) from teilnahmen
      where spiel_id = p_spiel
        and lower(btrim(vorname)) = lower(btrim(p_vorname))) > 0 then
    raise exception 'DOPPELT';
  end if;
  insert into teilnahmen (spiel_id, vorname) values (p_spiel, btrim(p_vorname));
  return true;
end $$;

create or replace function public.spiel_absagen(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update spiele set storniert = true
   where id = (select spiel_id from spiel_tokens where token = p_token)
     and storniert = false;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.spiel_anlegen(text,text,timestamptz,timestamptz,text,smallint,text,text,text,uuid) from public;
revoke all on function public.spiel_beitreten(uuid,text) from public;
revoke all on function public.spiel_absagen(uuid) from public;
revoke all on function public.plaetze_frei(uuid) from public;

grant execute on function public.spiel_anlegen(text,text,timestamptz,timestamptz,text,smallint,text,text,text,uuid) to anon;
grant execute on function public.spiel_beitreten(uuid,text) to anon;
grant execute on function public.spiel_absagen(uuid) to anon;

-- ------------------------------------------------------------- Realtime
alter publication supabase_realtime add table public.spiele;
alter publication supabase_realtime add table public.teilnahmen;

-- ------------------------------------------------------------- Aufräumen
-- Die Website blendet abgelaufene Einträge ohnehin aus. Damit die Tabelle
-- nicht endlos wächst, löscht dieser Auftrag alles, was zwei Tage vorbei ist.
-- pg_cron ist im Supabase-Dashboard unter Database → Extensions zu aktivieren.
-- create extension if not exists pg_cron;
-- select cron.schedule('spiele-aufraeumen', '17 4 * * *',
--   $$delete from public.spiele where ende < now() - interval '2 days'$$);
