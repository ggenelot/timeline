-- Correctif de sécurité (suite à 20260712130000) : empêcher une escalade de
-- privilèges par un administrateur de rôles *délégué*.
--
-- Problème : depuis que `admin_full_access_profile_roles` accepte
-- `administration/can_manage`, un délégué (non membre du rôle système) pouvait
-- s'ajouter lui-même au rôle système ; le trigger de synchronisation
-- (sync_membership_to_profile_role, 20260712110000) promeut alors
-- profiles.role='admin' → il devenait admin complet.
--
-- Règle : l'appartenance au ROLE SYSTÈME ne se gère que par un admin système
-- (is_admin). Les délégués `administration/can_manage` gèrent uniquement les
-- rôles non-système. (La route API service-role applique la même règle en
-- complément, car elle bypasse la RLS.)

drop policy if exists "admin_full_access_profile_roles" on public.profile_roles;
create policy "admin_full_access_profile_roles"
  on public.profile_roles for all
  using (
    (select public.is_admin(auth.uid()))
    or (
      (select public.has_permission(auth.uid(), 'administration', 'can_manage'))
      and not exists (
        select 1 from public.roles r
        where r.id = profile_roles.role_id and r.is_system
      )
    )
  )
  with check (
    (select public.is_admin(auth.uid()))
    or (
      (select public.has_permission(auth.uid(), 'administration', 'can_manage'))
      and not exists (
        select 1 from public.roles r
        where r.id = profile_roles.role_id and r.is_system
      )
    )
  );
