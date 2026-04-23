drop policy if exists "missions_delete_admin_only" on public.missions;
create policy "missions_delete_admin_only"
on public.missions
for delete
using (public.current_user_role() = 'admin');
