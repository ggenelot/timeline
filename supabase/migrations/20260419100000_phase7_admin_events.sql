create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_events_date on public.events(date);
create index if not exists idx_events_created_by on public.events(created_by);

alter table public.events enable row level security;

drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated"
on public.events
for select
using (auth.uid() is not null);

drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin"
on public.events
for insert
with check (
  auth.uid() = created_by
  and public.current_user_role() = 'admin'
);
