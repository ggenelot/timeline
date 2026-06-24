-- Catalogue de matériel (Phase 1) : module générique, indépendant du domaine
-- métier protection civile. Mirror exact du pattern skill_categories/skills,
-- avec en plus une table de composition auto-référentielle pour modéliser le
-- contenu de lot ("1 type A contient 2 type B").

create table materiel_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'slate',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table materiel_categories enable row level security;

create policy "authenticated_read_materiel_categories"
  on materiel_categories for select
  to authenticated
  using (true);

create policy "admin_manage_materiel_categories"
  on materiel_categories for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create table materiel_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references materiel_categories(id) on delete set null,
  name text not null,
  code text,
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_materiel_types_category_id on materiel_types(category_id);

alter table materiel_types enable row level security;

create policy "authenticated_read_materiel_types"
  on materiel_types for select
  to authenticated
  using (true);

create policy "admin_manage_materiel_types"
  on materiel_types for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- Contenu de lot : définit récursivement ce qu'un type de matériel contient
-- (ex. "1 type A contient 2 type B"), indépendamment de tout domaine métier.
create table materiel_type_contents (
  id uuid primary key default gen_random_uuid(),
  parent_type_id uuid not null references materiel_types(id) on delete cascade,
  child_type_id uuid not null references materiel_types(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  constraint materiel_type_contents_parent_child_key unique (parent_type_id, child_type_id),
  constraint materiel_type_contents_no_self_reference check (parent_type_id <> child_type_id)
);

create index idx_materiel_type_contents_parent on materiel_type_contents(parent_type_id);
create index idx_materiel_type_contents_child on materiel_type_contents(child_type_id);

alter table materiel_type_contents enable row level security;

create policy "authenticated_read_materiel_type_contents"
  on materiel_type_contents for select
  to authenticated
  using (true);

create policy "admin_manage_materiel_type_contents"
  on materiel_type_contents for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
