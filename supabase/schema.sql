-- ─────────────────────────────────────────────────────────────────────────────
-- MJAGENCY — Cockpit : schéma Supabase
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Liste blanche des personnes autorisées ──────────────────────────────────
-- Seules ces adresses email peuvent lire et écrire les données de l'agence,
-- même si quelqu'un d'autre parvient à créer un compte.
create table if not exists public.allowed_emails (
  email     text primary key,
  user_key  text not null check (user_key in ('jeremy', 'matheis')),
  added_at  timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

-- Chacun peut lire la liste blanche pour savoir qui il est dans l'app.
drop policy if exists "membres : lecture" on public.allowed_emails;
create policy "membres : lecture" on public.allowed_emails
  for select to authenticated using (true);

-- ⚠️ À FAIRE : remplacer par vos deux adresses réelles.
insert into public.allowed_emails (email, user_key) values
  ('jeremyvatuonepro@gmail.com', 'jeremy'),
  ('matheis@exemple.fr',        'matheis')
on conflict (email) do nothing;


-- 2. Table unique de données ─────────────────────────────────────────────────
-- Une ligne par enregistrement de l'app : un prospect, une tâche, un devis…
-- « collection » reprend le nom utilisé dans le code (prospects, tasks, quotes…)
-- et « data » contient l'objet complet en JSON.
create table if not exists public.records (
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id) on delete set null,
  client_id   text,
  primary key (collection, id)
);

create index if not exists records_collection_idx on public.records (collection);

alter table public.records enable row level security;

-- Fonction : l'utilisateur connecté est-il sur la liste blanche ?
create or replace function public.is_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "données : lecture membres"      on public.records;
drop policy if exists "données : écriture membres"     on public.records;
drop policy if exists "données : modification membres" on public.records;
drop policy if exists "données : suppression membres"  on public.records;

create policy "données : lecture membres" on public.records
  for select to authenticated using (public.is_member());

create policy "données : écriture membres" on public.records
  for insert to authenticated with check (public.is_member());

create policy "données : modification membres" on public.records
  for update to authenticated using (public.is_member()) with check (public.is_member());

create policy "données : suppression membres" on public.records
  for delete to authenticated using (public.is_member());


-- 3. Horodatage automatique ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();


-- 4. Temps réel ──────────────────────────────────────────────────────────────
-- Permet à Jérémy de voir bouger une carte que Matheis déplace, sans recharger.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;

alter table public.records replica identity full;
