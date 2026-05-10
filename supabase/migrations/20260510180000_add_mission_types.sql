create table mission_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category mission_category,
  default_required_volunteers int not null default 1 check (default_required_volunteers >= 1),
  default_start_time time,
  default_end_time time,
  created_at timestamptz not null default now()
);

alter table mission_types enable row level security;

create policy "Admins can manage mission types"
  on mission_types
  for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );
