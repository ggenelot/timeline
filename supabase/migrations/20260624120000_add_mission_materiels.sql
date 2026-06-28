-- Intégration du matériel aux missions (Phase 3) : seule phase qui couple le
-- module matériel (générique, Phases 1-2) au domaine "mission". Mirroring de
-- mission_required_skills / mission_type_required_skills / mission_assignments,
-- mais avec une écriture réservée aux admins (et non aux responsables via
-- can_manage_mission), conformément au choix de gestion admin-only du module.

create table mission_required_materiels (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  materiel_type_id uuid not null references materiel_types(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  constraint mission_required_materiels_mission_type_key unique (mission_id, materiel_type_id)
);

create index idx_mission_required_materiels_mission_id on mission_required_materiels(mission_id);
create index idx_mission_required_materiels_type_id on mission_required_materiels(materiel_type_id);

alter table mission_required_materiels enable row level security;

create policy "mission_required_materiels_select_strict"
  on mission_required_materiels for select
  using (can_read_mission(mission_required_materiels.mission_id, auth.uid()));

create policy "mission_required_materiels_write_admin"
  on mission_required_materiels for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create table mission_type_required_materiels (
  id uuid primary key default gen_random_uuid(),
  mission_type_id uuid not null references mission_types(id) on delete cascade,
  materiel_type_id uuid not null references materiel_types(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  constraint mission_type_required_materiels_type_key unique (mission_type_id, materiel_type_id)
);

alter table mission_type_required_materiels enable row level security;

create policy "mission_type_required_materiels_admin"
  on mission_type_required_materiels for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mission_materiel_assignment_status') then
    create type mission_materiel_assignment_status as enum ('selected', 'confirmed', 'returned', 'declined');
  end if;
end
$$;

create table mission_materiel_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  materiel_instance_id uuid not null references materiel_instances(id) on delete cascade,
  mission_required_materiel_id uuid references mission_required_materiels(id) on delete set null,
  assignment_status mission_materiel_assignment_status not null default 'selected',
  created_at timestamptz not null default now(),
  constraint mission_materiel_assignments_mission_instance_key unique (mission_id, materiel_instance_id)
);

create index idx_mission_materiel_assignments_mission_id on mission_materiel_assignments(mission_id);
create index idx_mission_materiel_assignments_instance_id on mission_materiel_assignments(materiel_instance_id);

alter table mission_materiel_assignments enable row level security;

create policy "mission_materiel_assignments_select_strict"
  on mission_materiel_assignments for select
  using (can_read_mission(mission_materiel_assignments.mission_id, auth.uid()));

create policy "mission_materiel_assignments_write_admin"
  on mission_materiel_assignments for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
