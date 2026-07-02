-- Retire the profiles.role = 'responsable' shortcut from RLS in favour of the
-- generalized dynamic roles system (see 20260622130000 / 20260622140000).
-- Safe to apply only after 20260622140000 has backfilled every legacy
-- 'responsable' account into the "Responsable" dynamic role with the
-- equivalent can_manage behaviors on the mission and cursus domains.

-- ============================================================
-- Cursus domain: admin OR can_manage/cursus
-- ============================================================

drop policy if exists "cursus_write_admin" on public.cursus;
create policy "cursus_write_admin"
  on public.cursus for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "cursus_rules_write_admin" on public.cursus_rules;
create policy "cursus_rules_write_admin"
  on public.cursus_rules for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "cursus_phases_write_admin" on public.cursus_phases;
create policy "cursus_phases_write_admin"
  on public.cursus_phases for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "cursus_comp_write_admin" on public.cursus_competences;
create policy "cursus_comp_write_admin"
  on public.cursus_competences for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "vc_read" on public.volunteer_cursus;
create policy "vc_read"
  on public.volunteer_cursus for select to authenticated
  using (
    profile_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "vc_insert" on public.volunteer_cursus;
create policy "vc_insert"
  on public.volunteer_cursus for insert to authenticated
  with check (
    profile_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

-- Widened (was admin-only): can_manage/cursus also covers managing any
-- volunteer's enrollment (update/delete), not just the catalog + reads.
drop policy if exists "vc_admin_all" on public.volunteer_cursus;
create policy "vc_admin_all"
  on public.volunteer_cursus for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "doublures_read" on public.doublures;
create policy "doublures_read"
  on public.doublures for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "doublures_insert" on public.doublures;
create policy "doublures_insert"
  on public.doublures for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

-- Widened (was admin-only): can_manage/cursus can update/delete any
-- volunteer's doublures, consistent with full enrollment management.
drop policy if exists "doublures_update" on public.doublures;
create policy "doublures_update"
  on public.doublures for update to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  )
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "doublures_delete" on public.doublures;
create policy "doublures_delete"
  on public.doublures for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "cv_read" on public.competence_validations;
create policy "cv_read"
  on public.competence_validations for select to authenticated
  using (
    declared_by = auth.uid()
    or exists (
      select 1 from public.volunteer_cursus vc
      where vc.id = volunteer_cursus_id and vc.profile_id = auth.uid()
    )
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

drop policy if exists "cv_insert" on public.competence_validations;
create policy "cv_insert"
  on public.competence_validations for insert to authenticated
  with check (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

-- Widened (was admin-only): can_manage/cursus can delete any volunteer's
-- competence validations.
drop policy if exists "cv_delete" on public.competence_validations;
create policy "cv_delete"
  on public.competence_validations for delete to authenticated
  using (
    declared_by = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
    or public.has_role_behavior(auth.uid(), 'cursus', 'can_manage')
  );

-- ============================================================
-- Mission domain
-- ============================================================

create or replace function public.can_read_mission(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions m
    where m.id = _mission_id
      and (
        -- (a) admin → voit tout ; ex-"responsable" → can_manage/mission
        public.current_user_role() = 'admin'
        or public.has_role_behavior(_user_id, 'mission', 'can_manage')

        -- (b) can_manage (bénévole) → voit les missions de ses types
        or (
          public.current_user_role() = 'benevole'
          and exists (
            select 1
            from public.profile_roles pr
            join public.role_behaviors rb on rb.role_id = pr.role_id
            where pr.profile_id = _user_id
              and rb.resource_type = 'mission'
              and rb.behavior_type = 'can_manage'
              and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
          )
        )

        -- (c) brouillon créé par le bénévole lui-même
        or (m.status = 'draft' and m.created_by = _user_id)

        -- (d) référent required_for_visibility → voit toujours ses types de mission
        or (
          public.current_user_role() = 'benevole'
          and exists (
            select 1
            from public.profile_roles pr
            join public.role_behaviors rb on rb.role_id = pr.role_id
            where pr.profile_id = _user_id
              and rb.resource_type = 'mission'
              and rb.behavior_type = 'required_for_visibility'
              and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
          )
        )

        -- (e) can_see (type + statut) avec vérification du référent si applicable
        or (
          public.current_user_role() = 'benevole'
          and exists (
            select 1
            from public.profile_roles pr
            join public.role_behaviors rb on rb.role_id = pr.role_id
            where pr.profile_id = _user_id
              and rb.resource_type = 'mission'
              and rb.behavior_type = 'can_see'
              and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
              and (rb.mission_statuses = '{}' or m.status = any(rb.mission_statuses))
          )
          and (
            not exists (
              select 1
              from public.role_behaviors rb
              where rb.resource_type = 'mission'
                and rb.behavior_type = 'required_for_visibility'
                and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
            )
            or exists (
              select 1
              from public.mission_proposals mp
              join public.profile_roles pr on pr.profile_id = mp.volunteer_id
              join public.role_behaviors rb on rb.role_id = pr.role_id
              where mp.mission_id = m.id
                and mp.response = 'available'
                and rb.resource_type = 'mission'
                and rb.behavior_type = 'required_for_visibility'
                and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
            )
          )
        )
      )
  );
$$;

drop policy if exists "mission_proposals_select_strict" on public.mission_proposals;
create policy "mission_proposals_select_strict"
on public.mission_proposals
for select
using (
  public.current_user_role() = 'admin'
  or (
    public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and public.can_read_mission(mission_proposals.mission_id, auth.uid())
  )
);

drop policy if exists "mission_proposals_insert_strict" on public.mission_proposals;
create policy "mission_proposals_insert_strict"
on public.mission_proposals
for insert
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
    public.current_user_role() = 'admin'
    or (
      public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
      and mission_proposals.proposed_by = auth.uid()
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
      and exists (
        select 1
        from public.profiles p
        where p.id = mission_proposals.volunteer_id
          and p.role = 'benevole'
      )
    )
    or (
      public.current_user_role() = 'benevole'
      and mission_proposals.volunteer_id = auth.uid()
      and mission_proposals.proposed_by = auth.uid()
    )
  )
);

drop policy if exists "mission_proposals_update_strict" on public.mission_proposals;
create policy "mission_proposals_update_strict"
on public.mission_proposals
for update
using (
  public.current_user_role() = 'admin'
  or (
    public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
    and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
  )
  or (
    public.current_user_role() = 'benevole'
    and mission_proposals.volunteer_id = auth.uid()
  )
)
with check (
  public.mission_allows_response(mission_proposals.mission_id)
  and (
    public.current_user_role() = 'admin'
    or (
      public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
      and public.is_mission_owner(mission_proposals.mission_id, auth.uid())
    )
    or (
      public.current_user_role() = 'benevole'
      and mission_proposals.volunteer_id = auth.uid()
    )
  )
);

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or public.current_user_role() = 'admin'
  or (
    (public.current_user_role() = 'benevole' or public.has_role_behavior(auth.uid(), 'mission', 'can_manage'))
    and role = 'benevole'
  )
);

drop policy if exists "profile_skills_select_strict" on public.profile_skills;
create policy "profile_skills_select_strict"
on public.profile_skills
for select
using (
  public.current_user_role() = 'admin'
  or profile_skills.profile_id = auth.uid()
  or (
    public.has_role_behavior(auth.uid(), 'mission', 'can_manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_skills.profile_id
        and p.role = 'benevole'
    )
  )
);

-- profile_domain_progress (Option B skill domains/levels) is dead schema:
-- superseded by skill_categories (20260517100000) and dropped outside the
-- migration system. No policy to migrate here.

-- 'responsable' never granted real extra rights here (benevole already
-- covered these reads) — simplify rather than reintroduce a dynamic check.
drop policy if exists "skills_select_authenticated" on public.skills;
create policy "skills_select_authenticated"
on public.skills
for select
to authenticated
using (true);

-- skill_domains / skill_levels (Option B) are dead schema too — see note above.
