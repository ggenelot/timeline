-- Refonte des rôles — bascule groupée de 4 domaines du check legacy
-- profiles.role='admin' (ou has_role_behavior) vers has_permission() :
--   phase 2 : compétences (skill)
--   phase 3 : cursus
--   phase 4 : bénévoles (volunteer)
--   phase 6 : réglages/aide/slack (settings) + administration des rôles
--
-- Rappels sur has_permission (20260712110000) : admin (rôle système) toujours
-- autorisé ; can_manage satisfait can_see. Les policies de LECTURE se
-- réduisent donc à has_permission(...,'X','can_see') qui couvre admin +
-- can_manage + can_see. Les lectures publiques déjà en place (catalogues,
-- app_settings) restent inchangées.
--
-- Les filtres role='benevole' (bénévole assignable / visibilité) et le
-- domaine mission sont volontairement conservés : ils seront traités en
-- phase 5 (missions) et phase 7 (suppression de profiles.role).

-- ============================================================
-- Phase 2 — Compétences (skill)
-- ============================================================

drop policy if exists "skills_write_admin_only" on public.skills;
create policy "skills_write_admin_only"
  on public.skills for all
  using ((select public.has_permission(auth.uid(), 'skill', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'skill', 'can_manage')));

drop policy if exists "admin_manage_skill_categories" on public.skill_categories;
create policy "admin_manage_skill_categories"
  on public.skill_categories for all to authenticated
  using ((select public.has_permission(auth.uid(), 'skill', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'skill', 'can_manage')));

drop policy if exists "Admins can manage skill statuses" on public.skill_statuses;
create policy "Admins can manage skill statuses"
  on public.skill_statuses for all to authenticated
  using ((select public.has_permission(auth.uid(), 'skill', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'skill', 'can_manage')));

-- ============================================================
-- Phase 3 — Cursus
-- ============================================================
-- Les policies actuelles (20260622150000) portent
-- « role='admin' OR has_role_behavior(...,'cursus','can_manage') » : on les
-- collapse en has_permission('cursus',...). Les lectures gagnent can_see
-- (supervision lecture seule, ex. présidente).

-- Écritures catalogue + inscriptions
drop policy if exists "cursus_write_admin" on public.cursus;
create policy "cursus_write_admin"
  on public.cursus for all to authenticated
  using ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')));

drop policy if exists "cursus_rules_write_admin" on public.cursus_rules;
create policy "cursus_rules_write_admin"
  on public.cursus_rules for all to authenticated
  using ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')));

drop policy if exists "cursus_phases_write_admin" on public.cursus_phases;
create policy "cursus_phases_write_admin"
  on public.cursus_phases for all to authenticated
  using ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')));

drop policy if exists "cursus_comp_write_admin" on public.cursus_competences;
create policy "cursus_comp_write_admin"
  on public.cursus_competences for all to authenticated
  using ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')));

-- volunteer_cursus : lecture (self + can_see), insert (self + can_manage),
-- gestion complète (can_manage)
drop policy if exists "vc_read" on public.volunteer_cursus;
create policy "vc_read"
  on public.volunteer_cursus for select to authenticated
  using (
    profile_id = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

drop policy if exists "vc_insert" on public.volunteer_cursus;
create policy "vc_insert"
  on public.volunteer_cursus for insert to authenticated
  with check (
    profile_id = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "vc_admin_all" on public.volunteer_cursus;
create policy "vc_admin_all"
  on public.volunteer_cursus for all to authenticated
  using ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'cursus', 'can_manage')));

-- doublures : lecture (self / cursus du bénévole / can_see), écritures can_manage
drop policy if exists "doublures_read" on public.doublures;
create policy "doublures_read"
  on public.doublures for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

drop policy if exists "doublures_insert" on public.doublures;
create policy "doublures_insert"
  on public.doublures for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "doublures_update" on public.doublures;
create policy "doublures_update"
  on public.doublures for update to authenticated
  using (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  )
  with check (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "doublures_delete" on public.doublures;
create policy "doublures_delete"
  on public.doublures for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

-- competence_validations : lecture (self / cursus / can_see), écritures can_manage
drop policy if exists "cv_read" on public.competence_validations;
create policy "cv_read"
  on public.competence_validations for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select public.has_permission(auth.uid(), 'cursus', 'can_see'))
  );

drop policy if exists "cv_insert" on public.competence_validations;
create policy "cv_insert"
  on public.competence_validations for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

drop policy if exists "cv_delete" on public.competence_validations;
create policy "cv_delete"
  on public.competence_validations for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select public.has_permission(auth.uid(), 'cursus', 'can_manage'))
  );

-- ============================================================
-- Phase 4 — Bénévoles (volunteer)
-- ============================================================
-- On migre la branche admin vers is_admin() et on ajoute volunteer/can_see
-- (supervision : voir tous les profils/compétences). Les branches
-- role='benevole' / mission (bénévole assignable, mission-manager) restent
-- telles quelles jusqu'aux phases 5 et 7.

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    auth.uid() = id
    or (select public.is_admin(auth.uid()))
    or (select public.has_permission(auth.uid(), 'volunteer', 'can_see'))
    or (
      (public.current_user_role() = 'benevole' or public.has_role_behavior(auth.uid(), 'mission', 'can_manage'))
      and role = 'benevole'
    )
  );

drop policy if exists "profile_skills_select_strict" on public.profile_skills;
create policy "profile_skills_select_strict"
  on public.profile_skills for select
  using (
    (select public.is_admin(auth.uid()))
    or profile_skills.profile_id = auth.uid()
    or (select public.has_permission(auth.uid(), 'volunteer', 'can_see'))
    or (
      public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
      and exists (
        select 1 from public.profiles p
        where p.id = profile_skills.profile_id and p.role = 'benevole'
      )
    )
  );

drop policy if exists "profile_skills_write_admin_only" on public.profile_skills;
create policy "profile_skills_write_admin_only"
  on public.profile_skills for all
  using ((select public.has_permission(auth.uid(), 'volunteer', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'volunteer', 'can_manage')));

-- ============================================================
-- Phase 6 — Réglages / aide / slack (settings) + administration
-- ============================================================

-- app_settings : lecture publique inchangée ; écriture settings/can_manage
drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings"
  on public.app_settings for update to authenticated
  using ((select public.has_permission(auth.uid(), 'settings', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'settings', 'can_manage')));

-- help_pages : lecture authentifiée inchangée ; gestion settings/can_manage
drop policy if exists "Help pages managed by admins" on public.help_pages;
create policy "Help pages managed by admins"
  on public.help_pages for all
  using ((select public.has_permission(auth.uid(), 'settings', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'settings', 'can_manage')));

-- slack_invitations : settings/can_manage
drop policy if exists "slack_invitations_admin_only" on public.slack_invitations;
create policy "slack_invitations_admin_only"
  on public.slack_invitations for all to authenticated
  using ((select public.has_permission(auth.uid(), 'settings', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'settings', 'can_manage')));

-- slack_message_templates : lecture settings/can_see, écriture can_manage
drop policy if exists "admin_read_slack_templates" on public.slack_message_templates;
create policy "admin_read_slack_templates"
  on public.slack_message_templates for select to authenticated
  using ((select public.has_permission(auth.uid(), 'settings', 'can_see')));

drop policy if exists "admin_write_slack_templates" on public.slack_message_templates;
create policy "admin_write_slack_templates"
  on public.slack_message_templates for all to authenticated
  using ((select public.has_permission(auth.uid(), 'settings', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'settings', 'can_manage')));

-- slack_notification_logs : lecture settings/can_see (écritures restent
-- service-role only via slack_notification_logs_no_client_writes)
drop policy if exists "slack_notification_logs_select_admin_only" on public.slack_notification_logs;
create policy "slack_notification_logs_select_admin_only"
  on public.slack_notification_logs for select
  using ((select public.has_permission(auth.uid(), 'settings', 'can_see')));

-- Administration des rôles : administration/can_manage (les admins passent
-- via is_admin ; garde-fous rôle système déjà en place — 20260712110000)
drop policy if exists "admin_full_access_roles" on public.roles;
create policy "admin_full_access_roles"
  on public.roles for all
  using ((select public.has_permission(auth.uid(), 'administration', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'administration', 'can_manage')));

drop policy if exists "admin_full_access_profile_roles" on public.profile_roles;
create policy "admin_full_access_profile_roles"
  on public.profile_roles for all
  using ((select public.has_permission(auth.uid(), 'administration', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'administration', 'can_manage')));

drop policy if exists "admin_full_access_role_behaviors" on public.role_behaviors;
create policy "admin_full_access_role_behaviors"
  on public.role_behaviors for all
  using ((select public.has_permission(auth.uid(), 'administration', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'administration', 'can_manage')));
