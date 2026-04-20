drop policy if exists "missions_update_creator_admin" on public.missions;

drop policy if exists "missions_update_admin_only" on public.missions;
create policy "missions_update_admin_only"
on public.missions
for update
using (
  public.current_user_role() = 'admin'
)
with check (
  public.current_user_role() = 'admin'
);
