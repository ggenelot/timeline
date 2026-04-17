alter table public.profiles enable row level security;
alter table public.missions enable row level security;

-- Profiles: each user can read/update own profile. Admin can read all.
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

-- Missions: authenticated users can read.
drop policy if exists "missions_select_authenticated" on public.missions;
create policy "missions_select_authenticated"
on public.missions
for select
using (auth.uid() is not null);

-- Missions insert/update restricted to admin/responsable.
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
