create table if not exists mission_type_required_skills (
  id uuid primary key default gen_random_uuid(),
  mission_type_id uuid not null references mission_types(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  quantity int not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  unique(mission_type_id, skill_id)
);

alter table mission_type_required_skills enable row level security;

create policy "Admins can manage mission type required skills"
  on mission_type_required_skills
  for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );
