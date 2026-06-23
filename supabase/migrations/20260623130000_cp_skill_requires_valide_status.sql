-- Le tableau de bord de suivi des compétences permet d'attribuer des statuts
-- « tentatifs » (formation / interesse / a_recycler) sur `profile_skills`.
-- Ces statuts ne doivent PAS rendre un bénévole titulaire d'une compétence pour
-- la visibilité privilégiée « CP » : seul le statut 'valide' qualifie.
--
-- Auparavant `user_has_cp_skill` comptait n'importe quelle ligne `profile_skills`
-- sans regarder `status`. On restreint à `status = 'valide'`.
--
-- Note : `can_read_mission` a été réécrit en 20260516150000 autour du système
-- de rôles et n'appelle plus cette fonction ; le correctif est donc défensif
-- (et garantit la bonne sémantique si la visibilité « CP » était réactivée).

create or replace function public.user_has_cp_skill(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.profile_id = _user_id
      and ps.status = 'valide'
      and lower(coalesce(s.name, '')) = 'cp'
  );
$$;
