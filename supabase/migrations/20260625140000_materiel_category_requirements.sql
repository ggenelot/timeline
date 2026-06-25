-- Typage du matériel : un besoin de mission réclame désormais une catégorie
-- (type de matériel, ex. "Ambulance") plutôt qu'un contenant précis. Un
-- gestionnaire affecte ensuite un contenant précis disponible à ce besoin
-- (mission_materiel_assignments), exactement comme on affecte un bénévole à
-- un besoin en compétence. La checklist de vérification (PR #364) se génère
-- désormais à l'affectation du contenant, pas à la déclaration du besoin.

-- Pas de données réelles en jeu (PR #364 non mergée) : on vide plutôt que de
-- backfiller une structure de données de test.
truncate table mission_materiel_check_history cascade;
truncate table mission_materiel_checks cascade;
truncate table mission_required_materiels cascade;
truncate table mission_type_required_materiels cascade;

-- ── 1. mission_required_materiels / mission_type_required_materiels : repointage catégorie ──

drop trigger if exists mission_required_materiels_generate_checks on mission_required_materiels;

alter table mission_required_materiels drop constraint mission_required_materiels_materiel_type_id_fkey;
alter table mission_required_materiels rename column materiel_type_id to category_id;
alter table mission_required_materiels
  add constraint mission_required_materiels_category_id_fkey
  foreign key (category_id) references materiel_categories(id) on delete cascade;

alter table mission_required_materiels rename constraint mission_required_materiels_mission_type_key to mission_required_materiels_mission_category_key;

drop policy if exists "mission_required_materiels_write_admin" on mission_required_materiels;
create policy "mission_required_materiels_write_manager"
  on mission_required_materiels for all
  using (can_manage_mission(mission_required_materiels.mission_id, auth.uid()))
  with check (can_manage_mission(mission_required_materiels.mission_id, auth.uid()));

alter table mission_type_required_materiels drop constraint mission_type_required_materiels_materiel_type_id_fkey;
alter table mission_type_required_materiels rename column materiel_type_id to category_id;
alter table mission_type_required_materiels
  add constraint mission_type_required_materiels_category_id_fkey
  foreign key (category_id) references materiel_categories(id) on delete cascade;

alter table mission_type_required_materiels rename constraint mission_type_required_materiels_type_key to mission_type_required_materiels_category_key;

drop policy if exists "mission_type_required_materiels_admin" on mission_type_required_materiels;
create policy "mission_type_required_materiels_admin"
  on mission_type_required_materiels for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ── 2. mission_materiel_assignments : affectation d'un contenant précis à un besoin ──

create table mission_materiel_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_required_materiel_id uuid not null references mission_required_materiels(id) on delete cascade,
  materiel_type_id uuid not null references materiel_types(id) on delete restrict,
  assigned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mission_materiel_assignments_requirement_container_key unique (mission_required_materiel_id, materiel_type_id)
);

create index idx_mission_materiel_assignments_requirement on mission_materiel_assignments(mission_required_materiel_id);
create index idx_mission_materiel_assignments_type on mission_materiel_assignments(materiel_type_id);

-- Refuse une affectation au-delà de la quantité réclamée par le besoin.
create or replace function public.enforce_materiel_assignment_quantity()
returns trigger as $$
declare
  requirement_quantity integer;
  assigned_count integer;
begin
  select quantity into requirement_quantity
  from mission_required_materiels
  where id = new.mission_required_materiel_id;

  select count(*) into assigned_count
  from mission_materiel_assignments
  where mission_required_materiel_id = new.mission_required_materiel_id
    and id is distinct from new.id;

  if assigned_count >= requirement_quantity then
    raise exception 'quantity already fully assigned for this requirement';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger mission_materiel_assignments_enforce_quantity
  before insert on mission_materiel_assignments
  for each row
  execute function enforce_materiel_assignment_quantity();

-- Le contenant affecté doit être un contenant racine (jamais imbriqué dans un
-- autre contenant) de la même catégorie que le besoin — reprend la
-- restriction "contenants de plus haut niveau" précédemment appliquée côté
-- besoin (commit a5b39e9), désormais appliquée côté affectation.
create or replace function public.enforce_materiel_assignment_container()
returns trigger as $$
declare
  requirement_category_id uuid;
  container_category_id uuid;
  container_is_container boolean;
begin
  select category_id into requirement_category_id
  from mission_required_materiels
  where id = new.mission_required_materiel_id;

  select category_id, is_container into container_category_id, container_is_container
  from materiel_types
  where id = new.materiel_type_id;

  if container_is_container is not true then
    raise exception 'materiel_type_id must reference a container type (is_container = true)';
  end if;

  if container_category_id is null or container_category_id is distinct from requirement_category_id then
    raise exception 'materiel_type_id must belong to the same category as the requirement';
  end if;

  if exists (select 1 from materiel_type_contents where child_type_id = new.materiel_type_id) then
    raise exception 'materiel_type_id must be a top-level container (not nested in another container)';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger mission_materiel_assignments_enforce_container
  before insert or update on mission_materiel_assignments
  for each row
  execute function enforce_materiel_assignment_container();

alter table mission_materiel_assignments enable row level security;

create policy "mission_materiel_assignments_select_strict"
  on mission_materiel_assignments for select
  using (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_assignments.mission_required_materiel_id
        and can_read_mission(mrm.mission_id, auth.uid())
    )
  );

create policy "mission_materiel_assignments_write_manager"
  on mission_materiel_assignments for all
  using (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_assignments.mission_required_materiel_id
        and can_manage_mission(mrm.mission_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_assignments.mission_required_materiel_id
        and can_manage_mission(mrm.mission_id, auth.uid())
    )
  );

-- ── 3. mission_materiel_checks / mission_materiel_check_history : repointage affectation ──

alter table mission_materiel_checks drop constraint mission_materiel_checks_mission_required_materiel_id_fkey;
alter table mission_materiel_checks rename column mission_required_materiel_id to mission_materiel_assignment_id;
alter table mission_materiel_checks
  add constraint mission_materiel_checks_assignment_id_fkey
  foreign key (mission_materiel_assignment_id) references mission_materiel_assignments(id) on delete cascade;
alter table mission_materiel_checks rename constraint mission_materiel_checks_required_materiel_item_key to mission_materiel_checks_assignment_item_key;

alter index idx_mission_materiel_checks_required_materiel rename to idx_mission_materiel_checks_assignment;

alter table mission_materiel_check_history drop constraint mission_materiel_check_histor_mission_required_materiel_id_fkey;
alter table mission_materiel_check_history rename column mission_required_materiel_id to mission_materiel_assignment_id;
alter table mission_materiel_check_history
  add constraint mission_materiel_check_history_assignment_id_fkey
  foreign key (mission_materiel_assignment_id) references mission_materiel_assignments(id) on delete cascade;

alter index idx_mission_materiel_check_history_required_materiel rename to idx_mission_materiel_check_history_assignment;

-- Le trigger de génération se déclenche désormais à l'affectation d'un
-- contenant précis, et non plus à la déclaration du besoin abstrait.
create or replace function public.generate_mission_materiel_checks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    delete from mission_materiel_checks where mission_materiel_assignment_id = new.id;
  end if;

  insert into mission_materiel_checks (mission_materiel_assignment_id, item_type_id, expected_quantity)
  select new.id, r.item_type_id, r.quantity
  from resolve_materiel_container_items(new.materiel_type_id) r;

  return new;
end;
$$;

create trigger mission_materiel_assignments_generate_checks
  after insert or update of materiel_type_id on mission_materiel_assignments
  for each row
  execute function generate_mission_materiel_checks();

drop policy if exists "mission_materiel_checks_select_strict" on mission_materiel_checks;
create policy "mission_materiel_checks_select_strict"
  on mission_materiel_checks for select
  using (
    exists (
      select 1 from mission_materiel_assignments mma
      join mission_required_materiels mrm on mrm.id = mma.mission_required_materiel_id
      where mma.id = mission_materiel_checks.mission_materiel_assignment_id
        and can_read_mission(mrm.mission_id, auth.uid())
    )
  );

drop policy if exists "mission_materiel_checks_update_assigned_or_manager" on mission_materiel_checks;
create policy "mission_materiel_checks_update_assigned_or_manager"
  on mission_materiel_checks for update
  using (
    exists (
      select 1 from mission_materiel_assignments mma
      join mission_required_materiels mrm on mrm.id = mma.mission_required_materiel_id
      where mma.id = mission_materiel_checks.mission_materiel_assignment_id
        and (
          can_manage_mission(mrm.mission_id, auth.uid())
          or exists (
            select 1 from mission_assignments ma
            where ma.mission_id = mrm.mission_id
              and ma.volunteer_id = auth.uid()
              and ma.assignment_status in ('selected', 'confirmed')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from mission_materiel_assignments mma
      join mission_required_materiels mrm on mrm.id = mma.mission_required_materiel_id
      where mma.id = mission_materiel_checks.mission_materiel_assignment_id
        and (
          can_manage_mission(mrm.mission_id, auth.uid())
          or exists (
            select 1 from mission_assignments ma
            where ma.mission_id = mrm.mission_id
              and ma.volunteer_id = auth.uid()
              and ma.assignment_status in ('selected', 'confirmed')
          )
        )
    )
  );

drop policy if exists "mission_materiel_check_history_select_strict" on mission_materiel_check_history;
create policy "mission_materiel_check_history_select_strict"
  on mission_materiel_check_history for select
  using (
    exists (
      select 1 from mission_materiel_assignments mma
      join mission_required_materiels mrm on mrm.id = mma.mission_required_materiel_id
      where mma.id = mission_materiel_check_history.mission_materiel_assignment_id
        and can_read_mission(mrm.mission_id, auth.uid())
    )
  );
