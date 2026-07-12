-- Étend la taxonomie des ressources du système de rôles dynamique au-delà de
-- mission/cursus, pour permettre des rôles modulaires par domaine (respo
-- matériel, supervision lecture seule, etc.).
--
-- ⚠ Contrainte Postgres : les nouvelles valeurs d'enum ne peuvent pas être
-- utilisées dans la transaction qui les ajoute — cette migration ne contient
-- donc QUE les ALTER TYPE ; tout ce qui les référence vient dans la migration
-- suivante (20260712110000_roles_system_foundation.sql).

alter type public.role_behavior_resource_type add value if not exists 'materiel';
alter type public.role_behavior_resource_type add value if not exists 'volunteer';
alter type public.role_behavior_resource_type add value if not exists 'skill';
alter type public.role_behavior_resource_type add value if not exists 'mission_type';
alter type public.role_behavior_resource_type add value if not exists 'settings';
alter type public.role_behavior_resource_type add value if not exists 'administration';
