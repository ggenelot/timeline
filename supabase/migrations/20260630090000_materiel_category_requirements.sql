-- Typage du matériel : un besoin de mission réclame désormais une catégorie
-- (type de matériel, ex. "VPS") plutôt qu'un contenant précis. Un
-- gestionnaire affecte ensuite un contenant précis du catalogue à ce besoin
-- (mission_materiel_assignments), exactement comme on affecte un bénévole à
-- un besoin en compétence. La vérification assistée (déjà en production)
-- pointe désormais sur l'affectation plutôt que sur une paire
-- (besoin, occurrence) : chaque affectation est par construction une
-- occurrence distincte, donc occurrence_index n'a plus lieu d'être.

-- ── 1. Backfill : convertir chaque besoin existant en (catégorie + affectation) ──
-- avant de modifier le schéma, le temps de lire encore materiel_type_id.

-- original_requirement_id reste figé sur le besoin d'origine (avant fusion des
-- doublons en 1bis) pour pouvoir encore retrouver, en 4, l'affectation exacte
-- qu'un pointage de vérification existant doit désormais cibler ; requirement_id
-- lui est mis à jour vers le besoin conservé et sert au backfill des affectations.
create table _materiel_requirements_backfill as
select id as requirement_id, id as original_requirement_id, materiel_type_id, quantity
from mission_required_materiels;

create table _materiel_type_requirements_backfill as
select id as requirement_id, materiel_type_id, quantity
from mission_type_required_materiels;

-- ── 1bis. Fusion des besoins existants qui partageraient la future catégorie ──
-- La nouvelle contrainte unique (mission_id, category_id) interdirait deux besoins
-- d'une même mission pointant vers des contenants différents d'une même catégorie :
-- on les fusionne en un seul besoin (quantité cumulée), en reportant dans le
-- backfill l'affectation de chaque contenant fusionné sur le besoin conservé pour
-- ne perdre aucun matériel déjà engagé. Même logique pour les gabarits de mission
-- (mission_type_required_materiels), sans report d'affectation puisqu'ils n'en ont pas.

with duplicate_groups as (
  select
    mrm.mission_id,
    mt.category_id,
    (array_agg(mrm.id order by mrm.created_at, mrm.id))[1] as keep_id,
    sum(mrm.quantity) as total_quantity
  from mission_required_materiels mrm
  join materiel_types mt on mt.id = mrm.materiel_type_id
  group by mrm.mission_id, mt.category_id
  having count(*) > 1
),
merge_map as (
  select mrm.id as drop_id, dg.keep_id, dg.total_quantity
  from mission_required_materiels mrm
  join materiel_types mt on mt.id = mrm.materiel_type_id
  join duplicate_groups dg
    on dg.mission_id = mrm.mission_id and dg.category_id = mt.category_id
  where mrm.id <> dg.keep_id
)
update mission_required_materiels mrm
set quantity = mm.total_quantity
from merge_map mm
where mrm.id = mm.keep_id;

update _materiel_requirements_backfill b
set requirement_id = mm.keep_id
from merge_map mm
where b.requirement_id = mm.drop_id;

delete from mission_required_materiels mrm
using merge_map mm
where mrm.id = mm.drop_id;

with duplicate_type_groups as (
  select
    mtrm.mission_type_id,
    mt.category_id,
    (array_agg(mtrm.id order by mtrm.created_at, mtrm.id))[1] as keep_id,
    sum(mtrm.quantity) as total_quantity
  from mission_type_required_materiels mtrm
  join materiel_types mt on mt.id = mtrm.materiel_type_id
  group by mtrm.mission_type_id, mt.category_id
  having count(*) > 1
),
merge_type_map as (
  select mtrm.id as drop_id, dg.keep_id, dg.total_quantity
  from mission_type_required_materiels mtrm
  join materiel_types mt on mt.id = mtrm.materiel_type_id
  join duplicate_type_groups dg
    on dg.mission_type_id = mtrm.mission_type_id and dg.category_id = mt.category_id
  where mtrm.id <> dg.keep_id
)
update mission_type_required_materiels mtrm
set quantity = mm.total_quantity
from merge_type_map mm
where mtrm.id = mm.keep_id;

delete from mission_type_required_materiels mtrm
using merge_type_map mm
where mtrm.id = mm.drop_id;

-- ── 2. mission_required_materiels / mission_type_required_materiels : repointage catégorie ──

alter table mission_required_materiels drop constraint mission_required_materiels_materiel_type_id_fkey;
alter table mission_required_materiels rename column materiel_type_id to category_id;
alter table mission_required_materiels rename constraint mission_required_materiels_mission_type_key to mission_required_materiels_mission_category_key;

update mission_required_materiels mrm
set category_id = b.materiel_type_id
from _materiel_requirements_backfill b
where b.requirement_id = mrm.id;

update mission_required_materiels mrm
set category_id = mt.category_id
from _materiel_requirements_backfill b
join materiel_types mt on mt.id = b.materiel_type_id
where b.requirement_id = mrm.id;

-- "restrict" plutôt que "cascade" : supprimer une catégorie encore utilisée par
-- un besoin de mission ne doit pas effacer silencieusement ce besoin (et, en
-- cascade, ses affectations et pointages de vérification).
alter table mission_required_materiels
  add constraint mission_required_materiels_category_id_fkey
  foreign key (category_id) references materiel_categories(id) on delete restrict;

alter table mission_type_required_materiels drop constraint mission_type_required_materiels_materiel_type_id_fkey;
alter table mission_type_required_materiels rename column materiel_type_id to category_id;
alter table mission_type_required_materiels rename constraint mission_type_required_materiels_type_key to mission_type_required_materiels_category_key;

update mission_type_required_materiels mtrm
set category_id = mt.category_id
from _materiel_type_requirements_backfill b
join materiel_types mt on mt.id = b.materiel_type_id
where b.requirement_id = mtrm.id;

alter table mission_type_required_materiels
  add constraint mission_type_required_materiels_category_id_fkey
  foreign key (category_id) references materiel_categories(id) on delete restrict;

-- ── 3. mission_materiel_assignments : affectation d'un contenant précis à un besoin ──

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
-- autre contenant) de la même catégorie que le besoin.
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

create policy "mission_materiel_assignments_write_admin"
  on mission_materiel_assignments for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Backfill : un besoin déjà existant pointait directement vers un contenant ;
-- cela devient une affectation unique de ce même contenant à ce besoin, ce
-- qui préserve exactement le matériel déjà engagé sur les missions en cours.
insert into mission_materiel_assignments (mission_required_materiel_id, materiel_type_id)
select requirement_id, materiel_type_id
from _materiel_requirements_backfill;

-- ── 4. mission_materiel_verification_items : repointage affectation (au lieu de occurrence_index) ──

alter table mission_materiel_verification_items drop constraint mission_materiel_verification_items_unique;
alter table mission_materiel_verification_items drop constraint mission_materiel_verification_mission_required_materiel_id_fkey;

alter table mission_materiel_verification_items rename column mission_required_materiel_id to mission_materiel_assignment_id;

-- Reprend l'affectation backfillée à la place de l'ancien couple (besoin, occurrence_index).
-- occurrence_index valait toujours 0 historiquement (quantité de 1 partout en donnée réelle).
update mission_materiel_verification_items vi
set mission_materiel_assignment_id = mma.id
from mission_materiel_assignments mma
join _materiel_requirements_backfill b
  on b.requirement_id = mma.mission_required_materiel_id
  and b.materiel_type_id = mma.materiel_type_id
where b.original_requirement_id = vi.mission_materiel_assignment_id;

alter table mission_materiel_verification_items
  add constraint mission_materiel_verification_items_assignment_id_fkey
  foreign key (mission_materiel_assignment_id) references mission_materiel_assignments(id) on delete cascade;

alter table mission_materiel_verification_items drop column occurrence_index;

alter table mission_materiel_verification_items
  add constraint mission_materiel_verification_items_unique
  unique (mission_materiel_assignment_id, child_type_id);

alter index idx_mission_materiel_verification_items_required_materiel_id rename to idx_mission_materiel_verification_items_assignment_id;

drop table _materiel_requirements_backfill;
drop table _materiel_type_requirements_backfill;
