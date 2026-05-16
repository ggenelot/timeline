-- Allow benevoles to see other benevoles' profiles (e.g. to display names on mission cards)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or public.current_user_role() = 'admin'
  or (
    public.current_user_role() in ('responsable', 'benevole')
    and role = 'benevole'
  )
);
