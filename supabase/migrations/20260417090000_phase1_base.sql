create extension if not exists "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'responsable', 'benevole');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_status') THEN
    CREATE TYPE public.mission_status AS ENUM ('draft', 'proposed', 'closed', 'confirmed', 'cancelled');
  END IF;
END
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null unique,
  role public.app_role not null default 'benevole',
  sector text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  sector text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  required_volunteers integer not null default 1 check (required_volunteers > 0),
  status public.mission_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  constraint missions_time_check check (ends_at > starts_at)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create index if not exists idx_missions_starts_at on public.missions(starts_at);
create index if not exists idx_missions_created_by on public.missions(created_by);

alter table public.profiles enable row level security;
alter table public.missions enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or public.current_user_role() = 'admin'
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "missions_select_by_role" on public.missions;
create policy "missions_select_by_role"
on public.missions
for select
using (
  public.current_user_role() in ('admin', 'responsable', 'benevole')
);

drop policy if exists "missions_insert_admin_or_responsable" on public.missions;
create policy "missions_insert_admin_or_responsable"
on public.missions
for insert
with check (
  auth.uid() = created_by
  and public.current_user_role() in ('admin', 'responsable')
);

drop policy if exists "missions_update_creator_admin" on public.missions;
create policy "missions_update_creator_admin"
on public.missions
for update
using (
  auth.uid() = created_by
  or public.current_user_role() = 'admin'
)
with check (
  auth.uid() = created_by
  or public.current_user_role() = 'admin'
);
