-- Fondation de la refonte des rôles (phase 0) :
--   1. roles.is_system : l'administration devient un rôle dynamique protégé
--      (unique, non supprimable, sans lignes de comportements — ses droits
--      sont implicites via is_admin()/has_permission()).
--   2. Backfill : chaque profiles.role = 'admin' devient membre du rôle
--      système (assert bloquant si le backfill est incomplet).
--   3. is_admin() + has_permission() : LA fonction de vérification unique que
--      les policies RLS, les routes API et l'UI utiliseront domaine par
--      domaine dans les phases suivantes. can_manage implique can_see.
--   4. Contrainte actions par ressource : hors mission, seuls
--      can_see/can_create/can_manage sont valides et les scopes
--      mission_type_ids/mission_statuses restent vides.
--   5. Garde-fous anti-verrouillage (triggers, actifs aussi pour le client
--      service-role qui bypasse la RLS).
--
-- Aucune policy RLS n'est modifiée ici : membre du rôle système ≡
-- profiles.role = 'admin' après backfill, les deux systèmes coïncident.

-- ============================================================
-- 1. Rôle système
-- ============================================================

alter table public.roles
  add column if not exists is_system boolean not null default false;

create unique index if not exists roles_single_system_idx
  on public.roles (is_system)
  where is_system = true;

-- ============================================================
-- 2. Seed + backfill + assert
-- ============================================================

do $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where is_system limit 1;

  if v_role_id is null then
    -- Réutilise un éventuel rôle « Administrateur » existant plutôt que d'en
    -- créer un doublon.
    select id into v_role_id from public.roles where name = 'Administrateur' limit 1;

    if v_role_id is null then
      insert into public.roles (name, description, is_system, is_default)
      values (
        'Administrateur',
        'Rôle système : accès complet à toutes les ressources. Non supprimable, '
        'sans comportements configurables (droits implicites).',
        true,
        false
      )
      returning id into v_role_id;
    else
      update public.roles set is_system = true where id = v_role_id;
    end if;
  end if;

  -- Le rôle système n'a pas de lignes de comportements : ses droits sont
  -- implicites (voir has_permission). Purge d'éventuels restes.
  delete from public.role_behaviors where role_id = v_role_id;

  insert into public.profile_roles (profile_id, role_id)
  select p.id, v_role_id
  from public.profiles p
  where p.role = 'admin'
  on conflict (profile_id, role_id) do nothing;

  if exists (
    select 1
    from public.profiles p
    where p.role = 'admin'
      and not exists (
        select 1 from public.profile_roles pr
        where pr.profile_id = p.id and pr.role_id = v_role_id
      )
  ) then
    raise exception 'Backfill incomplet : des comptes admin ne sont pas membres du rôle système.';
  end if;
end $$;

-- ============================================================
-- 3. Fonctions de vérification
-- ============================================================

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = _user_id
      and r.is_system
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- Vérification générique « ressource × action », insensible au scoping
-- mission (type/statut) : pour les décisions par ligne sur les missions,
-- can_read_mission / can_manage_mission restent les points d'entrée.
-- can_manage satisfait can_see (gérer sans lire serait incohérent).
create or replace function public.has_permission(
  _user_id uuid,
  _resource public.role_behavior_resource_type,
  _action public.role_behavior_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(_user_id)
    or exists (
      select 1
      from public.profile_roles pr
      join public.role_behaviors rb on rb.role_id = pr.role_id
      where pr.profile_id = _user_id
        and rb.resource_type = _resource
        and (
          rb.behavior_type = _action
          or (_action = 'can_see' and rb.behavior_type = 'can_manage')
        )
    );
$$;

revoke all on function public.has_permission(uuid, public.role_behavior_resource_type, public.role_behavior_type) from public;
grant execute on function public.has_permission(uuid, public.role_behavior_resource_type, public.role_behavior_type) to authenticated, service_role;

-- ============================================================
-- 4. Actions valides par ressource
-- ============================================================

-- Hors mission : seulement les 3 actions génériques, scopes vides.
-- required_for_visibility / auto_slack et les scopes type/statut restent
-- réservés aux missions.

-- Normalise d'éventuelles lignes historiques avant de poser la contrainte.
update public.role_behaviors
set mission_type_ids = '{}', mission_statuses = '{}'
where resource_type <> 'mission'
  and (mission_type_ids <> '{}' or mission_statuses <> '{}');

alter table public.role_behaviors
  drop constraint if exists role_behaviors_cursus_behavior_check;

alter table public.role_behaviors
  add constraint role_behaviors_action_per_resource_check check (
    resource_type = 'mission'
    or (
      behavior_type in ('can_see', 'can_create', 'can_manage')
      and mission_type_ids = '{}'
      and mission_statuses = '{}'
    )
  );

-- ============================================================
-- 5. Garde-fous anti-verrouillage
-- ============================================================

-- (a) roles : le rôle système est non supprimable et figé (seule la
-- description est modifiable) ; interdiction d'en promouvoir un second en
-- dehors des migrations.
create or replace function public.guard_roles_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Le rôle système ne peut pas être supprimé.';
    end if;
    return old;
  end if;

  if old.is_system then
    if new.name is distinct from old.name
       or new.is_system is distinct from old.is_system
       or new.is_default is distinct from old.is_default then
      raise exception 'Le rôle système ne peut pas être modifié (seule la description est éditable).';
    end if;
  elsif new.is_system then
    raise exception 'Impossible de promouvoir un rôle en rôle système.';
  end if;

  return new;
end;
$$;

drop trigger if exists roles_guard_system on public.roles;
create trigger roles_guard_system
  before update or delete on public.roles
  for each row execute function public.guard_roles_system();

-- (b) profile_roles : refuse de retirer le dernier membre du rôle système
-- (anti-verrouillage). Sur une suppression en masse, le dernier rang lève
-- l'exception et annule toute l'instruction.
create or replace function public.guard_profile_roles_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_system boolean;
  v_members integer;
begin
  -- Seuls comptent les retraits effectifs du rôle système.
  if tg_op = 'UPDATE'
     and new.role_id = old.role_id
     and new.profile_id = old.profile_id then
    return new;
  end if;

  select r.is_system into v_is_system from public.roles r where r.id = old.role_id;
  if coalesce(v_is_system, false) then
    select count(*) into v_members from public.profile_roles where role_id = old.role_id;
    if v_members <= 1 then
      raise exception 'Impossible de retirer le dernier administrateur.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_roles_guard_system on public.profile_roles;
create trigger profile_roles_guard_system
  before update or delete on public.profile_roles
  for each row execute function public.guard_profile_roles_system();

-- (c) role_behaviors : le rôle système n'a jamais de lignes de comportements
-- (droits implicites — des lignes seraient du poids mort et une surface de
-- manipulation).
create or replace function public.guard_role_behaviors_system()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_system boolean;
begin
  select r.is_system into v_is_system from public.roles r where r.id = new.role_id;
  if coalesce(v_is_system, false) then
    raise exception 'Le rôle système a tous les droits : il ne porte pas de comportements.';
  end if;
  return new;
end;
$$;

drop trigger if exists role_behaviors_guard_system on public.role_behaviors;
create trigger role_behaviors_guard_system
  before insert or update on public.role_behaviors
  for each row execute function public.guard_role_behaviors_system();

-- ============================================================
-- 6. Synchronisation transitoire profiles.role = 'admin' ⇄ rôle système
-- ============================================================
-- Tant que la colonne legacy profiles.role existe (elle sera supprimée en
-- dernière phase), les deux systèmes doivent rester équivalents : un admin
-- créé via l'écran Bénévoles (profiles.role) ou via l'écran Rôles
-- (profile_roles) doit être admin des deux côtés. À supprimer avec la colonne.

create or replace function public.sync_profile_role_to_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where is_system limit 1;
  if v_role_id is null then
    return new;
  end if;

  if new.role = 'admin' then
    insert into public.profile_roles (profile_id, role_id)
    values (new.id, v_role_id)
    on conflict (profile_id, role_id) do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'admin' then
    -- Peut lever « Impossible de retirer le dernier administrateur. » — c'est
    -- voulu : on ne rétrograde pas le dernier admin.
    delete from public.profile_roles where profile_id = new.id and role_id = v_role_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_admin_membership on public.profiles;
create trigger profiles_sync_admin_membership
  after insert or update of role on public.profiles
  for each row execute function public.sync_profile_role_to_membership();

create or replace function public.sync_membership_to_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.roles r where r.id = new.role_id and r.is_system) then
      update public.profiles set role = 'admin' where id = new.profile_id and role <> 'admin';
    end if;
    return new;
  end if;

  if exists (select 1 from public.roles r where r.id = old.role_id and r.is_system) then
    update public.profiles set role = 'benevole' where id = old.profile_id and role = 'admin';
  end if;
  return old;
end;
$$;

drop trigger if exists profile_roles_sync_profile_role on public.profile_roles;
create trigger profile_roles_sync_profile_role
  after insert or delete on public.profile_roles
  for each row execute function public.sync_membership_to_profile_role();

comment on column public.roles.is_system is
  'Rôle système « Administrateur » : unique, non supprimable, membres protégés '
  '(jamais 0), sans lignes role_behaviors — ses droits sont implicites via '
  'public.is_admin() / public.has_permission().';
