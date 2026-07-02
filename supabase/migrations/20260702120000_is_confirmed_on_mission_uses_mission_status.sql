-- La transition individuelle mission_assignments.assignment_status vers
-- 'confirmed' n'est déclenchée par aucun code applicatif : la "sélection de
-- l'équipage" insère toujours 'selected', et la confirmation de mission ne
-- touche que missions.status. Du point de vue métier, un bénévole 'selected'
-- sur une mission dont le statut est 'confirmed' est staffé : c'est ce
-- couple qui doit conditionner l'accès à la vérification matériel, pas la
-- seule valeur (jamais atteinte en pratique) assignment_status = 'confirmed'.
create or replace function public.is_confirmed_on_mission(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mission_assignments ma
    join public.missions m on m.id = ma.mission_id
    where ma.mission_id = _mission_id
      and ma.volunteer_id = _user_id
      and ma.assignment_status in ('selected', 'confirmed')
      and m.status = 'confirmed'
  );
$$;
