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
        public.current_user_role() in ('admin', 'responsable')
        or (
          public.current_user_role() = 'benevole'
          and m.status = 'proposed'
          and (
            public.user_has_cp_skill(_user_id)
            or m.category <> 'poste_de_secours'
            or public.mission_has_cp_available_volunteer(m.id)
          )
        )
      )
  );
$$;
