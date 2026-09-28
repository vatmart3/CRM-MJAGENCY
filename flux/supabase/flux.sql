-- ─────────────────────────────────────────────────────────────────────────────
-- FLUX — gestion financière MJAGENCY : schéma Supabase
--
-- À exécuter une fois dans le SQL Editor du projet Supabase, APRÈS le script
-- supabase/schema.sql du cockpit (qui crée la liste blanche allowed_emails).
-- Si FLUX vit dans un projet Supabase à part, la section 0 crée cette liste.
-- Le script peut être relancé sans risque.
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Liste blanche (partagée avec le cockpit) ────────────────────────────────
create table if not exists public.allowed_emails (
  email     text primary key,
  user_key  text not null check (user_key in ('jeremy', 'matheis')),
  added_at  timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
drop policy if exists "membres : lecture" on public.allowed_emails;
create policy "membres : lecture" on public.allowed_emails for select to authenticated using (true);

-- ⚠️ Vérifier que les deux vraies adresses y figurent :
--   select * from public.allowed_emails;
-- Jérémy (user_key = 'jeremy') est administrateur de FLUX, Matheis est associé.

-- Qui est connecté ? 'jeremy', 'matheis' ou null.
create or replace function public.flux_user()
returns text language sql stable security definer set search_path = public as $$
  select user_key from public.allowed_emails
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.flux_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.flux_user() = 'jeremy', false);
$$;


-- 1. Données ─────────────────────────────────────────────────────────────────
-- Une ligne par enregistrement : client, projet, recette, dépense, catégorie,
-- abonnement, déclaration, résumé hebdo, plus deux lignes uniques (settings, stats).
create table if not exists public.flux_records (
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id) on delete set null,
  client_id   text,
  primary key (collection, id)
);
create index if not exists flux_records_collection_idx on public.flux_records (collection);
alter table public.flux_records enable row level security;

drop policy if exists "flux : lecture"        on public.flux_records;
drop policy if exists "flux : création"       on public.flux_records;
drop policy if exists "flux : modification"   on public.flux_records;

create policy "flux : lecture" on public.flux_records
  for select to authenticated using (public.flux_user() is not null);

create policy "flux : création" on public.flux_records
  for insert to authenticated with check (public.flux_user() is not null);

-- Les réglages et les catégories ne se modifient que par l'administrateur.
create policy "flux : modification" on public.flux_records
  for update to authenticated
  using (public.flux_user() is not null and (collection not in ('settings', 'categories') or public.flux_is_admin()))
  with check (public.flux_user() is not null and (collection not in ('settings', 'categories') or public.flux_is_admin()));

-- Volontairement AUCUNE règle « delete » : personne ne peut supprimer une ligne.
-- Une suppression dans FLUX est un archivage avec motif, tracé au journal.

create or replace function public.flux_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;
drop trigger if exists flux_records_touch on public.flux_records;
create trigger flux_records_touch before insert or update on public.flux_records
  for each row execute function public.flux_touch();


-- 2. Journal d'historique (traçabilité comptable) ────────────────────────────
-- Ajout seul : aucune règle de modification ni de suppression.
create table if not exists public.flux_journal (
  id          text primary key,
  at          timestamptz not null default now(),
  by_user     text not null check (by_user in ('jeremy', 'matheis')),
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  label       text not null default '',
  motif       text,
  details     text,
  client_id   text,
  recorded_at timestamptz not null default now()
);
create index if not exists flux_journal_at_idx on public.flux_journal (at desc);
alter table public.flux_journal enable row level security;

drop policy if exists "journal : lecture" on public.flux_journal;
drop policy if exists "journal : ajout"   on public.flux_journal;
create policy "journal : lecture" on public.flux_journal
  for select to authenticated using (public.flux_user() is not null);
-- Chacun n'écrit qu'en son propre nom.
create policy "journal : ajout" on public.flux_journal
  for insert to authenticated with check (by_user = public.flux_user());


-- 3. Temps réel ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flux_records') then
    alter publication supabase_realtime add table public.flux_records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flux_journal') then
    alter publication supabase_realtime add table public.flux_journal;
  end if;
end $$;
alter table public.flux_records replica identity full;


-- 4. Justificatifs (photos de tickets, PDF de factures) ──────────────────────
-- Espace privé : les fichiers ne s'ouvrent que par lien signé, pour les membres.
insert into storage.buckets (id, name, public, file_size_limit)
values ('flux-justificatifs', 'flux-justificatifs', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "justificatifs : lecture" on storage.objects;
drop policy if exists "justificatifs : dépôt"   on storage.objects;
create policy "justificatifs : lecture" on storage.objects
  for select to authenticated using (bucket_id = 'flux-justificatifs' and public.flux_user() is not null);
create policy "justificatifs : dépôt" on storage.objects
  for insert to authenticated with check (bucket_id = 'flux-justificatifs' and public.flux_user() is not null);
-- Pas de suppression ni de remplacement : une pièce déposée reste.


-- 5. Création de compte depuis l'écran de connexion ─────────────────────────
-- Une adresse de la liste blanche est confirmée d'office à l'inscription :
-- pas d'e-mail de validation à attendre. Toute autre adresse reste non
-- confirmée, ne peut pas se connecter, et ne verrait de toute façon rien.
create or replace function public.flux_autoconfirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.allowed_emails where lower(email) = lower(new.email)) then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists flux_autoconfirm on auth.users;
create trigger flux_autoconfirm before insert on auth.users
  for each row execute function public.flux_autoconfirm();


-- 6. Droits d'exécution ──────────────────────────────────────────────────────
-- Les fonctions d'aide ne sont appelables que par un utilisateur connecté
-- (les règles de sécurité en ont besoin), jamais anonymement.
revoke execute on function public.flux_autoconfirm() from public, anon, authenticated;
revoke execute on function public.flux_user() from public, anon;
revoke execute on function public.flux_is_admin() from public, anon;
grant execute on function public.flux_user() to authenticated;
grant execute on function public.flux_is_admin() to authenticated;
