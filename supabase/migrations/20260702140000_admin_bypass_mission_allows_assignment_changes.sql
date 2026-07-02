-- La fiche mission permet désormais, une fois l'événement confirmé, de
-- rouvrir l'édition de l'équipage via le récapitulatif ("Modifier" /
-- "Terminer la modification") sans déconfirmer la mission ni recréer le
-- canal Slack. mission_allows_assignment_changes() ne couvre que les
-- statuts 'proposed'/'closed', donc mission_assignments_{insert,update,delete}_strict
-- rejetaient ces écritures dès qu'une mission passait à 'confirmed'.
-- Même bypass que 20260701090000_admin_bypass_mission_allows_response :
-- les admins ont un accès complet par règle métier et contournent ce
-- verrou de statut ; le chemin responsable (can_manage_mission) garde la
-- restriction existante.

drop policy if exists "mission_assignments_insert_strict" on public.mission_assignments;
create policy "mission_assignments_insert_strict"
on public.mission_assignments
for insert
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and mission_assignments.assignment_status = 'selected'
  and public.can_select_volunteer_for_mission(mission_assignments.mission_id, mission_assignments.volunteer_id)
  and (
    public.current_user_role() = 'admin'
    or public.mission_allows_assignment_changes(mission_assignments.mission_id)
  )
);

drop policy if exists "mission_assignments_update_strict" on public.mission_assignments;
create policy "mission_assignments_update_strict"
on public.mission_assignments
for update
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
)
with check (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and (
    public.current_user_role() = 'admin'
    or public.mission_allows_assignment_changes(mission_assignments.mission_id)
  )
);

drop policy if exists "mission_assignments_delete_strict" on public.mission_assignments;
create policy "mission_assignments_delete_strict"
on public.mission_assignments
for delete
using (
  public.can_manage_mission(mission_assignments.mission_id, auth.uid())
  and (
    public.current_user_role() = 'admin'
    or public.mission_allows_assignment_changes(mission_assignments.mission_id)
  )
);
