drop policy if exists "missions_insert_admin_or_responsable" on public.missions;

drop policy if exists "missions_insert_admin_only" on public.missions;
create policy "missions_insert_admin_only"
on public.missions
for insert
with check (
  auth.uid() = created_by
  and public.current_user_role() = 'admin'
);
