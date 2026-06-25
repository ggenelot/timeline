-- Vérification du matériel engagé en début de mission : on ne vérifie pas le
-- contenant engagé (mission_required_materiels) lui-même mais les items
-- terminaux qu'il contient, en dépliant récursivement la composition
-- (materiel_type_contents, potentiellement imbriquée sur plusieurs niveaux).

create or replace function public.resolve_materiel_container_items(_container_type_id uuid)
returns table (item_type_id uuid, quantity integer)
language sql
stable
as $$
  with recursive expanded(type_id, quantity) as (
    select mtc.child_type_id, mtc.quantity
    from materiel_type_contents mtc
    where mtc.parent_type_id = _container_type_id
    union all
    select mtc.child_type_id, e.quantity * mtc.quantity
    from expanded e
    join materiel_type_contents mtc on mtc.parent_type_id = e.type_id
  )
  select e.type_id, sum(e.quantity)::integer
  from expanded e
  join materiel_types mt on mt.id = e.type_id
  where mt.is_container = false
  group by e.type_id;
$$;

create table mission_materiel_checks (
  id uuid primary key default gen_random_uuid(),
  mission_required_materiel_id uuid not null references mission_required_materiels(id) on delete cascade,
  item_type_id uuid not null references materiel_types(id) on delete cascade,
  expected_quantity integer not null default 1 check (expected_quantity >= 1),
  is_present boolean not null default false,
  comment text,
  checked_by uuid references profiles(id) on delete set null,
  checked_at timestamptz not null default now(),
  constraint mission_materiel_checks_required_materiel_item_key unique (mission_required_materiel_id, item_type_id)
);

create index idx_mission_materiel_checks_required_materiel on mission_materiel_checks(mission_required_materiel_id);
create index idx_mission_materiel_checks_item_type on mission_materiel_checks(item_type_id);

create table mission_materiel_check_history (
  id uuid primary key default gen_random_uuid(),
  mission_required_materiel_id uuid not null references mission_required_materiels(id) on delete cascade,
  item_type_id uuid not null references materiel_types(id) on delete cascade,
  is_present boolean not null,
  comment text,
  checked_by uuid references profiles(id) on delete set null,
  checked_at timestamptz not null default now()
);

create index idx_mission_materiel_check_history_required_materiel on mission_materiel_check_history(mission_required_materiel_id);

-- Un item vérifié doit être une feuille de l'arborescence (jamais un
-- contenant, intermédiaire ou racine) : seul le matériel "en bout de chaîne"
-- fait l'objet d'une case à cocher.
create or replace function public.enforce_materiel_check_item_is_leaf()
returns trigger as $$
begin
  if exists (select 1 from materiel_types where id = new.item_type_id and is_container = true) then
    raise exception 'item_type_id must reference a non-container (leaf) type';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger mission_materiel_checks_enforce_leaf
  before insert or update on mission_materiel_checks
  for each row
  execute function enforce_materiel_check_item_is_leaf();

-- Génère/régénère automatiquement les lignes de check dès qu'un contenant est
-- engagé sur une mission, pour que la checklist existe sans étape manuelle.
create or replace function public.generate_mission_materiel_checks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    delete from mission_materiel_checks where mission_required_materiel_id = new.id;
  end if;

  insert into mission_materiel_checks (mission_required_materiel_id, item_type_id, expected_quantity)
  select new.id, r.item_type_id, r.quantity
  from resolve_materiel_container_items(new.materiel_type_id) r;

  return new;
end;
$$;

create trigger mission_required_materiels_generate_checks
  after insert or update of materiel_type_id on mission_required_materiels
  for each row
  execute function generate_mission_materiel_checks();

-- Trace d'archive : chaque vérification humaine (checked_by renseigné) est
-- copiée dans l'historique, append-only, même si la ligne courante est
-- ensuite écrasée par une vérification suivante.
create or replace function public.record_mission_materiel_check_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.checked_by is not null then
    insert into mission_materiel_check_history (mission_required_materiel_id, item_type_id, is_present, comment, checked_by, checked_at)
    values (new.mission_required_materiel_id, new.item_type_id, new.is_present, new.comment, new.checked_by, new.checked_at);
  end if;
  return new;
end;
$$;

create trigger mission_materiel_checks_history
  after insert or update on mission_materiel_checks
  for each row
  execute function record_mission_materiel_check_history();

alter table mission_materiel_checks enable row level security;
alter table mission_materiel_check_history enable row level security;

create policy "mission_materiel_checks_select_strict"
  on mission_materiel_checks for select
  using (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_checks.mission_required_materiel_id
        and can_read_mission(mrm.mission_id, auth.uid())
    )
  );

-- Pas de policy insert : les lignes sont créées uniquement par le trigger
-- generate_mission_materiel_checks (security definer), jamais par un client.
create policy "mission_materiel_checks_update_assigned_or_manager"
  on mission_materiel_checks for update
  using (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_checks.mission_required_materiel_id
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
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_checks.mission_required_materiel_id
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

create policy "mission_materiel_check_history_select_strict"
  on mission_materiel_check_history for select
  using (
    exists (
      select 1 from mission_required_materiels mrm
      where mrm.id = mission_materiel_check_history.mission_required_materiel_id
        and can_read_mission(mrm.mission_id, auth.uid())
    )
  );

-- Backfill : générer les checks pour les engagements de matériel déjà
-- existants au moment de cette migration.
insert into mission_materiel_checks (mission_required_materiel_id, item_type_id, expected_quantity)
select mrm.id, r.item_type_id, r.quantity
from mission_required_materiels mrm
cross join lateral resolve_materiel_container_items(mrm.materiel_type_id) r
on conflict (mission_required_materiel_id, item_type_id) do nothing;
