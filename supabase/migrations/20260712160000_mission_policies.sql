-- Phase 5 (missions) — partie B : policies RLS du domaine mission migrées de
-- profiles.role='admin' / current_user_role() vers is_admin() /
-- can_manage_mission() / has_permission('mission_type',...).
--
-- Effets : le « responsable maraude » (can_manage/mission scopé maraude) peut
-- créer/éditer/supprimer les missions maraude et gérer leur staffing ; les
-- types de mission passent sous mission_type/can_manage. Les filtres cibles
-- role='benevole' sont retirés (tout profil est assignable). Aucun droit admin
-- ne se réduit (is_admin implicite).

-- ============================================================
-- missions : insert (gestionnaire + brouillon can_create), update, delete
-- ============================================================

-- Création pleine (tous statuts) : admin ou can_manage/mission couvrant le type.
drop policy if exists "missions_insert_admin_only" on public.missions;
create policy "missions_insert_manager"
  on public.missions for insert
  with check (
    auth.uid() = created_by
    and (
      (select public.is_admin(auth.uid()))
      or exists (
        select 1 from public.profile_roles pr
        join public.role_behaviors rb on rb.role_id = pr.role_id
        where pr.profile_id = auth.uid()
          and rb.resource_type = 'mission'
          and rb.behavior_type = 'can_manage'
          and (rb.mission_type_ids = '{}' or mission_type_id = any(rb.mission_type_ids))
      )
    )
  );

-- Brouillon : détenteur d'un comportement can_create/mission couvrant le type.
drop policy if exists "benevoles_insert_draft_with_role" on public.missions;
create policy "missions_insert_draft_with_create_behavior"
  on public.missions for insert
  with check (
    status = 'draft'
    and created_by = auth.uid()
    and exists (
      select 1 from public.profile_roles pr
      join public.role_behaviors rb on rb.role_id = pr.role_id
      where pr.profile_id = auth.uid()
        and rb.resource_type = 'mission'
        and rb.behavior_type = 'can_create'
        and (rb.mission_type_ids = '{}' or mission_type_id = any(rb.mission_type_ids))
    )
  );

drop policy if exists "missions_update_admin_only" on public.missions;
create policy "missions_update_manager"
  on public.missions for update
  using ((select public.is_admin(auth.uid())) or public.can_manage_mission(missions.id, auth.uid()))
  with check ((select public.is_admin(auth.uid())) or public.can_manage_mission(missions.id, auth.uid()));

drop policy if exists "missions_delete_admin_only" on public.missions;
create policy "missions_delete_manager"
  on public.missions for delete
  using ((select public.is_admin(auth.uid())) or public.can_manage_mission(missions.id, auth.uid()));

-- ============================================================
-- mission_proposals : select / insert / update
-- ============================================================

drop policy if exists "mission_proposals_select_strict" on public.mission_proposals;
create policy "mission_proposals_select_strict"
  on public.mission_proposals for select
  using (
    (select public.is_admin(auth.uid()))
    or (
      public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    )
    or public.can_read_mission(mission_proposals.mission_id, auth.uid())
  );

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
  on public.mission_proposals for insert
  with check (
    (select public.is_admin(auth.uid()))
    or (
      public.mission_allows_response(mission_proposals.mission_id)
      and (
        (
          public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
          and mission_proposals.proposed_by = auth.uid()
          and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
        )
        or (
          mission_proposals.volunteer_id = auth.uid()
          and mission_proposals.proposed_by = auth.uid()
        )
      )
    )
  );

drop policy if exists "mission_proposals_update_strict" on public.mission_proposals;
create policy "mission_proposals_update_strict"
  on public.mission_proposals for update
  using (
    (select public.is_admin(auth.uid()))
    or (
      public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    )
    or mission_proposals.volunteer_id = auth.uid()
  )
  with check (
    (select public.is_admin(auth.uid()))
    or (
      public.mission_allows_response(mission_proposals.mission_id)
      and (
        (
          public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
          and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
        )
        or mission_proposals.volunteer_id = auth.uid()
      )
    )
  );

-- ============================================================
-- mission_assignments : bypass admin de statut → is_admin
-- ============================================================

drop policy if exists "mission_assignments_insert_strict" on public.mission_assignments;
create policy "mission_assignments_insert_strict"
  on public.mission_assignments for insert
  with check (
    public.can_manage_mission(mission_assignments.mission_id, auth.uid())
    and mission_assignments.assignment_status = 'selected'
    and public.can_select_volunteer_for_mission(mission_assignments.mission_id, mission_assignments.volunteer_id)
    and (
      (select public.is_admin(auth.uid()))
      or public.mission_allows_assignment_changes(mission_assignments.mission_id)
    )
  );

drop policy if exists "mission_assignments_update_strict" on public.mission_assignments;
create policy "mission_assignments_update_strict"
  on public.mission_assignments for update
  using (public.can_manage_mission(mission_assignments.mission_id, auth.uid()))
  with check (
    public.can_manage_mission(mission_assignments.mission_id, auth.uid())
    and (
      (select public.is_admin(auth.uid()))
      or public.mission_allows_assignment_changes(mission_assignments.mission_id)
    )
  );

drop policy if exists "mission_assignments_delete_strict" on public.mission_assignments;
create policy "mission_assignments_delete_strict"
  on public.mission_assignments for delete
  using (
    public.can_manage_mission(mission_assignments.mission_id, auth.uid())
    and (
      (select public.is_admin(auth.uid()))
      or public.mission_allows_assignment_changes(mission_assignments.mission_id)
    )
  );

-- ============================================================
-- Types de mission (configuration) → mission_type/can_manage
-- ============================================================

drop policy if exists "Admins can manage mission types" on public.mission_types;
create policy "Admins can manage mission types"
  on public.mission_types for all
  using ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')));

drop policy if exists "Admins can manage mission type required skills" on public.mission_type_required_skills;
create policy "Admins can manage mission type required skills"
  on public.mission_type_required_skills for all
  using ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')));

drop policy if exists "mission_type_required_materiels_admin" on public.mission_type_required_materiels;
create policy "mission_type_required_materiels_admin"
  on public.mission_type_required_materiels for all
  using ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'mission_type', 'can_manage')));

-- ============================================================
-- activity_logs / events
-- ============================================================

drop policy if exists "activity_logs_select_strict" on public.activity_logs;
create policy "activity_logs_select_strict"
  on public.activity_logs for select
  using (
    (select public.is_admin(auth.uid()))
    or (
      activity_logs.mission_id is not null
      and public.can_read_mission(activity_logs.mission_id, auth.uid())
    )
  );

drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin"
  on public.events for insert
  with check (
    auth.uid() = created_by
    and (select public.is_admin(auth.uid()))
  );
