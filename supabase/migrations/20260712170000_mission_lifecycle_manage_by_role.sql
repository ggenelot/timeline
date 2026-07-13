-- Phase 5 (missions) — correctif : gestion du cycle de vie mission sans
-- dérogation « créateur ».
--
-- En câblant can_manage_mission dans les policies missions UPDATE/DELETE
-- (20260712160000) et dans requireMissionPermission, on exposait la branche
-- `m.created_by = _user_id` de cette fonction : depuis que can_create/mission
-- laisse un bénévole créer un brouillon, tout auteur de brouillon devenait
-- gestionnaire de sa propre mission (flip de statut vers proposed/confirmed,
-- suppression, confirmation via l'API), court-circuitant le flux de validation
-- jusqu'ici réservé à l'admin.
--
-- can_manage_mission_by_role = admin OU comportement can_manage/mission
-- couvrant le type, SANS la dérogation créateur. C'est le prédicat de gestion
-- du cycle de vie (éditer/supprimer/confirmer/annuler/staffer) : il conserve
-- l'élargissement voulu (le responsable maraude gère TOUTES les maraudes, pas
-- seulement les siennes) mais ferme le trou créateur.
--
-- can_manage_mission (avec créateur) reste le point d'entrée des sous-ressources
-- (mission_assignments / mission_required_skills / mission_required_levels /
-- matériel) — comportement préexistant, hors périmètre de ce correctif.

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

-- Édition / suppression de la ligne mission : admin ou can_manage scopé au type,
-- sans dérogation créateur.
drop policy if exists "missions_update_manager" on public.missions;
create policy "missions_update_manager"
  on public.missions for update
  using (public.can_manage_mission_by_role(missions.id, auth.uid()))
  with check (public.can_manage_mission_by_role(missions.id, auth.uid()));

drop policy if exists "missions_delete_manager" on public.missions;
create policy "missions_delete_manager"
  on public.missions for delete
  using (public.can_manage_mission_by_role(missions.id, auth.uid()));
