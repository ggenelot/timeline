create extension if not exists "pgcrypto";

create type app_role as enum ('admin', 'responsable', 'benevole');
create type mission_status as enum ('draft', 'proposed', 'closed', 'confirmed', 'cancelled');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null unique,
  role app_role not null default 'benevole',
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
  status mission_status not null default 'draft',
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
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create index if not exists idx_missions_starts_at on public.missions(starts_at);
create index if not exists idx_missions_created_by on public.missions(created_by);
