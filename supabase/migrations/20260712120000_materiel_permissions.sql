-- Phase 1 de la refonte des rôles : le domaine MATÉRIEL bascule du check
-- legacy profiles.role = 'admin' vers le système de permissions générique
-- (has_permission — voir 20260712110000_roles_system_foundation.sql).
--
-- Effet : un rôle portant can_manage/materiel (ex. « Responsable matériel »)
-- peut gérer le catalogue et les listes matériel des missions sans être
-- admin ; les admins conservent tout implicitement (has_permission inclut
-- is_admin). Aucune policy de lecture ne change.
--
-- Hors périmètre volontaire : mission_type_required_materiels (config des
-- types de mission → phase 5, ressource mission_type).

-- ============================================================
-- Catalogue (types, contenants, catégories)
-- ============================================================

drop policy if exists "admin_manage_materiel_categories" on public.materiel_categories;
create policy "admin_manage_materiel_categories"
  on public.materiel_categories for all
  to authenticated
  using ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')));

drop policy if exists "admin_manage_materiel_types" on public.materiel_types;
create policy "admin_manage_materiel_types"
  on public.materiel_types for all
  to authenticated
  using ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')));

drop policy if exists "admin_manage_materiel_type_contents" on public.materiel_type_contents;
create policy "admin_manage_materiel_type_contents"
  on public.materiel_type_contents for all
  to authenticated
  using ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')));

-- ============================================================
-- Listes matériel des missions (besoins + affectations board OPE)
-- ============================================================

drop policy if exists "mission_required_materiels_write_admin" on public.mission_required_materiels;
create policy "mission_required_materiels_write_admin"
  on public.mission_required_materiels for all
  using ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')));

drop policy if exists "mission_materiel_assignments_write_admin" on public.mission_materiel_assignments;
create policy "mission_materiel_assignments_write_admin"
  on public.mission_materiel_assignments for all
  using ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')))
  with check ((select public.has_permission(auth.uid(), 'materiel', 'can_manage')));

-- ============================================================
-- Vérification matériel : la branche admin suit le nouveau système
-- (la branche « bénévole confirmé sur la mission » est inchangée)
-- ============================================================

create or replace function public.can_verify_mission_materiel(_mission_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.is_admin(_user_id)
    or public.is_confirmed_on_mission(_mission_id, _user_id)
  );
$$;
