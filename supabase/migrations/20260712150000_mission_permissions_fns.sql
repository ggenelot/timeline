-- Phase 5 (missions) — partie A : réécriture des fonctions de décision du
-- domaine mission pour retirer la dépendance à profiles.role
-- (current_user_role/p.role='admin') au profit de is_admin().
--
-- Débloque le « responsable maraude » : un rôle portant can_manage/mission
-- scopé au type maraude peut gérer (créer/voir/éditer/supprimer) les missions
-- de ce type — via can_manage_mission — sans être admin.
--
-- Correctif inclus : can_manage_mission filtre désormais
-- rb.resource_type='mission' (la version d'origine 20260516100000 datait
-- d'avant la colonne resource_type et pouvait, depuis 20260622130000,
-- matcher un can_manage d'une autre ressource comme cursus).

create or replace function public.can_manage_mission(_mission_id uuid, _user_id uuid)
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
        public.is_admin(_user_id)
        or m.created_by = _user_id
        or exists (
          select 1
          from public.profile_roles pr
          join public.role_behaviors rb on rb.role_id = pr.role_id
          where pr.profile_id = _user_id
            and rb.resource_type = 'mission'
            and rb.behavior_type = 'can_manage'
            and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
        )
      )
  );
$$;

-- can_manage_mission_by_role : décision de gestion du CYCLE DE VIE d'une
-- mission (éditer / supprimer la ligne, confirmer, annuler, staffer) — admin
-- OU comportement can_manage/mission couvrant le type, SANS la dérogation
-- « créateur » de can_manage_mission. Motivation : depuis que can_create/mission
-- permet à un bénévole de créer un brouillon, la branche m.created_by de
-- can_manage_mission ferait de tout auteur de brouillon un gestionnaire de sa
-- propre mission (flip de statut, suppression) — contournement du flux de
-- validation. La gestion du cycle de vie exige donc un droit can_manage réel
-- (admin ou rôle scopé), pas la simple qualité d'auteur. can_manage_mission
-- (avec créateur) reste le point d'entrée des sous-ressources
-- (mission_assignments / required_skills / required_levels / matériel).
create or replace function public.can_manage_mission_by_role(_mission_id uuid, _user_id uuid)
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
        public.is_admin(_user_id)
        or exists (
          select 1
          from public.profile_roles pr
          join public.role_behaviors rb on rb.role_id = pr.role_id
          where pr.profile_id = _user_id
            and rb.resource_type = 'mission'
            and rb.behavior_type = 'can_manage'
            and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
        )
      )
  );
$$;

revoke all on function public.can_manage_mission_by_role(uuid, uuid) from public;
grant execute on function public.can_manage_mission_by_role(uuid, uuid) to authenticated, service_role;

-- can_read_mission : admin → is_admin ; on retire les qualificatifs
-- current_user_role()='benevole' (les comportements sont la vraie garde et ne
-- s'appliquent de toute façon pas aux admins). Branches conservées : gestion
-- (can_manage), brouillon propre, affecté (selected/confirmed),
-- required_for_visibility, can_see (type+statut) avec gating référent. La
-- branche can_manage type-scopée redondante avec has_role_behavior est retirée.
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
        public.is_admin(_user_id)
        or public.has_role_behavior(_user_id, 'mission', 'can_manage')

        or (m.status = 'draft' and m.created_by = _user_id)

        or exists (
          select 1
          from public.mission_assignments ma
          where ma.mission_id = m.id
            and ma.volunteer_id = _user_id
            and ma.assignment_status in ('selected', 'confirmed')
        )

        or exists (
          select 1
          from public.profile_roles pr
          join public.role_behaviors rb on rb.role_id = pr.role_id
          where pr.profile_id = _user_id
            and rb.resource_type = 'mission'
            and rb.behavior_type = 'required_for_visibility'
            and (rb.mission_type_ids = '{}' or m.mission_type_id = any(rb.mission_type_ids))
        )

        or (
          exists (
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
