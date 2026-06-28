-- Inventaire physique (Phase 2) : instances réelles de matériel, organisées
-- selon la même logique de composition que le catalogue (un objet réel peut
-- en contenir d'autres). Statuts entièrement configurables en admin (comme
-- skill_statuses), pour ne coder en dur aucun vocabulaire métier.

create table materiel_instance_statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  color text not null default 'slate',
  display_order integer not null default 0,
  is_available boolean not null default true,
  protected boolean not null default false,
  created_at timestamptz not null default now()
);

insert into materiel_instance_statuses (key, label, color, display_order, is_available, protected)
values ('en_service', 'En service', 'emerald', 0, true, true);

alter table materiel_instance_statuses enable row level security;

create policy "authenticated_read_materiel_instance_statuses"
  on materiel_instance_statuses for select
  to authenticated
  using (true);

create policy "admin_manage_materiel_instance_statuses"
  on materiel_instance_statuses for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create table materiel_instances (
  id uuid primary key default gen_random_uuid(),
  materiel_type_id uuid not null references materiel_types(id) on delete restrict,
  parent_instance_id uuid references materiel_instances(id) on delete set null,
  label text not null,
  location text,
  status_id uuid not null references materiel_instance_statuses(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_materiel_instances_type on materiel_instances(materiel_type_id);
create index idx_materiel_instances_parent on materiel_instances(parent_instance_id);
create index idx_materiel_instances_status on materiel_instances(status_id);

alter table materiel_instances enable row level security;

create policy "authenticated_read_materiel_instances"
  on materiel_instances for select
  to authenticated
  using (true);

create policy "admin_manage_materiel_instances"
  on materiel_instances for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
