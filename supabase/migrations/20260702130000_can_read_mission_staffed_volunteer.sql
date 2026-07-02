-- can_read_mission() ne dépendait que des règles de visibilité par rôle
-- (type + statut de mission), jamais du fait d'être soi-même staffé sur la
-- mission. Conséquence : dès qu'une mission passe de 'proposed' à
-- 'confirmed', un bénévole qui y est affecté (mission_assignments) peut
-- perdre le droit de la lire si son rôle n'a pas de can_see couvrant ce
-- type de mission une fois confirmée — alors qu'il en fait partie de
-- l'équipage. Ajoute une clause explicite : être affecté (selected ou
-- confirmed) sur la mission suffit à pouvoir la lire, indépendamment des
-- règles de visibilité par rôle qui servent à décider quelles missions
-- proposer, pas à cacher celles où on est déjà engagé.
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
        public.current_user_role() = 'admin'
        or public.has_role_behavior(_user_id, 'mission', 'can_manage')

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

        or (m.status = 'draft' and m.created_by = _user_id)

        or exists (
          select 1
          from public.mission_assignments ma
          where ma.mission_id = m.id
            and ma.volunteer_id = _user_id
            and ma.assignment_status in ('selected', 'confirmed')
        )

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
